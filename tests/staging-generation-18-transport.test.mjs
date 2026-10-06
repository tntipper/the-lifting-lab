import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PACKAGE_ID, PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-18-credentials.mjs'
import { deriveScramVerifier, GENERATED_SUPABASE_SECRET_NAMES, STAGED_VERCEL_NAMES } from '../scripts/staging-generation-6-transport.mjs'
import { executeGeneration18CredentialWindow, GENERATION_18_SOURCE_FINGERPRINT, NATIVE_GENERATION_18_TRANSPORT_ENABLED } from '../scripts/staging-generation-18-transport.mjs'

const NOW=Date.parse('2026-09-20T21:30:00.000Z'),EXPIRES='2026-09-20T22:25:00.000Z'
const randomBytes=(()=>{let n=0;return size=>Buffer.alloc(size,++n)})(),randomUUID=(()=>{let n=0;return()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`})()
function fixture(fail){const events=[],ports={
  async preflightDatabase(){events.push('preflight')},async stageVercel(){events.push('stageVercel')},async stageSupabase(){events.push('stageSupabase')},
  async readbackNames(){events.push('readback');return{vercel:[...STAGED_VERCEL_NAMES],supabase:[...GENERATED_SUPABASE_SECRET_NAMES]}},
  async dispatchDatabase(){events.push('dispatch');return[{tll_generation_18_credential_receipt:{status:'PASS',packageId:PACKAGE_ID,projectRef:PROJECT_REF,generation:18,windowId:WINDOW_ID,expiresAt:EXPIRES,controlsEnabled:false,runtimeCount:5}}]},
  async verifyConnections(){events.push('verify');if(fail==='verify'){const error=Error('private');error.connectionFailure={status:'FAIL',reason:'connection_verification_failed',purpose:'customer',check:'connect_retry'};throw error}},
  async recoverDatabase(){events.push('recover')},async removeVercel(names){events.push('removeVercel');assert.deepEqual(names,STAGED_VERCEL_NAMES)},async removeSupabase(names){events.push('removeSupabase');assert.deepEqual(names,GENERATED_SUPABASE_SECRET_NAMES)}}
  return{events,ports}}
const journal=events=>({recordIntent(value){events.push('intent');return{...value,state:'INTENT_RECORDED',runId:'generation-18-test'}},transition(_intent,state){events.push(state);return{state}}})
const rejectedJournal=events=>({recordIntent(){events.push('journalRejected');throw Error('consumed')},transition(){events.push('journalTransition')}})

test('generation 18 is disarmed after entry-baseline failure with a fixed nonsecret fingerprint',()=>{
  assert.equal(NATIVE_GENERATION_18_TRANSPORT_ENABLED,false);assert.match(GENERATION_18_SOURCE_FINGERPRINT,/^[a-f0-9]{64}$/)
})

test('generation 18 consumed transport contains no native launcher or credential-bearing imports',()=>{
  assert.equal(NATIVE_GENERATION_18_TRANSPORT_ENABLED,false)
  const source=readFileSync('scripts/staging-generation-18-transport.mjs','utf8')
  assert.doesNotMatch(source,/runNativeGeneration18CredentialWindow/)
  assert.doesNotMatch(source,/staging-generation-6-provider-transport|readSupabaseTokenFromKeychain|createStagingPostgresRuntime|readPinnedSupabaseCa/)
})

test('generation 18 success stages providers, journals once and verifies before receipt',async()=>{
  const f=fixture(),result=await executeGeneration18CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes,randomUUID})
  assert.equal(result.status,'CREDENTIALS_VERIFIED_CONTROLS_DISABLED');assert.equal(result.generation, 18);assert.deepEqual(f.events,['preflight','intent','stageVercel','stageSupabase','readback','dispatch','verify','RECEIPT_VALIDATED'])
})

test('a consumed journal is rejected before material, provider, database, recovery, or cleanup work',async()=>{
  const f=fixture(),result=await executeGeneration18CredentialWindow({ports:f.ports,journal:rejectedJournal(f.events),now:()=>NOW,
    randomBytes(){throw Error('material must not be generated')},randomUUID(){throw Error('material must not be generated')}})
  assert.equal(result.status,'JOURNAL_CLAIM_REJECTED');assert.equal(result.phase,'JOURNAL_INTENT');assert.equal(result.nextAction,'REVIEW_EXCLUSIVE_JOURNAL')
  assert.deepEqual(f.events,['preflight','journalRejected'])
})

test('generation 18 entry baseline failure stops before providers and projects secret-free preflight fields',async()=>{
  const f=fixture()
  f.ports.preflightDatabase=async()=>{
    f.events.push('preflight')
    const error=Error('Generation-18 entry baseline verification unavailable')
    error.failureStep='preflight'
    error.failureReason='entry_predecessor_marker_mismatch'
    error.managementStatusCode=400
    throw error
  }
  const result=await executeGeneration18CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes,randomUUID})
  assert.equal(result.status,'ENTRY_BASELINE_FAILED')
  assert.equal(result.failedPhase,'ENTRY_PREFLIGHT_RETRY')
  assert.equal(result.failureStep,'preflight')
  assert.equal(result.failureReason,'entry_predecessor_marker_mismatch')
  assert.equal(result.managementStatusCode,400)
  assert.equal(result.nextAction,'REVIEW_ENTRY_BASELINE')
  assert.equal(result.recoveryOutcome,'NOT_REQUIRED')
  assert.deepEqual(f.events,['preflight','preflight'])
})

test('generation 18 connection failure recovers once, projects fixed diagnostic and forbids replay',async()=>{
  let byte=0;const f=fixture('verify'),result=await executeGeneration18CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:size=>Buffer.alloc(size,++byte),randomUUID:(()=>{let n=0;return()=>`10000000-0000-4000-8000-${String(++n).padStart(12,'0')}`})()})
  assert.equal(result.status,'RECOVERY_VERIFIED');assert.deepEqual(result.connectionFailure,{status:'FAIL',reason:'connection_verification_failed',purpose:'customer',check:'connect_retry'})
  assert.equal(f.events.filter(value=>value==='dispatch').length,1);assert.ok(f.events.includes('RECONCILIATION_REQUIRED'));assert.deepEqual(f.events.slice(-2),['removeVercel','removeSupabase']);assert.doesNotMatch(JSON.stringify(result),/private/i)
})

test('generation 18 embeds SCRAM derived from projected passwords into dispatch SQL',async()=>{
  let capturedSql='',capturedPasswords=null,byte=0
  const randomBytes=size=>Buffer.alloc(size,++byte)
  const randomUUID=(()=>{let n=0;return()=>`20000000-0000-4000-8000-${String(++n).padStart(12,'0')}`})()
  const f=fixture()
  f.ports.dispatchDatabase=async sql=>{f.events.push('dispatch');capturedSql=sql;return[{tll_generation_18_credential_receipt:{status:'PASS',packageId:PACKAGE_ID,projectRef:PROJECT_REF,generation:18,windowId:WINDOW_ID,expiresAt:EXPIRES,controlsEnabled:false,runtimeCount:5}}]}
  f.ports.verifyConnections=async input=>{f.events.push('verify');capturedPasswords=Object.fromEntries(Object.entries(input.passwords).map(([purpose,value])=>[purpose,String(value)]))}
  await executeGeneration18CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes,randomUUID})
  assert.ok(capturedPasswords)
  for(const [index,purpose] of ['customer','cart','broker','provisional','bridge'].entries()){
    const expected=deriveScramVerifier(capturedPasswords[purpose],Buffer.alloc(18,index+1))
    const rawEquivalent=deriveScramVerifier(Buffer.from(capturedPasswords[purpose],'base64url'),Buffer.alloc(18,index+1))
    assert.ok(capturedSql.includes(expected),`gen17 sql must embed projected SCRAM for ${purpose}`)
    assert.equal(capturedSql.includes(rawEquivalent),false)
    assert.notEqual(expected,rawEquivalent)
  }
})
