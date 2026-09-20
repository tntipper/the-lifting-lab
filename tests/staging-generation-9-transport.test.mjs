import test from 'node:test'
import assert from 'node:assert/strict'
import { PACKAGE_ID, PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-9-credentials.mjs'
import { GENERATED_SUPABASE_SECRET_NAMES, STAGED_VERCEL_NAMES } from '../scripts/staging-generation-6-transport.mjs'
import { executeGeneration9CredentialWindow, GENERATION_9_SOURCE_FINGERPRINT, NATIVE_GENERATION_9_TRANSPORT_ENABLED } from '../scripts/staging-generation-9-transport.mjs'

const NOW=Date.parse('2026-09-20T20:00:00.000Z'),EXPIRES='2026-09-20T20:55:00.000Z'
const randomBytes=(()=>{let n=0;return size=>Buffer.alloc(size,++n)})(),randomUUID=(()=>{let n=0;return()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`})()
function fixture(fail){const events=[],ports={
  async preflightDatabase(){events.push('preflight')},async stageVercel(){events.push('stageVercel')},async stageSupabase(){events.push('stageSupabase')},
  async readbackNames(){events.push('readback');return{vercel:[...STAGED_VERCEL_NAMES],supabase:[...GENERATED_SUPABASE_SECRET_NAMES]}},
  async dispatchDatabase(){events.push('dispatch');return[{tll_generation_9_credential_receipt:{status:'PASS',packageId:PACKAGE_ID,projectRef:PROJECT_REF,generation:9,windowId:WINDOW_ID,expiresAt:EXPIRES,controlsEnabled:false,runtimeCount:5}}]},
  async verifyConnections(){events.push('verify');if(fail==='verify'){const error=Error('private');error.connectionFailure={status:'FAIL',reason:'connection_verification_failed',purpose:'customer',check:'connect_retry'};throw error}},
  async recoverDatabase(){events.push('recover')},async removeVercel(names){events.push('removeVercel');assert.deepEqual(names,STAGED_VERCEL_NAMES)},async removeSupabase(names){events.push('removeSupabase');assert.deepEqual(names,GENERATED_SUPABASE_SECRET_NAMES)}}
  return{events,ports}}
const journal=events=>({recordIntent(value){events.push('intent');return{...value,state:'INTENT_RECORDED',runId:'generation-9-test'}},transition(_intent,state){events.push(state);return{state}}})

test('generation 9 is armed for one reviewed window with a fixed nonsecret fingerprint',()=>{
  assert.equal(NATIVE_GENERATION_9_TRANSPORT_ENABLED,true);assert.match(GENERATION_9_SOURCE_FINGERPRINT,/^[a-f0-9]{64}$/)
})

test('generation 9 success stages providers, journals once and verifies before receipt',async()=>{
  const f=fixture(),result=await executeGeneration9CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes,randomUUID})
  assert.equal(result.status,'CREDENTIALS_VERIFIED_CONTROLS_DISABLED');assert.equal(result.generation,9);assert.deepEqual(f.events,['preflight','stageVercel','stageSupabase','readback','intent','dispatch','verify','RECEIPT_VALIDATED'])
})

test('generation 9 connection failure recovers once, projects fixed diagnostic and forbids replay',async()=>{
  let byte=0;const f=fixture('verify'),result=await executeGeneration9CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:size=>Buffer.alloc(size,++byte),randomUUID:(()=>{let n=0;return()=>`10000000-0000-4000-8000-${String(++n).padStart(12,'0')}`})()})
  assert.equal(result.status,'RECOVERY_VERIFIED');assert.deepEqual(result.connectionFailure,{status:'FAIL',reason:'connection_verification_failed',purpose:'customer',check:'connect_retry'})
  assert.equal(f.events.filter(value=>value==='dispatch').length,1);assert.ok(f.events.includes('RECONCILIATION_REQUIRED'));assert.deepEqual(f.events.slice(-2),['removeVercel','removeSupabase']);assert.doesNotMatch(JSON.stringify(result),/private/i)
})
