import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildGeneration6CredentialSql, PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-6-credentials.mjs'
import { dispatchGeneration6Database, KEYCHAIN_HELPER_TIMEOUT_MS, NATIVE_DATABASE_TRANSPORT_ENABLED, normalizeSupabaseToken, recoverGeneration6Database, verifyGeneration6EntryBaseline, verifyGeneration6ZeroSessions } from '../scripts/staging-generation-6-database-transport.mjs'

const token='sbp_'+('a'.repeat(40)),expiresAt='2026-09-20T18:55:00.000Z',verifier=index=>`SCRAM-SHA-256$4096:${Buffer.alloc(18,index+1).toString('base64')}$${Buffer.alloc(32,index+2).toString('base64')}:${Buffer.alloc(32,index+3).toString('base64')}`
const sql=buildGeneration6CredentialSql({expiresAt,nowMs:Date.parse('2026-09-20T18:00:00.000Z'),verifiers:Object.fromEntries(['customer','cart','broker','provisional','bridge'].map((p,i)=>[p,verifier(i)]))})

test('token normalization accepts only the exact CLI formats and native transport is disabled',()=>{
  const helper=readFileSync('scripts/staging-generation-6-keychain.py','utf8')
  assert.equal(normalizeSupabaseToken(token),token);assert.equal(normalizeSupabaseToken('go-keyring-base64:'+Buffer.from(token).toString('base64')),token)
  for(const value of ['secret','sbp_'+('g'.repeat(40)),'go-keyring-base64:%%%%'])assert.throws(()=>normalizeSupabaseToken(value),/unavailable/)
  assert.equal(KEYCHAIN_HELPER_TIMEOUT_MS,45_000);assert.equal(NATIVE_DATABASE_TRANSPORT_ENABLED,false);assert.equal(helper.match(/^APPROVED_NATIVE_READ = (.+)$/m)?.[1],'False')
  assert.match(helper,/\["\/usr\/bin\/security", "find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"\]/)
  assert.match(helper,/stdin=subprocess\.DEVNULL/);assert.doesNotMatch(helper,/shell\s*=\s*True/)
})

test('database dispatch accepts only the fixed generated package and forwards once',async()=>{
  const calls=[],result=await dispatchGeneration6Database(sql,{token,post:async(t,q)=>{calls.push({t,q});return [{ok:true}]}})
  assert.deepEqual(result,[{ok:true}]);assert.equal(calls.length,1);assert.equal(calls[0].t,token);assert.equal(calls[0].q,sql)
  await assert.rejects(()=>dispatchGeneration6Database(sql.replaceAll(WINDOW_ID,'wrong'),{token,post:async()=>[]}),/unavailable/)
})

test('entry baseline requires the exact inert generation 5 hosted state',async()=>{
  let query;const value=await verifyGeneration6EntryBaseline({token,post:async(_token,sql)=>{query=sql;return [{tll_generation_6_entry_baseline:{status:'ENTRY_BASELINE_PASS',projectRef:PROJECT_REF,windowId:WINDOW_ID,runtimeGeneration:5,runtimeInert:true,controlsEnabled:false}}]}})
  assert.equal(value.status,'ENTRY_BASELINE_PASS');assert.match(query,/BEGIN READ ONLY/);assert.match(query,/pg_authid/);assert.match(query,/generation":5/);assert.match(query,/tll_bridge_private\.control/)
  assert.ok(query.includes("rolvaliduntil IS DISTINCT FROM '1970-01-01T00:00:00.000Z'::timestamptz"))
  await assert.rejects(()=>verifyGeneration6EntryBaseline({token,post:async()=>[{tll_generation_6_entry_baseline:{status:'ENTRY_BASELINE_PASS',projectRef:PROJECT_REF,windowId:WINDOW_ID,runtimeGeneration:6,runtimeInert:true,controlsEnabled:false}}]}),/unavailable/)
})

test('recovery uses the pinned transaction then a fresh-session postcommit proof with exact receipts',async()=>{
  const calls=[],post=async(_token,query)=>{calls.push(query);return calls.length===1
    ?[{tll_generation_6_recovery_receipt:{status:'RECOVERY_COMMITTED',projectRef:PROJECT_REF,windowId:WINDOW_ID}}]
    :[{tll_generation_6_recovery_postcommit:{status:'RECOVERY_VERIFIED',projectRef:PROJECT_REF,windowId:WINDOW_ID}}]}
  assert.equal((await recoverGeneration6Database({token,post})).status,'RECOVERY_VERIFIED');assert.equal(calls.length,2)
  assert.ok(calls[0].startsWith(readFileSync('config/staging-account-activation-recovery.sql','utf8')))
  assert.ok(calls[1].startsWith(readFileSync('config/staging-account-activation-recovery-postcommit.sql','utf8')))
})

test('post-connection proof requires zero runtime sessions and all controls disabled',async()=>{
  let query;const value=await verifyGeneration6ZeroSessions({token,post:async(_token,sql)=>{query=sql;return [{tll_generation_6_zero_sessions:{status:'ZERO_SESSIONS',projectRef:PROJECT_REF,windowId:WINDOW_ID,controlsEnabled:false}}]}})
  assert.equal(value.status,'ZERO_SESSIONS');assert.match(query,/pg_stat_activity/);assert.match(query,/tll_bridge_private\.control/)
  await assert.rejects(()=>verifyGeneration6ZeroSessions({token,post:async()=>[{tll_generation_6_zero_sessions:{status:'ZERO_SESSIONS',projectRef:PROJECT_REF,windowId:WINDOW_ID,controlsEnabled:true}}]}),/unavailable/)
})

test('uncertain recovery acknowledgement never reaches the second request',async()=>{
  let calls=0;await assert.rejects(()=>recoverGeneration6Database({token,post:async()=>{calls++;return []}}),/unavailable/);assert.equal(calls,1)
})
