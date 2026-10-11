// Transport fault proof without a database. Actual authority/state proof lives
// separately in tests/subject-broker-repository/acceptance.test.mjs (real PG17).
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomUUID,randomBytes} from 'node:crypto'
import {build} from 'esbuild'
const bundle=await build({entryPoints:['lib/identity/customer-subject-broker-repository.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'})
const {createCustomerSubjectBrokerRepository}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text+'\n//# sourceURL=customer-subject-broker-repository.js').toString('base64'))
const configHash='7c54b659cf0e2ecdf07ce2b34ea10d7fc0a7c6ef3c9f59f38ca8f5cd79e86780',clientId='tll-staging-subject-broker-v1',redirectUri='https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/callback'
const opaque=()=>randomBytes(32).toString('base64url'),hash=s=>createHash('sha256').update(s).digest('hex')
function request(){const now=Date.now(),outer={clientId,redirectUri,state:randomUUID(),scope:'subject',challenge:opaque(),method:'S256'};return{operationId:randomUUID(),configHash,record:{id:randomUUID(),configHash,browserHash:hash(opaque()),outer,outerHash:hash(JSON.stringify(Object.values(outer))),applicationPkceChallenge:opaque(),mode:'sign_in',target:null,createdAt:now,expiresAt:now+300000}}}
const stub=(query)=>{const calls=[],releases=[];return{calls,releases,pool:{async connect(){calls.push(['connect']);return{async query(sql,values){calls.push([sql,values]);return query(sql,values)},release(destroy){releases.push(destroy)}}}}}}
const result=status=>({rows:[{result:{status}}]})
const tick=()=>new Promise(resolve=>setImmediate(resolve))
test('broker adapter default disabled and liveEnabled cannot activate or acquire clients',async()=>{
 let acquisitions=0;const pool={async connect(){acquisitions++;throw Error('Unexpected')}}
 for(const options of [{},{syntheticExecution:true,liveEnabled:true}]){
  const repo=createCustomerSubjectBrokerRepository({pool,...options}),p=request();assert.equal(await repo.register(p),false)
  assert.deepEqual(await repo.claimReadiness({...p,transactionId:p.record.id,browserHash:p.record.browserHash}),{status:'rejected'})
  await assert.rejects(()=>repo.holdOperation({...p,locator:{kind:'transaction',id:p.record.id,browserHash:p.record.browserHash,outerHash:p.record.outerHash}}),/unavailable/)
 }
 assert.equal(acquisitions,0)
})
test('broker adapter emits success only after COMMIT acknowledgement and snapshots projected input',async()=>{
 let acknowledge,committing=false;const gate=new Promise(resolve=>{acknowledge=resolve})
 const s=stub(async sql=>{if(sql==='COMMIT'){committing=true;await gate}return sql.startsWith('SELECT ')?result('registered'):{rows:[]}})
 const repo=createCustomerSubjectBrokerRepository({pool:s.pool,syntheticExecution:true}),p=request(),saved=structuredClone(p);let done=false
 const pending=repo.register({...p,record:{...p.record,accessToken:'DO_NOT_PERSIST'}}).then(r=>{done=true;return r});p.record.outer.state=randomUUID();p.record.browserHash=hash(opaque())
 while(!committing)await tick();assert.equal(done,false);assert.equal(s.releases.length,0)
 const wire=JSON.parse(s.calls.find(([sql])=>sql.startsWith('SELECT '))[1][1]);assert.deepEqual(wire,saved);assert.doesNotMatch(JSON.stringify(wire),/DO_NOT_PERSIST|accessToken/)
 acknowledge();assert.equal(await pending,true);assert.deepEqual(s.releases,[false])
 assert.ok(s.calls.some(([sql])=>sql==="SET LOCAL lock_timeout = '5s'"));assert.ok(s.calls.some(([sql])=>sql==="SET LOCAL statement_timeout = '10s'"))
})
test('uncertain COMMIT is redacted, rolled back, discarded and never retried',async()=>{
 const s=stub(async sql=>{if(sql==='COMMIT')throw Error('SENSITIVE_DATABASE_DETAIL');return sql.startsWith('SELECT ')?result('registered'):{rows:[]}})
 await assert.rejects(()=>createCustomerSubjectBrokerRepository({pool:s.pool,syntheticExecution:true}).register(request()),/^Error: Subject broker repository unavailable$/)
 assert.deepEqual(s.releases,[true]);assert.equal(s.calls.filter(([sql])=>sql==='connect').length,1);assert.equal(s.calls.at(-1)[0],'ROLLBACK')
})
test('unrecognized SQL results fail before COMMIT and release an uncertain client',async()=>{
 for(const response of [{rows:[]},{rows:[{result:null}]},{rows:[{result:{status:'unexpected'}}]},{rows:[{result:{status:'issued'}}]}]){
  const s=stub(async sql=>sql.startsWith('SELECT ')?response:{rows:[]});await assert.rejects(()=>createCustomerSubjectBrokerRepository({pool:s.pool,syntheticExecution:true}).register(request()),/unavailable/)
  assert.equal(s.calls.some(([sql])=>sql==='COMMIT'),false);assert.deepEqual(s.releases,[true])
 }
})
test('claim responses require valid immutable record, exact binding, current fence and generation',async()=>{
 const p=request(),base={status:'claimed',record:p.record,fence:'1',generation:'0'}
 for(const change of [{record:{...p.record,browserHash:hash(opaque())}},{fence:'0'},{generation:'-1'},{record:{...p.record,outerHash:hash(opaque())}}]){
  const s=stub(async sql=>sql.startsWith('SELECT ')?{rows:[{result:{...base,...change}}]}:{rows:[]})
  await assert.rejects(()=>createCustomerSubjectBrokerRepository({pool:s.pool,syntheticExecution:true}).claimReadiness({...p,transactionId:p.record.id,browserHash:p.record.browserHash}),/unavailable/)
 }
})
test('bearer issuance keeps the requested expiry snapshot across async acknowledgement',async()=>{
 const p={operationId:randomUUID(),configHash,codeHash:hash(opaque()),clientId,redirectUri,challenge:opaque(),bearerHash:hash(opaque()),bearerExpiresAt:Date.now()+60000},original=p.bearerExpiresAt
 const s=stub(async sql=>{if(sql==='COMMIT')p.bearerExpiresAt=1;return sql.startsWith('SELECT ')?{rows:[{result:{status:'issued',hardDeadline:Date.now()+3000,bearerExpiresAt:original}}]}:{rows:[]}})
 const output=await createCustomerSubjectBrokerRepository({pool:s.pool,syntheticExecution:true}).redeemCode(p);assert.equal(output.status,'issued');assert.equal(output.bearerExpiresAt,original)
})
test('invalid original quarantine locator is refused locally and rejected SQL quarantine is never acknowledged',async()=>{
 const p=request();const s=stub(async sql=>sql.startsWith('SELECT ')?result('rejected'):{rows:[]});const repo=createCustomerSubjectBrokerRepository({pool:s.pool,syntheticExecution:true})
 await assert.rejects(()=>repo.holdOperation({...p,locator:{kind:'transaction',id:p.record.id,browserHash:'bad',outerHash:p.record.outerHash}}),/unavailable/);assert.equal(s.calls.length,0)
 await assert.rejects(()=>repo.holdOperation({...p,locator:{kind:'transaction',id:p.record.id,browserHash:p.record.browserHash,outerHash:p.record.outerHash}}),/unavailable/)
 assert.deepEqual(s.releases,[false])
})
