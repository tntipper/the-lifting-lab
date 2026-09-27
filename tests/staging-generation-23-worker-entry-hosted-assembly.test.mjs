import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const scripts = new URL('../scripts/', import.meta.url)
const moduleUrl = new URL('staging-generation-23-worker-entry.mjs', scripts)
const hostedSource = await readFile(new URL('staging-generation-23-hosted-assembly.mjs', scripts), 'utf8')
const hostedUrl = `data:text/javascript;base64,${Buffer.from(hostedSource.replace(
  'export const STAGING_GENERATION_23_HOSTED_ASSEMBLY_ENABLED = false',
  'export const STAGING_GENERATION_23_HOSTED_ASSEMBLY_ENABLED = true')).toString('base64')}`
const credentialSource = await readFile(new URL('staging-generation-23-credentials.mjs', scripts), 'utf8')
const credentialUrl = `data:text/javascript;base64,${Buffer.from(credentialSource
  .replace('export const ACTIVE_WINDOW_EXPIRES_AT = \'UNSET_REQUIRES_REVIEWED_ARMING_DIFF\'',
    "export const ACTIVE_WINDOW_EXPIRES_AT = '2026-09-28T12:00:00.000Z'")
  .replaceAll("from './", `from '${scripts.href}`)).toString('base64')}`
const workerSource = await readFile(moduleUrl, 'utf8')
const workerUrl = `data:text/javascript;base64,${Buffer.from(workerSource
  .replace('export const STAGING_GENERATION_23_WORKER_ENTRY_ENABLED = false',
    'export const STAGING_GENERATION_23_WORKER_ENTRY_ENABLED = true')
  .replace('export const STAGING_GENERATION_23_HOSTED_WORKER_ASSEMBLY_ENABLED = false',
    'export const STAGING_GENERATION_23_HOSTED_WORKER_ASSEMBLY_ENABLED = true')
  .replace("from './staging-generation-23-hosted-assembly.mjs'", `from '${hostedUrl}'`)
  .replace("from './staging-generation-23-credentials.mjs'", `from '${credentialUrl}'`)
  .replaceAll("from './", `from '${scripts.href}`)).toString('base64')}`
const { createStagingGeneration23HostedWorkerAssembly } = await import(workerUrl)

const credentials = () => ({ managementToken: Buffer.from(`sbp_${'a'.repeat(40)}`),
  vercelToken: Buffer.from('token-value'), previewBypass: Buffer.from('bypass-value') })
const names = ['readBaseline', 'replaceSettings', 'readSettings', 'setupDatabase',
  'proveRestrictedConnections', 'proveConsumers', 'enableProvider', 'enableDatabase', 'enableSurface',
  'runOwnerJourney', 'disableDatabase', 'disableProvider', 'freezeSurface',
  'retireDatabase', 'readFinal']
const statuses = Object.freeze({ readBaseline: 'BASELINE_HELD_VERIFIED',
  replaceSettings: 'SETTINGS_METADATA_VERIFIED', readSettings: 'SETTINGS_METADATA_VERIFIED',
  setupDatabase: 'SETUP_VERIFIED', proveRestrictedConnections: 'PASS_RESTRICTED_CONNECTIONS', proveConsumers: 'CONSUMERS_READY_VERIFIED',
  enableProvider: 'PROVIDER_ENABLED_VERIFIED', enableDatabase: 'CONTROL_ACTIVATION_VERIFIED',
  enableSurface: 'SURFACES_ENABLED_VERIFIED', runOwnerJourney: 'OWNER_JOURNEY_VERIFIED_NO_PURCHASE',
  disableDatabase: 'SHUTDOWN_VERIFIED', disableProvider: 'PROVIDER_DISABLED_VERIFIED',
  freezeSurface: 'SURFACES_HELD_VERIFIED', retireDatabase: 'RETIREMENT_VERIFIED', readFinal: 'FINAL_HELD_VERIFIED' })

test('hosted worker factory retains credentials in the child and disposes its real-port factory', async () => {
  const owned = credentials(), calls = []
  let disposed = false
  const worker = createStagingGeneration23HostedWorkerAssembly({ credentials: owned,
    createAdapters(received) {
      assert.equal(received.managementToken, owned.managementToken)
      const ports = Object.fromEntries(names.map(name => [name, async () => {
        calls.push(name)
        return name === 'proveConsumers' ? { status: statuses[name], deployment: { deploymentId: 'dpl_consumer' } }
          : name === 'enableSurface'
          ? { status: statuses[name], deployment: { deploymentId: 'dpl_gen23' } }
          : { status: statuses[name] }
      }]))
      return { ports, async dispose() { disposed = true } }
    },
    async runWhole({ operations, signal, windowExpiresAt }) {
      for (const phase of ['baseline', 'settings', 'databaseSetup', 'restrictedConnections', 'consumerReadiness', 'providerEnable',
        'databaseEnable', 'surfaceEnable', 'ownerJourney', 'backendDisable', 'surfaceFreeze', 'databaseRetire', 'finalReadback']) {
        await operations[phase]({ signal, windowExpiresAt, phaseDeadlineAt: windowExpiresAt })
      }
      return { status: 'LOCAL_SEQUENCE_PASS' }
    },
    journal: { claim() {} },
  })
  assert.deepEqual(await worker.core.run({ signal: new AbortController().signal }),
    { status: 'HOSTED_ASSEMBLY_SEQUENCE_VERIFIED' })
  await worker.dispose()
  assert.equal(disposed, true)
  assert.deepEqual(calls, names)
})

test('verified owner failure is never published as a success route', async () => {
  const owned = credentials()
  const worker = createStagingGeneration23HostedWorkerAssembly({ credentials: owned,
    createAdapters() { return { ports: Object.fromEntries(names.map(name => [name, async () =>
      name === 'runOwnerJourney' ? { status: 'OWNER_JOURNEY_FAILED_VERIFIED' }
        : name === 'proveConsumers' ? { status: statuses[name], deployment: { deploymentId: 'dpl_consumer' } }
        : name === 'enableSurface' ? { status: statuses[name], deployment: { deploymentId: 'dpl_gen23' } }
          : { status: statuses[name] }])), async dispose() {} } },
    async runWhole({ operations, signal, windowExpiresAt }) {
      await operations.consumerReadiness({ signal, windowExpiresAt, phaseDeadlineAt: windowExpiresAt })
      await operations.surfaceEnable({ signal, windowExpiresAt, phaseDeadlineAt: windowExpiresAt })
      assert.equal((await operations.ownerJourney({ signal, windowExpiresAt, phaseDeadlineAt: windowExpiresAt })).status,
        'OWNER_JOURNEY_FAILED_VERIFIED')
      return { status: 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED' }
    }, journal: { claim() {} },
  })
  assert.deepEqual(await worker.core.run({ signal: new AbortController().signal }),
    { status: 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED' })
  await worker.dispose()
})

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
}

async function fixedEntryFixture() {
  const fakePipe = dataModule("export const acceptSupervisorPipe=async()=>()=>{}")
  const fakeBinding = dataModule("export const GENERATION_23_WHOLE_WORKER_PROOF='proof'")
  const fakeHosted = dataModule("export const createStagingGeneration23HostedAssembly=()=>{throw Error('unused')}")
  const fakeCredentials = dataModule("export const ACTIVE_WINDOW_EXPIRES_AT='2026-09-28T12:00:00.000Z'")
  const fakeReader = dataModule("export let reads=0; export const readStagingGeneration23Credentials=async()=>{reads++;throw Error('unused')}")
  const fakeCli = dataModule("export const createStagingGeneration23CliRunner=()=>async()=>({status:'COMPLETED'})")
  const fakePreflight = dataModule("export const createStagingGeneration23FixedPreflight=()=>{throw Error('unused')}")
  const fakeSource = dataModule("export const readStagingGeneration23ArmingSourceFixed=async()=>{throw Error('unused')}")
  const fakeFixed = dataModule("export let inputs; export const createStagingGeneration23FixedWorkerAssembly=input=>{inputs=input;let disposed=false;return {core:{async run(){return {status:'LOCAL_SEQUENCE_PASS'}}},dispose(){disposed=true},get disposed(){return disposed}}}")
  const armed = workerSource
    .replace('export const STAGING_GENERATION_23_WORKER_ENTRY_ENABLED = false',
      'export const STAGING_GENERATION_23_WORKER_ENTRY_ENABLED = true')
    .replace('export const STAGING_GENERATION_23_HOSTED_WORKER_ASSEMBLY_ENABLED = false',
      'export const STAGING_GENERATION_23_HOSTED_WORKER_ASSEMBLY_ENABLED = true')
    .replace('export const STAGING_GENERATION_23_WORKER_CLI_ARMED = false',
      'export const STAGING_GENERATION_23_WORKER_CLI_ARMED = true')
    .replace("from './staging-provider-broker-recovery-process-control.mjs'", `from '${fakePipe}'`)
    .replace("from './staging-generation-23-process-binding.mjs'", `from '${fakeBinding}'`)
    .replace("from './staging-generation-23-hosted-assembly.mjs'", `from '${fakeHosted}'`)
    .replace("from './staging-generation-23-credentials.mjs'", `from '${fakeCredentials}'`)
    .replace("from './staging-generation-23-credential-reader.mjs'", `from '${fakeReader}'`)
    .replace("from './staging-generation-23-cli-runner.mjs'", `from '${fakeCli}'`)
    .replace("from './staging-generation-23-fixed-worker-assembly.mjs'", `from '${fakeFixed}'`)
    .replace("from './staging-generation-23-fixed-preflight.mjs'", `from '${fakePreflight}'`)
    .replace("from './staging-generation-23-arming-source-proof.mjs'", `from '${fakeSource}'`)
  return import(`${dataModule(armed)}#${Math.random()}`)
}

const fixedPreflight = Object.freeze({
  requirements: Object.freeze({ sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64),
    observedAt: '2026-09-28T11:59:00.000Z' }),
  heldEvidence: Object.freeze({ target: Object.freeze({ branch: 'codex/tll-integration' }),
    deploymentId: 'dpl_held', immutableUrl: 'https://held.vercel.app', sourceCommit: 'a'.repeat(40),
    manifestSha256: 'b'.repeat(64), ready: true, createdAt: '2026-09-28T11:58:00.000Z' }),
})
const fixedCheckout = Object.freeze({ name: 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED', id: 'env_checkout',
  branch: 'codex/tll-integration', environment: 'preview', classification: 'config' })

test('fixed path binds only the real fixed factory and translates its completed route terminal', async () => {
  const entry = await fixedEntryFixture()
  const owned = credentials()
  const worker = entry.createStagingGeneration23FixedHostedWorker({ credentials: owned,
    preflight: fixedPreflight, checkoutTarget: fixedCheckout, fetch: async () => {} })
  assert.deepEqual(await worker.core.run({ signal: new AbortController().signal }),
    { status: 'STAGING_SEQUENCE_PASS' })
  worker.dispose()
  for (const value of Object.values(owned)) value.fill(0)
})

test('fixed worker accepts the millisecond timestamps emitted by the fresh preflight', async () => {
  const entry = await fixedEntryFixture()
  const preflight = { ...fixedPreflight,
    requirements: { ...fixedPreflight.requirements, observedAt: new Date(Date.parse('2026-09-28T11:59:00.000Z') + 123).toISOString() },
    heldEvidence: { ...fixedPreflight.heldEvidence, createdAt: '2026-09-28T11:58:00.456Z' } }
  const worker = entry.createStagingGeneration23FixedHostedWorker({ credentials: credentials(),
    preflight, checkoutTarget: fixedCheckout, fetch: async () => {} })
  assert.equal((await worker.core.run({ signal: new AbortController().signal })).status, 'STAGING_SEQUENCE_PASS')
  worker.dispose()
})

test('fixed path refuses missing fresh facts before it can read a credential', async () => {
  const entry = await fixedEntryFixture()
  await assert.rejects(entry.runStagingGeneration23FixedWholeWorker({ signal: new AbortController().signal,
    checkoutTarget: fixedCheckout, fetch: async () => {} }), /unavailable/)
})
