import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildGeneration10CredentialSql, PREDECESSOR, PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-10-credentials.mjs'
import { dispatchGeneration10Database, GENERATION_10_ENTRY_BASELINE_SQL, KEYCHAIN_HELPER_TIMEOUT_MS, NATIVE_GENERATION_10_DATABASE_TRANSPORT_ENABLED, normalizeSupabaseToken, recoverGeneration10Database, verifyGeneration10EntryBaseline, verifyGeneration10ZeroSessions } from '../scripts/staging-generation-10-database-transport.mjs'

const token='sbp_'+('a'.repeat(40)),expiresAt='2026-09-20T20:55:00.000Z',nowMs=Date.parse('2026-09-20T20:00:00.000Z')
const verifier=index=>`SCRAM-SHA-256$4096:${Buffer.alloc(18,index+1).toString('base64')}$${Buffer.alloc(32,index+2).toString('base64')}:${Buffer.alloc(32,index+3).toString('base64')}`
const sql=buildGeneration10CredentialSql({expiresAt,nowMs,verifiers:Object.fromEntries(['customer','cart','broker','provisional','bridge'].map((purpose,index)=>[purpose,verifier(index)]))})

test('generation 10 native database transport and keychain access are disarmed after recovery',()=>{
  const helper=readFileSync('scripts/staging-generation-10-keychain.py','utf8')
  assert.equal(normalizeSupabaseToken(token),token);assert.equal(NATIVE_GENERATION_10_DATABASE_TRANSPORT_ENABLED,false);assert.equal(KEYCHAIN_HELPER_TIMEOUT_MS,45_000)
  assert.equal(helper.match(/^APPROVED_NATIVE_READ = (.+)$/m)?.[1],'False');assert.match(helper,/\["\/usr\/bin\/security", "find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"\]/)
  assert.match(helper,/Generation-10 native credential transport unavailable/);assert.doesNotMatch(helper,/Generation-6 native credential transport unavailable/)
})

test('generation 10 dispatch accepts only its new package and window',async()=>{
  const calls=[],result=await dispatchGeneration10Database(sql,{token,post:async(t,q)=>{calls.push({t,q});return [{ok:true}]}})
  assert.deepEqual(result,[{ok:true}]);assert.equal(calls.length,1);assert.equal(calls[0].q,sql)
  await assert.rejects(()=>dispatchGeneration10Database(sql.replaceAll(WINDOW_ID,'wrong'),{token,post:async()=>[]}),/unavailable/)
})

test('generation 10 entry baseline requires exact recovered retired generation 9 marker',async()=>{
  let query;const receipt={status:'ENTRY_BASELINE_PASS',projectRef:PROJECT_REF,windowId:WINDOW_ID,runtimeGeneration:9,runtimeInert:true,controlsEnabled:false}
  const value=await verifyGeneration10EntryBaseline({token,post:async(_token,text)=>{query=text;return [{tll_generation_10_entry_baseline:receipt}]}})
  assert.deepEqual(value,receipt);assert.equal(query,GENERATION_10_ENTRY_BASELINE_SQL);assert.match(query,/BEGIN READ ONLY/);assert.match(query,new RegExp(PREDECESSOR.windowId));assert.match(query,/generation":9/)
  assert.ok(query.includes(`rolvaliduntil IS DISTINCT FROM '${PREDECESSOR.expiresAt}'::timestamptz`))
  assert.match(query,/substring\(role_marker FROM/);assert.match(query,/parsed_marker IS DISTINCT FROM/);assert.doesNotMatch(query,/shobj_description\(oid,'pg_authid'\)='/)
  await assert.rejects(()=>verifyGeneration10EntryBaseline({token,post:async()=>[{tll_generation_10_entry_baseline:{...receipt,runtimeGeneration:6}}]}),/unavailable/)
})

test('generation 10 recovery uses separately generated SQL and exact receipts',async()=>{
  const calls=[],post=async(_token,query)=>{calls.push(query);return calls.length===1
    ?[{tll_generation_10_recovery_receipt:{status:'RECOVERY_COMMITTED',projectRef:PROJECT_REF,windowId:WINDOW_ID}}]
    :[{tll_generation_10_recovery_postcommit:{status:'RECOVERY_VERIFIED',projectRef:PROJECT_REF,windowId:WINDOW_ID}}]}
  assert.equal((await recoverGeneration10Database({token,post})).status,'RECOVERY_VERIFIED');assert.equal(calls.length,2)
  assert.ok(calls[0].startsWith(readFileSync('config/staging-generation-10-recovery.sql','utf8')));assert.ok(calls[1].startsWith(readFileSync('config/staging-generation-10-recovery-postcommit.sql','utf8')))
})

test('generation 10 zero-session proof remains disabled and exact',async()=>{
  let query;const receipt={status:'ZERO_SESSIONS',projectRef:PROJECT_REF,windowId:WINDOW_ID,controlsEnabled:false}
  assert.deepEqual(await verifyGeneration10ZeroSessions({token,post:async(_token,text)=>{query=text;return [{tll_generation_10_zero_sessions:receipt}]}}),receipt)
  assert.match(query,/pg_stat_activity/);assert.match(query,/tll_bridge_private\.control/)
})

test('generation 10 uncertain recovery acknowledgement stops before postcommit',async()=>{
  let calls=0;await assert.rejects(()=>recoverGeneration10Database({token,post:async()=>{calls++;return []}}),/unavailable/);assert.equal(calls,1)
})
