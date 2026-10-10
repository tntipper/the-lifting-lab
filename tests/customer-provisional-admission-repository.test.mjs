import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {build} from 'esbuild'
import {createAesGcmEnvelopeVault} from '../lib/identity/customer-token-vault.ts'
const bundle=await build({entryPoints:['lib/identity/customer-provisional-admission-repository.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'})
const {createCustomerProvisionalAdmissionRepository:create,createProvisionalAdmissionMetadata:describe}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text+'\n//# sourceURL=provisional-admission-repository.js').toString('base64'))
const ORIGIN='https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app',opaque=()=>randomBytes(32).toString('base64url'),hash=s=>createHash('sha256').update(s).digest('hex')
function intent(change={}){const verifier=opaque(),now=Date.now();return{operationId:randomUUID(),applicationPkceVerifier:verifier,metadata:describe({transactionId:randomUUID(),browserHash:hash(opaque()),applicationOrigin:ORIGIN,mode:'sign_in',original:null,applicationPkceChallenge:createHash('sha256').update(verifier).digest('base64url'),createdAt:now,expiresAt:now+300000,...change})}}
const binding=p=>{const r=p.metadata;return{transactionId:r.transactionId,browserHash:r.browserHash,configHash:r.configHash,intentHash:r.intentHash,applicationPkceChallenge:r.applicationPkceChallenge}}
const snapshot=p=>({...binding(p),state:'prepared',metadata:p.metadata,fence:'1',generation:'0',observedAt:Date.now(),outer:null,outerHash:null})
const vault=()=>createAesGcmEnvelopeVault({activeKeyId:'synthetic',keys:new Map([['synthetic',randomBytes(32)]])})
const stub=query=>{const calls=[],releases=[];return{calls,releases,pool:{async connect(){calls.push(['connect']);return{async query(sql,values){calls.push([sql,values]);return query(sql,values)},release(destroy){releases.push(destroy)}}}}}}
const result=status=>({rows:[{result:{status}}]})
const tick=()=>new Promise(resolve=>setImmediate(resolve))
test('metadata is available before persistence and binds exact origin, mode, original owner and token hash',()=>{
 const p=intent(),m=p.metadata;assert.equal(m.original,null)
 for(const change of [{browserHash:hash(opaque())},{applicationOrigin:'https://the-lifting-other-my-lifting-lab-s-projects.vercel.app'},
  {mode:'migration',original:{userId:randomUUID(),sessionId:randomUUID(),accessTokenHash:hash(opaque())}}])assert.notEqual(describe({...m,...change}).intentHash,m.intentHash)
 assert.throws(()=>describe({...m,mode:'migration',original:null}),/unavailable/)
 assert.throws(()=>describe({...m,applicationOrigin:'https://other.example'}),/unavailable/)
 assert.throws(()=>describe({...m,expiresAt:m.createdAt+300001}),/unavailable/)
 const projected=describe({...m,accessToken:'DO_NOT_RETAIN'});assert.deepEqual(projected,m)
})
test('default/live/browser gates cannot acquire clients or seal PKCE material',async()=>{
 let touched=0;const options={pool:{async connect(){touched++;throw Error('Unexpected')}},vault:{seal(){touched++;throw Error('Unexpected')}},applicationOrigin:ORIGIN}
 for(const flags of [{},{syntheticExecution:true,liveEnabled:true}]){const r=create({...options,...flags});assert.equal(await r.prepare(intent()),false);assert.equal(await r.readIntent(binding(intent())),null)}
 const r=create({...options,syntheticExecution:true});globalThis.window={};try{assert.equal(await r.prepare(intent()),false)}finally{delete globalThis.window}
 assert.equal(touched,0)
})
test('prepare projects and seals verifier before SQL, then returns only after commit acknowledgement',async()=>{
 let acknowledge,committing=false;const gate=new Promise(resolve=>{acknowledge=resolve}),v=vault()
 const s=stub(async sql=>{if(sql==='COMMIT'){committing=true;await gate}return sql.startsWith('SELECT ')?result('prepared'):{rows:[]}})
 const options={pool:s.pool,vault:v,applicationOrigin:ORIGIN,syntheticExecution:true},r=create(options),p=intent(),saved=structuredClone(p);let done=false
 const pending=r.prepare({...p,metadata:{...p.metadata,accessToken:'DO_NOT_RETAIN'}}).then(result=>{done=true;return result})
 p.metadata.browserHash=hash(opaque());options.applicationOrigin='https://other.example'
 while(!committing)await tick();assert.equal(done,false);assert.equal(s.releases.length,0)
 const wire=JSON.parse(s.calls.find(([sql])=>sql.startsWith('SELECT '))[1][1]);assert.deepEqual(wire.metadata,saved.metadata)
 assert.doesNotMatch(JSON.stringify(wire),new RegExp(saved.applicationPkceVerifier+'|DO_NOT_RETAIN|applicationPkceVerifier'))
 const aad=['tll-provisional-admission/v1','qdmvngjwkcsilzmqksme','application-pkce',saved.metadata.transactionId,saved.metadata.configHash,saved.metadata.browserHash,saved.metadata.intentHash,'0']
 assert.deepEqual(v.open(wire.material,aad),{verifier:saved.applicationPkceVerifier})
 acknowledge();assert.equal(await pending,true);assert.deepEqual(s.releases,[false]);v.destroy()
})
test('lost commit exposes a fixed error, discards the connection and makes no retry or HTTP call',async()=>{
 const s=stub(async sql=>{if(sql==='COMMIT')throw Error('SENSITIVE_SERVER_DETAIL');return sql.startsWith('SELECT ')?result('prepared'):{rows:[]}}),v=vault()
 await assert.rejects(()=>create({pool:s.pool,vault:v,applicationOrigin:ORIGIN,syntheticExecution:true}).prepare(intent()),/^Error: Provisional admission repository unavailable$/)
 assert.deepEqual(s.releases,[true]);assert.equal(s.calls.filter(([sql])=>sql==='connect').length,1);assert.equal(s.calls.at(-1)[0],'ROLLBACK');v.destroy()
})
test('unexpected SQL status cannot be acknowledged as a successful intent transition',async()=>{
 for(const response of [{rows:[]},{rows:[{result:null}]},result('admitted'),result('unexpected')]){
  const s=stub(async sql=>sql.startsWith('SELECT ')?response:{rows:[]}),v=vault();await assert.rejects(()=>create({pool:s.pool,vault:v,applicationOrigin:ORIGIN,syntheticExecution:true}).prepare(intent()),/unavailable/)
  assert.equal(s.calls.some(([sql])=>sql==='COMMIT'),false);assert.deepEqual(s.releases,[true]);v.destroy()
 }
})
test('recovery reads expose immutable metadata only, including after expiry, and reject transplanted bindings',async()=>{
 const p=intent(),state={...snapshot(p),state:'held',material:{ciphertext:'DO_NOT_EXPOSE'},verifier:'DO_NOT_EXPOSE'}
 const s=stub(async sql=>sql.startsWith('SELECT ')?{rows:[{result:{status:'found',snapshot:state}}]}:{rows:[]}),v=vault(),r=create({pool:s.pool,vault:v,applicationOrigin:ORIGIN,syntheticExecution:true})
 const read=await r.readIntent(binding(p));assert.equal(read.state,'held');assert.doesNotMatch(JSON.stringify(read),/DO_NOT_EXPOSE|ciphertext|verifier|material/)
 state.browserHash=hash(opaque());await assert.rejects(()=>r.readIntent(binding(p)),/unavailable/);v.destroy()
})
test('migration proof projection persists neither bearer nor unrecognized verifier output fields',async()=>{
 const original={userId:randomUUID(),sessionId:randomUUID(),accessTokenHash:hash(opaque())},p=intent({mode:'migration',original}),v=vault()
 const s=stub(async sql=>sql.startsWith('SELECT ')?result('rejected'):{rows:[]}),r=create({pool:s.pool,vault:v,applicationOrigin:ORIGIN,syntheticExecution:true}),now=Date.now()
 await r.claimAdmission({...binding(p),operationId:randomUUID(),currentMigrationProof:{...original,issuer:'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1',audience:'authenticated',anonymous:false,authenticatedAt:now-1000,checkedAt:now,expiresAt:now+3600000,accessToken:'DO_NOT_RETAIN',verified:true}})
 const wire=JSON.parse(s.calls.find(([sql])=>sql.startsWith('SELECT '))[1][1]);assert.doesNotMatch(JSON.stringify(wire),/DO_NOT_RETAIN|verified/);assert.equal(wire.currentMigrationProof.accessTokenHash,original.accessTokenHash);v.destroy()
})
test('missing key or verifier/challenge mismatch prevents any SQL allocation',async()=>{
 const s=stub(async()=>result('prepared')),v=vault(),r=create({pool:s.pool,vault:v,applicationOrigin:ORIGIN,syntheticExecution:true}),p=intent()
 await assert.rejects(()=>r.prepare({...p,applicationPkceVerifier:opaque()}),/unavailable/);v.destroy();await assert.rejects(()=>r.prepare(p),/^Error: Provisional admission repository unavailable$/);assert.equal(s.calls.length,0)
})
