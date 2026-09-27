/**
 * The first concrete part of the Gen23 hosted adapter factory.
 *
 * It binds the existing fixed-target baseline readers and the six setting
 * replacements.  Later phases must extend this same factory rather than
 * creating a second credential path.  This source is OFF and does no I/O on
 * import; the reviewed arming diff must set its window and enable every
 * underlying guarded module.
 */
import { createStagingAccountHostedBaselineSupabaseBinding } from './staging-account-hosted-baseline-supabase.mjs'
import { createStagingAccountHostedBaselineVercelBinding } from './staging-account-hosted-baseline-vercel.mjs'
import { createStagingAccountHostedBaselineSurfaceBinding } from './staging-account-hosted-baseline-surface.mjs'
import { createStagingGeneration23VercelInventoryReader } from './staging-generation-23-vercel-inventory-reader.mjs'
import { createStagingGeneration23VercelReplacer } from './staging-generation-23-vercel-replacer.mjs'
import { createStagingGeneration23EdgeReplacer } from './staging-generation-23-edge-replacer.mjs'
import { createStagingGeneration23SettingsCoordinator } from './staging-generation-23-settings-coordinator.mjs'
import { createStagingGeneration23SettingsReadback } from './staging-generation-23-settings-readback.mjs'
import { generateStagingGeneration23Passwords, projectStagingGeneration23Passwords,
  deriveStagingGeneration23Verifiers, eraseStagingGeneration23Passwords, EDGE_PASSWORD_NAME } from './staging-generation-23-password-material.mjs'
import { postStagingGeneration23PredecessorCheck } from './staging-generation-23-predecessor-query.mjs'
import { validateStagingGeneration23PredecessorCheck } from './staging-generation-23-predecessor-check.mjs'
import { projectOfficialStagingProvider } from './staging-provider-broker-native-adapter.mjs'
import { BROKER_SECRET_NAME } from './staging-provider-broker-rotation.mjs'
import { HELD_SURFACE_FLAGS, STAGING_BRANCH, STAGING_ALIAS } from './staging-surface-activation-transport.mjs'
import { PASSWORD_PURPOSES } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_23_FIXED_HOSTED_ADAPTERS_ENABLED = false
const unavailable = () => { throw Error('Generation 23 fixed hosted adapters unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const token = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 4096
  && !value.includes(0) && /^[\x21-\x7e]+$/.test(value.toString('utf8'))
const validSignal = value => value && typeof value.aborted === 'boolean'
  && typeof value.addEventListener === 'function' && !value.aborted
const deployment = value => exact(value, ['deploymentId', 'immutableUrl', 'gitSourceCommit'])
  && /^dpl_[A-Za-z0-9]+$/.test(value.deploymentId)
  && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value.immutableUrl)
  && /^[a-f0-9]{40}$/.test(value.gitSourceCommit)

/**
 * Create actual, fixed service adapters for baseline and settings only.
 *
 * `expectedDeployment` is the source-pinned Preview identity from the fresh
 * preflight. It is passed into the existing surface reader, which refuses an
 * alias or immutable deployment change before using the bypass token.
 */
export function createStagingGeneration23FixedHostedAdapters({ credentials, fetch: fetcher,
  expiresAt, expectedDeployment, settingsJournal, factories = {} } = {}) {
  if (!STAGING_GENERATION_23_FIXED_HOSTED_ADAPTERS_ENABLED
    || !exact(credentials, ['managementToken', 'vercelToken', 'previewBypass'])
    || !token(credentials.managementToken) || !token(credentials.vercelToken) || !token(credentials.previewBypass)
    || typeof fetcher !== 'function' || typeof expiresAt !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(expiresAt) || Date.parse(expiresAt) <= Date.now()
    || !deployment(expectedDeployment) || !settingsJournal
    || ['claim', 'dispatch', 'confirm', 'hold', 'read'].some(name => typeof settingsJournal[name] !== 'function')
    || factories === null || typeof factories !== 'object' || Array.isArray(factories)) unavailable()
  const make = (name, fallback) => factories[name] ?? fallback
  const makeSupabase = make('createSupabase', input => createStagingAccountHostedBaselineSupabaseBinding(input))
  const makeVercel = make('createVercel', input => createStagingAccountHostedBaselineVercelBinding(input))
  const makeSurface = make('createSurface', input => createStagingAccountHostedBaselineSurfaceBinding(input))
  const makeInventory = make('createInventory', input => createStagingGeneration23VercelInventoryReader(input))
  const makeReplacer = make('createReplacer', input => createStagingGeneration23VercelReplacer(input))
  const makeEdge = make('createEdge', input => createStagingGeneration23EdgeReplacer(input))
  const makeCoordinator = make('createCoordinator', input => createStagingGeneration23SettingsCoordinator(input))
  const makeReadback = make('createReadback', input => createStagingGeneration23SettingsReadback(input))
  const readPredecessor = make('readPredecessor', async ({ token: managementToken, signal }) => {
    const rows = await postStagingGeneration23PredecessorCheck({ token: managementToken, signal })
    return validateStagingGeneration23PredecessorCheck(rows)
  })
  if ([makeSupabase, makeVercel, makeSurface, makeInventory, makeReplacer,
    makeEdge, makeCoordinator, makeReadback, readPredecessor].some(item => typeof item !== 'function')) unavailable()

  let disposed = false, settingsStarted = false, targets, passwords, verifiers
  const dispose = () => {
    if (disposed) return
    disposed = true
    eraseStagingGeneration23Passwords(passwords)
    passwords = undefined; verifiers = undefined; targets = undefined
  }
  const requireLive = signal => { if (disposed || !validSignal(signal)) unavailable() }
  const withInventory = async operation => {
    const reader = makeInventory({ fetch: fetcher, token: credentials.vercelToken })
    if (!reader || typeof reader.readTargets !== 'function' || typeof reader.dispose !== 'function') unavailable()
    try { return await operation(reader) } finally { reader.dispose() }
  }
  const readEdgeNames = async signal => {
    const binding = makeSupabase({ fetch: fetcher, managementToken: credentials.managementToken })
    if (!binding || typeof binding.readEdgeSecretNames !== 'function' || typeof binding.dispose !== 'function') unavailable()
    try { return await binding.readEdgeSecretNames({ signal }) } finally { binding.dispose() }
  }

  return Object.freeze({
    /** The worker later uses these only for the fixed database setup host. */
    getDatabaseMaterial() {
      if (disposed || !passwords || !verifiers) unavailable()
      // The connection verifier uses the 64-character password text installed
      // in Vercel/Edge and represented by these SCRAM verifiers, not the
      // 48-byte random buffers from which that text was derived.
      return Object.freeze({ passwords: Object.freeze(Object.fromEntries(PASSWORD_PURPOSES.map(purpose =>
        [purpose, passwords[purpose].toString('base64url')]))), verifiers })
    },
    ports: Object.freeze({
      async readBaseline({ signal } = {}) {
        requireLive(signal)
        // Gen23 has a different safe starting point to the legacy observer:
        // the Gen22 logins are retired, the disabled broker remains configured,
        // and its client secret is deliberately retained in both hosts.  The
        // older observer treats that retained secret as a HOLD, so calling it
        // here would make a correct Gen23 environment fail.  This explicit
        // observer preserves every real service observation but gives the
        // retained secret its intended Generation 23 meaning.
        const predecessor = await readPredecessor({ token: credentials.managementToken, signal })
        if (!predecessor || predecessor.status !== 'PASS_RETIRED'
          || typeof predecessor.receiptSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(predecessor.receiptSha256)) unavailable()
        const supabase = makeSupabase({ fetch: fetcher, managementToken: credentials.managementToken })
        const vercel = makeVercel({ fetch: fetcher, vercelToken: credentials.vercelToken })
        const surface = makeSurface({ fetch: fetcher, vercelToken: credentials.vercelToken,
          protectionBypassToken: credentials.previewBypass, expectedDeployment })
        if (!supabase || !vercel || !surface
          || ['readProvider', 'readEdgeSecretNames', 'dispose'].some(name => typeof supabase[name] !== 'function')
          || ['readProject', 'readPreviewEnvironmentPresence', 'dispose'].some(name => typeof vercel[name] !== 'function')
          || typeof surface.readBaseline !== 'function' || typeof surface.dispose !== 'function') unavailable()
        try {
          // Await each independent read before starting the next. A rejected
          // Promise.all previously left sibling requests running while the
          // one-use baseline was already being reported as unavailable.
          const edgeNames = await supabase.readEdgeSecretNames({ signal })
          const rawProvider = await supabase.readProvider({ signal })
          const project = await vercel.readProject({ signal })
          const previewPresence = await vercel.readPreviewEnvironmentPresence({ signal })
          const observedSurface = await surface.readBaseline({ signal })
          // This exact projector validates the disabled provider's identifier,
          // endpoints, PKCE, scopes and retained JWKS address. It is a real
          // read of Supabase's official provider response, never a guessed copy.
          projectOfficialStagingProvider(rawProvider)
          // Gen22 retirement disabled the database login but deliberately
          // retained this Edge setting. Gen23 replaces its value in the
          // supervised window, so its single existing name is the baseline.
          if (!Array.isArray(edgeNames) || edgeNames.filter(name => name === BROKER_SECRET_NAME).length !== 1
            || edgeNames.filter(name => name === EDGE_PASSWORD_NAME).length !== 1) unavailable()
          if (!previewPresence || previewPresence.environment !== 'preview' || previewPresence.branch !== STAGING_BRANCH
            || previewPresence.brokerSecretPresent !== true) unavailable()
          // Vercel can report a Git-linked project as `sourceless: true`.
          // The Git repository ID and the deployment/source proof, not this
          // project flag, establish which code the protected Preview runs.
          if (!project?.repository || project.repository.provider !== 'github' || project.repository.repo !== 'the-lifting-lab'
            || project.repository.org !== 'tntipper' || project.repository.repoId !== 1264363509
            || typeof project.repository.sourceless !== 'boolean') unavailable()
          const flags = observedSurface?.surface?.flags, edge = observedSurface?.surface?.edge, identity = observedSurface?.deployment
          if (!flags || !edge || edge.enabled !== false
            || Object.keys(HELD_SURFACE_FLAGS).filter(key => key !== 'edge')
              .some(key => flags[key] !== HELD_SURFACE_FLAGS[key])
            || !identity || identity.branch !== STAGING_BRANCH || identity.alias !== STAGING_ALIAS
            || ['deploymentId', 'immutableUrl', 'gitSourceCommit'].some(key => identity[key] !== expectedDeployment[key])) unavailable()
          return Object.freeze({ status: 'BASELINE_HELD_VERIFIED' })
        } catch { throw Error('Generation 23 fixed hosted adapters unavailable') }
        finally { try { supabase.dispose() } finally { try { vercel.dispose() } finally { surface.dispose() } } }
      },
      async replaceSettings({ signal } = {}) {
        requireLive(signal)
        if (settingsStarted || settingsJournal.read() !== null) unavailable()
        settingsStarted = true
        passwords = generateStagingGeneration23Passwords()
        let projection
        try {
          projection = projectStagingGeneration23Passwords(passwords)
          verifiers = deriveStagingGeneration23Verifiers(projection)
          targets = await withInventory(reader => reader.readTargets({ signal }))
          const edgeHost = makeEdge({ fetch: fetcher, token: credentials.managementToken, expiresAt })
          const coordinator = makeCoordinator({ journal: settingsJournal,
            makeReplacer: () => makeReplacer({ fetch: fetcher, token: credentials.vercelToken }), edgeHost })
          if (!coordinator || typeof coordinator.run !== 'function') unavailable()
          const result = await coordinator.run({ targets, projection, expiresAt, signal })
          projection = undefined // coordinator has already cleared its owned copy
          if (!result || result.status !== 'SETTINGS_REPLACED_UNVERIFIED') unavailable()
          return Object.freeze({ status: 'SETTINGS_METADATA_VERIFIED' })
        } catch {
          eraseStagingGeneration23Passwords(passwords); passwords = undefined; verifiers = undefined; targets = undefined
          throw Error('Generation 23 fixed hosted adapters unavailable')
        }
      },
      async readSettings({ signal } = {}) {
        requireLive(signal)
        if (!settingsStarted || !targets || settingsJournal.read()?.state !== 'FINISHED') unavailable()
        const readback = makeReadback({
          readVercelTargets: ({ signal: child }) => withInventory(reader => reader.readTargets({ signal: child })),
          readEdgeNames: ({ signal: child }) => readEdgeNames(child),
        })
        if (!readback || typeof readback.prove !== 'function') unavailable()
        const result = await readback.prove({ expectedTargets: targets, signal })
        if (!result || result.status !== 'SETTINGS_METADATA_VERIFIED') unavailable()
        return Object.freeze({ status: 'SETTINGS_METADATA_VERIFIED' })
      },
      async readFinalProvider({ signal } = {}) {
        requireLive(signal)
        const binding = makeSupabase({ fetch: fetcher, managementToken: credentials.managementToken })
        if (!binding || typeof binding.readProvider !== 'function'
          || typeof binding.readEdgeSecretNames !== 'function'
          || typeof binding.dispose !== 'function') unavailable()
        try {
          const [provider, names] = await Promise.all([
            binding.readProvider({ signal }), binding.readEdgeSecretNames({ signal }),
          ])
          projectOfficialStagingProvider(provider)
          if (!Array.isArray(names) || names.filter(name => name === BROKER_SECRET_NAME).length !== 1
            || names.filter(name => name === EDGE_PASSWORD_NAME).length !== 1) unavailable()
          return Object.freeze({ status: 'FINAL_PROVIDER_DISABLED_VERIFIED' })
        } finally { binding.dispose() }
      },
    }),
    dispose,
  })
}
