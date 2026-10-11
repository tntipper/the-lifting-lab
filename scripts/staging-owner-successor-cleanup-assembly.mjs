/** Disabled fixed cleanup for one uncertain databaseSetup. Never resumes the original route. */
import * as fs from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { ownerSuccessorSourceIdentity } from './staging-owner-successor-native-context.mjs'
import { ACTIVE_WINDOW_EXPIRES_AT, WINDOW_ID, assertOwnerSuccessorSetupClock } from './staging-owner-successor-sql-context.mjs'
import { createOwnerSuccessorWholeRouteJournal, JOURNAL_PATH as ORIGINAL_PATH } from './staging-owner-successor-whole-route-journal.mjs'
import { createOwnerSuccessorFixedDatabaseProviderComponents } from './staging-owner-successor-fixed-database-provider-components.mjs'
import { createOwnerSuccessorFixedHostedAdapters } from './staging-owner-successor-fixed-hosted-adapters.mjs'
import { createStagingGeneration23SettingsJournal } from './staging-generation-23-settings-journal.mjs'
import { createStagingGeneration23FixedPreflight } from './staging-generation-23-fixed-preflight.mjs'
import { createStagingGeneration23CheckoutReadinessReader } from './staging-generation-23-checkout-readiness-reader.mjs'
import { createStagingGeneration23CheckoutSettingPort } from './staging-generation-23-checkout-setting-port.mjs'
import { createStagingGeneration23BrokerGateRetire } from './staging-generation-23-broker-gate-retire.mjs'
import { createStagingAccountHostedBaselineSupabaseBinding } from './staging-account-hosted-baseline-supabase.mjs'
import { projectOfficialStagingProvider } from './staging-provider-broker-native-adapter.mjs'
import { waitForRetirementDrain } from './staging-owner-successor-fixed-worker-assembly.mjs'

export const OWNER_SUCCESSOR_CLEANUP_ASSEMBLY_ENABLED = false
export const CLEANUP_JOURNAL_PATH = resolve(import.meta.dirname, '../.agent/owner-successor', WINDOW_ID, 'cleanup-only.json')
const SCHEMA = 'tll-owner-successor-cleanup-only/v1'
const PHASES = Object.freeze(['heldBefore', 'databaseShutdown', 'providerHeld', 'databaseRetire', 'brokerGateRetire', 'finalReadback'])
const HOLD = Object.freeze({ status: 'HOLD_RECONCILE', authorization: 'NONE' })
const denied = () => { throw Error('Successor cleanup unavailable') }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join('|') === [...keys].sort().join('|')
const signalOk = v => v && !v.aborted && typeof v.addEventListener === 'function' && typeof v.removeEventListener === 'function'
const OWNERSHIP_PATH = resolve(dirname(CLEANUP_JOURNAL_PATH), 'worker-ownership.json')
function originalWorkerStopped(identity) {
  const bytes = privateRead(OWNERSHIP_PATH, 2048), ownership = JSON.parse(bytes.toString('utf8'))
  if (!exact(ownership, ['schema', 'identity', 'pid', 'supervisorPid'])
    || ownership.schema !== 'tll-owner-successor-worker-ownership/v1'
    || JSON.stringify(ownership.identity) !== JSON.stringify(identity)
    || !Number.isSafeInteger(ownership.pid) || ownership.pid < 2
    || !Number.isSafeInteger(ownership.supervisorPid) || ownership.supervisorPid < 2
    || ownership.pid === ownership.supervisorPid) denied()
  for (const pid of [ownership.pid, -ownership.pid, ownership.supervisorPid]) {
    try { process.kill(pid, 0) } catch (error) { if (error?.code === 'ESRCH') continue; denied() }
    denied()
  }
  return hash(bytes)
}
const privateDirectory = () => {
  const directory = dirname(CLEANUP_JOURNAL_PATH)
  for (let path = directory; path !== resolve(import.meta.dirname, '..'); path = dirname(path)) {
    const stat = fs.lstatSync(path)
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()) denied()
    if (path === directory && (stat.mode & 0o777) !== 0o700) denied()
  }
  return directory
}
const privateRead = (path, maximum) => {
  privateDirectory()
  const stat = fs.lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.getuid()
    || (stat.mode & 0o777) !== 0o600 || stat.size > maximum) denied()
  return fs.readFileSync(path)
}
function originalAdmission(sourceProof, now) {
  const identity = ownerSuccessorSourceIdentity(sourceProof, now())
  const bytes = privateRead(ORIGINAL_PATH, 8192)
  const original = createOwnerSuccessorWholeRouteJournal({ identity, now }).read()
  if (!original || !['ACTIVE', 'HOLD'].includes(original.state) || original.pendingPhase !== 'databaseSetup'
    || original.nextIndex !== 2 || original.phases.length !== 3
    || original.phases[0].state !== 'VERIFIED' || original.phases[1].state !== 'VERIFIED'
    || !['DISPATCHED', 'HOLD'].includes(original.phases[2].state)
    || JSON.stringify(JSON.parse(bytes.toString('utf8'))) !== JSON.stringify(original)) denied()
  const workerOwnershipSha256 = originalWorkerStopped(identity)
  return Object.freeze({ identity, originalRunId: original.runId, originalSha256: hash(bytes), workerOwnershipSha256 })
}
/** Evidence only. The accepted cleanup child calls this before reading credentials. */
export function readOwnerSuccessorCleanupAdmission(options = {}) {
  if (!OWNER_SUCCESSOR_CLEANUP_ASSEMBLY_ENABLED) denied()
  const { sourceProof, now = Date.now } = options
  if (typeof now !== 'function') denied()
  const admission = originalAdmission(sourceProof, now)
  try { fs.lstatSync(CLEANUP_JOURNAL_PATH); denied() } catch (error) { if (error?.code !== 'ENOENT') denied() }
  return admission
}
function persist(record, initial) {
  const directory = privateDirectory(), bytes = Buffer.from(`${JSON.stringify(record)}\n`)
  const path = initial ? CLEANUP_JOURNAL_PATH : `${CLEANUP_JOURNAL_PATH}.${record.runId}.${record.nextIndex}.tmp`
  let fd
  try {
    fd = fs.openSync(path, 'wx', 0o600)
    let offset = 0
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset)
      if (!Number.isSafeInteger(written) || written < 1) denied()
      offset += written
    }
    fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined
    if (!initial) fs.renameSync(path, CLEANUP_JOURNAL_PATH)
    const dir = fs.openSync(directory, 'r')
    try { fs.fsyncSync(dir) } finally { fs.closeSync(dir) }
  } finally { if (fd !== undefined) fs.closeSync(fd); bytes.fill(0) }
}
/** Fixed defaults only: no setup, enable, deployment, customer-write or resume API is exposed. */
export function createOwnerSuccessorFixedCleanupAssembly(options = {}) {
  if (!OWNER_SUCCESSOR_CLEANUP_ASSEMBLY_ENABLED) denied()
  const { credentials, sourceProof, preflight, runCli, fetch: fetcher, now = Date.now, signal } = options
  if (!exact(credentials, ['managementToken', 'vercelToken', 'previewBypass'])
    || !Object.values(credentials).every(v => Buffer.isBuffer(v) && v.length >= 8 && v.length <= 1024)
    || !exact(preflight, ['heldEvidence', 'requirements']) || typeof runCli !== 'function'
    || typeof fetcher !== 'function' || typeof now !== 'function' || !signalOk(signal)) denied()
  const controller = new AbortController(), joined = AbortSignal.any([signal, controller.signal])
  let used = false, disposed = false, last = -Infinity, database, hosted, gate, reader, timer
  const clock = () => {
    const at = now()
    if (disposed || joined.aborted || !Number.isSafeInteger(at) || at < last || at >= Date.parse(ACTIVE_WINDOW_EXPIRES_AT) - 5000) denied()
    last = at; return at
  }
  const admission = readOwnerSuccessorCleanupAdmission({ sourceProof, now: clock })
  if (preflight.requirements?.sourceCommit !== admission.identity.sourceCommit
    || preflight.requirements?.manifestSha256 !== admission.identity.manifestSha256) denied()
  const originalUnchanged = () => {
    clock()
    if (hash(privateRead(ORIGINAL_PATH, 8192)) !== admission.originalSha256) denied()
    if (originalWorkerStopped(admission.identity) !== admission.workerOwnershipSha256) denied()
  }
  const dispose = () => {
    if (disposed) return
    disposed = true; controller.abort(); clearTimeout(timer)
    try { reader?.dispose?.() } finally { try { gate?.dispose?.() } finally {
      try { hosted?.dispose?.() } finally { database?.dispose?.() }
    } }
  }
  const held = async () => {
    originalUnchanged()
    reader = createStagingGeneration23FixedPreflight({ fetch: fetcher,
      vercelToken: credentials.vercelToken, previewBypass: credentials.previewBypass, now: clock,
      readSourceProof: async () => Object.freeze({ status: 'SOURCE_PROOF_VERIFIED',
        sourceCommit: admission.identity.sourceCommit, manifestSha256: admission.identity.manifestSha256 }) })
    try {
      const result = await reader.read({ signal: joined })
      originalUnchanged()
      if (result.preflight.heldEvidence.deploymentId !== preflight.heldEvidence.deploymentId
        || result.preflight.heldEvidence.immutableUrl !== preflight.heldEvidence.immutableUrl) denied()
      const checkoutRuntime = createStagingGeneration23CheckoutReadinessReader({ fetch: fetcher,
        bypass: credentials.previewBypass, deploymentId: preflight.heldEvidence.deploymentId,
        immutableUrl: preflight.heldEvidence.immutableUrl })
      const checkoutSetting = createStagingGeneration23CheckoutSettingPort({ fetch: fetcher,
        token: credentials.vercelToken, target: result.checkoutTarget })
      try {
        if ((await checkoutRuntime.read({ expected: false, signal: joined }))?.status !== 'CHECKOUT_RUNTIME_VERIFIED') denied()
        if ((await checkoutSetting.read(result.checkoutTarget, { signal: joined }))?.enabled !== false) denied()
        originalUnchanged()
      } finally { checkoutRuntime.dispose(); checkoutSetting.dispose() }
    } finally { reader.dispose(); reader = undefined }
  }
  return Object.freeze({ core: Object.freeze({ async run() {
    if (used || disposed) return HOLD
    used = true
    let record
    const update = change => {
      originalUnchanged()
      if (JSON.stringify(JSON.parse(privateRead(CLEANUP_JOURNAL_PATH, 4096).toString('utf8'))) !== JSON.stringify(record)) denied()
      record = { ...record, ...change, updatedAt: new Date(clock()).toISOString() }
      persist(record, false)
    }
    try {
      assertOwnerSuccessorSetupClock(ACTIVE_WINDOW_EXPIRES_AT, clock())
      originalUnchanged()
      record = { schema: SCHEMA, authorization: 'NONE', identity: admission.identity,
        originalRunId: admission.originalRunId, originalSha256: admission.originalSha256,
        workerOwnershipSha256: admission.workerOwnershipSha256,
        runId: randomUUID(), state: 'ACTIVE', nextIndex: 0, pendingPhase: null,
        phases: [], createdAt: new Date(clock()).toISOString(), updatedAt: new Date(clock()).toISOString() }
      persist(record, true)
      timer = setTimeout(() => controller.abort(), Math.max(1, Date.parse(ACTIVE_WINDOW_EXPIRES_AT) - clock() - 5000))
      const path = name => resolve(dirname(CLEANUP_JOURNAL_PATH), `${name}.json`)
      hosted = createOwnerSuccessorFixedHostedAdapters({ credentials, fetch: fetcher, expiresAt: ACTIVE_WINDOW_EXPIRES_AT,
        expectedDeployment: { deploymentId: preflight.heldEvidence.deploymentId,
          immutableUrl: preflight.heldEvidence.immutableUrl, gitSourceCommit: preflight.heldEvidence.sourceCommit },
        settingsJournal: createStagingGeneration23SettingsJournal({ path: path('cleanup-settings-unused') }), now: clock })
      database = createOwnerSuccessorFixedDatabaseProviderComponents({ credentials,
        sourceCommit: admission.identity.sourceCommit, expiresAt: ACTIVE_WINDOW_EXPIRES_AT, fetch: fetcher })
      gate = createStagingGeneration23BrokerGateRetire({ path: path('cleanup-broker-gate-retire'),
        token: credentials.managementToken, fetch: fetcher,
        readNames: input => hosted.ports.readEdgeNamesForRetire(input) })
      const input = () => ({ expiresAt: ACTIVE_WINDOW_EXPIRES_AT,
        deadlineAt: new Date(Date.parse(ACTIVE_WINDOW_EXPIRES_AT) - 5000).toISOString(), signal: joined })
      const phases = [held,
        async () => { if ((await database.components.controlsDisable.run(input()))?.status !== 'SHUTDOWN_VERIFIED') denied() },
        async () => {
          // This original route stopped at setup, before provider enable. A
          // real OFF read proves that scope; drift is HOLD, never an enable or
          // a weakened DISABLE transition from an already-held provider.
          const binding = createStagingAccountHostedBaselineSupabaseBinding({ fetch: fetcher,
            managementToken: credentials.managementToken })
          try { projectOfficialStagingProvider(await binding.readProvider({ signal: joined })); originalUnchanged() }
          finally { binding.dispose() }
        },
        async () => {
          if (!await waitForRetirementDrain({ readState: () => database.components.readBackendState(input()),
            signal: joined, deadlineAt: input().deadlineAt, now: clock })) denied()
          if ((await database.components.databaseRetire.run(input()))?.status !== 'RETIREMENT_VERIFIED') denied()
        },
        async () => { if ((await gate.retire({ signal: joined }))?.status !== 'BROKER_GATE_RETIRED_VERIFIED') denied() },
        async () => {
          if ((await database.components.readRetiredState({ signal: joined }))?.status !== 'PASS_FINAL_RETIRED') denied()
          if ((await hosted.ports.readFinalProvider({ signal: joined }))?.status !== 'FINAL_PROVIDER_DISABLED_VERIFIED') denied()
          if ((await database.components.readBrokerHeld({ signal: joined }))?.status !== 'HELD') denied()
          await held()
        }]
      for (const [index, run] of phases.entries()) {
        originalUnchanged()
        update({ nextIndex: index, pendingPhase: PHASES[index] })
        await run()
        originalUnchanged()
        update({ nextIndex: index + 1, pendingPhase: null, phases: [...record.phases, PHASES[index]] })
      }
      update({ state: 'PASS' })
      return Object.freeze({ status: 'CLEANUP_SEQUENCE_PASS', authorization: 'NONE' })
    } catch {
      if (record) { try { update({ state: 'HOLD' }) } catch {} }
      return HOLD
    } finally { dispose() }
  } }), dispose })
}
