// Actual PG17 proof in the new, explicitly marked disposable broker database.
// No hosted configuration, passwords, LOGINs, identities or customer ledger use.
import test,{before,beforeEach,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {build} from 'esbuild'
import {admin,assertFixture,localPool,closeClients} from './local-pg.mjs'
const bundle=await build({entryPoints:['lib/identity/customer-subject-broker-repository.ts','lib/identity/customer-subject-broker.ts'],bundle:true,platform:'node',format:'esm',write:false,outdir:'/unused',logLevel:'silent'})
const load=async name=>import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles.find(f=>f.path.endsWith(name+'.js')).text+'\n//# sourceURL='+name+'.js').toString('base64'))
const {createCustomerSubjectBrokerRepository}=await load('customer-subject-broker-repository')
const {createCustomerSubjectBroker}=await load('customer-subject-broker')
const CONFIG='7c54b659cf0e2ecdf07ce2b34ea10d7fc0a7c6ef3c9f59f38ca8f5cd79e86780',CLIENT='tll-staging-subject-broker-v1',CALLBACK='https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/callback'
const opaque=()=>randomBytes(32).toString('base64url'),hash=s=>createHash('sha256').update(s).digest('hex')
const operation=()=>({operationId:randomUUID(),configHash:CONFIG})
const owner=()=>({userId:randomUUID(),sessionId:randomUUID()})
const record=(change={})=>{const now=Date.now(),outer={clientId:CLIENT,redirectUri:CALLBACK,state:randomUUID(),scope:'subject',challenge:opaque(),method:'S256'};return{id:randomUUID(),configHash:CONFIG,browserHash:hash(opaque()),outer,outerHash:hash(JSON.stringify(Object.values(outer))),applicationPkceChallenge:opaque(),mode:'sign_in',target:null,createdAt:now,expiresAt:now+300000,...change}}
const browser=(r,op=operation())=>({...op,transactionId:r.id,browserHash:r.browserHash})
const locator=r=>({kind:'transaction',id:r.id,browserHash:r.browserHash,outerHash:r.outerHash})
const query=(op,p)=>`SELECT tll_broker_private.repository('${op}','${JSON.stringify(p).replaceAll("'","''")}'::jsonb);`
const raw=(op,p)=>JSON.parse(admin('SET ROLE tll_broker_executor; '+query(op,p)))
const snapshot=()=>JSON.parse(admin("SELECT json_build_object('flows',(SELECT coalesce(json_agg(f ORDER BY id),'[]') FROM tll_broker_private.flows f),'subjects',(SELECT coalesce(json_agg(s ORDER BY sub),'[]') FROM tll_broker_private.subjects s),'operations',(SELECT coalesce(json_agg(o ORDER BY id),'[]') FROM tll_broker_private.operations o));"))
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let repo,verified=false
const make=(pool=localPool())=>createCustomerSubjectBrokerRepository({pool,syntheticExecution:true})
async function admitted(r=record()){assert.equal(await repo.register({...operation(),record:r}),true);assert.equal(await repo.admit({...browser(r),outerHash:r.outerHash}),true);return r}
async function claim(r=record()){await admitted(r);const request=browser(r),c=await repo.claimReadiness(request);assert.equal(c.status,'claimed');return{r,request,c}}
function finishInput({r,request,c},changes={}){const now=Date.now();return{...request,fence:c.fence,generation:c.generation,codeHash:hash(opaque()),candidateSubject:'tllb_'+opaque(),hardDeadline:now+4000,shopifyProof:{transactionId:r.id,receiptId:randomUUID(),shopId:'107532616020',issuer:'https://shopify.com/authentication/107532616020',subject:'gid://shopify/Customer/'+randomUUID(),innerPkceChallenge:opaque(),verifiedAt:now,expiresAt:now+3600000},migrationProof:r.target?{...r.target,issuer:'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1',audience:'authenticated',anonymous:false,authenticatedAt:now-1000,checkedAt:now,expiresAt:now+3600000}:null,...changes}}
async function ready(r=record(),changes={}){const c=await claim(r),input=finishInput(c,changes);assert.equal(await repo.finishReadiness(input),true);return{...c,input}}
const redeemInput=c=>({...operation(),codeHash:c.input.codeHash,clientId:CLIENT,redirectUri:CALLBACK,challenge:c.r.outer.challenge,bearerHash:hash(opaque()),bearerExpiresAt:Date.now()+60000})
async function issued(r=record()){const c=await ready(r),redeem=redeemInput(c);assert.equal((await repo.redeemCode(redeem)).status,'issued');return{...c,redeem}}
before(()=>{assertFixture();verified=true;assert.equal(admin('SELECT enabled FROM tll_broker_private.control'),'f')})
beforeEach(()=>{admin('TRUNCATE tll_broker_private.flows,tll_broker_private.subjects,tll_broker_private.operations,tll_broker_private.daily_quota; UPDATE tll_broker_private.control SET enabled=true;');repo=make()})
after(async()=>{if(!verified)return;admin('UPDATE tll_broker_private.control SET enabled=false; TRUNCATE tll_broker_private.flows,tll_broker_private.subjects,tll_broker_private.operations,tll_broker_private.daily_quota;');await closeClients();assert.equal(admin('SELECT enabled FROM tll_broker_private.control'),'f')})

test('actual non-superuser migration isolates roles, schema, tables, sequences and every helper function',()=>{
 for(const role of ['anon','authenticated','service_role','tll_broker_executor']){
  assert.equal(admin(`SELECT has_schema_privilege('${role}','tll_broker_private','CREATE')`),'f')
  for(const table of ['flows','subjects','operations','daily_quota','control'])assert.equal(admin(`SELECT has_table_privilege('${role}','tll_broker_private.${table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege('${role}','tll_broker_private.${table}','SELECT,INSERT,UPDATE,REFERENCES')`),'f')
  assert.equal(admin(`SELECT has_sequence_privilege('${role}','tll_broker_private.fences','USAGE,SELECT,UPDATE')`),'f')
  assert.throws(()=>admin(`SET ROLE ${role}; SELECT * FROM tll_broker_private.flows`))
  if(role!=='tll_broker_executor')assert.throws(()=>admin(`SET ROLE ${role}; `+query('register',{...operation(),record:record()})))
 }
 assert.equal(admin("SELECT count(*) FROM pg_auth_members WHERE (roleid IN ('tll_broker_owner'::regrole,'tll_broker_executor'::regrole) OR member IN ('tll_broker_owner'::regrole,'tll_broker_executor'::regrole)) AND NOT(roleid='tll_broker_executor'::regrole AND member='tll_broker_migrator'::regrole AND admin_option AND NOT inherit_option AND NOT set_option)"),'0')
 assert.equal(admin("SELECT count(*) FROM pg_auth_members WHERE roleid='tll_broker_executor'::regrole AND member='tll_broker_migrator'::regrole AND admin_option AND NOT inherit_option AND NOT set_option"),'1')
 assert.equal(admin("SELECT count(*) FROM pg_roles WHERE rolname IN ('tll_broker_owner','tll_broker_executor','tll_broker_migrator') AND rolcanlogin"),'0')
 assert.equal(admin("SELECT count(*) FROM pg_roles WHERE rolname='tll_broker_role_setup'"),'0')
})
test('operator uses aggregate control only and its retained ADMIN edge delegates without executor authority',()=>{
 const operator=sql=>JSON.parse(admin('SET SESSION AUTHORIZATION tll_broker_migrator; '+sql))
 const status=operator('SELECT tll_broker_private.operator_status()');assert.equal(status.enabled,true)
 assert.deepEqual(Object.keys(status).sort(),['changedAt','enabled','flows','heldFlows','operations','pendingMigrationSubjects','provisionalSubjects','reasonCode'])
 assert.equal(operator("SELECT tll_broker_private.operator_set_enabled(false,'synthetic_test')").enabled,false)
 for(const sql of ['SET ROLE tll_broker_executor','SET ROLE tll_broker_owner','SELECT * FROM tll_broker_private.control','CREATE TABLE tll_broker_private.forbidden(id int)',query('cancel',browser(record()))])assert.throws(()=>admin('SET SESSION AUTHORIZATION tll_broker_migrator; '+sql))
 for(const role of ['anon','authenticated','service_role','tll_broker_executor'])for(const sql of ['SELECT tll_broker_private.operator_status()',"SELECT tll_broker_private.operator_set_enabled(true,'synthetic')"])assert.throws(()=>admin(`SET SESSION AUTHORIZATION ${role}; `+sql))
 admin(`BEGIN; SET SESSION AUTHORIZATION tll_broker_migrator; CREATE ROLE tll_broker_delegation_probe NOLOGIN NOINHERIT;
 GRANT tll_broker_executor TO tll_broker_delegation_probe WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;
 DO $$BEGIN IF NOT pg_has_role('tll_broker_delegation_probe','tll_broker_executor','USAGE') THEN RAISE EXCEPTION 'Missing delegation';END IF;END$$;
 REVOKE tll_broker_executor FROM tll_broker_delegation_probe; ROLLBACK;`)
 assert.equal(admin("SELECT count(*) FROM pg_roles WHERE rolname='tll_broker_delegation_probe'"),'0')
})
test('operator session identity cannot be impersonated with inherited SET ROLE authority',()=>{
 admin(`BEGIN; CREATE ROLE tll_broker_operator_probe NOLOGIN; GRANT tll_broker_migrator TO tll_broker_operator_probe WITH INHERIT TRUE,SET TRUE;
 SET SESSION AUTHORIZATION tll_broker_operator_probe; SET ROLE tll_broker_migrator;
 DO $$BEGIN BEGIN PERFORM tll_broker_private.operator_status();RAISE EXCEPTION 'Impersonated';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM tll_broker_private.operator_set_enabled(true,'synthetic');RAISE EXCEPTION 'Impersonated';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END$$;ROLLBACK;`)
})
test('disabled gates allocate nothing; disable still permits original-bound hold/cancel',async()=>{
 const never={async connect(){throw new Error('Unexpected pool acquisition')}}
 for(const options of [{},{syntheticExecution:true,liveEnabled:true}]){
  const disabled=createCustomerSubjectBrokerRepository({pool:never,...options});assert.equal(await disabled.register({...operation(),record:record()}),false)
  assert.deepEqual(await disabled.claimReadiness(browser(record())),{status:'rejected'});await assert.rejects(()=>disabled.holdOperation({...operation(),locator:locator(record())}),/unavailable/)
 }
 const r=await admitted();admin('UPDATE tll_broker_private.control SET enabled=false;')
 assert.equal(await repo.register({...operation(),record:record()}),false);assert.equal((await repo.claimReadiness(browser(r))).status,'rejected')
 assert.equal(await repo.cancel(browser(r)),true)
 const quarantined=record();await repo.holdOperation({...operation(),locator:locator(quarantined)});assert.equal(snapshot().flows.find(f=>f.id===quarantined.id).status,'held')
})
test('registration is immutable, outer state unique, and admission binds the original browser/hash',async()=>{
 const r=record();const results=await Promise.all([repo.register({...operation(),record:r}),repo.register({...operation(),record:r})]);assert.equal(results.filter(Boolean).length,1)
 const transplanted=record({outer:r.outer,outerHash:r.outerHash});assert.equal(await repo.register({...operation(),record:transplanted}),false)
 assert.equal(await repo.admit({...browser(r),browserHash:hash(opaque()),outerHash:r.outerHash}),false)
 assert.equal(await repo.admit({...browser(r),outerHash:hash(opaque())}),false)
 const admits=await Promise.all([repo.admit({...browser(r),outerHash:r.outerHash}),repo.admit({...browser(r),outerHash:r.outerHash})]);assert.equal(admits.filter(Boolean).length,1)
 assert.equal(snapshot().flows.length,1)
})
test('claim and finish share one operation but unrelated phase and cross-flow operation reuse fail',async()=>{
 const r=await admitted(),requests=[browser(r),browser(r)],claims=await Promise.all(requests.map(request=>repo.claimReadiness(request)));assert.equal(claims.filter(c=>c.status==='claimed').length,1)
 const winner=claims.findIndex(c=>c.status==='claimed'),c=claims[winner],request=requests[winner]
 assert.equal(await repo.cancel(request),false)
 assert.equal(await repo.register({...request,record:record()}),false)
 const input=finishInput({r,request,c});assert.equal(await repo.finishReadiness({...input,operationId:randomUUID()}),false)
 assert.equal(await repo.finishReadiness(input),true);assert.equal(await repo.finishReadiness(input),false)
 const other=await admitted();assert.equal((await repo.claimReadiness({...browser(other),operationId:request.operationId})).status,'rejected')
})
test('finish requires claim fence/generation, fresh minimal proof and independent inner challenge',async()=>{
 const c=await claim(),input=finishInput(c)
 for(const change of [{fence:String(BigInt(input.fence)+1n)},{generation:'1'},{browserHash:hash(opaque())},{hardDeadline:Date.now()+60000},
  {shopifyProof:{...input.shopifyProof,verifiedAt:Date.now()-6000}},{shopifyProof:{...input.shopifyProof,verifiedAt:Date.now()+10000}},
  {shopifyProof:{...input.shopifyProof,innerPkceChallenge:c.r.outer.challenge}},{shopifyProof:{...input.shopifyProof,innerPkceChallenge:c.r.applicationPkceChallenge}}])assert.equal(await repo.finishReadiness({...input,...change}),false)
 assert.equal(await repo.finishReadiness(input),true)
 assert.equal(snapshot().flows[0].hard_deadline,new Date(input.hardDeadline).toISOString().replace('Z','+00:00'))
})
test('one-use code/userinfo across real simultaneous connections and code replay revokes outstanding bearer',async()=>{
 const c=await ready(),a=redeemInput(c),b=redeemInput(c)
 const tokens=await Promise.all([repo.redeemCode(a),repo.redeemCode(b)]);assert.equal(tokens.filter(r=>r.status==='issued').length,1)
 assert.equal(snapshot().flows[0].status,'held');assert.equal((await repo.consumeUserinfo({...operation(),bearerHash:a.bearerHash})).status,'rejected')
 const d=await issued(),outputs=await Promise.all([repo.consumeUserinfo({...operation(),bearerHash:d.redeem.bearerHash}),repo.consumeUserinfo({...operation(),bearerHash:d.redeem.bearerHash})])
 assert.equal(outputs.filter(r=>r.status==='consumed').length,1);assert.equal(outputs.find(r=>r.status==='consumed').sub,d.input.candidateSubject)
})
test('wrong code binding cannot consume or revoke the original bearer',async()=>{
 const c=await ready(),p=redeemInput(c)
 assert.equal((await repo.redeemCode({...p,challenge:opaque()})).status,'rejected')
 assert.equal((await repo.redeemCode(p)).status,'issued')
 assert.equal((await repo.redeemCode({...redeemInput(c),challenge:opaque()})).status,'rejected')
 assert.equal((await repo.consumeUserinfo({...operation(),bearerHash:p.bearerHash})).status,'consumed')
})
test('database clock is sampled after the lock; client clock cannot prolong readiness or bearer authority',async()=>{
 const prepared=await claim(),input=finishInput(prepared,{hardDeadline:Date.now()+1000});assert.equal(await repo.finishReadiness(input),true)
 const c={...prepared,input},p=redeemInput(c)
 const lock=await localPool({role:'postgres'}).connect();await lock.query('BEGIN');await lock.query('SELECT singleton FROM tll_broker_private.control FOR UPDATE')
 const pending=repo.redeemCode(p);await pause(1100);await lock.query('COMMIT');lock.release();assert.equal((await pending).status,'rejected')
 const d=await issued();admin("UPDATE tll_broker_private.flows SET hard_deadline=clock_timestamp()-interval '1 second' WHERE status='token_issued'")
 assert.equal((await repo.consumeUserinfo({...operation(),bearerHash:d.redeem.bearerHash})).status,'rejected')
})
test('expired registration rejects after a transition lock wait',async()=>{
 const r=await admitted(record({expiresAt:Date.now()+1000}))
 const lock=await localPool({role:'postgres'}).connect();await lock.query('BEGIN');await lock.query('SELECT singleton FROM tll_broker_private.control FOR UPDATE')
 const pending=repo.claimReadiness(browser(r));await pause(1100);await lock.query('COMMIT');lock.release();assert.equal((await pending).status,'rejected')
})
test('same verified Shopify subject reuses stable opaque sub with no invented Supabase identity',async()=>{
 const first=await ready(),second=await claim(),p=finishInput(second);p.shopifyProof.subject=first.input.shopifyProof.subject
 assert.equal(await repo.finishReadiness(p),true);const db=snapshot();assert.equal(db.subjects.length,1);assert.equal(db.subjects[0].reservation,'provisional');assert.equal(db.subjects[0].pending_user_id,null)
 assert.ok(db.flows.every(f=>f.sub===first.input.candidateSubject));assert.equal(admin('SELECT count(*) FROM auth.users'),'20')
})
test('concurrent pending migrations reserve one exact target and cannot promote a provisional reservation',async()=>{
 const targetA=owner(),targetB=owner(),a=await claim(record({mode:'migration',target:targetA})),b=await claim(record({mode:'migration',target:targetB})),pa=finishInput(a),pb=finishInput(b)
 pb.shopifyProof.subject=pa.shopifyProof.subject
 const results=await Promise.all([repo.finishReadiness(pa),repo.finishReadiness(pb)]);assert.equal(results.filter(Boolean).length,1)
 assert.equal(snapshot().subjects.length,1);assert.equal(snapshot().subjects[0].reservation,'pending_migration')
 const provisional=await ready(),migration=await claim(record({mode:'migration',target:owner()})),p=finishInput(migration);p.shopifyProof.subject=provisional.input.shopifyProof.subject
 assert.equal(await repo.finishReadiness(p),false)
})
test('migration binds original UUID/session with fresh live-proof metadata and unique target reservation',async()=>{
 const target=owner(),c=await claim(record({mode:'migration',target})),p=finishInput(c)
 for(const change of [{sessionId:randomUUID()},{userId:randomUUID()},{checkedAt:Date.now()-6000},{authenticatedAt:Date.now()-301000},{expiresAt:Date.now()-1}])assert.equal(await repo.finishReadiness({...p,migrationProof:{...p.migrationProof,...change}}),false)
 assert.equal(await repo.finishReadiness(p),true)
 const d=await claim(record({mode:'migration',target:{...target,sessionId:randomUUID()}})),other=finishInput(d)
 assert.equal(await repo.finishReadiness(other),false)
 other.shopifyProof.subject=p.shopifyProof.subject;assert.equal(await repo.finishReadiness(other),true)
})
test('receipt/code/bearer collisions never overwrite an earlier flow',async()=>{
 const first=await issued(),second=await claim(),p=finishInput(second)
 assert.equal(await repo.finishReadiness({...p,codeHash:first.input.codeHash}),false)
 assert.equal(await repo.finishReadiness({...p,shopifyProof:{...p.shopifyProof,receiptId:first.input.shopifyProof.receiptId}}),false)
 assert.equal(await repo.finishReadiness(p),true)
 assert.equal((await repo.redeemCode({...redeemInput({...second,input:p}),bearerHash:first.redeem.bearerHash})).status,'rejected')
})
test('cancellation advances generation and rejects delayed finish and all descendants',async()=>{
 const c=await claim(),p=finishInput(c);assert.equal(await repo.cancel(browser(c.r)),true);assert.equal(await repo.finishReadiness(p),false)
 assert.equal(snapshot().flows[0].generation,1)
 const d=await issued();assert.equal(await repo.cancel(browser(d.r)),true);assert.equal((await repo.consumeUserinfo({...operation(),bearerHash:d.redeem.bearerHash})).status,'rejected')
})
test('pre-registration uncertainty writes a locator tombstone that blocks delayed commit and new operation IDs',async()=>{
 const r=record(),op=operation();await repo.holdOperation({...op,locator:locator(r)})
 assert.equal(await repo.register({...op,record:r}),false);assert.equal(await repo.register({...operation(),record:r}),false)
 assert.equal(await repo.register({...operation(),record:{...r,browserHash:hash(opaque())}}),false)
 assert.equal(await repo.register({...operation(),record:{...r,id:randomUUID(),browserHash:hash(opaque())}}),false)
 await assert.rejects(()=>repo.holdOperation({...operation(),locator:{...locator(r),id:randomUUID()}}),/unavailable/)
 const state=snapshot();assert.equal(state.flows[0].registration,null);assert.equal(state.flows[0].status,'held')
 assert.equal(await repo.register({...operation(),record:record()}),true)
})
test('hold uses original bindings plus observed fences; invalid/transplanted locators cannot affect another flow',async()=>{
 const c=await ready(),base={...c.request,locator:{...locator(c.r),fence:c.c.fence,generation:c.c.generation}}
 for(const change of [{browserHash:hash(opaque())},{outerHash:hash(opaque())},{fence:'999999'},{generation:'1'}])await assert.rejects(()=>repo.holdOperation({...base,locator:{...base.locator,...change}}),/unavailable/)
 const d=await ready();await assert.rejects(()=>repo.holdOperation({...c.request,locator:locator(d.r)}),/unavailable/)
 assert.ok(snapshot().flows.every(f=>f.status==='ready'))
 await repo.holdOperation(base);assert.equal(snapshot().flows.find(f=>f.id===c.r.id).status,'held')
 assert.equal((await repo.redeemCode(redeemInput(c))).status,'rejected');assert.equal(snapshot().flows.find(f=>f.id===d.r.id).status,'ready')
})
test('pre- and post-COMMIT uncertainty are redacted and require original-bound quarantine, never an automatic retry',async()=>{
 for(const afterCommit of [false,true]){
  const r=record(),op=operation();let injected=false,attempts=0
  const faulty=make(localPool({fault:({sql,op:method,before})=>{if(method==='register'&&sql.startsWith('SELECT ')&&before)attempts++;if(!injected&&method==='register'&&((afterCommit&&sql==='COMMIT'&&!before)||(!afterCommit&&sql.startsWith('SELECT ')&&before))){injected=true;return true}return false}}))
  await assert.rejects(()=>faulty.register({...op,record:r}),/^Error: Subject broker repository unavailable$/);assert.equal(injected,true);assert.equal(attempts,1)
  await faulty.holdOperation({...op,locator:locator(r)});assert.equal(await repo.register({...operation(),record:r}),false)
  assert.equal(snapshot().flows.find(f=>f.id===r.id).status,'held')
 }
})
test('lost finish, token and userinfo acknowledgements expose no successful result and quarantine their descendants',async()=>{
 for(const method of ['finish_readiness','redeem_code','consume_userinfo']){
  const c=await claim(),p=finishInput(c);let injected=false
  const faulty=make(localPool({fault:({sql,op,before})=>{if(!injected&&!before&&op===method&&sql==='COMMIT'){injected=true;return true}return false}}))
  let invocation,hold
  if(method==='finish_readiness'){invocation=()=>faulty.finishReadiness(p);hold={...c.request,locator:{...locator(c.r),fence:c.c.fence,generation:c.c.generation}}}
  else{assert.equal(await repo.finishReadiness(p),true);const token=redeemInput({...c,input:p})
   if(method==='redeem_code'){invocation=()=>faulty.redeemCode(token);hold={...token,locator:{kind:'code',hash:p.codeHash,clientId:CLIENT,redirectUri:CALLBACK,challenge:c.r.outer.challenge}}}
   else{assert.equal((await repo.redeemCode(token)).status,'issued');const op=operation();invocation=()=>faulty.consumeUserinfo({...op,bearerHash:token.bearerHash});hold={...op,locator:{kind:'bearer',hash:token.bearerHash}}}
  }
  await assert.rejects(invocation,/unavailable/);assert.equal(injected,true);await faulty.holdOperation(hold);assert.equal(snapshot().flows.find(f=>f.id===c.r.id).status,'held')
 }
})
test('late admitted transaction and quarantine serialize under the same lock and leave no usable flow',async()=>{
 const c=await claim(),p=finishInput(c),late=await localPool().connect();await late.query('BEGIN');await late.query('SELECT tll_broker_private.repository($1::text,$2::jsonb) AS result',['finish_readiness',JSON.stringify(p)])
 let completed=false;const hold=repo.holdOperation({...c.request,locator:{...locator(c.r),fence:c.c.fence,generation:c.c.generation}}).then(()=>{completed=true})
 await pause(75);assert.equal(completed,false);await late.query('COMMIT');late.release();await hold
 assert.equal(snapshot().flows[0].status,'held');assert.equal((await repo.redeemCode(redeemInput({...c,input:p}))).status,'rejected')
})
test('operator disable waits for a transition and prevents further material use',async()=>{
 const r=await admitted(),request=browser(r),late=await localPool().connect();await late.query('BEGIN');await late.query('SELECT tll_broker_private.repository($1::text,$2::jsonb) AS result',['claim_readiness',JSON.stringify(request)])
 const op=await localPool({role:'postgres'}).connect();await op.query('SET SESSION AUTHORIZATION tll_broker_migrator');let finished=false
 const disabling=op.query("SELECT tll_broker_private.operator_set_enabled(false,'synthetic_wait') AS result").then(r=>{finished=true;return r})
 await pause(75);assert.equal(finished,false);await late.query('COMMIT');late.release();assert.equal((await disabling).rows[0].result.enabled,false);op.release()
 await repo.holdOperation({...request,locator:locator(r)});assert.equal(snapshot().flows[0].status,'held')
})
test('adapter projects metadata only and SQL rejects arbitrary proof/registration secret fields',async()=>{
 const r=record();assert.equal(await repo.register({...operation(),record:{...r,accessToken:'SECRET_FORBIDDEN'}}),true)
 assert.equal(raw('register',{...operation(),record:{...record(),accessToken:'SECRET_FORBIDDEN'}}).status,'rejected')
 await repo.admit({...browser(r),outerHash:r.outerHash});const request=browser(r),c=await repo.claimReadiness(request),p=finishInput({r,request,c})
 assert.equal(raw('finish_readiness',{...p,shopifyProof:{...p.shopifyProof,refreshToken:'SECRET_FORBIDDEN'}}).status,'rejected')
 assert.equal(await repo.finishReadiness({...p,shopifyProof:{...p.shopifyProof,accessToken:'SECRET_FORBIDDEN'},secret:'SECRET_FORBIDDEN'}),true)
 assert.doesNotMatch(JSON.stringify(snapshot()),/SECRET_FORBIDDEN|accessToken|refreshToken|email|idToken/)
})
test('bounded browser/daily quotas persist; exhausted regular capacity still permits quarantine and cancellation',async()=>{
 const shared=hash(opaque());for(let i=0;i<10;i++)assert.equal(await repo.register({...operation(),record:record({browserHash:shared})}),true)
 assert.equal(await repo.register({...operation(),record:record({browserHash:shared})}),false)
 admin("UPDATE tll_broker_private.daily_quota SET registrations=500;")
 assert.equal(await repo.register({...operation(),record:record()}),false)
 const r=snapshot().flows[0];await repo.holdOperation({...operation(),locator:{kind:'transaction',id:r.id,browserHash:r.browser_hash,outerHash:r.outer_hash}})
 assert.equal(snapshot().flows.find(f=>f.id===r.id).status,'held')
 assert.equal(await repo.cancel({...operation(),transactionId:snapshot().flows[1].id,browserHash:shared}),true)
})
test('total flow and subject quotas reject new allocation without deleting prior reservations',async()=>{
 admin(`INSERT INTO tll_broker_private.flows(id,config_hash,browser_hash,outer_hash,created_at,status,fence)
 SELECT gen_random_uuid(),'${CONFIG}',encode(sha256(i::text::bytea),'hex'),encode(sha256(('outer'||i)::bytea),'hex'),clock_timestamp(),'held',nextval('tll_broker_private.fences') FROM generate_series(1,10000)i;`)
 assert.equal(await repo.register({...operation(),record:record()}),false)
 const r=record();await repo.holdOperation({...operation(),locator:locator(r)});assert.equal(admin('SELECT count(*) FROM tll_broker_private.flows'),'10001')
 admin('TRUNCATE tll_broker_private.flows,tll_broker_private.operations;')
 admin("INSERT INTO tll_broker_private.subjects SELECT 'tllb_'||translate(rtrim(encode(sha256(i::text::bytea),'base64'),'='),'+/','-_'),'107532616020','https://shopify.com/authentication/107532616020','synthetic-quota-'||i,'provisional',NULL,clock_timestamp() FROM generate_series(1,5000)i")
 const c=await claim();assert.equal(await repo.finishReadiness(finishInput(c)),false);assert.equal(admin('SELECT count(*) FROM tll_broker_private.subjects'),'5000')
})
test('real protocol through durable adapter consumes broker bearer before returning subject-only userinfo',async()=>{
 const transactionId=randomUUID(),secret=opaque(),verifier=opaque(),challenge=createHash('sha256').update(verifier).digest('base64url'),clientSecret='SYNTHETIC_CLIENT_SECRET_'.repeat(3)
 const authorizationQuery=new URLSearchParams({response_type:'code',client_id:CLIENT,redirect_uri:CALLBACK,state:randomUUID(),scope:'subject',code_challenge:challenge,code_challenge_method:'S256'}).toString()
 const registration={transactionId,cookieSecret:secret,authorizationQuery,applicationPkceChallenge:opaque(),mode:'sign_in',target:null}
 const core=createCustomerSubjectBroker({syntheticExecution:true,clientSecret,ports:{repository:repo,currentBrowser:async()=>({transactionId,cookieSecret:secret}),serverRegistration:async()=>registration,currentSession:async()=>null,now:Date.now,
 verifiedShopifySubject:async()=>({transactionId,receiptId:randomUUID(),shopId:'107532616020',issuer:'https://shopify.com/authentication/107532616020',subject:'synthetic-full-protocol',innerPkceChallenge:opaque(),verifiedAt:Date.now(),expiresAt:Date.now()+3600000})}})
 assert.equal((await core.register()).status,'registered');assert.equal((await core.admit(authorizationQuery)).status,'admitted');const ready=await core.ready();assert.equal(ready.status,'authorization_ready')
 const code=new URL(ready.redirectUrl).searchParams.get('code'),token=await core.token({method:'POST',headers:[['authorization','Basic '+Buffer.from(CLIENT+':'+clientSecret).toString('base64')],['content-type','application/x-www-form-urlencoded']],body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:CALLBACK,code_verifier:verifier}).toString()})
 assert.equal(token.status,200);const info=await core.userinfo({method:'GET',headers:[['authorization','Bearer '+token.body.access_token]]});assert.equal(info.status,200);assert.deepEqual(Object.keys(info.body),['sub']);assert.equal(snapshot().flows[0].status,'consumed')
 assert.equal((await core.userinfo({method:'GET',headers:[['authorization','Bearer '+token.body.access_token]]})).status,401)
})

test('lost transition before its operation is recorded quarantines the original flow and denies cross-flow reuse',async()=>{
 for(const method of ['admit','claim_readiness','redeem_code','consume_userinfo'])for(const faultPoint of ['before_sql','after_sql','after_commit']){
  let invocation,hold,original,replay,request,injected=false
  const faulty=make(localPool({fault:({sql,op,before})=>{const hit=faultPoint==='before_sql'?sql.startsWith('SELECT ')&&before:faultPoint==='after_sql'?sql.startsWith('SELECT ')&&!before:sql==='COMMIT'&&!before;if(!injected&&op===method&&hit){injected=true;return true}return false}}))
  if(method==='admit'||method==='claim_readiness'){
   original=record();await repo.register({...operation(),record:original});if(method==='claim_readiness')await repo.admit({...browser(original),outerHash:original.outerHash})
   request=browser(original);hold={...request,locator:locator(original)}
   invocation=()=>method==='admit'?faulty.admit({...request,outerHash:original.outerHash}):faulty.claimReadiness(request)
   replay=()=>method==='admit'?repo.admit({...browser(original),outerHash:original.outerHash}):repo.claimReadiness(browser(original))
  }else{
   const c=method==='redeem_code'?await ready():await issued();original=c.r
   if(method==='redeem_code'){request=redeemInput(c);invocation=()=>faulty.redeemCode(request);hold={...request,locator:{kind:'code',hash:c.input.codeHash,clientId:CLIENT,redirectUri:CALLBACK,challenge:original.outer.challenge}};replay=()=>repo.redeemCode(redeemInput(c))}
   else{request={...operation(),bearerHash:c.redeem.bearerHash};invocation=()=>faulty.consumeUserinfo(request);hold={...request,locator:{kind:'bearer',hash:request.bearerHash}};replay=()=>repo.consumeUserinfo({...operation(),bearerHash:request.bearerHash})}
  }
  await assert.rejects(invocation,/unavailable/);assert.equal(injected,true);await faulty.holdOperation(hold)
  assert.equal(snapshot().flows.find(f=>f.id===original.id).status,'held');const denied=await replay();assert.ok(denied===false||denied.status==='rejected')
  assert.equal(await repo.register({...request,record:record()}),false)
 }
})
test('operation and quarantine caps retain safe revocation when normal allocation is exhausted',async()=>{
 const a=await admitted(),b=await admitted()
 admin(`INSERT INTO tll_broker_private.operations SELECT gen_random_uuid(),'${a.id}','admit',0,1,true,clock_timestamp() FROM generate_series(1,99996)`)
 assert.equal(admin('SELECT count(*) FROM tll_broker_private.operations'),'100000')
 assert.equal((await repo.claimReadiness(browser(a))).status,'rejected')
 await repo.holdOperation({...operation(),locator:locator(a)});assert.equal(await repo.cancel(browser(b)),true)
 assert.equal(admin('SELECT count(*) FROM tll_broker_private.operations'),'100000')
 await assert.rejects(()=>repo.holdOperation({...operation(),locator:locator(record())}),/unavailable/)
 assert.equal(admin('SELECT count(*) FROM tll_broker_private.flows'),'2')
})

test('sign-in cannot reuse a pending-migration subject before authoritative promotion',async()=>{
 const migration=await ready(record({mode:'migration',target:owner()})),saved=structuredClone(snapshot().subjects)
 const signin=await claim(),p=finishInput(signin);p.shopifyProof.subject=migration.input.shopifyProof.subject
 assert.equal(await repo.finishReadiness(p),false);assert.deepEqual(snapshot().subjects,saved)
 const row=snapshot().flows.find(f=>f.id===signin.r.id);assert.equal(row.code_hash,null);assert.equal(row.bearer_hash,null)
 assert.equal(admin('SELECT count(*) FROM auth.users'),'20')
})
test('concurrent migration/sign-in completion reserves one mode and never issues both codes',async()=>{
 for(const migrationFirst of [true,false]){
  const migration=await claim(record({mode:'migration',target:owner()})),signin=await claim(),mp=finishInput(migration),sp=finishInput(signin)
  sp.shopifyProof.subject=mp.shopifyProof.subject
  const inputs=migrationFirst?[mp,sp]:[sp,mp],results=await Promise.all(inputs.map(p=>repo.finishReadiness(p)))
  assert.equal(results.filter(Boolean).length,1)
  const subject=snapshot().subjects.find(s=>s.subject===mp.shopifyProof.subject),winner=inputs[results.findIndex(Boolean)]
  assert.equal(subject.reservation,winner===mp?'pending_migration':'provisional')
  assert.equal(subject.pending_user_id,winner===mp?migration.r.target.userId:null)
  const rows=snapshot().flows.filter(f=>[migration.r.id,signin.r.id].includes(f.id));assert.equal(rows.filter(f=>f.code_hash!==null).length,1)
 }
})
