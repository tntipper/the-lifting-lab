import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildGeneration7CredentialSql, PREDECESSOR, PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-7-credentials.mjs'
import { dispatchGeneration7Database, GENERATION_7_ENTRY_BASELINE_SQL, KEYCHAIN_HELPER_TIMEOUT_MS, NATIVE_GENERATION_7_DATABASE_TRANSPORT_ENABLED, normalizeSupabaseToken, recoverGeneration7Database, verifyGeneration7EntryBaseline, verifyGeneration7ZeroSessions } from '../scripts/staging-generation-7-database-transport.mjs'

const token='sbp_'+('a'.repeat(40)),expiresAt='2026-09-20T20:55:00.000Z',nowMs=Date.parse('2026-09-20T20:00:00.000Z')
const verifier=index=>`SCRAM-SHA-256$4096:${Buffer.alloc(18,index+1).toString('base64')}$${Buffer.alloc(32,index+2).toString('base64')}:${Buffer.alloc(32,index+3).toString('base64')}`
const sql=buildGeneration7CredentialSql({expiresAt,nowMs,verifiers:Object.fromEntries(['customer','cart','broker','provisional','bridge'].map((purpose,index)=>[purpose,verifier(index)]))})

test('generation 7 native database transport and keychain access are disarmed after entry stop',()=>{
  const helper=readFileSync('scripts/staging-generation-7-keychain.py','utf8')
  assert.equal(normalizeSupabaseToken(token),token);assert.equal(NATIVE_GENERATION_7_DATABASE_TRANSPORT_ENABLED,false);assert.equal(KEYCHAIN_HELPER_TIMEOUT_MS,45_000)
  assert.equal(helper.match(/^APPROVED_NATIVE_READ = (.+)$/m)?.[1],'False');assert.match(helper,/\["\/usr\/bin\/security", "find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"\]/)
  assert.match(helper,/Generation-7 native credential transport unavailable/);assert.doesNotMatch(helper,/Generation-6 native credential transport unavailable/)
})

test('generation 7 dispatch accepts only its new package and window',async()=>{
  const calls=[],result=await dispatchGeneration7Database(sql,{token,post:async(t,q)=>{calls.push({t,q});return [{ok:true}]}})
  assert.deepEqual(result,[{ok:true}]);assert.equal(calls.length,1);assert.equal(calls[0].q,sql)
  await assert.rejects(()=>dispatchGeneration7Database(sql.replaceAll(WINDOW_ID,'wrong'),{token,post:async()=>[]}),/unavailable/)
})

test('generation 7 entry baseline requires exact retired generation 6 marker',async()=>{
  let query;const receipt={status:'ENTRY_BASELINE_PASS',projectRef:PROJECT_REF,windowId:WINDOW_ID,runtimeGeneration:6,runtimeInert:true,controlsEnabled:false}
  const value=await verifyGeneration7EntryBaseline({token,post:async(_token,text)=>{query=text;return [{tll_generation_7_entry_baseline:receipt}]}})
  assert.deepEqual(value,receipt);assert.equal(query,GENERATION_7_ENTRY_BASELINE_SQL);assert.match(query,/BEGIN READ ONLY/);assert.match(query,new RegExp(PREDECESSOR.windowId));assert.match(query,/generation":6/)
  await assert.rejects(()=>verifyGeneration7EntryBaseline({token,post:async()=>[{tll_generation_7_entry_baseline:{...receipt,runtimeGeneration:5}}]}),/unavailable/)
})

test('generation 7 recovery uses separately generated SQL and exact receipts',async()=>{
  const calls=[],post=async(_token,query)=>{calls.push(query);return calls.length===1
    ?[{tll_generation_7_recovery_receipt:{status:'RECOVERY_COMMITTED',projectRef:PROJECT_REF,windowId:WINDOW_ID}}]
    :[{tll_generation_7_recovery_postcommit:{status:'RECOVERY_VERIFIED',projectRef:PROJECT_REF,windowId:WINDOW_ID}}]}
  assert.equal((await recoverGeneration7Database({token,post})).status,'RECOVERY_VERIFIED');assert.equal(calls.length,2)
  assert.ok(calls[0].startsWith(readFileSync('config/staging-generation-7-recovery.sql','utf8')));assert.ok(calls[1].startsWith(readFileSync('config/staging-generation-7-recovery-postcommit.sql','utf8')))
})

test('generation 7 zero-session proof remains disabled and exact',async()=>{
  let query;const receipt={status:'ZERO_SESSIONS',projectRef:PROJECT_REF,windowId:WINDOW_ID,controlsEnabled:false}
  assert.deepEqual(await verifyGeneration7ZeroSessions({token,post:async(_token,text)=>{query=text;return [{tll_generation_7_zero_sessions:receipt}]}}),receipt)
  assert.match(query,/pg_stat_activity/);assert.match(query,/tll_bridge_private\.control/)
})

test('generation 7 uncertain recovery acknowledgement stops before postcommit',async()=>{
  let calls=0;await assert.rejects(()=>recoverGeneration7Database({token,post:async()=>{calls++;return []}}),/unavailable/);assert.equal(calls,1)
})
