import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const script = new URL('../scripts/staging-generation-23-fixed-worker-assembly.mjs', import.meta.url)
const source = await readFile(script, 'utf8')
const armed = await import(`data:text/javascript;base64,${Buffer.from(source
  .replace('export const STAGING_GENERATION_23_FIXED_WORKER_ASSEMBLY_ENABLED = false',
    'export const STAGING_GENERATION_23_FIXED_WORKER_ASSEMBLY_ENABLED = true')
  .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)).toString('base64')}`)

const now = Date.parse('2026-09-27T12:00:00.000Z')
const expiry = new Date(now + 45 * 60_000).toISOString()
const signal = new AbortController().signal
const credentials = Object.freeze({ managementToken: Buffer.from(`sbp_${'a'.repeat(40)}`),
  vercelToken: Buffer.from('vercel-token'), previewBypass: Buffer.from('preview-token') })
const preflight = Object.freeze({ requirements: Object.freeze({ sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64), observedAt: new Date(now).toISOString() }),
  heldEvidence: Object.freeze({ target: Object.freeze({}), deploymentId: 'dpl_held', immutableUrl: 'https://held.vercel.app',
    sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64), ready: true, createdAt: new Date(now - 1_000).toISOString() }) })
const checkout = Object.freeze({ name: 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED', id: 'env_checkout',
  branch: 'codex/tll-integration', environment: 'preview', classification: 'config' })
const adapters = ['readBaseline', 'replaceSettings', 'readSettings', 'setupDatabase', 'proveRestrictedConnections',
  'enableProvider', 'enableDatabase', 'enableSurface', 'runOwnerJourney', 'disableDatabase', 'disableProvider',
  'freezeSurface', 'retireDatabase', 'readFinal']

const journal = () => ({ read: () => null, claim() {}, dispatch() {}, verify() {}, ownerFailure() {}, skipOwner() {}, hold() {}, holdBeforeDispatch() {}, confirm() {}, recordIntent() {}, transition() {} })

function factories(calls, final = {}) {
  const captured = {}
  const hostedPorts = { readBaseline: async () => ({ status: 'BASELINE_HELD_VERIFIED' }),
    readFinalProvider: async () => ({ status: final.provider ?? 'FINAL_PROVIDER_DISABLED_VERIFIED' }),
    replaceSettings: async () => ({ status: 'SETTINGS_METADATA_VERIFIED' }), readSettings: async () => ({ status: 'SETTINGS_METADATA_VERIFIED' }) }
  const databaseResult = name => async () => ({ status: name })
  return {
    createWholeJournal: journal, createSettingsJournal: journal, createCheckoutJournal: journal,
    createPreviewJournal: journal, createSurfaceJournal: journal,
    createHosted(input) { calls.push('hosted'); assert.equal(input.expectedDeployment.gitSourceCommit, preflight.requirements.sourceCommit)
      return { ports: hostedPorts, getDatabaseMaterial: () => ({ passwords: {}, verifiers: {} }), dispose() { calls.push('dispose:hosted') } } },
    createDatabase() { calls.push('database'); return { components: {
      databaseSetup: { run: databaseResult('SETUP_VERIFIED') }, restrictedConnections: { prove: databaseResult('PASS_RESTRICTED_CONNECTIONS') },
      providerEnable: databaseResult('PROVIDER_ENABLED_VERIFIED'), controlsEnable: { run: databaseResult('CONTROL_ACTIVATION_VERIFIED') },
      controlsDisable: { run: databaseResult('SHUTDOWN_VERIFIED') }, providerDisable: databaseResult('PROVIDER_DISABLED_VERIFIED'),
      readBackendState: async () => ({ projectRef: 'qdmvngjwkcsilzmqksme', controlsEnabled: false, runtimeSessions: 0 }),
      databaseRetire: { run: databaseResult('RETIREMENT_VERIFIED') }, readRetiredState: databaseResult(final.database ?? 'PASS_FINAL_RETIRED'),
    }, dispose() { calls.push('dispose:database') } } },
    createVariantReader() { return { read: async () => ({ status: 'SHOPIFY_STAGING_VARIANT_PRICE_VERIFIED' }), dispose() { calls.push('dispose:variant') } } },
    createExecutor() { return async operation => ({ status: 'COMPLETED', value: await operation(signal) }) },
    createSurface(input) { calls.push('surface'); assert.equal(typeof input.preview.runBuild, 'function'); captured.runPreviewBuild = input.preview.runBuild
      return { ports: { enableSurface: async () => ({ status: 'SURFACES_ENABLED_VERIFIED', deployment: { deploymentId: 'dpl_enabled' } }),
        runOwnerJourney: async () => ({ status: 'OWNER_JOURNEY_VERIFIED_NO_PURCHASE' }), freezeSurface: async () => ({ status: 'SURFACES_HELD_VERIFIED' }),
        readFinalSurface: async () => ({ status: final.surface ?? 'FINAL_SURFACES_HELD_VERIFIED' }) },
      dispose() { calls.push('dispose:surface') } } },
    createAssembly({ adapters: supplied, runWhole }) { calls.push('assembly'); assert.deepEqual(Object.keys(supplied), adapters)
      return { async run(input) { calls.push('run'); return runWhole({ operations: {}, ...input }) }, dispose() { calls.push('dispose:core') } } },
    async runWhole({ windowExpiresAt }) { assert.equal(windowExpiresAt, expiry); return { status: 'LOCAL_SEQUENCE_PASS' } },
    async runPreviewWorker({ input, journal: workerJournal, acquireCredentials, stopWorkerGroup }) {
      calls.push('preview-worker')
      assert.equal(typeof input, 'object'); assert.equal(typeof workerJournal.claim, 'function')
      assert.equal(typeof stopWorkerGroup, 'function')
      const copied = await acquireCredentials()
      assert.notEqual(copied.vercelToken, credentials.vercelToken)
      assert.notEqual(copied.protectionBypassToken, credentials.previewBypass)
      copied.vercelToken.fill(0); copied.protectionBypassToken.fill(0)
      return { status: 'PROTECTED_PREVIEW_VERIFIED' }
    },
    captured,
  }
}

test('ordinary source remains disabled', async () => {
  const plain = await import(`${script.href}?plain=${Date.now()}`)
  assert.throws(() => plain.createStagingGeneration23FixedWorkerAssembly({}), /unavailable/)
})

test('joins the fourteen phase adapters to their fixed factories and one whole-route journal', async () => {
  const calls = []
  const f = factories(calls)
  const built = armed.createStagingGeneration23FixedWorkerAssembly({ credentials: { ...credentials }, fetch: async () => {},
    expiresAt: expiry, preflight, checkoutTarget: checkout, runCli: async () => ({ status: 'COMPLETED' }),
    now: () => now, factories: f })
  assert.deepEqual(await f.captured.runPreviewBuild({ input: {}, journal: journal(), signal }),
    { status: 'PROTECTED_PREVIEW_VERIFIED' })
  assert.deepEqual(await built.core.run({ signal }), { status: 'LOCAL_SEQUENCE_PASS' })
  assert.deepEqual(await built.ports.readFinal({ signal }), { status: 'FINAL_HELD_VERIFIED' })
  assert.deepEqual(calls.slice(0, 5), ['hosted', 'database', 'surface', 'assembly', 'preview-worker'])
  built.dispose()
  assert.deepEqual(calls.slice(-5), ['dispose:core', 'dispose:surface', 'dispose:variant', 'dispose:database', 'dispose:hosted'])
})

test('refuses a malformed fixed input before any factory can run', () => {
  let called = false
  assert.throws(() => armed.createStagingGeneration23FixedWorkerAssembly({ credentials: { ...credentials }, fetch: async () => {},
    expiresAt: expiry, preflight, checkoutTarget: { ...checkout, branch: 'main' }, runCli: async () => {}, now: () => now,
    factories: { createHosted() { called = true } } }), /unavailable/)
  assert.equal(called, false)
})

test('final success requires database, provider and held Preview proofs together', async () => {
  for (const failed of [{ database: 'PASS_RETIRED' }, { provider: 'PROVIDER_ENABLED' },
    { surface: 'ALIAS_DRIFT' }]) {
    const built = armed.createStagingGeneration23FixedWorkerAssembly({ credentials: { ...credentials },
      fetch: async () => {}, expiresAt: expiry, preflight, checkoutTarget: checkout,
      runCli: async () => ({ status: 'COMPLETED' }), now: () => now,
      factories: factories([], failed) })
    await assert.rejects(built.ports.readFinal({ signal }), /unavailable/)
    built.dispose()
  }
})

test('later customer sessions drain before the one-use retirement write is claimed', async () => {
  let clock = now, reads = 0
  const passed = await armed.waitForRetirementDrain({
    readState: async () => ({ projectRef: 'qdmvngjwkcsilzmqksme', controlsEnabled: false,
      runtimeSessions: reads++ < 2 ? 1 : 0 }), signal,
    deadlineAt: new Date(now + 5 * 60_000).toISOString(), now: () => clock,
    pause: async milliseconds => { clock += milliseconds },
  })
  assert.equal(passed, true)
  assert.equal(reads, 3)
  assert.equal(await armed.waitForRetirementDrain({
    readState: async () => ({ projectRef: 'qdmvngjwkcsilzmqksme', controlsEnabled: false, runtimeSessions: 1 }),
    signal, deadlineAt: new Date(now + 20_000).toISOString(), now: () => now,
  }), false)
  let delayed = now
  assert.equal(await armed.waitForRetirementDrain({
    readState: async () => { delayed += 120_000; return { projectRef: 'qdmvngjwkcsilzmqksme',
      controlsEnabled: false, runtimeSessions: 0 } }, signal,
    deadlineAt: new Date(now + 5 * 60_000).toISOString(), now: () => delayed,
  }), false)
  const cancelled = new AbortController()
  assert.equal(await armed.waitForRetirementDrain({
    readState: async () => { cancelled.abort(); return { projectRef: 'qdmvngjwkcsilzmqksme',
      controlsEnabled: false, runtimeSessions: 0 } }, signal: cancelled.signal,
    deadlineAt: new Date(now + 5 * 60_000).toISOString(), now: () => now,
  }), false)
})
