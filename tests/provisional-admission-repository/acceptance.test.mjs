// Real PG17 admission intent proof. This does not dispatch HTTP or verify a session.
import test,{before,beforeEach,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {build} from 'esbuild'
import {admin,assertFixture,localPool,closeClients} from './local-pg.mjs'
import {createAesGcmEnvelopeVault} from '../../lib/identity/customer-token-vault.ts'
const bundle=await build({entryPoints:['lib/identity/customer-provisional-admission-repository.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'})
const {createCustomerProvisionalAdmissionRepository:create,createProvisionalAdmissionMetadata:describe}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text+'\n//# sourceURL=provisional-admission-repository.js').toString('base64'))
const ORIGIN='https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app',CLIENT='tll-staging-subject-broker-v1',CALLBACK='https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/callback'
const opaque=()=>randomBytes(32).toString('base64url'),hash=s=>createHash('sha256').update(s).digest('hex'),challenge=s=>createHash('sha256').update(s).digest('base64url')
const owner=()=>({userId:randomUUID(),sessionId:randomUUID(),accessTokenHash:hash(opaque())})
function intent(change={},verifier=opaque()){const now=Date.now();return{operationId:randomUUID(),applicationPkceVerifier:verifier,metadata:describe({applicationOrigin:ORIGIN,transactionId:randomUUID(),browserHash:hash(opaque()),mode:'sign_in',original:null,applicationPkceChallenge:challenge(verifier),createdAt:now,expiresAt:now+300000,...change})}}
const binding=p=>{const r=p.metadata??p;return{transactionId:r.transactionId,browserHash:r.browserHash,configHash:r.configHash,intentHash:r.intentHash,applicationPkceChallenge:r.applicationPkceChallenge}}
const op=p=>({...binding(p),operationId:randomUUID()})
const proof=p=>p.metadata.original?{...p.metadata.original,issuer:'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1',audience:'authenticated',anonymous:false,checkedAt:Date.now(),authenticatedAt:Date.now()-1000,expiresAt:Date.now()+3600000}:null
function admission(change={}){const fields={response_type:'code',client_id:CLIENT,redirect_uri:CALLBACK,scope:'subject',state:randomUUID(),code_challenge_method:'S256',code_challenge:opaque(),...change},authorizationQuery=new URLSearchParams(fields).toString();return{authorizationQuery,authorizationUrl:ORIGIN+'/auth/customer/authorize?'+authorizationQuery}}
const outer=a=>{const q=new URLSearchParams(a.authorizationQuery);return{clientId:q.get('client_id'),redirectUri:q.get('redirect_uri'),state:q.get('state'),scope:q.get('scope'),challenge:q.get('code_challenge'),method:q.get('code_challenge_method')}}
const outerHash=o=>hash(JSON.stringify([o.clientId,o.redirectUri,o.state,o.scope,o.challenge,o.method]))
const raw=(method,p)=>JSON.parse(admin(`SET ROLE tll_provisional_executor; SELECT tll_provisional_private.repository('${method}','${JSON.stringify(p).replaceAll("'","''")}'::jsonb);`))
const rows=()=>JSON.parse(admin("SELECT coalesce(json_agg(r ORDER BY id),'[]') FROM tll_provisional_private.intents r;"))
const aad=m=>['tll-provisional-admission/v1','qdmvngjwkcsilzmqksme','application-pkce',m.transactionId,m.configHash,m.browserHash,m.intentHash,'0']
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let vault,repo,verified=false
const make=(pool=localPool())=>create({pool,vault,applicationOrigin:ORIGIN,syntheticExecution:true})
async function prepared(p=intent()){assert.equal(await repo.prepare(p),true);return p}
async function claimed(p=intent()){await prepared(p);const request={...op(p),currentMigrationProof:proof(p)},c=await repo.claimAdmission(request);assert.equal(c.status,'claimed');return{p,request,c}}
const finishInput=c=>({...c.request,fence:c.c.snapshot.fence,generation:c.c.snapshot.generation,admission:admission()})
async function admitted(p=intent()){const c=await claimed(p),finish=finishInput(c);assert.equal(await repo.finishAdmission(finish),true);return{...c,finish}}
before(()=>{assertFixture();verified=true;assert.equal(admin('SELECT enabled FROM tll_provisional_private.control'),'f')})
beforeEach(()=>{vault?.destroy();vault=createAesGcmEnvelopeVault({activeKeyId:'synthetic-admission-1',keys:new Map([['synthetic-admission-1',randomBytes(32)]])});admin('TRUNCATE tll_provisional_private.intents,tll_provisional_private.operations,tll_provisional_private.daily_quota; UPDATE tll_provisional_private.control SET enabled=true;');repo=make()})
after(async()=>{if(!verified)return;admin('UPDATE tll_provisional_private.control SET enabled=false; TRUNCATE tll_provisional_private.intents,tll_provisional_private.operations,tll_provisional_private.daily_quota;');vault?.destroy();await closeClients();assert.equal(admin('SELECT enabled FROM tll_provisional_private.control'),'f')})

test('private admission owner/executor and tables are independent from browsers, service role and other repositories',()=>{
 for(const role of ['anon','authenticated','service_role','tll_provisional_executor','tll_broker_executor','tll_customer_executor']){
  if(admin(`SELECT count(*) FROM pg_roles WHERE rolname='${role}'`)==='0')continue
  assert.equal(admin(`SELECT has_schema_privilege('${role}','tll_provisional_private','CREATE')`),'f')
  for(const table of ['intents','operations','control','daily_quota'])assert.equal(admin(`SELECT has_table_privilege('${role}','tll_provisional_private.${table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege('${role}','tll_provisional_private.${table}','SELECT,INSERT,UPDATE,REFERENCES')`),'f')
  assert.equal(admin(`SELECT has_sequence_privilege('${role}','tll_provisional_private.fences','USAGE,SELECT,UPDATE')`),'f')
  assert.throws(()=>admin(`SET ROLE ${role}; SELECT * FROM tll_provisional_private.intents`))
  if(role!=='tll_provisional_executor')assert.equal(admin(`SELECT has_schema_privilege('${role}','tll_provisional_private','USAGE')`),'f')
 }
 assert.equal(admin("SELECT count(*) FROM pg_roles WHERE rolname LIKE 'tll_provisional_%' AND rolcanlogin"),'0')
 assert.equal(admin("SELECT count(*) FROM pg_auth_members WHERE (roleid IN ('tll_provisional_owner'::regrole,'tll_provisional_executor'::regrole) OR member IN ('tll_provisional_owner'::regrole,'tll_provisional_executor'::regrole)) AND NOT(roleid IN ('tll_provisional_owner'::regrole,'tll_provisional_executor'::regrole) AND member='tll_provisional_migrator'::regrole AND grantor='postgres'::regrole AND admin_option AND NOT inherit_option AND NOT set_option)"),'0')
 for(const role of ['tll_provisional_owner','tll_provisional_executor']){
  assert.equal(admin(`SELECT count(*) FROM pg_auth_members WHERE roleid='${role}'::regrole`),'1')
  assert.equal(admin(`SELECT pg_has_role('tll_provisional_migrator','${role}','USAGE') OR pg_has_role('tll_provisional_migrator','${role}','SET')`),'f')
 }

})
test('operator controls aggregate state only and retains ADMIN-only executor delegation',()=>{
 const status=JSON.parse(admin('SET SESSION AUTHORIZATION tll_provisional_migrator; SELECT tll_provisional_private.operator_status()'))
 assert.deepEqual(Object.keys(status).sort(),['admitted','changedAt','dailyQuota','enabled','held','inflight','intents','operations','reasonCode'])
 assert.equal(status.dailyQuota,0);admin("INSERT INTO tll_provisional_private.daily_quota VALUES(current_date,1)");assert.equal(JSON.parse(admin('SET SESSION AUTHORIZATION tll_provisional_migrator; SELECT tll_provisional_private.operator_status()')).dailyQuota,1)
 for(const sql of ['SELECT * FROM tll_provisional_private.intents','SET ROLE tll_provisional_executor','SET ROLE tll_provisional_owner','CREATE TABLE tll_provisional_private.forbidden(id int)'])assert.throws(()=>admin('SET SESSION AUTHORIZATION tll_provisional_migrator; '+sql))
 for(const role of ['anon','authenticated','service_role','tll_provisional_executor'])assert.throws(()=>admin(`SET SESSION AUTHORIZATION ${role}; SELECT tll_provisional_private.operator_status()`))
 admin(`BEGIN; SET SESSION AUTHORIZATION tll_provisional_migrator; CREATE ROLE tll_provisional_delegation_probe NOLOGIN NOINHERIT;
 GRANT tll_provisional_executor TO tll_provisional_delegation_probe WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;
 DO $$BEGIN IF NOT pg_has_role('tll_provisional_delegation_probe','tll_provisional_executor','USAGE') THEN RAISE EXCEPTION 'Delegation missing';END IF;END$$;
 REVOKE tll_provisional_executor FROM tll_provisional_delegation_probe;ROLLBACK;`)
})
test('prepared verifier is authenticated ciphertext with purpose/transaction/config/browser/intent/generation AAD',async()=>{
 const p=await prepared(),stored=rows()[0],state=await repo.readIntent(binding(p))
 assert.equal(state.state,'prepared');assert.deepEqual(state.metadata,p.metadata)
 assert.deepEqual(vault.open(stored.material,aad(p.metadata)),{verifier:p.applicationPkceVerifier})
 assert.doesNotMatch(JSON.stringify(stored),new RegExp(p.applicationPkceVerifier))
 assert.doesNotMatch(JSON.stringify(state),/ciphertext|material|verifier|accessToken\"|refreshToken|idToken|email/)
 assert.equal(stored.metadata.original,null);assert.equal('userId' in stored.metadata,false)
 for(const i of [0,2,3,4,5,6,7]){const wrong=aad(p.metadata);wrong[i]+='x';assert.throws(()=>vault.open(stored.material,wrong),/unavailable/)}
 const damaged={...stored.material,ciphertext:'A'+stored.material.ciphertext.slice(1)};if(damaged.ciphertext===stored.material.ciphertext)damaged.ciphertext='B'+stored.material.ciphertext.slice(1)
 assert.throws(()=>vault.open(damaged,aad(p.metadata)),/unavailable/)
})
test('default/live gates touch neither pool nor vault; SQL disable preserves metadata reads and revocation',async()=>{
 let touched=0;const never={async connect(){touched++;throw Error('Unexpected')}}
 for(const options of [{},{syntheticExecution:true,liveEnabled:true}]){const disabled=create({pool:never,vault:{seal(){touched++;throw Error('Unexpected')}},applicationOrigin:ORIGIN,...options});assert.equal(await disabled.prepare(intent()),false);assert.equal(await disabled.readIntent(binding(intent())),null)}
 assert.equal(touched,0)
 const p=await prepared();admin('UPDATE tll_provisional_private.control SET enabled=false')
 assert.equal(await repo.prepare(intent()),false);assert.equal((await repo.claimAdmission({...op(p),currentMigrationProof:null})).status,'rejected')
 assert.equal((await repo.readIntent(binding(p))).state,'prepared');assert.equal(await repo.cancel(op(p)),true)
 const unknown=intent();await repo.holdOperation(op(unknown));assert.equal((await repo.readIntent(binding(unknown))).state,'held')
})
test('prepare is immutable and never reuses an ID or PKCE challenge across concurrent starts',async()=>{
 const p=intent(),result=await Promise.all([repo.prepare(p),repo.prepare({...p,operationId:randomUUID()})]);assert.equal(result.filter(Boolean).length,1)
 const different=intent({transactionId:p.metadata.transactionId});assert.equal(await repo.prepare(different),false)
 const reused=intent({},p.applicationPkceVerifier);assert.equal(await repo.prepare(reused),false)
 await assert.rejects(()=>repo.prepare({...intent(),applicationPkceVerifier:p.applicationPkceVerifier}),/unavailable/)
 assert.equal(rows().length,1)
})
test('one-use claim and its paired finish bind browser/config/intent and deny unrelated operation reuse',async()=>{
 const p=await prepared(),requests=[{...op(p),currentMigrationProof:null},{...op(p),currentMigrationProof:null}]
 const claims=await Promise.all(requests.map(r=>repo.claimAdmission(r)));assert.equal(claims.filter(c=>c.status==='claimed').length,1)
 const at=claims.findIndex(c=>c.status==='claimed'),c={p,request:requests[at],c:claims[at]},finish=finishInput(c)
 assert.equal(await repo.cancel(c.request),false);assert.equal(await repo.finishAdmission({...finish,operationId:randomUUID()}),false)
 assert.equal(await repo.finishAdmission(finish),true);assert.equal(await repo.finishAdmission(finish),false)
 assert.equal(await repo.prepare({...intent(),operationId:c.request.operationId}),false)
 assert.equal((await repo.claimAdmission({...op(p),currentMigrationProof:null})).status,'rejected')
 const s=await repo.readIntent(binding(p));assert.equal(s.state,'admitted');assert.deepEqual(s.outer,outer(finish.admission));assert.equal(s.outerHash,outerHash(s.outer))
})
test('migration claim requires exact original UUID/session/token hash and fresh verifier metadata',async()=>{
 const p=await prepared(intent({mode:'migration',original:owner()})),current=proof(p)
 for(const changes of [{userId:randomUUID()},{sessionId:randomUUID()},{accessTokenHash:hash(opaque())},{checkedAt:Date.now()-5001},{authenticatedAt:Date.now()-300001},{expiresAt:Date.now()-1},{checkedAt:Date.now()+10000}]){
  assert.equal((await repo.claimAdmission({...op(p),currentMigrationProof:{...current,...changes}})).status,'rejected')
 }
 assert.equal((await repo.claimAdmission({...op(p),currentMigrationProof:null})).status,'rejected')
 const c=await repo.claimAdmission({...op(p),currentMigrationProof:proof(p)});assert.equal(c.status,'claimed');assert.deepEqual(c.snapshot.metadata.original,p.metadata.original)
 assert.equal(admin('SELECT count(*) FROM auth.users'),'20')
})
test('sign-in cannot accept migration metadata and wrong browser/config/intent cannot read or claim',async()=>{
 const p=await prepared(),b=binding(p),foreign=intent({mode:'migration',original:owner()})
 assert.equal((await repo.claimAdmission({...op(p),currentMigrationProof:proof(foreign)})).status,'rejected')
 for(const changes of [{browserHash:hash(opaque())},{intentHash:hash(opaque())},{applicationPkceChallenge:opaque()}]){
  assert.equal(await repo.readIntent({...b,...changes}),null);assert.equal((await repo.claimAdmission({...op(p),...changes,currentMigrationProof:null})).status,'rejected')
 }
 await assert.rejects(()=>repo.readIntent({...b,configHash:hash(opaque())}),/unavailable/)
 assert.equal(raw('read_intent',{...b,configHash:hash(opaque())}).status,'rejected')
})
test('database-clock proof expiry is checked after acquiring the transition lock',async()=>{
 const p=await prepared(intent({mode:'migration',original:owner()})),current={...proof(p),expiresAt:Date.now()+400}
 const lock=await localPool({role:'postgres'}).connect();await lock.query('BEGIN');await lock.query('SELECT singleton FROM tll_provisional_private.control FOR UPDATE')
 const waiting=repo.claimAdmission({...op(p),currentMigrationProof:current});await pause(500);await lock.query('COMMIT');lock.release()
 assert.equal((await waiting).status,'rejected');assert.equal((await repo.readIntent(binding(p))).state,'prepared')
})
test('expired intents remain readable but cannot be claimed, finished or reclaimed',async()=>{
 const c=await claimed(intent({expiresAt:Date.now()+1000})),finish=finishInput(c)
 const lock=await localPool({role:'postgres'}).connect();await lock.query('BEGIN');await lock.query('SELECT singleton FROM tll_provisional_private.control FOR UPDATE')
 const waiting=repo.finishAdmission(finish);await pause(1100);await lock.query('COMMIT');lock.release();assert.equal(await waiting,false)
 const s=await repo.readIntent(binding(c.p));assert.equal(s.state,'admission_inflight');assert.ok(s.observedAt>c.p.metadata.expiresAt)
 assert.equal((await repo.claimAdmission({...op(c.p),currentMigrationProof:null})).status,'rejected')
})
test('admission finish revalidates exact normalized URL/query and independent outer S256',async()=>{
 const c=await claimed(),finish=finishInput(c)
 for(const value of [admission({code_challenge:c.p.metadata.applicationPkceChallenge}),admission({client_id:'other'}),admission({scope:'subject email'}),
  {...finish.admission,authorizationUrl:'https://other.example/?'+finish.admission.authorizationQuery},
  {authorizationQuery:finish.admission.authorizationQuery+'&state='+randomUUID(),authorizationUrl:finish.admission.authorizationUrl+'&state='+randomUUID()}])await assert.rejects(()=>repo.finishAdmission({...finish,admission:value}),/unavailable/)
 assert.equal(await repo.finishAdmission(finish),true)
})
test('SQL independently enforces origin/config/intent fingerprints, envelope shape and canonical outer tuple',async()=>{
 const p=intent(),material=vault.seal({verifier:p.applicationPkceVerifier},aad(p.metadata))
 for(const metadata of [{...p.metadata,applicationOrigin:'https://other.example'},{...p.metadata,mode:'migration'},
  {...p.metadata,accessToken:'UNSTORED_SECRET'},{...p.metadata,expiresAt:p.metadata.expiresAt+1}])assert.equal(raw('prepare',{...op(p),metadata,material}).status,'rejected')
 assert.equal(raw('prepare',{...op(p),metadata:p.metadata,material:{...material,accessToken:'UNSTORED_SECRET'}}).status,'rejected')
 const c=await claimed(p),f=finishInput(c),o=outer(f.admission)
 const payload={...c.request,fence:f.fence,generation:f.generation,outer:o,outerHash:outerHash(o)}
 for(const changes of [{outerHash:hash(opaque())},{outer:{...o,scope:'email'}},{outer:{...o,accessToken:'UNSTORED_SECRET'}},{outer:{...o,challenge:p.metadata.applicationPkceChallenge}}])assert.equal(raw('finish_admission',{...payload,...changes}).status,'rejected')
 assert.equal(await repo.finishAdmission(f),true);assert.doesNotMatch(JSON.stringify(rows()),/UNSTORED_SECRET/)
})
test('outer state and tuple cannot be transplanted to a second admitted intent',async()=>{
 const first=await admitted(),second=await claimed(),p=finishInput(second);p.admission=first.finish.admission
 assert.equal(await repo.finishAdmission(p),false)
 p.admission=admission({state:outer(first.finish.admission).state});assert.equal(await repo.finishAdmission(p),false)
 assert.equal(rows().filter(r=>r.state==='admitted').length,1)
})
test('preprepare tombstones bind original ID/browser/config/intent and reserve its PKCE challenge',async()=>{
 const p=intent(),request=op(p);await repo.holdOperation(request)
 assert.equal(await repo.prepare(p),false);assert.equal(await repo.prepare({...p,operationId:randomUUID()}),false)
 assert.equal(await repo.prepare(intent({},p.applicationPkceVerifier)),false)
 const s=await repo.readIntent(binding(p));assert.equal(s.state,'held');assert.equal(s.metadata,null)
 assert.equal(rows()[0].material,null);assert.equal(await repo.prepare(intent()),true)
})
test('cancellation advances generation, destroys held verifier and rejects stale finish/hold authority',async()=>{
 const c=await claimed(),f=finishInput(c)
 assert.equal(await repo.cancel(op(c.p)),true);assert.equal(await repo.finishAdmission(f),false)
 const s=await repo.readIntent(binding(c.p));assert.equal(s.generation,'1');assert.equal(s.state,'cancelled');assert.equal(rows()[0].material,null)
 await assert.rejects(()=>repo.holdOperation({...c.request,fence:f.fence,generation:f.generation}),/unavailable/)
 const other=await admitted();await assert.rejects(()=>repo.holdOperation({...other.request,browserHash:c.p.metadata.browserHash}),/unavailable/)
 assert.equal((await repo.readIntent(binding(other.p))).state,'admitted')
})
test('pre-SQL, lost-query and lost-COMMIT prepare outcomes cannot be retried with a new operation',async()=>{
 for(const point of ['before_sql','after_sql','after_commit']){
  let injected=false;const p=intent(),faulty=make(localPool({fault:({sql,op,before})=>{const hit=point==='before_sql'?sql.startsWith('SELECT ')&&before:point==='after_sql'?sql.startsWith('SELECT ')&&!before:sql==='COMMIT'&&!before;if(!injected&&op==='prepare'&&hit){injected=true;return true}return false}}))
  await assert.rejects(()=>faulty.prepare(p),/^Error: Provisional admission repository unavailable$/);assert.equal(injected,true)
  await faulty.holdOperation({...binding(p),operationId:p.operationId});assert.equal((await repo.readIntent(binding(p))).state,'held')
  assert.equal(await repo.prepare({...p,operationId:randomUUID()}),false)
 }
})
test('unknown claim/finish outcomes are never reclaimed, even when their operation was not committed',async()=>{
 for(const method of ['claim_admission','finish_admission'])for(const point of ['before_sql','after_sql','after_commit']){
  let injected=false;const faulty=make(localPool({fault:({sql,op,before})=>{const hit=point==='before_sql'?sql.startsWith('SELECT ')&&before:point==='after_sql'?sql.startsWith('SELECT ')&&!before:sql==='COMMIT'&&!before;if(!injected&&op===method&&hit){injected=true;return true}return false}}))
  let p,request,run,hold
  if(method==='claim_admission'){p=await prepared();request={...op(p),currentMigrationProof:null};run=()=>faulty.claimAdmission(request);hold=request}
  else{const c=await claimed();p=c.p;request=finishInput(c);run=()=>faulty.finishAdmission(request);hold=request}
  await assert.rejects(run,/unavailable/);assert.equal(injected,true)
  // An acknowledged read of admitted metadata alone does not grant HTTP/redirect.
  const observed=await repo.readIntent(binding(p));assert.ok(['prepared','admission_inflight','admitted'].includes(observed.state))
  await faulty.holdOperation(hold);assert.equal((await repo.readIntent(binding(p))).state,'held');assert.equal(rows().find(r=>r.id===p.metadata.transactionId).material,null)
  assert.equal((await repo.claimAdmission({...op(p),currentMigrationProof:null})).status,'rejected')
  assert.equal(await repo.prepare({...intent(),operationId:request.operationId}),false)
 }
})
test('late committed admission and original hold serialize and leave retained outer evidence unusable',async()=>{
 const c=await claimed(),f=finishInput(c),o=outer(f.admission),late=await localPool().connect();await late.query('BEGIN')
 await late.query('SELECT tll_provisional_private.repository($1::text,$2::jsonb) AS result',['finish_admission',JSON.stringify({...c.request,fence:f.fence,generation:f.generation,outer:o,outerHash:outerHash(o)})])
 let done=false;const hold=repo.holdOperation(f).then(()=>{done=true});await pause(75);assert.equal(done,false)
 await late.query('COMMIT');late.release();await hold
 const s=await repo.readIntent(binding(c.p));assert.equal(s.state,'held');assert.deepEqual(s.outer,o);assert.equal(rows()[0].material,null)
})
test('operator disable waits for current transition then permits only metadata read and revocation',async()=>{
 const p=await prepared(),request={...op(p),currentMigrationProof:null},late=await localPool().connect();await late.query('BEGIN')
 await late.query('SELECT tll_provisional_private.repository($1::text,$2::jsonb) AS result',['claim_admission',JSON.stringify(request)])
 const operator=await localPool({role:'postgres'}).connect();await operator.query('SET SESSION AUTHORIZATION tll_provisional_migrator');let done=false
 const disable=operator.query("SELECT tll_provisional_private.operator_set_enabled(false,'synthetic_wait') AS result").then(r=>{done=true;return r})
 await pause(75);assert.equal(done,false);await late.query('COMMIT');late.release();assert.equal((await disable).rows[0].result.enabled,false);operator.release()
 assert.equal((await repo.readIntent(binding(p))).state,'admission_inflight');await repo.holdOperation(request);assert.equal((await repo.readIntent(binding(p))).state,'held')
})
test('browser and UTC daily quotas are durable and do not prevent known revocation',async()=>{
 const browserHash=hash(opaque()),items=[];for(let i=0;i<10;i++){const p=intent({browserHash});assert.equal(await repo.prepare(p),true);items.push(p)}
 assert.equal(await repo.prepare(intent({browserHash})),false);admin('UPDATE tll_provisional_private.daily_quota SET preparations=500')
 assert.equal(await repo.prepare(intent()),false);await repo.holdOperation(op(items[0]));assert.equal(await repo.cancel(op(items[1])),true)
})
test('normal flow/operation capacity never blocks holding or cancelling known intents',async()=>{
 const a=await prepared(),b=await prepared()
 admin(`INSERT INTO tll_provisional_private.operations SELECT gen_random_uuid(),'${a.metadata.transactionId}','prepare',0,1,true,clock_timestamp() FROM generate_series(1,99998)`)
 assert.equal((await repo.claimAdmission({...op(a),currentMigrationProof:null})).status,'rejected');const hold=op(a),cancel=op(b);await repo.holdOperation(hold);assert.equal(await repo.cancel(cancel),true)
 await assert.rejects(()=>repo.holdOperation({...op(b),operationId:hold.operationId}),/unavailable/)
 assert.equal(await repo.cancel({...op(a),operationId:cancel.operationId}),false)
 await assert.rejects(()=>repo.holdOperation(op(intent())),/unavailable/)
 assert.equal(admin('SELECT count(*) FROM tll_provisional_private.operations'),'100002');assert.equal(rows().length,2)
})
test('retained flow cap leaves reserved quarantine headroom with no automatic deletion',async()=>{
 admin("INSERT INTO tll_provisional_private.intents(id,browser_hash,config_hash,intent_hash,application_challenge,created_at,state,fence) SELECT gen_random_uuid(),encode(sha256(('b'||i)::bytea),'hex'),encode(sha256(('c'||i)::bytea),'hex'),encode(sha256(('i'||i)::bytea),'hex'),translate(rtrim(encode(sha256(i::text::bytea),'base64'),'='),'+/','-_'),clock_timestamp(),'held',nextval('tll_provisional_private.fences') FROM generate_series(1,10000)i")
 assert.equal(await repo.prepare(intent()),false);const p=intent();await repo.holdOperation(op(p));assert.equal((await repo.readIntent(binding(p))).state,'held')
 assert.equal(admin('SELECT count(*) FROM tll_provisional_private.intents'),'10001')
})
