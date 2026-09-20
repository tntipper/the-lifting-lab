import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildGeneration9CredentialSql, PREDECESSOR, PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-9-credentials.mjs'
import { dispatchGeneration9Database, GENERATION_9_ENTRY_BASELINE_SQL, KEYCHAIN_HELPER_TIMEOUT_MS, NATIVE_GENERATION_9_DATABASE_TRANSPORT_ENABLED, normalizeSupabaseToken, recoverGeneration9Database, verifyGeneration9EntryBaseline, verifyGeneration9ZeroSessions } from '../scripts/staging-generation-9-database-transport.mjs'

const token='sbp_'+('a'.repeat(40)),expiresAt='2026-09-20T20:55:00.000Z',nowMs=Date.parse('2026-09-20T20:00:00.000Z')
const verifier=index=>`SCRAM-SHA-256$4096:${Buffer.alloc(18,index+1).toString('base64')}$${Buffer.alloc(32,index+2).toString('base64')}:${Buffer.alloc(32,index+3).toString('base64')}`
const sql=buildGeneration9CredentialSql({expiresAt,nowMs,verifiers:Object.fromEntries(['customer','cart','broker','provisional','bridge'].map((purpose,index)=>[purpose,verifier(index)]))})

test('generation 9 native database transport and keychain access are armed for one reviewed window',()=>{
  const helper=readFileSync('scripts/staging-generation-9-keychain.py','utf8')
  assert.equal(normalizeSupabaseToken(token),token);assert.equal(NATIVE_GENERATION_9_DATABASE_TRANSPORT_ENABLED,true);assert.equal(KEYCHAIN_HELPER_TIMEOUT_MS,45_000)
  assert.equal(helper.match(/^APPROVED_NATIVE_READ = (.+)$/m)?.[1],'True');assert.match(helper,/\["\/usr\/bin\/security", "find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"\]/)
  assert.match(helper,/Generation-9 native credential transport unavailable/);assert.doesNotMatch(helper,/Generation-6 native credential transport unavailable/)
})

test('generation 9 dispatch accepts only its new package and window',async()=>{
  const calls=[],result=await dispatchGeneration9Database(sql,{token,post:async(t,q)=>{calls.push({t,q});return [{ok:true}]}})
  assert.deepEqual(result,[{ok:true}]);assert.equal(calls.length,1);assert.equal(calls[0].q,sql)
  await assert.rejects(()=>dispatchGeneration9Database(sql.replaceAll(WINDOW_ID,'wrong'),{token,post:async()=>[]}),/unavailable/)
})

test('generation 9 entry baseline requires exact retired generation 6 marker',async()=>{
  let query;const receipt={status:'ENTRY_BASELINE_PASS',projectRef:PROJECT_REF,windowId:WINDOW_ID,runtimeGeneration:6,runtimeInert:true,controlsEnabled:false}
  const value=await verifyGeneration9EntryBaseline({token,post:async(_token,text)=>{query=text;return [{tll_generation_9_entry_baseline:receipt}]}})
  assert.deepEqual(value,receipt);assert.equal(query,GENERATION_9_ENTRY_BASELINE_SQL);assert.match(query,/BEGIN READ ONLY/);assert.match(query,new RegExp(PREDECESSOR.windowId));assert.match(query,/generation":6/)
  assert.ok(query.includes(`rolvaliduntil IS DISTINCT FROM '${PREDECESSOR.expiresAt}'::timestamptz`))
  assert.match(query,/substring\(role_marker FROM/);assert.match(query,/parsed_marker IS DISTINCT FROM/);assert.doesNotMatch(query,/shobj_description\(oid,'pg_authid'\)='/)
  await assert.rejects(()=>verifyGeneration9EntryBaseline({token,post:async()=>[{tll_generation_9_entry_baseline:{...receipt,runtimeGeneration:5}}]}),/unavailable/)
})

test('generation 9 recovery uses separately generated SQL and exact receipts',async()=>{
  const calls=[],post=async(_token,query)=>{calls.push(query);return calls.length===1
    ?[{tll_generation_9_recovery_receipt:{status:'RECOVERY_COMMITTED',projectRef:PROJECT_REF,windowId:WINDOW_ID}}]
    :[{tll_generation_9_recovery_postcommit:{status:'RECOVERY_VERIFIED',projectRef:PROJECT_REF,windowId:WINDOW_ID}}]}
  assert.equal((await recoverGeneration9Database({token,post})).status,'RECOVERY_VERIFIED');assert.equal(calls.length,2)
  assert.ok(calls[0].startsWith(readFileSync('config/staging-generation-9-recovery.sql','utf8')));assert.ok(calls[1].startsWith(readFileSync('config/staging-generation-9-recovery-postcommit.sql','utf8')))
})

test('generation 9 zero-session proof remains disabled and exact',async()=>{
  let query;const receipt={status:'ZERO_SESSIONS',projectRef:PROJECT_REF,windowId:WINDOW_ID,controlsEnabled:false}
  assert.deepEqual(await verifyGeneration9ZeroSessions({token,post:async(_token,text)=>{query=text;return [{tll_generation_9_zero_sessions:receipt}]}}),receipt)
  assert.match(query,/pg_stat_activity/);assert.match(query,/tll_bridge_private\.control/)
})

test('generation 9 uncertain recovery acknowledgement stops before postcommit',async()=>{
  let calls=0;await assert.rejects(()=>recoverGeneration9Database({token,post:async()=>{calls++;return []}}),/unavailable/);assert.equal(calls,1)
})
