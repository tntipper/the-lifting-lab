import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PREDECESSOR, PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-21-credentials.mjs'
import { dispatchGeneration21Database, GENERATION_21_ENTRY_BASELINE_SQL, KEYCHAIN_HELPER_TIMEOUT_MS, NATIVE_GENERATION_21_DATABASE_TRANSPORT_ENABLED, normalizeSupabaseToken, recoverGeneration21Database, verifyGeneration21EntryBaseline, verifyGeneration21ZeroSessions } from '../scripts/staging-generation-21-database-transport.mjs'

const token='sbp_'+('a'.repeat(40))
const sql=`BEGIN;\n-- ${WINDOW_ID} tll-staging-generation-21-credentials/v1\nSELECT 1 AS tll_generation_21_credential_receipt;\n`

test('generation 21 native database transport and keychain access stay disabled',()=>{
  const helper=readFileSync('scripts/staging-generation-21-keychain.py','utf8')
  assert.equal(normalizeSupabaseToken(token),token);assert.equal(NATIVE_GENERATION_21_DATABASE_TRANSPORT_ENABLED,false);assert.equal(KEYCHAIN_HELPER_TIMEOUT_MS,45_000)
  assert.equal(helper.match(/^APPROVED_NATIVE_READ = (.+)$/m)?.[1],'False');assert.match(helper,/\["\/usr\/bin\/security", "find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"\]/)
  assert.match(helper,/Generation-21 native credential transport unavailable/);assert.doesNotMatch(helper,/Generation-6 native credential transport unavailable/)
})

test('generation 21 dispatch accepts only its new package and window',async()=>{
  const calls=[],result=await dispatchGeneration21Database(sql,{token,post:async(t,q)=>{calls.push({t,q});return [{ok:true}]}})
  assert.deepEqual(result,[{ok:true}]);assert.equal(calls.length,1);assert.equal(calls[0].q,sql)
  await assert.rejects(()=>dispatchGeneration21Database(sql.replaceAll(WINDOW_ID,'wrong'),{token,post:async()=>[]}),/unavailable/)
})

test('generation 21 entry baseline accepts the canonical retired Gen19 role shape',async()=>{
  let query;const receipt={status:'ENTRY_BASELINE_PASS',projectRef:PROJECT_REF,windowId:WINDOW_ID,
    predecessorGeneration:19,predecessorWindowId:PREDECESSOR.windowId,predecessorExpiresAt:PREDECESSOR.expiresAt,
    predecessorState:'retired',runtimeInert:true,controlsEnabled:false}
  const value=await verifyGeneration21EntryBaseline({token,post:async(_token,text)=>{query=text;return [{tll_generation_21_entry_baseline:receipt}]}})
  assert.deepEqual(value,receipt);assert.equal(query,GENERATION_21_ENTRY_BASELINE_SQL);assert.match(query,/BEGIN READ ONLY/);assert.match(query,new RegExp(PREDECESSOR.windowId));assert.match(query,/generation":19/)
  assert.ok(query.includes("rolvaliduntil IS DISTINCT FROM 'infinity'::timestamptz"))
  assert.ok(!query.includes(`rolvaliduntil IS DISTINCT FROM '${PREDECESSOR.expiresAt}'::timestamptz`))
  assert.match(query,/rolcanlogin/);assert.match(query,/pg_authid/);assert.match(query,/rolpassword IS NOT NULL/)
  assert.match(query,/member\.rolname=current_user AND m\.admin_option AND NOT m\.inherit_option AND NOT m\.set_option/)
  assert.match(query,/AND NOT \(granted\.rolname IN/)
  assert.match(query,/substring\(role_marker FROM/);assert.match(query,/parsed_marker IS DISTINCT FROM/);assert.doesNotMatch(query,/shobj_description\(oid,'pg_authid'\)='/)
  await assert.rejects(()=>verifyGeneration21EntryBaseline({token,post:async()=>[{tll_generation_21_entry_baseline:{...receipt,predecessorGeneration:10}}]}),error=>{
    assert.match(error.message,/unavailable/);assert.equal(error.failureStep,'preflight');assert.equal(error.failureReason,'unavailable');return true
  })
})

test('generation 21 entry baseline projects secret-free preflight step and allow-listed reason on management failure',async()=>{
  const managementError=Error('Generation 21 entry predecessor marker mismatch')
  managementError.managementStatusCode=400
  await assert.rejects(()=>verifyGeneration21EntryBaseline({token,post:async()=>{throw managementError}}),error=>{
    assert.equal(error.failureStep,'preflight')
    assert.equal(error.failureReason,'entry_predecessor_marker_mismatch')
    assert.equal(error.managementStatusCode,400)
    return true
  })
})

test('generation 21 recovery consumes exactly one generated postcommit receipt without appending another select',async()=>{
  const calls=[],post=async(_token,query)=>{calls.push(query);return calls.length===1
    ?[{tll_generation_21_recovery_receipt:{status:'RECOVERY_COMMITTED',projectRef:PROJECT_REF,windowId:WINDOW_ID}}]
    :[{tll_gen21_retirement_postcommit:{queryId:'tll-staging-generation-21-retirement-postcommit/v1',projectRef:PROJECT_REF,generation: 21,windowId:WINDOW_ID,status:'PASS_RETIRED',runtimeRoles:5,runtimeSessions:0,controlsEnabled:0,passwordsConfigured:0,validUntilInfinity:5,executionEdges:0,operatorEdges:5}}]}
  assert.equal((await recoverGeneration21Database({token,post})).status,'RECOVERY_VERIFIED');assert.equal(calls.length,2)
  assert.ok(calls[0].startsWith(readFileSync('config/staging-generation-21-recovery.sql','utf8')));assert.ok(calls[1].startsWith(readFileSync('config/staging-generation-21-recovery-postcommit.sql','utf8')))
  assert.equal((calls[1].match(/AS tll_gen21_retirement_postcommit/g)??[]).length,1)
  assert.doesNotMatch(calls[1],/tll_generation_21_recovery_postcommit/)
})

test('generation 21 zero-session proof remains disabled and exact',async()=>{
  let query;const receipt={status:'ZERO_SESSIONS',projectRef:PROJECT_REF,windowId:WINDOW_ID,controlsEnabled:false}
  assert.deepEqual(await verifyGeneration21ZeroSessions({token,post:async(_token,text)=>{query=text;return [{tll_generation_21_zero_sessions:receipt}]}}),receipt)
  assert.match(query,/pg_stat_activity/);assert.match(query,/tll_bridge_private\.control/)
})

test('generation 21 uncertain recovery acknowledgement stops before postcommit',async()=>{
  let calls=0;await assert.rejects(()=>recoverGeneration21Database({token,post:async()=>{calls++;return []}}),/unavailable/);assert.equal(calls,1)
})
