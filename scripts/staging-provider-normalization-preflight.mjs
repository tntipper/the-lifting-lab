/** Injected-only, read-only staging evidence for provider normalization. */
import { STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME } from './staging-provider-broker-rotation.mjs'
import { HOSTED_BASELINE_VERCEL_TARGET } from './staging-account-hosted-baseline-vercel.mjs'
import { STAGING_SURFACE_TARGET } from './staging-surface-activation-transport.mjs'
import { STAGING_EDGE_FUNCTION } from './staging-surface-activation-native-adapter.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from './staging-account-hosted-baseline-database.mjs'

export const STAGING_PROVIDER_NORMALIZATION_PREFLIGHT_ENABLED = false
export const STAGING_PROVIDER_NORMALIZATION_PREVIEW = Object.freeze({
  deploymentId: 'dpl_9CFPQG6JChoGrkWidhh73BY1Qj1b',
  immutableUrl: 'https://the-lifting-7kom7bvbo-my-lifting-lab-s-projects.vercel.app',
  gitSourceCommit: 'abd5a5258dd1072daf83a4447ce7110465f445e1',
})
const unavailable = () => { throw new Error('Staging provider normalization preflight unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const targetMatches = (actual, expected) => typeof expected === 'string' ? actual === expected
  : exact(actual, Object.keys(expected)) && Object.entries(expected).every(([key, value]) => actual[key] === value)
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const validSignal = signal => signal && typeof signal.aborted === 'boolean'
  && typeof signal.addEventListener === 'function' && signal.aborted === false

function validateDatabase(value) {
  if (!exact(value, ['status', 'target', 'queryId', 'receiptHash', 'counts']) || value.status !== 'PASS'
    || value.target !== STAGING_PROVIDER_TARGET.projectRef
    || value.queryId !== STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID || !sha(value.receiptHash)
    || !exact(value.counts, ['migrations', 'controlsEnabled', 'runtimeRoles', 'runtimeSessions', 'executionEdges', 'operatorEdges'])
    || value.counts.migrations !== 15 || value.counts.controlsEnabled !== 0 || value.counts.runtimeRoles !== 5
    || value.counts.runtimeSessions !== 0 || value.counts.executionEdges !== 0 || value.counts.operatorEdges !== 5) unavailable()
}

function validateSecrets(supabaseNames, vercelPresence) {
  if (!Array.isArray(supabaseNames) || supabaseNames.some(name => typeof name !== 'string' || !/^[A-Z][A-Z0-9_]{0,255}$/.test(name))
    || supabaseNames.includes(BROKER_SECRET_NAME)
    || !exact(vercelPresence, ['target', 'environment', 'branch', 'brokerSecretPresent'])
    || !targetMatches(vercelPresence.target, HOSTED_BASELINE_VERCEL_TARGET)
    || vercelPresence.environment !== 'preview' || vercelPresence.branch !== STAGING_PROVIDER_TARGET.branch
    || vercelPresence.brokerSecretPresent !== false) unavailable()
}

function validateSurface(value, project) {
  if (!exact(value, ['surface', 'deployment']) || !exact(value.surface, ['edge', 'flags'])
    || !exact(value.surface.edge, ['target', 'functionName', 'enabled'])
    || !targetMatches(value.surface.edge.target, STAGING_SURFACE_TARGET)
    || value.surface.edge.functionName !== STAGING_EDGE_FUNCTION || value.surface.edge.enabled !== false
    || !exact(value.surface.flags, ['target', 'privateCustomer', 'privateCart', 'publicCustomer', 'publicCart'])
    || !targetMatches(value.surface.flags.target, STAGING_SURFACE_TARGET)
    || ['privateCustomer', 'privateCart', 'publicCustomer', 'publicCart'].some(key => value.surface.flags[key] !== false)
    || !project || !exact(project, ['target', 'repository']) || !targetMatches(project.target, HOSTED_BASELINE_VERCEL_TARGET)
    || !project.repository || project.repository.provider !== 'github'
    || project.repository.org !== HOSTED_BASELINE_VERCEL_TARGET.githubOrg
    || project.repository.repo !== HOSTED_BASELINE_VERCEL_TARGET.githubRepository
    || !Number.isSafeInteger(project.repository.repoId) || project.repository.repoId <= 0
    || !value.deployment || value.deployment.projectId !== HOSTED_BASELINE_VERCEL_TARGET.projectId
    || value.deployment.teamId !== HOSTED_BASELINE_VERCEL_TARGET.teamId
    || value.deployment.alias !== STAGING_SURFACE_TARGET.alias
    || value.deployment.project !== STAGING_PROVIDER_TARGET.vercelProject
    || value.deployment.scope !== STAGING_PROVIDER_TARGET.vercelScope
    || value.deployment.branch !== STAGING_PROVIDER_TARGET.branch
    || value.deployment.gitProvider !== 'github'
    || value.deployment.repositoryId !== String(project.repository.repoId)) unavailable()
  if (['deploymentId', 'immutableUrl', 'gitSourceCommit'].some(key =>
    value.deployment[key] !== STAGING_PROVIDER_NORMALIZATION_PREVIEW[key])) unavailable()
}

function validateBinding(binding, target, methods) {
  if (!binding || target !== undefined && !targetMatches(binding.target, target)
    || methods.some(name => typeof binding[name] !== 'function') || typeof binding.dispose !== 'function') unavailable()
}

function disposeAll(...bindings) {
  let failed = false
  for (const binding of bindings) {
    if (!binding) continue
    try { binding.dispose() } catch { failed = true }
  }
  if (failed) unavailable()
}

/** The live launcher must inject fresh, fixed-target read bindings and a deadline signal. */
export function createStagingProviderNormalizationPreflight({ openSupabase, openVercel, openSurface, signal, now = Date.now } = {}) {
  if ([openSupabase, openVercel, openSurface, now].some(value => typeof value !== 'function') || !validSignal(signal)) unavailable()
  return Object.freeze({
    async preflight(target) {
      if (!targetMatches(target, STAGING_PROVIDER_TARGET) || !validSignal(signal)) unavailable()
      const started = now()
      if (!Number.isFinite(started)) unavailable()
      let supabase, vercel, surface
      try {
        supabase = openSupabase(); vercel = openVercel(); surface = openSurface()
        validateBinding(supabase, STAGING_PROVIDER_TARGET.projectRef, ['readDatabase', 'readEdgeSecretNames'])
        // The fixed Vercel binding carries its target in each validated receipt,
        // not on the binding object itself.
        validateBinding(vercel, undefined, ['readProject', 'readPreviewEnvironmentPresence'])
        validateBinding(surface, undefined, ['readBaseline'])
        const input = Object.freeze({ signal })
        const database = await supabase.readDatabase(input)
        validateDatabase(database)
        const supabaseNames = await supabase.readEdgeSecretNames(input)
        const project = await vercel.readProject(input)
        const vercelPresence = await vercel.readPreviewEnvironmentPresence(input)
        validateSecrets(supabaseNames, vercelPresence)
        const observedSurface = await surface.readBaseline(input)
        validateSurface(observedSurface, project)
        const finished = now()
        if (!Number.isFinite(finished) || finished < started || finished - started > 30_000 || signal.aborted) unavailable()
        return Object.freeze({ target: STAGING_PROVIDER_TARGET, observedAt: new Date(started).toISOString(),
          controls: Object.freeze({ customer: false, cart: false, broker: false, provisional: false, bridge: false }),
          runtimeSessions: 0, edgeEnabled: false, privateEnabled: false, publicEnabled: false,
          supabaseBrokerSecretNames: Object.freeze([]), vercelBrokerSecretNames: Object.freeze([]) })
      } catch { unavailable() } finally { disposeAll(supabase, vercel, surface) }
    },
    async readProvider(target) {
      if (!targetMatches(target, STAGING_PROVIDER_TARGET) || !validSignal(signal)) unavailable()
      let supabase
      try {
        supabase = openSupabase()
        validateBinding(supabase, STAGING_PROVIDER_TARGET.projectRef, ['readProvider'])
        return await supabase.readProvider(Object.freeze({ signal }))
      } catch { unavailable() } finally { disposeAll(supabase) }
    },
  })
}
