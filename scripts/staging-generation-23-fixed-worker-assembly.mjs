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
import { createStagingBoundedExecutor } from './staging-bounded-executor.mjs'
import { runStagingPreviewDeploymentWorker } from './staging-surface-preview-deployment-worker.mjs'
import { STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_MAX_MS } from './staging-generation-23-restricted-connections.mjs'

export const STAGING_GENERATION_23_FIXED_WORKER_ASSEMBLY_ENABLED = false

const unavailable = () => { throw Error('Generation 23 fixed worker assembly unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const signalOk = signal => signal && !signal.aborted && typeof signal.addEventListener === 'function'
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
  const makeExecutor = make('createExecutor', createStagingBoundedExecutor)
  const runWhole = make('runWhole', rehearseStagingGeneration23WholeRun)
  const runPreviewWorker = make('runPreviewWorker', runStagingPreviewDeploymentWorker)
  if ([makeHosted, makeDatabase, makeSurface, makeAssembly, makeWholeJournal, makeSettingsJournal,
    makeCheckoutJournal, makePreviewJournal, makeSurfaceJournal, makeVariantReader, makeExecutor, runWhole]
    .concat(runPreviewWorker).some(item => typeof item !== 'function')) unavailable()

  // These are deliberately separate durable records. The enable and freeze
  // operations, as well as the enabled and held Preview builds, must never be
  // able to consume one another's record.
  const journals = Object.freeze({
    whole: requireJournal(makeWholeJournal(), ['claim', 'dispatch', 'verify', 'ownerFailure', 'skipOwner', 'hold', 'holdBeforeDispatch', 'read']),
    settings: requireJournal(makeSettingsJournal(), ['claim', 'dispatch', 'confirm', 'hold', 'read']),
    enableSurface: requireJournal(makeSurfaceJournal({ path: `${import.meta.dirname}/../../implementation-state/staging/tll-generation-23-surface-enable-v2.json` }), ['read', 'recordIntent', 'transition']),
    freezeSurface: requireJournal(makeSurfaceJournal({ path: `${import.meta.dirname}/../../implementation-state/staging/tll-generation-23-surface-freeze-v2.json` }), ['read', 'recordIntent', 'transition']),
    checkoutEnable: requireJournal(makeCheckoutJournal({ action: 'ENABLE' }), ['read', 'recordIntent', 'transition']),
    checkoutFreeze: requireJournal(makeCheckoutJournal({ action: 'FREEZE' }), ['read', 'recordIntent', 'transition']),
    previewEnabled: requireJournal(makePreviewJournal({ path: `${import.meta.dirname}/../../implementation-state/staging/tll-generation-23-preview-enabled-v2.json` }), ['read', 'claim']),
    previewHeld: requireJournal(makePreviewJournal({ path: `${import.meta.dirname}/../../implementation-state/staging/tll-generation-23-preview-held-v2.json` }), ['read', 'claim']),
  })
  if (journals.previewEnabled === journals.previewHeld || journals.enableSurface === journals.freezeSurface) unavailable()

  let hosted, database, surface, variant, core, disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    try { core?.dispose?.() } finally {
      try { surface?.dispose?.() } finally {
        try { variant?.dispose?.() } finally {
          try { database?.dispose?.() } finally { hosted?.dispose?.() }
        }
      }
    }
  }
  try {
    const expectedDeployment = Object.freeze({ deploymentId: preflight.heldEvidence.deploymentId,
      immutableUrl: preflight.heldEvidence.immutableUrl, gitSourceCommit: preflight.heldEvidence.sourceCommit })
    hosted = makeHosted({ credentials, fetch: fetcher, expiresAt, expectedDeployment, settingsJournal: journals.settings })
    database = makeDatabase({ credentials, fetch: fetcher })
    variant = makeVariantReader({ fetch: fetcher, bypass: credentials.previewBypass,
      deploymentId: preflight.heldEvidence.deploymentId, immutableUrl: preflight.heldEvidence.immutableUrl })
    const execute = makeExecutor()
    if (!hosted?.ports || typeof hosted.getDatabaseMaterial !== 'function' || typeof hosted.dispose !== 'function'
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
    surface = makeSurface({ credentials: Object.freeze({ vercelToken: credentials.vercelToken, previewBypass: credentials.previewBypass }),
      fetch: fetcher, runCli, execute, preflight,
      preview: Object.freeze({ enabledJournal: journals.previewEnabled, heldJournal: journals.previewHeld, runBuild: runPreviewBuild }),
      journals: Object.freeze({ enableSurface: journals.enableSurface, freezeSurface: journals.freezeSurface,
        checkoutEnable: journals.checkoutEnable, checkoutFreeze: journals.checkoutFreeze }),
      checkoutTarget: checkout, readVariantPrice: input => variant.read(input), now })
    if (!surface?.ports || typeof surface.dispose !== 'function') unavailable()

    const ports = Object.freeze({
      readBaseline: input => hosted.ports.readBaseline(input),
      replaceSettings: input => hosted.ports.replaceSettings(input),
      readSettings: input => hosted.ports.readSettings(input),
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
      enableProvider: ({ signal }) => database.components.providerEnable({ expiresAt, signal }),
      enableDatabase: ({ signal, phaseDeadlineAt }) => database.components.controlsEnable.run({ expiresAt, deadlineAt: phaseDeadlineAt, signal }),
      enableSurface: input => surface.ports.enableSurface(input),
      runOwnerJourney: input => surface.ports.runOwnerJourney(input),
      disableDatabase: ({ signal, phaseDeadlineAt }) => database.components.controlsDisable.run({ expiresAt, deadlineAt: phaseDeadlineAt, signal }),
      disableProvider: ({ signal }) => database.components.providerDisable({ expiresAt, signal }),
      freezeSurface: input => surface.ports.freezeSurface(input),
      retireDatabase: ({ signal, phaseDeadlineAt }) => database.components.databaseRetire.run({ expiresAt, deadlineAt: phaseDeadlineAt, signal }),
      async readFinal({ signal }) {
        const result = await database.components.readRetiredState({ signal })
        // This is a distinct Gen23 post-retirement query. It checks the
        // Generation 23 marker and exact window rather than replaying the
        // earlier Gen22-predecessor observer.
        if (result?.status !== 'PASS_FINAL_RETIRED') unavailable()
        const provider = await hosted.ports.readFinalProvider({ signal })
        if (provider?.status !== 'FINAL_PROVIDER_DISABLED_VERIFIED') unavailable()
        const heldSurface = await surface.ports.readFinalSurface({ signal })
        if (heldSurface?.status !== 'FINAL_SURFACES_HELD_VERIFIED') unavailable()
        return Object.freeze({ status: 'FINAL_HELD_VERIFIED' })
      },
    })
    const needed = ['readBaseline', 'replaceSettings', 'readSettings', 'setupDatabase', 'proveRestrictedConnections',
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
