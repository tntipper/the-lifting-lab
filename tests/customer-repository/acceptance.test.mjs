import test,{before,beforeEach,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'
import {admin,assertFixture,localPool,closeClients} from './local-pg.mjs'
import {createAesGcmEnvelopeVault} from '../../lib/identity/customer-token-vault.ts'
const bundle=await build({entryPoints:['lib/identity/customer-connection-repository.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'})
const {createCustomerConnectionRepository}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const SHOP='107532616020',ISSUER='https://shopify.com/authentication/'+SHOP,CONFIG='a'.repeat(64)
const users=Array.from({length:20},(_,i)=>'a0000000-0000-4000-8000-'+String(i+1).padStart(12,'0'))
const owned=(i=0)=>({userId:users[i],sessionId:'b0000000-0000-4000-8000-'+String(i+1).padStart(12,'0')})
const bound=(i=0,subject='gid://shopify/Customer/synthetic-1')=>({userId:users[i],shopId:SHOP,issuer:ISSUER,subject})
const a=(i=0,change={})=>{const now=Date.now();return{id:randomUUID(),stateHash:createHash('sha256').update(randomBytes(32)).digest('hex'),owner:owned(i),configHash:CONFIG,shopId:SHOP,callbackUrl:'https://synthetic-staging.vercel.app/auth/shopify/callback',nonce:randomBytes(32).toString('base64url'),verifier:randomBytes(32).toString('base64url'),createdAt:now,expiresAt:now+300000,...change}}
const t=(change={})=>({accessToken:'SYNTHETIC_SECRET_access_'+randomUUID(),refreshToken:'SYNTHETIC_SECRET_refresh_'+randomUUID(),idToken:'SYNTHETIC_SECRET_id_'+randomUUID(),accessExpiresAt:Date.now()+3600000,originalNonce:'n'.repeat(43),scopes:['openid','email','customer-account-api:full'],scopeProvenance:{source:'unchanged_request',requestedScope:'openid email customer-account-api:full',grantType:'refresh_token'},refreshTokenProvenance:{source:'retained_original',grantType:'refresh_token',previousTokenHash:'b'.repeat(64)},...change})
let vault,repo,fixtureVerified=false
const snapshot=()=>JSON.parse(admin("SELECT json_build_object('owners',(SELECT coalesce(json_agg(o),'[]') FROM tll_customer_private.owners o),'attempts',(SELECT coalesce(json_agg(a),'[]') FROM tll_customer_private.attempts a),'connections',(SELECT coalesce(json_agg(c),'[]') FROM tll_customer_private.connections c));"))
async function claimed(i=0){const attempt=a(i);assert.equal(await repo.createAttempt(attempt),true);const claim=await repo.claimAttempt(attempt.stateHash,owned(i),CONFIG,Date.now());assert.equal(claim.status,'claimed');return claim}
async function connect(i=0,subject){const claim=await claimed(i),tokens=t();const result=await repo.finishAttempt(claim.attempt.id,claim.fence,bound(i,subject),tokens,Date.now());assert.equal(result.status,'connected');return{id:result.connectionId,claim,tokens}}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
before(()=>{assertFixture();fixtureVerified=true;assert.equal(admin('SELECT enabled FROM tll_customer_private.control'),'f')})
beforeEach(()=>{vault?.destroy();admin('TRUNCATE tll_customer_private.owners CASCADE; UPDATE tll_customer_private.control SET enabled=true;');vault=createAesGcmEnvelopeVault({activeKeyId:'synthetic-1',keys:new Map([['synthetic-1',randomBytes(32)]])});repo=createCustomerConnectionRepository({pool:localPool(),vault,syntheticExecution:true})})
after(async()=>{if(!fixtureVerified)return;admin('UPDATE tll_customer_private.control SET enabled=false; TRUNCATE tll_customer_private.owners CASCADE;');vault?.destroy();await closeClients();assert.equal(admin('SELECT enabled FROM tll_customer_private.control'),'f')})

test('private executor cannot bypass transitions and browser/service roles have no effective authority',async()=>{
 for(const role of ['anon','authenticated','service_role','tll_customer_executor']){
  assert.equal(admin(`SELECT has_table_privilege('${role}','tll_customer_private.connections','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege('${role}','tll_customer_private.connections','SELECT,INSERT,UPDATE,REFERENCES');`),'f')
  const pool=localPool({role});const c=await pool.connect();await assert.rejects(()=>c.query('SELECT * FROM tll_customer_private.connections'));c.release()
  if(role!=='tll_customer_executor'){const c=await pool.connect();await assert.rejects(()=>c.query("SELECT tll_customer_private.repository('logout','{}'::jsonb)"));c.release()}
 }
 assert.equal(admin("SELECT count(*) FROM pg_auth_members WHERE (roleid IN ('tll_customer_owner'::regrole,'tll_customer_executor'::regrole) OR member IN ('tll_customer_owner'::regrole,'tll_customer_executor'::regrole)) AND NOT(roleid IN ('tll_customer_owner'::regrole,'tll_customer_executor'::regrole) AND member='tll_customer_migrator'::regrole AND grantor='postgres'::regrole AND admin_option AND NOT inherit_option AND NOT set_option)"),'0')
 assert.equal(admin("SELECT count(*) FROM pg_auth_members WHERE roleid='tll_customer_executor'::regrole AND member='tll_customer_migrator'::regrole AND admin_option AND NOT inherit_option AND NOT set_option"),'1')
 assert.equal(admin("SELECT has_schema_privilege('tll_customer_migrator','tll_customer_private','CREATE')"),'f')
 assert.equal(admin("SELECT count(*) FROM pg_roles WHERE rolname='tll_customer_role_setup'"),'0')
 for(const role of ['tll_customer_owner','tll_customer_executor']){
  assert.equal(admin(`SELECT count(*) FROM pg_auth_members WHERE roleid='${role}'::regrole`),'1')
  assert.equal(admin(`SELECT pg_has_role('tll_customer_migrator','${role}','USAGE') OR pg_has_role('tll_customer_migrator','${role}','SET')`),'f')
 }

})
test('recorded non-superuser operator receives only aggregate status/control, not stored identity or ciphertext',async()=>{
 const query=sql=>JSON.parse(admin('SET SESSION AUTHORIZATION tll_customer_migrator; '+sql))
 const status=query('SELECT tll_customer_private.operator_status();')
 assert.deepEqual(Object.keys(status).sort(),['attempts','changedAt','connections','enabled','owners','reasonCode'])
 assert.equal(status.owners,0);assert.equal(status.enabled,true)
 assert.deepEqual(status.attempts,{pending:0,exchanging:0,connected:0,held:0})
 assert.deepEqual(status.connections,{active:0,refreshing:0,held:0,loggedOut:0})
 await connect()
 const occupied=query('SELECT tll_customer_private.operator_status();')
 assert.equal(occupied.owners,1);assert.equal(occupied.attempts.connected,1);assert.equal(occupied.connections.active,1)
 assert.doesNotMatch(JSON.stringify(occupied),/SYNTHETIC_SECRET|gid:\/\/shopify|a0000000|ciphertext|tokens|operator_oid/)
 const changed=query("SELECT tll_customer_private.operator_set_enabled(false,'synthetic_operator_test');")
 assert.equal(changed.enabled,false);assert.equal(changed.reasonCode,'synthetic_operator_test');assert.ok(Number.isFinite(Date.parse(changed.changedAt)))
 assert.equal(query("SELECT tll_customer_private.operator_set_enabled(true,'synthetic_operator_restore');").enabled,true)
 for(const sql of ['SET ROLE tll_customer_owner','SET ROLE tll_customer_executor','SELECT * FROM tll_customer_private.control','SELECT tokens FROM tll_customer_private.connections',"UPDATE tll_customer_private.control SET enabled=true",'CREATE TABLE tll_customer_private.forbidden(id int)',"SELECT tll_customer_private.repository('logout','{}'::jsonb)"]){
  assert.throws(()=>admin('SET SESSION AUTHORIZATION tll_customer_migrator; '+sql))
 }
 for(const role of ['anon','authenticated','service_role','tll_customer_executor'])for(const sql of ['SELECT tll_customer_private.operator_status()',"SELECT tll_customer_private.operator_set_enabled(true,'synthetic')"]){
  assert.throws(()=>admin('SET SESSION AUTHORIZATION '+role+'; '+sql))
 }
})
test('operator disable waits for admitted SQL, then blocks material claims while permitting revocation',async()=>{
 const attempt=a();assert.equal(await repo.createAttempt(attempt),true)
 const admitted=await localPool().connect();await admitted.query('BEGIN')
 await admitted.query("SELECT tll_customer_private.repository('claim_attempt',$1::jsonb) AS result",[JSON.stringify({stateHash:attempt.stateHash,...owned(),configHash:CONFIG})])
 // Run in another psql connection; exact SESSION identity, never privileged status.
 const operator=await localPool({role:'postgres'}).connect();await operator.query('SET SESSION AUTHORIZATION tll_customer_migrator')
 let complete=false
 const disabling=operator.query("SELECT tll_customer_private.operator_set_enabled(false,'synthetic_wait_test') AS result").then(r=>{complete=true;return r})
 await pause(100);assert.equal(complete,false)
 await admitted.query('COMMIT');admitted.release()
 assert.equal((await disabling).rows[0].result.enabled,false);operator.release()
 assert.equal(await repo.createAttempt(a(1)),false)
 assert.equal((await repo.beginLogout(owned(),SHOP,Date.now())).status,'local_revoked')
})
test('two explicit disabled gates prevent allocation and SQL use, while logout can revoke after DB switch-off',async()=>{
 const never={async connect(){throw new Error('disabled adapter touched pool')}}
 for(const opts of [{},{syntheticExecution:false},{syntheticExecution:true,liveEnabled:true}]){const r=createCustomerConnectionRepository({pool:never,vault,...opts});assert.equal(await r.createAttempt(a()),false);assert.equal((await r.claimRefresh(randomUUID(),owned(),CONFIG,Date.now(),60000)).status,'rejected');await assert.rejects(()=>r.beginLogout(owned(),SHOP,Date.now()))}
 admin('UPDATE tll_customer_private.control SET enabled=false;');assert.equal(await repo.createAttempt(a()),false);assert.equal(snapshot().attempts.length,0)
 admin('DELETE FROM tll_customer_private.control;');try{assert.equal(await repo.createAttempt(a()),false);assert.throws(()=>admin('SET SESSION AUTHORIZATION tll_customer_migrator; SELECT tll_customer_private.operator_status();'));assert.throws(()=>admin("SET SESSION AUTHORIZATION tll_customer_migrator; SELECT tll_customer_private.operator_set_enabled(true,'synthetic');"))}finally{admin("INSERT INTO tll_customer_private.control(singleton,enabled,operator_oid) VALUES(true,false,'tll_customer_migrator'::regrole::oid);")}
 admin('UPDATE tll_customer_private.control SET enabled=true;');await connect();admin('UPDATE tll_customer_private.control SET enabled=false;')
 assert.equal((await repo.beginLogout(owned(),SHOP,Date.now())).status,'local_revoked');assert.equal(snapshot().connections[0].status,'logged_out')
})
test('simultaneous same-owner starts reserve one operation; same-state/id collisions cannot replace it',async()=>{
 const first=a(),second=a();const results=await Promise.all([repo.createAttempt(first),repo.createAttempt(second)]);assert.equal(results.filter(Boolean).length,1);assert.equal(snapshot().attempts.length,1)
 const winner=results[0]?first:second;assert.equal(await repo.createAttempt({...winner,owner:owned(1)}),false);assert.equal(snapshot().attempts.length,1)
})
test('claim is one-use across independent connections and bound to owner, session, configuration and ciphertext',async()=>{
 const attempt=a();assert.equal(await repo.createAttempt(attempt),true)
 for(const [owner,hash]of [[owned(1),CONFIG],[{...owned(),sessionId:owned(1).sessionId},CONFIG],[owned(),'c'.repeat(64)]])assert.equal((await repo.claimAttempt(attempt.stateHash,owner,hash,1)).status,'rejected')
 const claims=await Promise.all([repo.claimAttempt(attempt.stateHash,owned(),CONFIG,1),repo.claimAttempt(attempt.stateHash,owned(),CONFIG,Date.now()+99999999)])
 assert.equal(claims.filter(c=>c.status==='claimed').length,1);assert.deepEqual(claims.find(c=>c.status==='claimed').attempt,attempt)
 assert.equal(snapshot().attempts[0].status,'exchanging');assert.equal((await repo.claimAttempt(attempt.stateHash,owned(),CONFIG,1)).status,'rejected')
})
test('database time is sampled after lock wait; a supplied ancient clock cannot revive an expired attempt',async()=>{
 const attempt=a(0,{expiresAt:Date.now()+200});assert.equal(await repo.createAttempt(attempt),true)
 const lock=await localPool({role:'postgres'}).connect();await lock.query('BEGIN');await lock.query(`SELECT user_id FROM tll_customer_private.owners WHERE user_id='${users[0]}' FOR UPDATE`)
 const pending=repo.claimAttempt(attempt.stateHash,owned(),CONFIG,1);await pause(300);await lock.query('COMMIT');lock.release()
 assert.equal((await pending).status,'rejected');assert.equal(snapshot().attempts[0].status,'pending')
})
test('different-user concurrent subject binding yields exactly one reserved owner',async()=>{
 const ca=await claimed(0),cb=await claimed(1)
 const results=await Promise.all([repo.finishAttempt(ca.attempt.id,ca.fence,bound(0),t(),Date.now()),repo.finishAttempt(cb.attempt.id,cb.fence,bound(1),t(),Date.now())])
 assert.equal(results.filter(r=>r.status==='connected').length,1);const db=snapshot();assert.equal(db.connections.length,1)
 const winner=results[0].status==='connected'?0:1;assert.equal(db.connections[0].user_id,users[winner])
})
test('exact reauthentication replaces tokens; another subject or Supabase owner cannot take a reserved binding',async()=>{
 const first=await connect();const mismatch=await claimed();assert.equal((await repo.finishAttempt(mismatch.attempt.id,mismatch.fence,bound(0,'gid://shopify/Customer/different'),t(),Date.now())).status,'rejected');await repo.holdAttempt(mismatch.attempt.id,mismatch.fence)
 const second=await connect();assert.equal(second.id,first.id);assert.equal(snapshot().connections.length,1)
 const c=await repo.claimRefresh(first.id,owned(),CONFIG,Date.now(),60000);assert.deepEqual(c.tokens,second.tokens)
 assert.equal((await repo.claimRefresh(first.id,owned(1),CONFIG,Date.now(),60000)).status,'rejected')
})
test('simultaneous refresh claims expose material only to one winner and block a new attempt',async()=>{
 const c=await connect();const results=await Promise.all([repo.claimRefresh(c.id,owned(),CONFIG,1,60000),repo.claimRefresh(c.id,owned(),CONFIG,Date.now()+999999,60000)])
 assert.equal(results.filter(r=>r.status==='claimed').length,1);assert.equal(await repo.createAttempt(a()),false)
 assert.deepEqual(results.find(r=>r.status==='claimed').tokens,c.tokens)
})
test('expired refreshing is held and never retried, even with a caller clock in the past',async()=>{
 const c=await connect();const claim=await repo.claimRefresh(c.id,owned(),CONFIG,Date.now(),50);assert.equal(claim.status,'claimed');await pause(75)
 assert.equal(await repo.finishRefresh(c.id,claim.fence,t(),1),false)
 assert.equal((await repo.claimRefresh(c.id,owned(),CONFIG,1,60000)).status,'rejected')
 assert.equal(snapshot().connections[0].status,'held');assert.equal(snapshot().connections[0].tokens,null)
 const reauthenticated=await connect();assert.equal(reauthenticated.id,c.id)
})
test('stale finish and stale hold cannot overwrite or disable a newer refresh fence',async()=>{
 const c=await connect(),one=await repo.claimRefresh(c.id,owned(),CONFIG,Date.now(),60000),updated=t()
 assert.equal(await repo.finishRefresh(c.id,one.fence,updated,Date.now()),true)
 const two=await repo.claimRefresh(c.id,owned(),CONFIG,Date.now(),60000);assert.deepEqual(two.tokens,updated)
 assert.equal(await repo.finishRefresh(c.id,one.fence,t(),Date.now()),false);await repo.holdRefresh(c.id,one.fence)
 assert.equal(snapshot().connections[0].status,'refreshing');assert.equal(String(snapshot().connections[0].fence),two.fence)
})
test('same-fence hold quarantines a committed attempt or refresh after lost acknowledgement',async()=>{
 const c=await connect();await repo.holdAttempt(c.claim.attempt.id,c.claim.fence);assert.equal(snapshot().connections[0].status,'held');assert.equal(snapshot().connections[0].tokens,null)
 const again=await connect();const claim=await repo.claimRefresh(again.id,owned(),CONFIG,Date.now(),60000);assert.equal(await repo.finishRefresh(again.id,claim.fence,t(),Date.now()),true)
 await repo.holdRefresh(again.id,claim.fence);assert.equal(snapshot().connections[0].status,'held')
})
test('logout cancels an exchanging callback and fences late refresh; repeat logout is idempotent',async()=>{
 const claim=await claimed();assert.deepEqual(await repo.beginLogout(owned(),SHOP,Date.now()),{status:'local_revoked',upstreamLogout:'not_required'})
 assert.equal((await repo.finishAttempt(claim.attempt.id,claim.fence,bound(),t(),Date.now())).status,'rejected')
 const c=await connect(),refresh=await repo.claimRefresh(c.id,owned(),CONFIG,Date.now(),60000)
 assert.equal((await repo.beginLogout(owned(),SHOP,Date.now())).upstreamLogout,'pending');const before=snapshot()
 assert.equal(await repo.finishRefresh(c.id,refresh.fence,t(),Date.now()),false);await repo.beginLogout(owned(),SHOP,Date.now());assert.deepEqual(snapshot(),before)
 assert.equal(before.connections[0].tokens,null);assert.equal(before.connections[0].token_context,null);assert.ok(before.connections[0].logout_material);assert.ok(before.connections[0].logout_context)
 const conflict=await claimed(1);assert.equal((await repo.finishAttempt(conflict.attempt.id,conflict.fence,bound(1),t(),Date.now())).status,'rejected')
})

test('concurrent refresh completion and logout serialize under the same owner lock and leave no usable tokens',async()=>{
 const c=await connect(),claim=await repo.claimRefresh(c.id,owned(),CONFIG,Date.now(),60000)
 const lock=await localPool({role:'postgres'}).connect();await lock.query('BEGIN');await lock.query(`SELECT user_id FROM tll_customer_private.owners WHERE user_id='${users[0]}' FOR UPDATE`)
 const finishing=repo.finishRefresh(c.id,claim.fence,t(),Date.now()),logout=repo.beginLogout(owned(),SHOP,Date.now())
 await pause(100);await lock.query('COMMIT');lock.release();const results=await Promise.all([finishing,logout])
 assert.equal(results[1].status,'local_revoked');assert.equal(snapshot().connections[0].status,'logged_out');assert.equal(snapshot().connections[0].tokens,null)
})

test('an old attempt hold after logout and new authentication cannot hold the new connection',async()=>{
 const old=await connect();await repo.beginLogout(owned(),SHOP,Date.now());const latest=await connect()
 await repo.holdAttempt(old.claim.attempt.id,old.claim.fence);assert.equal(snapshot().connections[0].status,'active');assert.equal(latest.id,old.id)
})
test('ciphertext corruption and a missing key produce no plaintext claim and quarantine known fence',async()=>{
 const c=await connect();admin("UPDATE tll_customer_private.connections SET tokens=jsonb_set(tokens,'{tag}',to_jsonb('AAAAAAAAAAAAAAAAAAAAAA'::text));")
 await assert.rejects(()=>repo.claimRefresh(c.id,owned(),CONFIG,Date.now(),60000),/unavailable/);assert.equal(snapshot().connections[0].status,'held')
 const claim=await claimed();vault.destroy();await assert.rejects(()=>repo.finishAttempt(claim.attempt.id,claim.fence,bound(),t(),Date.now()),/unavailable/)
})
test('lost claim COMMIT acknowledgement is never exposed and same-fence material is held',async()=>{
 const attempt=a();await repo.createAttempt(attempt);let injected=false,opens=0
 const faulty=createCustomerConnectionRepository({pool:localPool({fault:({sql,op})=>{if(!injected&&op==='claim_attempt'&&sql==='COMMIT'){injected=true;return true}return false}}),vault:{...vault,open(...args){opens++;return vault.open(...args)}},syntheticExecution:true})
 await assert.rejects(()=>faulty.claimAttempt(attempt.stateHash,owned(),CONFIG,Date.now()),/unavailable/)
 assert.equal(injected,true);assert.equal(opens,0);assert.equal(snapshot().attempts[0].status,'held');assert.equal(snapshot().attempts[0].material,null)
})
test('lost finish COMMIT acknowledgement actively quarantines its committed token bundle',async()=>{
 const claim=await claimed();let injected=false
 const faulty=createCustomerConnectionRepository({pool:localPool({fault:({sql,op})=>{if(!injected&&op==='finish_attempt'&&sql==='COMMIT'){injected=true;return true}return false}}),vault,syntheticExecution:true})
 await assert.rejects(()=>faulty.finishAttempt(claim.attempt.id,claim.fence,bound(),t(),Date.now()),/unavailable/)
 assert.equal(injected,true);assert.equal(snapshot().connections[0].status,'held');assert.equal(snapshot().connections[0].tokens,null)
})

test('refresh claim and refresh finish COMMIT losses quarantine the exact connection fence',async()=>{
 const c=await connect();let phase='claim_refresh',fired=false
 const faulty=createCustomerConnectionRepository({pool:localPool({fault:({sql,op})=>{if(!fired&&op===phase&&sql==='COMMIT'){fired=true;return true}return false}}),vault,syntheticExecution:true})
 await assert.rejects(()=>faulty.claimRefresh(c.id,owned(),CONFIG,Date.now(),60000),/unavailable/)
 assert.equal(fired,true);assert.equal(snapshot().connections[0].status,'held');assert.equal(snapshot().connections[0].tokens,null)
 await connect();const claim=await repo.claimRefresh(c.id,owned(),CONFIG,Date.now(),60000);phase='finish_refresh';fired=false
 await assert.rejects(()=>faulty.finishRefresh(c.id,claim.fence,t(),Date.now()),/unavailable/)
 assert.equal(fired,true);assert.equal(snapshot().connections[0].status,'held');assert.equal(snapshot().connections[0].tokens,null)
})

test('stored attempt/provider material contains ciphertext only, and logout keeps only a separate ID-token envelope',async()=>{
 const attempt=a();await repo.createAttempt(attempt);const db=snapshot();assert.equal(JSON.stringify(db).includes(attempt.verifier),false);assert.equal(JSON.stringify(db).includes(attempt.nonce),false)
 const claim=await repo.claimAttempt(attempt.stateHash,owned(),CONFIG,Date.now()),tokens=t(),b=bound();await repo.finishAttempt(claim.attempt.id,claim.fence,b,tokens,Date.now())
 await repo.beginLogout(owned(),SHOP,Date.now());const state=snapshot(),c=state.connections[0]
 assert.doesNotMatch(JSON.stringify(state),/SYNTHETIC_SECRET/);const ctx=c.logout_context
 const onlyId=vault.open(c.logout_material,['tll-customer-connection/v1','qdmvngjwkcsilzmqksme','logout-intent',SHOP,ISSUER,b.subject,b.userId,CONFIG,ctx.kind,ctx.id,ctx.fence])
 assert.deepEqual(onlyId,{idToken:tokens.idToken});assert.equal(c.tokens,null)
})
test('repeat migration is refused transactionally without changing rows or privileges',()=>{
 const before=snapshot(),sql=readFileSync('supabase/migrations/202609150005_customer_connection_repository.sql','utf8')
 assert.throws(()=>admin('SET SESSION AUTHORIZATION tll_customer_migrator;\n'+sql))
 assert.deepEqual(snapshot(),before);assert.equal(admin("SELECT has_table_privilege('anon','tll_customer_private.connections','SELECT,MAINTAIN')"),'f')
})
