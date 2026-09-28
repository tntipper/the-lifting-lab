import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const adapters = ['readBaseline', 'replaceSettings', 'readSettings', 'setupDatabase', 'proveRestrictedConnections', 'proveConsumers',
  'enableProvider', 'enableDatabase', 'enableSurface', 'runOwnerJourney', 'disableDatabase', 'disableProvider',
  'freezeSurface', 'retireDatabase', 'readFinal']

const journal = () => ({ read: () => null, claim() {}, dispatch() {}, verify() {}, ownerFailure() {}, skipOwner() {}, hold() {}, holdBeforeDispatch() {}, confirm() {}, recordIntent() {}, transition() {}, pending() {}, verified() {}, finish() {} })

function factories(calls, final = {}) {
  const captured = {}
  const hostedPorts = { readBaseline: async () => ({ status: 'BASELINE_HELD_VERIFIED' }),
    readEdgeNamesForRetire: async () => [],
    readFinalProvider: async () => ({ status: final.provider ?? 'FINAL_PROVIDER_DISABLED_VERIFIED' }),
    replaceSettings: async () => ({ status: 'SETTINGS_METADATA_VERIFIED' }), readSettings: async () => ({ status: 'SETTINGS_METADATA_VERIFIED' }) }
  const databaseResult = name => async () => ({ status: name })
  return {
    createWholeJournal: journal, createSettingsJournal: journal, createCheckoutJournal: journal,
    createPreviewJournal: journal, createSurfaceJournal: journal, createConsumerDiagnostic: journal,
    createHosted(input) { calls.push('hosted'); assert.equal(input.expectedDeployment.gitSourceCommit, preflight.requirements.sourceCommit)
      return { ports: hostedPorts, getDatabaseMaterial: () => ({ passwords: {}, verifiers: {} }), dispose() { calls.push('dispose:hosted') } } },
    createDatabase() { calls.push('database'); return { components: {
      databaseSetup: { run: async () => { calls.push('database-setup'); return { status: 'SETUP_VERIFIED' } } },
      restrictedConnections: { prove: databaseResult('PASS_RESTRICTED_CONNECTIONS') },
      providerEnable: async input => { calls.push('provider-enable'); captured.providerEnable = input; return { status: 'PROVIDER_ENABLED_VERIFIED' } },
      controlsEnable: { run: databaseResult('CONTROL_ACTIVATION_VERIFIED') },
      controlsDisable: { run: databaseResult('SHUTDOWN_VERIFIED') }, providerDisable: databaseResult('PROVIDER_DISABLED_VERIFIED'),
      readBackendState: async () => { calls.push('backend-state'); return {
        projectRef: 'qdmvngjwkcsilzmqksme', controlsEnabled: false, runtimeSessions: 0 } },
      databaseRetire: { run: databaseResult('RETIREMENT_VERIFIED') }, readRetiredState: databaseResult(final.database ?? 'PASS_FINAL_RETIRED'),
      readBrokerHeld: databaseResult(final.broker ?? 'HELD'),
      readBrokerWindowActive: async () => { calls.push('broker-guard'); return { status: final.guard ?? 'ACTIVE_GUARDS' } },
    }, dispose() { calls.push('dispose:database') } } },
    createVariantReader() { return { read: async () => ({ status: 'SHOPIFY_STAGING_VARIANT_PRICE_VERIFIED' }), dispose() { calls.push('dispose:variant') } } },
    createConsumerProof() { return { prove: async () => ({ status: 'CONSUMERS_READY_VERIFIED', deployment: { deploymentId: 'dpl_consumer' } }) } },
    createGateRetire() { return { retire: async () => ({ status: 'BROKER_GATE_RETIRED_VERIFIED' }), dispose() {} } },
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
  assert.deepEqual(await built.ports.readBaseline({ signal }), { status: 'BASELINE_HELD_VERIFIED' })
  assert.deepEqual(await built.ports.readFinal({ signal }), { status: 'FINAL_HELD_VERIFIED' })
  assert.deepEqual(calls.slice(0, 5), ['hosted', 'database', 'surface', 'assembly', 'preview-worker'])
  built.dispose()
  assert.deepEqual(calls.slice(-5), ['dispose:core', 'dispose:surface', 'dispose:variant', 'dispose:database', 'dispose:hosted'])
})

test('starting-state check refuses a broker response without the reviewed source', async () => {
  const f = factories([], { broker: 'UNPROVEN_SOURCE' })
  const built = armed.createStagingGeneration23FixedWorkerAssembly({
    credentials: { ...credentials }, fetch: async () => {}, expiresAt: expiry, preflight,
    checkoutTarget: checkout, runCli: async () => ({ status: 'COMPLETED' }), now: () => now,
    factories: f,
  })
  try { await assert.rejects(built.ports.readBaseline({ signal }), /unavailable/) }
  finally { built.dispose() }
})

test('settings read proves an active broker window before database setup is called', async () => {
  for (const guard of ['ACTIVE_GUARDS', 'HELD']) {
    const calls = [], built = armed.createStagingGeneration23FixedWorkerAssembly({
      credentials: { ...credentials }, fetch: async () => {}, expiresAt: expiry, preflight,
      checkoutTarget: checkout, runCli: async () => ({ status: 'COMPLETED' }), now: () => now,
      factories: factories(calls, { guard }),
    })
    try {
      if (guard === 'ACTIVE_GUARDS') assert.equal((await built.ports.readSettings({ signal })).status, 'SETTINGS_METADATA_VERIFIED')
      else await assert.rejects(built.ports.readSettings({ signal }), /unavailable/)
      assert.equal(calls.filter(value => value === 'broker-guard').length, 1)
      assert.equal(calls.includes('database-setup'), false)
    } finally { built.dispose() }
  }
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
    { broker: 'PASS' }, { surface: 'ALIAS_DRIFT' }]) {
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

test('provider waits for temporary Preview-probe sessions before claiming its write', async () => {
  let clock = now, reads = 0
  const deadlineAt = new Date(now + 45 * 60_000).toISOString()
  assert.equal(await armed.waitForProviderDrain({
    readState: async () => ({ projectRef: 'qdmvngjwkcsilzmqksme', controlsEnabled: false,
      runtimeSessions: reads++ < 2 ? 5 : 0 }), signal, deadlineAt,
    now: () => clock, pause: async milliseconds => { clock += milliseconds },
  }), true)
  assert.equal(reads, 3)
  const secondStart = clock
  assert.equal(await armed.waitForProviderDrain({
    readState: async () => ({ projectRef: 'qdmvngjwkcsilzmqksme', controlsEnabled: false,
      runtimeSessions: 5 }), signal, deadlineAt, now: () => clock,
    pause: async milliseconds => { clock += milliseconds },
  }), false)
  assert.equal(clock - secondStart <= 300_000, true)

  let longerClock = now, longerReads = 0
  assert.equal(await armed.waitForProviderDrain({
    readState: async () => ({ projectRef: 'qdmvngjwkcsilzmqksme', controlsEnabled: false,
      runtimeSessions: longerReads++ < 13 ? 5 : 0 }), signal, deadlineAt,
    now: () => longerClock, pause: async milliseconds => { longerClock += milliseconds },
  }), true)
  assert.equal(longerClock - now, 130_000)
  assert.equal(await armed.waitForProviderDrain({
    readState: async () => { throw Error('read failed') }, signal, deadlineAt,
    now: () => now, pause: async () => assert.fail('no wait after failed read'),
  }), false)
  const cancelled = new AbortController()
  assert.equal(await armed.waitForProviderDrain({
    readState: async () => { cancelled.abort(); return { projectRef: 'qdmvngjwkcsilzmqksme',
      controlsEnabled: false, runtimeSessions: 0 } }, signal: cancelled.signal,
    deadlineAt, now: () => now,
  }), false)
  assert.equal(await armed.waitForProviderDrain({
    readState: async () => assert.fail('no read without shutdown reserve'), signal,
    deadlineAt: new Date(now + 15 * 60_000).toISOString(), now: () => now,
  }), false)
  for (const remaining of [22 * 60_000 - 1, 22 * 60_000]) {
    assert.equal(await armed.waitForProviderDrain({
      readState: async () => assert.fail('no read at or below the 22-minute boundary'), signal,
      deadlineAt: new Date(now + remaining).toISOString(), now: () => now,
    }), false)
  }
  let boundaryReads = 0
  assert.equal(await armed.waitForProviderDrain({
    readState: async () => { boundaryReads += 1; return { projectRef: 'qdmvngjwkcsilzmqksme',
      controlsEnabled: false, runtimeSessions: 0 } }, signal,
    deadlineAt: new Date(now + 22 * 60_000 + 1).toISOString(), now: () => now,
  }), true)
  assert.equal(boundaryReads, 1)

  const hanging = new AbortController()
  const pending = armed.waitForProviderDrain({
    readState: async () => new Promise(() => {}), signal: hanging.signal,
    deadlineAt, now: () => now,
  })
  hanging.abort()
  assert.equal(await pending, false)

  let lateClock = now
  assert.equal(await armed.waitForProviderDrain({
    readState: async () => { lateClock += 6 * 60_000; return {
      projectRef: 'qdmvngjwkcsilzmqksme', controlsEnabled: false, runtimeSessions: 0 } },
    signal, deadlineAt, now: () => lateClock,
  }), false)
})

test('assembled provider step reads zero sessions before the provider write', async () => {
  const calls = [], f = factories(calls), built = armed.createStagingGeneration23FixedWorkerAssembly({
    credentials: { ...credentials }, fetch: async () => {}, expiresAt: expiry, preflight,
    checkoutTarget: checkout, runCli: async () => ({ status: 'COMPLETED' }),
    now: () => now, factories: f,
  })
  try {
    assert.equal((await built.ports.enableProvider({ signal,
      phaseDeadlineAt: expiry })).status, 'PROVIDER_ENABLED_VERIFIED')
    assert.deepEqual(calls.slice(-2), ['backend-state', 'provider-enable'])
    assert.equal(f.captured.providerEnable.latestDispatchAt,
      new Date(Date.parse(expiry) - 21 * 60_000).toISOString())
  } finally { built.dispose() }
})

test('provider step stops a hung update or readback before the shutdown reserve', async () => {
  for (const label of ['update', 'readback']) {
    let cancelled = false
    const result = await armed.runProviderBeforeShutdownReserve({
      run: ({ signal: child }) => new Promise(() => {
        child.addEventListener('abort', () => { cancelled = true }, { once: true })
      }),
      signal, deadlineAt: new Date(now + 20 * 60_000 + 20).toISOString(),
      now: () => now,
    })
    assert.equal(result.status, 'PROVIDER_DEADLINE_HOLD', label)
    assert.equal(cancelled, true, label)
  }
  assert.equal((await armed.runProviderBeforeShutdownReserve({
    run: async () => assert.fail('no provider call after reserve'), signal,
    deadlineAt: new Date(now + 20 * 60_000).toISOString(), now: () => now,
  })).status, 'PROVIDER_DEADLINE_HOLD')
})

// Exercise the actual nested website wrapper, protected body copy, broker read,
// consumer proof and durable diagnostic together. Other whole-route phases
// remain synthetic; no credential or network boundary is opened by this test.
async function armReal(name, gate) {
  const path = new URL(`../scripts/${name}`, import.meta.url)
  const source = (await readFile(path, 'utf8'))
    .replace(`export const ${gate} = false`, `export const ${gate} = true`)
    .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)
    .replace('resolve(import.meta.dirname,',
      `resolve(${JSON.stringify(fileURLToPath(new URL('../scripts/', import.meta.url)))},`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('assembled consumers record real website and broker boundaries before activation', async () => {
  const [proofModule, diagnosticModule, protectedModule, databaseModule] = await Promise.all([
    armReal('staging-generation-23-consumer-proof.mjs', 'STAGING_GENERATION_23_CONSUMER_PROOF_ENABLED'),
    armReal('staging-generation-23-consumer-diagnostic.mjs', 'STAGING_GENERATION_23_CONSUMER_DIAGNOSTIC_ENABLED'),
    armReal('staging-generation-23-protected-fetch.mjs', 'STAGING_GENERATION_23_PROTECTED_FETCH_ENABLED'),
    armReal('staging-generation-23-fixed-database-provider-components.mjs',
      'STAGING_GENERATION_23_FIXED_DATABASE_PROVIDER_COMPONENTS_ENABLED'),
  ])
  const deploymentId = 'dpl_consumer', immutableUrl = 'https://consumer.vercel.app'
  const sourceCommit = preflight.requirements.sourceCommit
  const manifestSha256 = preflight.requirements.manifestSha256
  const runId = '8a5354d1-e925-4e30-84cf-70802c5d4a34'
  const validWebsite = { status: 'PASS', deploymentId,
    checks: { customer: 'PASS', cart: 'PASS', provisional: 'PASS', bridge: 'PASS' } }
  const scenarios = [
    { name: 'pass', expected: 'PASS', stage: 'broker_response_validation', website: validWebsite },
    { name: 'website-invalid-json', expected: 'HOLD', stage: 'website_response_validation', website: '{' },
    { name: 'website-invalid-contract', expected: 'HOLD', stage: 'website_response_validation',
      website: { ...validWebsite, checks: { ...validWebsite.checks, bridge: 'FAIL' } } },
    { name: 'service-key-failure', expected: 'HOLD', stage: 'broker_service_key', website: validWebsite,
      serviceKeyFails: true },
    { name: 'broker-network-failure', expected: 'HOLD', stage: 'broker_request', website: validWebsite,
      brokerThrows: true },
    { name: 'broker-503', expected: 'HOLD', stage: 'broker_response_validation', website: validWebsite,
      brokerStatus: 503 },
    { name: 'journal-write-failure', expected: 'PENDING', stage: 'preview_build', website: validWebsite,
      blockJournalWrite: true },
  ]
  for (const scenario of scenarios) {
    const dir = mkdtempSync(join(tmpdir(), 'tll-gen23-joined-consumer-'))
    const path = join(dir, 'consumer.json')
    const requests = { website: 0, broker: 0 }
    let consumerPreviewJournal
    let built
    try {
      if (scenario.blockJournalWrite) writeFileSync(`${path}.${runId}.1.tmp`, 'occupied', { flag: 'wx', mode: 0o600 })
      const f = factories([])
      f.createConsumerProof = proofModule.createStagingGeneration23ConsumerProof
      f.createConsumerDiagnostic = () => diagnosticModule.createStagingGeneration23ConsumerDiagnostic({
        path, makeRunId: () => runId, now: () => now })
      f.createProtectedFetch = protectedModule.createStagingGeneration23ProtectedFetch
      f.createPreviewJournal = ({ path: journalPath }) => {
        const fixture = { value: null, read() { return this.value }, claim() {} }
        if (journalPath.includes('preview-consumer')) consumerPreviewJournal = fixture
        return fixture
      }
      f.createNativeBinding = () => ({ async readDeployment() { return {
        deploymentId, immutableUrl, sourceCommit, manifestSha256, ready: true,
        createdAt: new Date(now).toISOString(),
      } } })
      f.createDatabase = input => databaseModule.createStagingGeneration23FixedDatabaseProviderComponents({
        ...input, factories: { createSupabase: () => ({
          async readNamedSecretKey() {
            if (scenario.serviceKeyFails) throw Error('synthetic service-key failure')
            return Buffer.from(`sb_secret_${'d'.repeat(32)}`)
          }, dispose() {},
        }) },
      })
      f.runPreviewWorker = async ({ journal: selected }) => {
        assert.equal(selected, consumerPreviewJournal)
        selected.value = { phase: 'VERIFIED', deploymentId, sourceCommit, manifestSha256,
          publicCustomer: false, publicCart: false }
        return { status: 'PROTECTED_PREVIEW_VERIFIED', deploymentId, immutableUrl,
          sourceCommit, manifestSha256, customerEnabled: false, cartEnabled: false }
      }
      const fakeFetch = async (url, options) => {
        if (url === `${immutableUrl}/api/staging/consumer-readiness`) {
          requests.website++
          assert.equal(options.method, 'GET')
          assert.equal(options.headers.get('x-vercel-protection-bypass'), 'preview-token')
          return new Response(typeof scenario.website === 'string' ? scenario.website
            : JSON.stringify(scenario.website), { status: 200,
            headers: { 'content-type': 'application/json' } })
        }
        if (url === 'https://qdmvngjwkcsilzmqksme.supabase.co/functions/v1/tll-broker-readiness-g23-v9') {
          requests.broker++
          assert.equal(options.headers.authorization, undefined)
          assert.equal(options.headers.apikey, `sb_secret_${'d'.repeat(32)}`)
          if (scenario.brokerThrows) throw Error('synthetic broker network failure')
          const status = scenario.brokerStatus ?? 200
          return new Response(JSON.stringify(status === 200
            ? { status: 'PASS', windowId: '759bc8ed-5ecd-475c-8a4c-e35fcf628a73', expiresAt: expiry }
            : { status: 'FAIL' }), { status, headers: { 'content-type': 'application/json',
              'x-tll-broker-revision': 'tll-gen23-v17-cart-route-1' } })
        }
        throw Error('unexpected synthetic target')
      }
      built = armed.createStagingGeneration23FixedWorkerAssembly({ credentials: { ...credentials },
        fetch: fakeFetch, expiresAt: expiry, preflight, checkoutTarget: checkout,
        runCli: async () => ({ status: 'COMPLETED' }), now: () => now, factories: f })
      if (scenario.expected === 'PASS') {
        const result = await built.ports.proveConsumers({ signal })
        assert.equal(result.status, 'CONSUMERS_READY_VERIFIED', scenario.name)
      } else await assert.rejects(built.ports.proveConsumers({ signal }), undefined, scenario.name)
      const recorded = JSON.parse(readFileSync(path, 'utf8'))
      assert.equal(recorded.state, scenario.expected, scenario.name)
      assert.equal(recorded.stage, scenario.stage, scenario.name)
      assert.equal(requests.website, scenario.blockJournalWrite ? 0 : 1, scenario.name)
      assert.equal(requests.broker, ['pass', 'broker-network-failure', 'broker-503'].includes(scenario.name) ? 1 : 0,
        scenario.name)
      assert.equal(recorded.websiteHttpStatus, scenario.blockJournalWrite ? null : 200, scenario.name)
      assert.equal(recorded.brokerHttpStatus, scenario.brokerStatus ?? (scenario.expected === 'PASS' ? 200 : null),
        scenario.name)
      assert.doesNotMatch(readFileSync(path, 'utf8'), /Bearer|preview-token|synthetic service-key/i)
    } finally { built?.dispose(); rmSync(dir, { recursive: true, force: true }) }
  }
})
