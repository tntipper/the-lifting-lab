import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const script = new URL('../scripts/staging-generation-23-hosted-assembly.mjs', import.meta.url)
const source = await readFile(script, 'utf8')
const armed = await import(`data:text/javascript;base64,${Buffer.from(source.replace(
  'export const STAGING_GENERATION_23_HOSTED_ASSEMBLY_ENABLED = false',
  'export const STAGING_GENERATION_23_HOSTED_ASSEMBLY_ENABLED = true')).toString('base64')}`)

const names = ['readBaseline', 'replaceSettings', 'readSettings', 'setupDatabase',
  'proveRestrictedConnections', 'proveConsumers', 'enableProvider', 'enableDatabase', 'enableSurface',
  'runOwnerJourney', 'disableDatabase', 'disableProvider', 'freezeSurface',
  'retireDatabase', 'readFinal']
const heldConsumer = { deploymentId: 'dpl_consumer' }
const phaseToAdapter = Object.freeze({ baseline: 'readBaseline', settings: ['replaceSettings', 'readSettings'],
  databaseSetup: 'setupDatabase', restrictedConnections: 'proveRestrictedConnections', consumerReadiness: 'proveConsumers',
  providerEnable: 'enableProvider', databaseEnable: 'enableDatabase', surfaceEnable: 'enableSurface',
  ownerJourney: 'runOwnerJourney', backendDisable: ['disableDatabase', 'disableProvider'],
  surfaceFreeze: 'freezeSurface', databaseRetire: 'retireDatabase', finalReadback: 'readFinal' })

function fakeAdapters(calls, owner = 'OWNER_JOURNEY_VERIFIED_NO_PURCHASE') {
  const result = {
    readBaseline: 'BASELINE_HELD_VERIFIED', replaceSettings: 'SETTINGS_METADATA_VERIFIED',
    readSettings: 'SETTINGS_METADATA_VERIFIED', setupDatabase: 'SETUP_VERIFIED',
    proveRestrictedConnections: 'PASS_RESTRICTED_CONNECTIONS', proveConsumers: 'CONSUMERS_READY_VERIFIED', enableProvider: 'PROVIDER_ENABLED_VERIFIED',
    enableDatabase: 'CONTROL_ACTIVATION_VERIFIED', enableSurface: 'SURFACES_ENABLED_VERIFIED',
    runOwnerJourney: owner, disableDatabase: 'SHUTDOWN_VERIFIED', disableProvider: 'PROVIDER_DISABLED_VERIFIED',
    freezeSurface: 'SURFACES_HELD_VERIFIED', retireDatabase: 'RETIREMENT_VERIFIED', readFinal: 'FINAL_HELD_VERIFIED',
  }
  return Object.fromEntries(names.map(name => [name, async input => {
    calls.push(name)
    if (name === 'runOwnerJourney') assert.deepEqual(input.deployment, { deploymentId: 'dpl_one' })
    if (name === 'enableSurface') assert.deepEqual(input.heldEvidence, heldConsumer)
    return name === 'proveConsumers' ? { status: result[name], deployment: heldConsumer }
      : name === 'enableSurface' ? { status: result[name], deployment: { deploymentId: 'dpl_one' } }
      : { status: result[name] }
  }]))
}

test('ordinary source stays disabled', async () => {
  const plain = await import(`${script.href}?ordinary=${Date.now()}`)
  assert.throws(() => plain.createStagingGeneration23HostedAssembly({}), /unavailable/)
})

test('joins every whole-run phase to exact guarded adapter outcomes', async () => {
  const calls = [], controller = new AbortController()
  const core = armed.createStagingGeneration23HostedAssembly({ adapters: fakeAdapters(calls),
    async runWhole({ operations, signal, windowExpiresAt }) {
      assert.equal(windowExpiresAt, '2026-09-28T12:00:00.000Z')
      for (const phase of Object.keys(phaseToAdapter)) {
        const result = await operations[phase]({ signal, windowExpiresAt, phaseDeadlineAt: windowExpiresAt })
        if (phase === 'ownerJourney') assert.equal(result.status, 'PASS_OWNERJOURNEY')
        else assert.equal(result.status, `PASS_${phase.toUpperCase()}`)
      }
      return { status: 'LOCAL_SEQUENCE_PASS' }
    } })
  assert.deepEqual(await core.run({ signal: controller.signal, windowExpiresAt: '2026-09-28T12:00:00.000Z' }),
    { status: 'LOCAL_SEQUENCE_PASS' })
  assert.deepEqual(calls, names)
})

test('a verified owner failure still permits the whole-run shutdown path', async () => {
  const calls = [], controller = new AbortController()
  const core = armed.createStagingGeneration23HostedAssembly({ adapters: fakeAdapters(calls, 'OWNER_JOURNEY_FAILED_VERIFIED'),
    async runWhole({ operations, signal, windowExpiresAt }) {
      await operations.consumerReadiness({ signal, windowExpiresAt, phaseDeadlineAt: windowExpiresAt })
      await operations.surfaceEnable({ signal, windowExpiresAt, phaseDeadlineAt: windowExpiresAt })
      assert.equal((await operations.ownerJourney({ signal, windowExpiresAt, phaseDeadlineAt: windowExpiresAt })).status,
        'OWNER_JOURNEY_FAILED_VERIFIED')
      await operations.backendDisable({ signal, windowExpiresAt, phaseDeadlineAt: windowExpiresAt })
      await operations.surfaceFreeze({ signal, windowExpiresAt, phaseDeadlineAt: windowExpiresAt })
      await operations.databaseRetire({ signal, windowExpiresAt, phaseDeadlineAt: windowExpiresAt })
      await operations.finalReadback({ signal, windowExpiresAt, phaseDeadlineAt: windowExpiresAt })
      return { status: 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED' }
    } })
  const result = await core.run({ signal: controller.signal, windowExpiresAt: '2026-09-28T12:00:00.000Z' })
  assert.equal(result.status, 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED')
  assert.deepEqual(calls, ['proveConsumers', 'enableSurface', 'runOwnerJourney', 'disableDatabase', 'disableProvider', 'freezeSurface', 'retireDatabase', 'readFinal'])
})

test('missing a real port is rejected before any route can start', () => {
  const adapters = fakeAdapters([]); delete adapters.readFinal
  assert.throws(() => armed.createStagingGeneration23HostedAssembly({ adapters,
    runWhole: async () => ({ status: 'LOCAL_SEQUENCE_PASS' }) }), /unavailable/)
})
