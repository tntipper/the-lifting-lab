import test from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { ownerSuccessorRegistrationDescriptor, issueSyntheticRegistrationCapability, openSyntheticRegisteredSuccessor,
  registerOwnerSuccessorNativeComponents, OWNER_SUCCESSOR_PORTS, OWNER_SUCCESSOR_WINDOW_ID, OWNER_SUCCESSOR_EDGE_REVISION,
  OWNER_SUCCESSOR_SELECTORS } from '../scripts/staging-owner-successor-registration.mjs'
const pins = () => ({ sourceSha: 'a'.repeat(40), reviewedSha: 'a'.repeat(40), manifestSha256: 'b'.repeat(64),
  dependencySha256: 'c'.repeat(64), windowId: OWNER_SUCCESSOR_WINDOW_ID, edgeRevision: OWNER_SUCCESSOR_EDGE_REVISION })
const statuses = ['BASELINE_HELD_VERIFIED', 'SETTINGS_METADATA_VERIFIED', 'SETTINGS_METADATA_VERIFIED', 'SETUP_VERIFIED',
  'PASS_RESTRICTED_CONNECTIONS', 'CONSUMERS_READY_VERIFIED', 'PROVIDER_ENABLED_VERIFIED', 'CONTROL_ACTIVATION_VERIFIED',
  'SURFACES_ENABLED_VERIFIED', 'OWNER_JOURNEY_VERIFIED_NO_PURCHASE', 'SHUTDOWN_VERIFIED', 'PROVIDER_DISABLED_VERIFIED',
  'SURFACES_HELD_VERIFIED', 'RETIREMENT_VERIFIED', 'FINAL_HELD_VERIFIED']
const credentials = () => ({ managementToken: Buffer.from(`sbp_${'a'.repeat(40)}`),
  vercelToken: Buffer.from('SYNTHETIC-VERCEL-STUB'), previewBypass: Buffer.from('SYNTHETIC-BYPASS-STUB') })
const setup = () => {
  const p = pins(), calls = [], owned = credentials()
  return { p, calls, owned, options: { pins: p, supervisorAccepted: true, nowMs: 1000,
    capability: issueSyntheticRegistrationCapability({ pins: p, approvedAtMs: 1000, validUntilMs: 2000 }),
    readStub(selectors) { calls.push('reader'); assert.deepEqual(selectors, OWNER_SUCCESSOR_SELECTORS); return owned },
    makeStubPorts() { calls.push('factory'); return { kind: 'SYNTHETIC_STUB', windowId: p.windowId, edgeRevision: p.edgeRevision,
      adapters: Object.fromEntries(Object.values(OWNER_SUCCESSOR_PORTS).flat().map((name, i) => [name, () => { calls.push(name); return { status: statuses[i] } }])) } },
  } }
}
const wiped = values => assert.ok(Object.values(values).every(v => v.every(byte => byte === 0)))
test('native registration remains OFF and cannot access getters or call a real reader', () => {
  assert.deepEqual(registerOwnerSuccessorNativeComponents(new Proxy({}, { get() { throw Error('must not access') } })),
    { status: 'NATIVE_REGISTRATION_DISABLED', authorization: 'NONE' })
})
test('all existing reader/port interfaces register under exact pins and no phase replays', async () => {
  const s = setup(), worker = await openSyntheticRegisteredSuccessor(s.options)
  for (const phase of Object.keys(OWNER_SUCCESSOR_PORTS)) {
    const result = await worker.runPhase(phase, {})
    assert.equal(result.authorization, 'NONE'); assert.equal(result.provenance, 'SYNTHETIC_STUB')
  }
  assert.deepEqual(s.calls, ['reader', 'factory', ...Object.values(OWNER_SUCCESSOR_PORTS).flat()])
  await assert.rejects(worker.runPhase('ownerJourney', {}))
  worker.dispose(); wiped(s.owned)
  await assert.rejects(openSyntheticRegisteredSuccessor(s.options))
})
test('forged, expired, unreviewed, old-window and unsupervised registration cannot read credentials', async () => {
  for (const extra of [{ capability: {} }, { nowMs: 2000 }, { supervisorAccepted: false }]) {
    const s = setup(); await assert.rejects(openSyntheticRegisteredSuccessor({ ...s.options, ...extra }))
    assert.deepEqual(s.calls, [])
  }
  for (const delta of [{ reviewedSha: 'd'.repeat(40) }, { windowId: 'd5180b08-79ee-43e8-96d4-4f73621fecbf' },
    { edgeRevision: 'tll-gen23-v18-cart-route-1' }, { extra: 'not permitted' }])
    assert.throws(() => ownerSuccessorRegistrationDescriptor({ ...pins(), ...delta }))
})
test('credential or factory failure wipes every acquired buffer', async () => {
  for (const variant of ['same', 'bad', 'throw', 'old-window']) {
    const s = setup()
    if (variant === 'same') s.owned.vercelToken = s.owned.managementToken
    if (variant === 'bad') s.owned.managementToken[0] = 0
    if (variant === 'throw') s.options.makeStubPorts = () => { throw Error('Synthetic factory failure') }
    if (variant === 'old-window') s.options.makeStubPorts = () => ({ kind: 'SYNTHETIC_STUB', windowId: 'old', edgeRevision: s.p.edgeRevision, adapters: {} })
    await assert.rejects(openSyntheticRegisteredSuccessor(s.options)); wiped(s.owned)
  }
})
test('uncertain adapter result is consumed and erases credentials before any success', async () => {
  const s = setup(), factory = s.options.makeStubPorts
  s.options.makeStubPorts = () => { const result = factory(); result.adapters.enableProvider = () => ({ status: 'UNCERTAIN' }); return result }
  const worker = await openSyntheticRegisteredSuccessor(s.options)
  await assert.rejects(worker.runPhase('providerEnable', {})); wiped(s.owned)
  await assert.rejects(worker.runPhase('providerEnable', {}))
})

test('registration snapshots pins and freezes phase lists before a stub can mutate caller state', async () => {
  const s = setup(), reader = s.options.readStub, factory = s.options.makeStubPorts
  s.options.readStub = selectors => { s.p.sourceSha = 'd'.repeat(40); s.p.reviewedSha = 'd'.repeat(40); return reader(selectors) }
  s.options.makeStubPorts = input => {
    assert.equal(input.descriptor.descriptor.pins.sourceSha, 'a'.repeat(40))
    assert.throws(() => { input.descriptor.descriptor.pins.sourceSha = 'e'.repeat(40) })
    assert.throws(() => OWNER_SUCCESSOR_PORTS.settings.push('unexpected'))
    return factory(input)
  }
  const worker = await openSyntheticRegisteredSuccessor(s.options)
  worker.dispose(); wiped(s.owned)
})

test('stub status obligations match the unchanged existing hosted assembly contract', () => {
  const source = readFileSync(new URL('../scripts/staging-generation-23-hosted-assembly.mjs', import.meta.url), 'utf8')
  for (const status of statuses) assert.ok(source.includes("'" + status + "'"), 'missing existing contract: ' + status)
})

test('paused phase cannot dispatch its next adapter or report PASS after disposal or sibling failure', async () => {
  for (const cause of ['dispose', 'failure']) {
    const s = setup(), factory = s.options.makeStubPorts
    let resume, entered
    const started = new Promise(resolve => { entered = resolve })
    s.options.makeStubPorts = () => {
      const result = factory()
      result.adapters.replaceSettings = async () => {
        s.calls.push('replaceSettings'); entered()
        await new Promise(resolve => { resume = resolve })
        return { status: 'SETTINGS_METADATA_VERIFIED' }
      }
      result.adapters.enableProvider = () => ({ status: 'UNCERTAIN' })
      return result
    }
    const worker = await openSyntheticRegisteredSuccessor(s.options)
    const pending = worker.runPhase('settings', {})
    const refused = assert.rejects(pending)
    await started
    if (cause === 'dispose') worker.dispose()
    else await assert.rejects(worker.runPhase('providerEnable', {}))
    wiped(s.owned); resume(); await refused
    assert.equal(s.calls.includes('readSettings'), false)
    await assert.rejects(worker.runPhase('finalReadback', {}))
  }
})
test('disposed single-adapter phase cannot report PASS when its awaited adapter resumes', async () => {
  const s = setup(), factory = s.options.makeStubPorts
  let resume
  s.options.makeStubPorts = () => { const result = factory(); result.adapters.readBaseline = () =>
    new Promise(resolve => { resume = () => resolve({ status: 'BASELINE_HELD_VERIFIED' }) }); return result }
  const worker = await openSyntheticRegisteredSuccessor(s.options), pending = worker.runPhase('baseline', {})
  const refused = assert.rejects(pending)
  worker.dispose(); wiped(s.owned); resume(); await refused
})
