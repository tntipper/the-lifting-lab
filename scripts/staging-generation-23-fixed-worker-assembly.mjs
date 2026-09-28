/**
 * The fixed, disabled join for Generation 23's complete protected staging
 * route. It joins existing narrow components; it does not read Keychain,
 * create an approval window, or perform I/O while imported.
 *
 * The caller supplies fresh, source-pinned held Preview evidence. Preview
 * builds use the existing worker inside this same supervised child, so that
 * worker keeps ownership of its durable dispatch record and containment.
 */
import { createStagingGeneration23FixedHostedAdapters } from './staging-generation-23-fixed-hosted-adapters.mjs'
import { createStagingGeneration23FixedDatabaseProviderComponents } from './staging-generation-23-fixed-database-provider-components.mjs'
import { createStagingGeneration23SurfaceFactory } from './staging-generation-23-surface-factory.mjs'
import { createStagingGeneration23HostedAssembly } from './staging-generation-23-hosted-assembly.mjs'
import { rehearseStagingGeneration23WholeRun } from './staging-generation-23-whole-run.mjs'
import { createStagingGeneration23WholeRouteJournal } from './staging-generation-23-whole-route-journal.mjs'
import { createStagingGeneration23SettingsJournal } from './staging-generation-23-settings-journal.mjs'
import { createStagingGeneration23CheckoutSettingJournal } from './staging-generation-23-checkout-setting-journal.mjs'
import { createStagingPreviewDeploymentJournal } from './staging-surface-preview-deployment-journal.mjs'
import { createSurfaceActivationJournal } from './staging-surface-activation-transport.mjs'
import { createStagingGeneration23VariantReadinessReader } from './staging-generation-23-variant-readiness-reader.mjs'
import { createStagingGeneration23ConsumerProof } from './staging-generation-23-consumer-proof.mjs'
import { createStagingGeneration23ConsumerDiagnostic } from './staging-generation-23-consumer-diagnostic.mjs'
import { createStagingGeneration23BrokerGateRetire } from './staging-generation-23-broker-gate-retire.mjs'
import { createStagingGeneration23ProtectedFetch } from './staging-generation-23-protected-fetch.mjs'
import { createStagingSurfaceNativeBinding } from './staging-surface-activation-native-binding.mjs'
import { createStagingBoundedExecutor } from './staging-bounded-executor.mjs'
import { runStagingPreviewDeploymentWorker } from './staging-surface-preview-deployment-worker.mjs'
import { STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_MAX_MS } from './staging-generation-23-restricted-connections.mjs'
import { PROJECT_REF } from './staging-generation-23-password-material.mjs'

export const STAGING_GENERATION_23_FIXED_WORKER_ASSEMBLY_ENABLED = false

const unavailable = () => { throw Error('Generation 23 fixed worker assembly unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const signalOk = signal => signal && !signal.aborted && typeof signal.addEventListener === 'function'
const wait = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (!signalOk(signal)) return reject(Error('Session drain unavailable'))
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, milliseconds)
  const abort = () => { clearTimeout(timer); reject(Error('Session drain stopped')) }
  signal.addEventListener('abort', abort, { once: true })
})

/** Read only: leave the one-use retirement record untouched until sessions drain. */
export async function waitForRetirementDrain({ readState, signal, deadlineAt,
  now = Date.now, pause = wait } = {}) {
  if (typeof readState !== 'function' || !signalOk(signal) || typeof now !== 'function'
    || typeof pause !== 'function' || !Number.isFinite(Date.parse(deadlineAt))) return false
  const start = now(), stop = Math.min(start + 120_000, Date.parse(deadlineAt) - 30_000)
  if (!Number.isFinite(start) || stop <= start) return false
  while (signalOk(signal) && now() < stop) {
    let state
    try { state = await readState() } catch { return false }
    const observedAt = now()
    if (!signalOk(signal) || !Number.isFinite(observedAt)
      || observedAt < start || observedAt >= stop) return false
    if (!exact(state, ['projectRef', 'controlsEnabled', 'runtimeSessions'])
      || state.projectRef !== PROJECT_REF || state.controlsEnabled !== false
      || !Number.isSafeInteger(state.runtimeSessions) || state.runtimeSessions < 0) return false
    if (state.runtimeSessions === 0) return true
    if (now() + 10_000 >= stop) return false
    try { await pause(10_000, signal) } catch { return false }
  }
  return false
}
/** Stop observing early enough for provider preflight and the shutdown reserve. */
export async function waitForProviderDrain({ readState, signal, deadlineAt,
  now = Date.now, pause = wait } = {}) {
  if (typeof readState !== 'function' || !signalOk(signal) || typeof now !== 'function'
    || typeof deadlineAt !== 'string' || !Number.isFinite(Date.parse(deadlineAt))) return false
  const stopAt = Math.min(now() + 120_000, Date.parse(deadlineAt) - 20 * 60_000)
  if (!Number.isFinite(stopAt) || stopAt <= now()) return false
  const boundedRead = async () => {
    const remaining = Math.min(30_000, stopAt - now())
    if (!signalOk(signal) || remaining <= 0) throw Error('Provider drain deadline reached')
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, remaining)
    try {
      return await Promise.race([
        Promise.resolve().then(() => readState({ signal: controller.signal })),
        new Promise((_, reject) => controller.signal.addEventListener('abort',
          () => reject(Error('Provider drain read stopped')), { once: true })),
      ])
    } finally {
      clearTimeout(timer); signal.removeEventListener('abort', abort); controller.abort()
    }
  }
  // The shared helper reserves its own final 30 seconds. Subtract that here
  // so its observation cutoff is exactly stopAt.
  return waitForRetirementDrain({ readState: boundedRead, signal,
    deadlineAt: new Date(stopAt + 30_000).toISOString(), now, pause })
}
/** Cap the entire provider preflight, update and readback before shutdown reserve. */
export async function runProviderBeforeShutdownReserve({ run, signal, deadlineAt,
  now = Date.now } = {}) {
  if (typeof run !== 'function' || !signalOk(signal) || typeof now !== 'function'
    || typeof deadlineAt !== 'string' || !Number.isFinite(Date.parse(deadlineAt)))
    return Object.freeze({ status: 'PROVIDER_DEADLINE_HOLD' })
  const remaining = Math.min(120_000, Date.parse(deadlineAt) - 15 * 60_000 - now())
  if (!Number.isFinite(remaining) || remaining <= 0)
    return Object.freeze({ status: 'PROVIDER_DEADLINE_HOLD' })
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, remaining)
  try {
    return await Promise.race([
      Promise.resolve().then(() => run({ signal: controller.signal })),
      new Promise((_, reject) => controller.signal.addEventListener('abort',
        () => reject(Error('Provider step stopped')), { once: true })),
    ])
  } catch { return Object.freeze({ status: 'PROVIDER_DEADLINE_HOLD' }) }
  finally { clearTimeout(timer); signal.removeEventListener('abort', abort); controller.abort() }
}
const token = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 4096
  && !value.includes(0) && /^[\x21-\x7e]+$/.test(value.toString('utf8'))
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(value)
  && Number.isFinite(Date.parse(value))
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const deployment = value => exact(value, ['target', 'deploymentId', 'immutableUrl', 'sourceCommit',
  'manifestSha256', 'ready', 'createdAt']) && value.target && typeof value.target === 'object'
  && /^dpl_[A-Za-z0-9]+$/.test(value.deploymentId) && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value.immutableUrl)
  && sha(value.sourceCommit) && digest(value.manifestSha256) && value.ready === true
  && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
const requirements = value => exact(value, ['sourceCommit', 'manifestSha256', 'observedAt'])
  && sha(value.sourceCommit) && digest(value.manifestSha256) && typeof value.observedAt === 'string'
  && Number.isFinite(Date.parse(value.observedAt))
const checkoutTarget = value => exact(value, ['name', 'id', 'branch', 'environment', 'classification'])
  && typeof value.name === 'string' && /^[A-Za-z0-9_-]{4,128}$/.test(value.id)
  && value.branch === 'codex/tll-integration' && value.environment === 'preview' && value.classification === 'config'

function validatePreflight(value) {
  if (!exact(value, ['heldEvidence', 'requirements']) || !deployment(value.heldEvidence)
    || !requirements(value.requirements)
    || value.heldEvidence.sourceCommit !== value.requirements.sourceCommit
    || value.heldEvidence.manifestSha256 !== value.requirements.manifestSha256) unavailable()
  return value
}

function requireJournal(journal, methods) {
  if (!journal || methods.some(name => typeof journal[name] !== 'function')) unavailable()
  return journal
}

/**
 * Build all fourteen guarded adapter functions and the one whole-route core.
 *
 * The containing Gen23 worker may call this only after accepting its
 * supervisor pipe. An uncertain Preview POST terminates that child process
 * group rather than allowing a second mutation from an ambiguous record.
 */
export function createStagingGeneration23FixedWorkerAssembly({ credentials, fetch: fetcher,
  expiresAt, preflight, checkoutTarget: checkout, runCli, now = Date.now,
  factories = {} } = {}) {
  if (!STAGING_GENERATION_23_FIXED_WORKER_ASSEMBLY_ENABLED
    || !exact(credentials, ['managementToken', 'vercelToken', 'previewBypass'])
    || !Object.values(credentials).every(token) || typeof fetcher !== 'function' || !iso(expiresAt)
    || !validatePreflight(preflight) || !checkoutTarget(checkout) || typeof runCli !== 'function'
    || typeof now !== 'function'
    || !factories || typeof factories !== 'object' || Array.isArray(factories)) unavailable()

  const make = (name, fallback) => factories[name] ?? fallback
  const makeHosted = make('createHosted', createStagingGeneration23FixedHostedAdapters)
  const makeDatabase = make('createDatabase', createStagingGeneration23FixedDatabaseProviderComponents)
  const makeSurface = make('createSurface', createStagingGeneration23SurfaceFactory)
  const makeAssembly = make('createAssembly', createStagingGeneration23HostedAssembly)
  const makeWholeJournal = make('createWholeJournal', createStagingGeneration23WholeRouteJournal)
  const makeSettingsJournal = make('createSettingsJournal', createStagingGeneration23SettingsJournal)
  const makeCheckoutJournal = make('createCheckoutJournal', createStagingGeneration23CheckoutSettingJournal)
  const makePreviewJournal = make('createPreviewJournal', createStagingPreviewDeploymentJournal)
  const makeSurfaceJournal = make('createSurfaceJournal', createSurfaceActivationJournal)
  const makeVariantReader = make('createVariantReader', createStagingGeneration23VariantReadinessReader)
  const makeConsumerProof = make('createConsumerProof', createStagingGeneration23ConsumerProof)
  const makeConsumerDiagnostic = make('createConsumerDiagnostic', createStagingGeneration23ConsumerDiagnostic)
  const makeGateRetire = make('createGateRetire', createStagingGeneration23BrokerGateRetire)
  const makeProtectedFetch = make('createProtectedFetch', createStagingGeneration23ProtectedFetch)
  const makeNativeBinding = make('createNativeBinding', createStagingSurfaceNativeBinding)
  const makeExecutor = make('createExecutor', createStagingBoundedExecutor)
  const runWhole = make('runWhole', rehearseStagingGeneration23WholeRun)
  const runPreviewWorker = make('runPreviewWorker', runStagingPreviewDeploymentWorker)
  if ([makeHosted, makeDatabase, makeSurface, makeAssembly, makeWholeJournal, makeSettingsJournal,
    makeCheckoutJournal, makePreviewJournal, makeSurfaceJournal, makeVariantReader,
    makeConsumerDiagnostic, makeExecutor, runWhole]
    .concat(runPreviewWorker).some(item => typeof item !== 'function')) unavailable()

  // These are deliberately separate durable records. The enable and freeze
  // operations, as well as the enabled and held Preview builds, must never be
  // able to consume one another's record.
  const journals = Object.freeze({
    whole: requireJournal(makeWholeJournal(), ['claim', 'dispatch', 'verify', 'ownerFailure', 'skipOwner', 'hold', 'holdBeforeDispatch', 'read']),
    settings: requireJournal(makeSettingsJournal(), ['claim', 'dispatch', 'confirm', 'hold', 'read']),
    enableSurface: requireJournal(makeSurfaceJournal({ path: `${import.meta.dirname}/../../implementation-state/staging/tll-generation-23-surface-enable-v12.json` }), ['read', 'recordIntent', 'transition']),
    freezeSurface: requireJournal(makeSurfaceJournal({ path: `${import.meta.dirname}/../../implementation-state/staging/tll-generation-23-surface-freeze-v12.json` }), ['read', 'recordIntent', 'transition']),
    consumerPreview: requireJournal(makePreviewJournal({ path: `${import.meta.dirname}/../../implementation-state/staging/tll-generation-23-preview-consumer-v12.json` }), ['read', 'claim']),
    consumerDiagnostic: requireJournal(makeConsumerDiagnostic(), ['read', 'claim', 'pending', 'verified', 'finish', 'hold']),
    checkoutEnable: requireJournal(makeCheckoutJournal({ action: 'ENABLE' }), ['read', 'recordIntent', 'transition']),
    checkoutFreeze: requireJournal(makeCheckoutJournal({ action: 'FREEZE' }), ['read', 'recordIntent', 'transition']),
    previewEnabled: requireJournal(makePreviewJournal({ path: `${import.meta.dirname}/../../implementation-state/staging/tll-generation-23-preview-enabled-v12.json` }), ['read', 'claim']),
    previewHeld: requireJournal(makePreviewJournal({ path: `${import.meta.dirname}/../../implementation-state/staging/tll-generation-23-preview-held-v12.json` }), ['read', 'claim']),
  })
  if (journals.previewEnabled === journals.previewHeld || journals.enableSurface === journals.freezeSurface) unavailable()

  let hosted, database, surface, variant, gateRetire, core, disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    try { core?.dispose?.() } finally {
      try { surface?.dispose?.() } finally {
        try { variant?.dispose?.() } finally {
          try { database?.dispose?.() } finally { try { gateRetire?.dispose?.() } finally { hosted?.dispose?.() } }
        }
      }
    }
  }
  try {
    const expectedDeployment = Object.freeze({ deploymentId: preflight.heldEvidence.deploymentId,
      immutableUrl: preflight.heldEvidence.immutableUrl, gitSourceCommit: preflight.heldEvidence.sourceCommit })
    hosted = makeHosted({ credentials, fetch: fetcher, expiresAt, expectedDeployment, settingsJournal: journals.settings })
    database = makeDatabase({ credentials, sourceCommit: preflight.requirements.sourceCommit, expiresAt, fetch: fetcher })
    gateRetire = makeGateRetire({ token: credentials.managementToken, fetch: fetcher,
      readNames: input => hosted.ports.readEdgeNamesForRetire(input) })
    variant = makeVariantReader({ fetch: fetcher, bypass: credentials.previewBypass,
      deploymentId: preflight.heldEvidence.deploymentId, immutableUrl: preflight.heldEvidence.immutableUrl })
    const execute = makeExecutor()
    if (!hosted?.ports || typeof hosted.ports.readEdgeNamesForRetire !== 'function'
      || typeof hosted.getDatabaseMaterial !== 'function' || typeof hosted.dispose !== 'function'
      || !database?.components || typeof database.dispose !== 'function' || !variant || typeof variant.read !== 'function'
      || typeof variant.dispose !== 'function' || typeof execute !== 'function') unavailable()
    const runPreviewBuild = async ({ input, journal, signal } = {}) => {
      if (!signalOk(signal) || !input || !journal || typeof journal.claim !== 'function') unavailable()
      // The Preview worker receives copies and wipes them in its finally block.
      // The owned buffers remain available for the held Preview and shutdown.
      const acquireCredentials = async () => Object.freeze({ vercelToken: Buffer.from(credentials.vercelToken),
        protectionBypassToken: Buffer.from(credentials.previewBypass) })
      // This closure is reachable only from the accepted, supervised Gen23 child.
      const stopWorkerGroup = () => { try { process.kill(-process.pid, 'SIGKILL') } catch { process.kill(process.pid, 'SIGKILL') } }
      return runPreviewWorker({ input, journal, acquireCredentials, fetch: fetcher,
        runCli, stopWorkerGroup, signal })
    }
    const readConsumerDeployment = async (target, deploymentId, { signal }) => {
      const binding = makeNativeBinding({ runCli, fetch: fetcher, vercelToken: credentials.vercelToken })
      const identity = await binding.readDeployment(target, deploymentId, { signal })
      return Object.freeze({ target, ...identity })
    }
    const readWebsiteConsumer = async (identity, { signal, diagnostic }) => {
      const reader = makeProtectedFetch({ fetch: fetcher, bypass: credentials.previewBypass,
        immutableUrl: identity.immutableUrl, maxReads: 1 })
      try {
        const response = await reader.fetch(`${identity.immutableUrl}/api/staging/consumer-readiness`, {
          method: 'GET', redirect: 'error', headers: { 'x-tll-deployment-id': identity.deploymentId }, signal })
        diagnostic?.verified('website_request', response.status)
        diagnostic?.pending('website_response_validation')
        if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) unavailable()
        return response.json()
      } finally { reader.dispose() }
    }
    const consumerProof = makeConsumerProof({ journal: journals.consumerPreview,
      diagnostic: journals.consumerDiagnostic,
      runBuild: runPreviewBuild, readDeployment: readConsumerDeployment,
      readWebsite: readWebsiteConsumer,
      readEdge: input => database.components.readBrokerConsumer(input) })
    surface = makeSurface({ credentials: Object.freeze({ vercelToken: credentials.vercelToken, previewBypass: credentials.previewBypass }),
      fetch: fetcher, runCli, execute, preflight,
      preview: Object.freeze({ enabledJournal: journals.previewEnabled, heldJournal: journals.previewHeld, runBuild: runPreviewBuild }),
      journals: Object.freeze({ enableSurface: journals.enableSurface, freezeSurface: journals.freezeSurface,
        checkoutEnable: journals.checkoutEnable, checkoutFreeze: journals.checkoutFreeze }),
      checkoutTarget: checkout, readVariantPrice: input => variant.read(input), now })
    if (!surface?.ports || typeof surface.dispose !== 'function') unavailable()

    const ports = Object.freeze({
      readBaseline: async input => {
        const baseline = await hosted.ports.readBaseline(input)
        if (baseline?.status !== 'BASELINE_HELD_VERIFIED') unavailable()
        const broker = await database.components.readBrokerHeld(input)
        if (broker?.status !== 'HELD') unavailable()
        return baseline
      },
      replaceSettings: input => hosted.ports.replaceSettings(input),
      readSettings: async input => {
        const result = await hosted.ports.readSettings(input)
        if (result?.status !== 'SETTINGS_METADATA_VERIFIED') unavailable()
        // The deployed broker must recognise this exact window before any
        // temporary database login is installed. This audit does no DB I/O.
        const guard = await database.components.readBrokerWindowActive(input)
        if (guard?.status !== 'ACTIVE_GUARDS') unavailable()
        return result
      },
      setupDatabase: async ({ signal, phaseDeadlineAt }) => {
        const material = hosted.getDatabaseMaterial()
        return database.components.databaseSetup.run({ expiresAt, deadlineAt: phaseDeadlineAt, verifiers: material.verifiers, signal })
      },
      proveRestrictedConnections: async ({ signal, phaseDeadlineAt }) => {
        const material = hosted.getDatabaseMaterial()
        // The whole window can last an hour, but this credential probe is
        // deliberately limited to 140 seconds. Never pass the hour-long
        // deadline through to its narrower guard.
        const deadlineAt = new Date(Math.min(Date.parse(phaseDeadlineAt),
          now() + STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_MAX_MS - 1000)).toISOString()
        return database.components.restrictedConnections.prove({ expiresAt, deadlineAt, passwords: material.passwords, signal })
      },
      proveConsumers: ({ signal }) => consumerProof.prove({ sourceCommit: preflight.requirements.sourceCommit,
        manifestSha256: preflight.requirements.manifestSha256, signal }),
      enableProvider: async ({ signal, phaseDeadlineAt }) => {
        // The protected consumer proof can leave idle Supavisor sessions behind.
        // Wait read-only before claiming the provider's one-use write journal.
        const drained = await waitForProviderDrain({
          readState: ({ signal: child }) => database.components.readBackendState({ expiresAt, signal: child }),
          signal, deadlineAt: phaseDeadlineAt, now,
        })
        if (!drained) return Object.freeze({ status: 'SESSION_DRAIN_HOLD' })
        return runProviderBeforeShutdownReserve({ signal, deadlineAt: phaseDeadlineAt, now,
          run: ({ signal: child }) => database.components.providerEnable({ expiresAt, signal: child,
            latestDispatchAt: new Date(Date.parse(phaseDeadlineAt) - 17 * 60_000).toISOString() }),
        })
      },
      enableDatabase: ({ signal, phaseDeadlineAt }) => database.components.controlsEnable.run({ expiresAt, deadlineAt: phaseDeadlineAt, signal }),
      enableSurface: input => surface.ports.enableSurface(input),
      runOwnerJourney: input => surface.ports.runOwnerJourney(input),
      disableDatabase: ({ signal, phaseDeadlineAt }) => database.components.controlsDisable.run({ expiresAt, deadlineAt: phaseDeadlineAt, signal }),
      disableProvider: ({ signal }) => database.components.providerDisable({ expiresAt, signal }),
      freezeSurface: input => surface.ports.freezeSurface(input),
      retireDatabase: async ({ signal, phaseDeadlineAt }) => {
        // A completed browser journey can leave a pooled database session for
        // a short time. Prove zero sessions before claiming the one-use write.
        const drained = await waitForRetirementDrain({
          readState: () => database.components.readBackendState({ expiresAt, signal }),
          signal, deadlineAt: phaseDeadlineAt, now,
        })
        if (!drained) return Object.freeze({ status: 'SESSION_DRAIN_HOLD' })
        const retired = await database.components.databaseRetire.run({ expiresAt, deadlineAt: phaseDeadlineAt, signal })
        if (retired?.status !== 'RETIREMENT_VERIFIED') return retired
        const gate = await gateRetire.retire({ signal })
        if (gate?.status !== 'BROKER_GATE_RETIRED_VERIFIED') unavailable()
        return retired
      },
      async readFinal({ signal }) {
        const result = await database.components.readRetiredState({ signal })
        // This is a distinct Gen23 post-retirement query. It checks the
        // Generation 23 marker and exact window rather than replaying the
        // earlier Gen22-predecessor observer.
        if (result?.status !== 'PASS_FINAL_RETIRED') unavailable()
        const provider = await hosted.ports.readFinalProvider({ signal })
        if (provider?.status !== 'FINAL_PROVIDER_DISABLED_VERIFIED') unavailable()
        const broker = await database.components.readBrokerHeld({ signal })
        if (broker?.status !== 'HELD') unavailable()
        const heldSurface = await surface.ports.readFinalSurface({ signal })
        if (heldSurface?.status !== 'FINAL_SURFACES_HELD_VERIFIED') unavailable()
        return Object.freeze({ status: 'FINAL_HELD_VERIFIED' })
      },
    })
    const needed = ['readBaseline', 'replaceSettings', 'readSettings', 'setupDatabase', 'proveRestrictedConnections', 'proveConsumers',
      'enableProvider', 'enableDatabase', 'enableSurface', 'runOwnerJourney', 'disableDatabase', 'disableProvider',
      'freezeSurface', 'retireDatabase', 'readFinal']
    if (needed.some(name => typeof ports[name] !== 'function')) unavailable()
    core = makeAssembly({ adapters: ports, runWhole, now })
    if (!core || typeof core.run !== 'function' || typeof core.dispose !== 'function') unavailable()
    return Object.freeze({
      ports,
      journal: journals.whole,
      core: Object.freeze({ run: ({ signal } = {}) => {
        if (disposed || !signalOk(signal)) unavailable()
        return core.run({ signal, windowExpiresAt: expiresAt, journal: journals.whole })
      } }),
      dispose,
    })
  } catch {
    dispose()
    unavailable()
  }
}
