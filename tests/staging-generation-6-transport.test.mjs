import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildGeneration6CredentialSql, PACKAGE_ID, PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-6-credentials.mjs'
import { deriveScramVerifier, DISABLED_VERCEL_CONFIGURATION, eraseGeneration6Material, executeGeneration6CredentialWindow,
  generateGeneration6Material, GENERATED_SUPABASE_SECRET_NAMES, GENERATED_VERCEL_SECRET_NAMES, NATIVE_TRANSPORT_ENABLED,
  projectGeneration6Secrets, SHOPIFY_CREDENTIAL_DEPENDENCIES, STAGED_VERCEL_NAMES } from '../scripts/staging-generation-6-transport.mjs'

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
  assert.deepEqual(result,{status:'ENTRY_BASELINE_FAILED',phase:'ENTRY_PREFLIGHT_RETRY',target:PROJECT_REF,generation:6,windowId:WINDOW_ID,nextAction:'REVIEW_ENTRY_BASELINE'})
  assert.equal(generated,false);assert.deepEqual(f.events,['preflight','preflight'])
})

test('one transient read-only entry failure retries before material generation',async()=>{
  const f=fixture();let attempts=0;f.ports.preflightDatabase=async()=>{f.events.push('preflight');if(++attempts===1)throw Error('private')}
  deterministicRandom.calls=0;deterministicUuid.calls=0
  const result=await executeGeneration6CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  assert.equal(result.status,'CREDENTIALS_VERIFIED_CONTROLS_DISABLED');assert.equal(attempts,2)
  assert.deepEqual(f.events.slice(0,3),['preflight','preflight','stageVercel'])
})

for(const phase of ['vercel','supabase','readback']) test(`provider failure ${phase} cleans names and never dispatches`,async()=>{
  const f=fixture(phase);deterministicRandom.calls=0;deterministicUuid.calls=0
  const result=await executeGeneration6CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  assert.equal(result.status,'STOPPED_BEFORE_DATABASE');assert.ok(!f.events.includes('dispatch'));assert.deepEqual(f.events.slice(-2),['removeVercel','removeSupabase'])
  assert.equal(result.phase,{vercel:'VERCEL_STAGE',supabase:'SUPABASE_STAGE',readback:'PROVIDER_READBACK'}[phase])
})

test('provider failure result exposes only an allow-listed fixed classification',async()=>{
  const f=fixture();f.ports.stageSupabase=async()=>{f.events.push('stageSupabase');const error=Error('secret provider response');error.code='TRANSIENT';throw error}
  deterministicRandom.calls=0;deterministicUuid.calls=0
  const classified=await executeGeneration6CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  assert.equal(classified.failureClassification,'TRANSIENT');assert.doesNotMatch(JSON.stringify(classified),/secret provider response/)
  const g=fixture();g.ports.stageSupabase=async()=>{g.events.push('stageSupabase');const error=Error('private');error.code='PRIVATE_RAW_CODE';throw error}
  deterministicRandom.calls=0;deterministicUuid.calls=0
  const rejected=await executeGeneration6CredentialWindow({ports:g.ports,journal:journal(g.events),now:()=>NOW,randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  assert.equal('failureClassification' in rejected,false)
})

for(const phase of ['dispatch','verify']) test(`database failure ${phase} invokes recovery once and forbids retry`,async()=>{
  const f=fixture(phase);deterministicRandom.calls=0;deterministicUuid.calls=0
  const result=await executeGeneration6CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  assert.equal(result.status,'RECOVERY_VERIFIED');assert.equal(f.events.filter(value=>value==='dispatch').length,1)
  assert.ok(f.events.includes('recover'));assert.ok(f.events.includes('RECONCILIATION_REQUIRED'));assert.deepEqual(f.events.slice(-2),['removeVercel','removeSupabase'])
})

test('failed recovery returns a fixed reconciliation result and consumed transport has no native launcher',async()=>{
  const f=fixture('recover');f.ports.verifyConnections=async()=>{f.events.push('verify');throw Error('secret raw provider failure')}
  deterministicRandom.calls=0;deterministicUuid.calls=0
  const result=await executeGeneration6CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  assert.deepEqual(result,{status:'RECOVERY_REQUIRED',phase:'CONNECTION_VERIFICATION',target:PROJECT_REF,generation:6,windowId:WINDOW_ID,nextAction:'NO_RETRY_RECONCILE'})
  assert.equal(NATIVE_TRANSPORT_ENABLED,false)
  const source=readFileSync('scripts/staging-generation-6-transport.mjs','utf8')
  assert.doesNotMatch(source,/runNativeGeneration6CredentialWindow/)
  assert.doesNotMatch(source,/staging-generation-6-provider-transport|readSupabaseTokenFromKeychain|createStagingPostgresRuntime/)
})

test('connection failure result projects only an exact fixed diagnostic',async()=>{
  const f=fixture();f.ports.verifyConnections=async()=>{f.events.push('verify');const error=Error('PRIVATE_PASSWORD');error.connectionFailure={status:'FAIL',reason:'connection_verification_failed',purpose:'customer',check:'connect_retry'};throw error}
  deterministicRandom.calls=0;deterministicUuid.calls=0
  const result=await executeGeneration6CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  assert.deepEqual(result.connectionFailure,{status:'FAIL',reason:'connection_verification_failed',purpose:'customer',check:'connect_retry'});assert.doesNotMatch(JSON.stringify(result),/PRIVATE|PASSWORD/)
  const g=fixture();g.ports.verifyConnections=async()=>{g.events.push('verify');const error=Error('private');error.connectionFailure={status:'FAIL',reason:'connection_verification_failed',purpose:'PRIVATE',check:'connect_retry'};throw error}
  deterministicRandom.calls=0;deterministicUuid.calls=0
  const rejected=await executeGeneration6CredentialWindow({ports:g.ports,journal:journal(g.events),now:()=>NOW,randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  assert.equal('connectionFailure' in rejected,false)
})

test('SCRAM verifiers are derived from projected base64url passwords, not raw material buffers',async()=>{
  deterministicRandom.calls=0;deterministicUuid.calls=0
  const material=generateGeneration6Material({randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  const projection=projectGeneration6Secrets(material)
  const salt=Buffer.alloc(18,1)
  const fromRaw=deriveScramVerifier(material.passwords.customer,salt)
  const fromProjected=deriveScramVerifier(projection.passwords.customer,salt)
  assert.notEqual(fromRaw,fromProjected)
  assert.equal(typeof projection.passwords.customer,'string')
  assert.ok(Buffer.isBuffer(material.passwords.customer))

  let capturedSql='',capturedPasswords=null
  const f=fixture()
  f.ports.dispatchDatabase=async sql=>{f.events.push('dispatch');capturedSql=sql;return receipt()}
  f.ports.verifyConnections=async input=>{f.events.push('verify');capturedPasswords=Object.fromEntries(Object.entries(input.passwords).map(([purpose,value])=>[purpose,String(value)]))}
  deterministicRandom.calls=0;deterministicUuid.calls=0
  await executeGeneration6CredentialWindow({ports:f.ports,journal:journal(f.events),now:()=>NOW,randomBytes:deterministicRandom,randomUUID:deterministicUuid})
  assert.ok(capturedPasswords)
  for(const [index,purpose] of ['customer','cart','broker','provisional','bridge'].entries()){
    const expected=deriveScramVerifier(capturedPasswords[purpose],Buffer.alloc(18,index+1))
    const rejected=deriveScramVerifier(Buffer.from(capturedPasswords[purpose],'base64url'),Buffer.alloc(18,index+1))
    assert.ok(capturedSql.includes(expected),`sql must embed SCRAM for ${purpose}`)
    assert.notEqual(expected,rejected)
  }
})
