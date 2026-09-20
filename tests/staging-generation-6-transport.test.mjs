import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { buildGeneration6CredentialSql, PACKAGE_ID, PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-6-credentials.mjs'
import { deriveScramVerifier, DISABLED_VERCEL_CONFIGURATION, eraseGeneration6Material, executeGeneration6CredentialWindow,
  generateGeneration6Material, GENERATED_SUPABASE_SECRET_NAMES, GENERATED_VERCEL_SECRET_NAMES, NATIVE_TRANSPORT_ENABLED,
  projectGeneration6Secrets, runNativeGeneration6CredentialWindow, SHOPIFY_CREDENTIAL_DEPENDENCIES, STAGED_VERCEL_NAMES } from '../scripts/staging-generation-6-transport.mjs'

const NOW = Date.parse('2026-09-20T18:00:00.000Z'), EXPIRES = '2026-09-20T18:55:00.000Z'
const deterministicRandom = size => Buffer.alloc(size, deterministicRandom.calls++ + 1); deterministicRandom.calls = 0
const deterministicUuid = () => `00000000-0000-4000-8000-${String(++deterministicUuid.calls).padStart(12,'0')}`; deterministicUuid.calls = 0
function receipt() { return [{ tll_generation_6_credential_receipt: { status:'PASS',packageId:PACKAGE_ID,projectRef:PROJECT_REF,generation:6,
  windowId:WINDOW_ID,expiresAt:EXPIRES,controlsEnabled:false,runtimeCount:5 } }] }
function journal(events) { return { recordIntent(value) { events.push('intent'); return { ...value, state:'INTENT_RECORDED',runId:'synthetic' } }, transition(_intent,state) { events.push(state); return { state } } } }
function fixture(fail) {
  const events = [], ports = {
    async preflightDatabase() { events.push('preflight'); if (fail==='preflight') throw Error('private') },
    async stageVercel(input) { events.push('stageVercel'); if (fail==='vercel') throw Error('private'); assert.deepEqual(input.configuration, DISABLED_VERCEL_CONFIGURATION) },
    async stageSupabase() { events.push('stageSupabase'); if (fail==='supabase') throw Error('private') },
    async readbackNames() { events.push('readback'); if (fail==='readback') return {vercel:[],supabase:[]}; return {vercel:[...STAGED_VERCEL_NAMES],supabase:[...GENERATED_SUPABASE_SECRET_NAMES]} },
    async dispatchDatabase(sql) { events.push('dispatch'); assert.match(sql,/BEGIN;/); if (fail==='dispatch') throw Error('private'); return receipt() },
    async verifyConnections() { events.push('verify'); if (fail==='verify') throw Error('private') },
    async recoverDatabase() { events.push('recover'); if (fail==='recover') throw Error('private') },
    async removeVercel(names) { events.push('removeVercel'); assert.deepEqual(names, STAGED_VERCEL_NAMES) },
    async removeSupabase(names) { events.push('removeSupabase'); assert.deepEqual(names, GENERATED_SUPABASE_SECRET_NAMES) },
  }
  return { events, ports }
}

test('generated values are distinct, projected to the exact stores and erased', () => {
  deterministicRandom.calls=0;deterministicUuid.calls=0
  const material=generateGeneration6Material({randomBytes:deterministicRandom,randomUUID:deterministicUuid}), projected=projectGeneration6Secrets(material)
  assert.deepEqual(Object.keys(projected.vercel).sort(), [...GENERATED_VERCEL_SECRET_NAMES])
  assert.deepEqual(Object.keys(projected.supabase).sort(), [...GENERATED_SUPABASE_SECRET_NAMES])
  assert.equal(new Set(Object.values(projected.passwords)).size,5); assert.deepEqual(SHOPIFY_CREDENTIAL_DEPENDENCIES,
    ['TLL_STAGING_CART_STOREFRONT_TOKEN','TLL_STAGING_SHOPIFY_CUSTOMER_CLIENT_SECRET'])
  const buffers=[...Object.values(material.passwords),...Object.values(material.customerVaults).map(v=>v.key),material.cartVault.key,material.cartHmac,material.brokerSecret]
  eraseGeneration6Material(material);assert.ok(buffers.every(value=>value.every(byte=>byte===0)))
})

test('SCRAM derivation is deterministic and accepted by the SQL builder', () => {
  const verifiers=Object.fromEntries(['customer','cart','broker','provisional','bridge'].map((purpose,index)=>[purpose,deriveScramVerifier(Buffer.alloc(48,index+1),Buffer.alloc(18,index+9))]))
  assert.equal(new Set(Object.values(verifiers)).size,5);assert.ok(Object.values(verifiers).every(value=>value.startsWith('SCRAM-SHA-256$4096:')))
  assert.match(buildGeneration6CredentialSql({expiresAt:EXPIRES,verifiers,nowMs:NOW}),/tll_generation_6_credential_receipt/)
  assert.match(createHash('sha256').update(verifiers.customer).digest('hex'),/^[a-f0-9]{64}$/)
})

test('duplicate random material and duplicate vault IDs fail before provider projection',()=>{
  assert.throws(()=>generateGeneration6Material({randomBytes:size=>Buffer.alloc(size,1),randomUUID:deterministicUuid}),/unavailable/)
  assert.throws(()=>generateGeneration6Material({randomBytes:systematicRandom(),randomUUID:()=> '00000000-0000-4000-8000-000000000001'}),/unavailable/)
  function systematicRandom(){let n=0;return size=>Buffer.alloc(size,++n)}
})

test('successful flow stages disabled providers, journals before one dispatch and verifies connections', async () => {
  const f=fixture(); deterministicRandom.calls=0;deterministicUuid.calls=0
  const result=await executeGeneration6CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  assert.equal(result.status,'CREDENTIALS_VERIFIED_CONTROLS_DISABLED');assert.equal(result.expiresAt,EXPIRES)
  assert.deepEqual(f.events,['preflight','stageVercel','stageSupabase','readback','intent','dispatch','verify','RECEIPT_VALIDATED'])
})

test('entry baseline failure creates no material, provider change or dispatch',async()=>{
  const f=fixture('preflight');let generated=false
  const result=await executeGeneration6CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:size=>{generated=true;return Buffer.alloc(size,1)},randomUUID:deterministicUuid})
  assert.deepEqual(result,{status:'ENTRY_BASELINE_FAILED',phase:'ENTRY_PREFLIGHT',target:PROJECT_REF,generation:6,windowId:WINDOW_ID,nextAction:'REVIEW_ENTRY_BASELINE'})
  assert.equal(generated,false);assert.deepEqual(f.events,['preflight'])
})

for(const phase of ['vercel','supabase','readback']) test(`provider failure ${phase} cleans names and never dispatches`,async()=>{
  const f=fixture(phase);deterministicRandom.calls=0;deterministicUuid.calls=0
  const result=await executeGeneration6CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  assert.equal(result.status,'STOPPED_BEFORE_DATABASE');assert.ok(!f.events.includes('dispatch'));assert.deepEqual(f.events.slice(-2),['removeVercel','removeSupabase'])
  assert.equal(result.phase,{vercel:'VERCEL_STAGE',supabase:'SUPABASE_STAGE',readback:'PROVIDER_READBACK'}[phase])
})

for(const phase of ['dispatch','verify']) test(`database failure ${phase} invokes recovery once and forbids retry`,async()=>{
  const f=fixture(phase);deterministicRandom.calls=0;deterministicUuid.calls=0
  const result=await executeGeneration6CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  assert.equal(result.status,'RECOVERY_VERIFIED');assert.equal(f.events.filter(value=>value==='dispatch').length,1)
  assert.ok(f.events.includes('recover'));assert.ok(f.events.includes('RECONCILIATION_REQUIRED'));assert.deepEqual(f.events.slice(-2),['removeVercel','removeSupabase'])
})

test('failed recovery returns a fixed reconciliation result and native entry remains disabled',async()=>{
  const f=fixture('recover');f.ports.verifyConnections=async()=>{f.events.push('verify');throw Error('secret raw provider failure')}
  deterministicRandom.calls=0;deterministicUuid.calls=0
  const result=await executeGeneration6CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  assert.deepEqual(result,{status:'RECOVERY_REQUIRED',phase:'CONNECTION_VERIFICATION',target:PROJECT_REF,generation:6,windowId:WINDOW_ID,nextAction:'NO_RETRY_RECONCILE'})
  assert.equal(NATIVE_TRANSPORT_ENABLED,false);assert.equal((await runNativeGeneration6CredentialWindow()).status,'NATIVE_TRANSPORT_DISABLED')
})
