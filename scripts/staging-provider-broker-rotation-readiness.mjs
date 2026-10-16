/** Adapt the existing read-only staging checks to the rotation's frozen receipt. */
import {
  PROVIDER_IDENTIFIER, RETAINED_STAGING_JWKS_URI, STAGING_PROVIDER_TARGET,
} from './staging-provider-broker-rotation.mjs'
import { projectOfficialProviderSchema } from './staging-provider-broker-native-adapter.mjs'

const unavailable = () => { throw new Error('Staging provider broker rotation readiness unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const targetMatches = value => exact(value, Object.keys(STAGING_PROVIDER_TARGET))
  && Object.entries(STAGING_PROVIDER_TARGET).every(([key, expected]) => value[key] === expected)
async function readBeforeAbort(operation, signal) {
  if (signal.aborted) unavailable()
  let onAbort
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new Error('aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try { return await Promise.race([Promise.resolve().then(operation), aborted]) }
  finally { signal.removeEventListener('abort', onAbort) }
}

/** All read ports and the deadline clock are injected; this module has no credential or network access. */
export function createStagingProviderBrokerRotationReadiness({ openPreflight, now = Date.now } = {}) {
  if (typeof openPreflight !== 'function' || typeof now !== 'function') unavailable()
  return async (target, { signal } = {}) => {
    if (!targetMatches(target) || !signal || typeof signal.aborted !== 'boolean'
      || typeof signal.addEventListener !== 'function' || signal.aborted) unavailable()
    try {
      const preflight = openPreflight(signal)
      if (!preflight || typeof preflight.preflight !== 'function' || typeof preflight.readProvider !== 'function') unavailable()
      const started = now()
      if (!Number.isFinite(started)) unavailable()
      const observed = await readBeforeAbort(() => preflight.preflight(STAGING_PROVIDER_TARGET), signal)
      if (!exact(observed, ['target', 'observedAt', 'controls', 'runtimeSessions', 'edgeEnabled', 'privateEnabled',
        'publicEnabled', 'supabaseBrokerSecretNames', 'vercelBrokerSecretNames']) || !targetMatches(observed.target)
        || !exact(observed.controls, ['customer', 'cart', 'broker', 'provisional', 'bridge'])
        || Object.values(observed.controls).some(value => value !== false)
        || observed.runtimeSessions !== 0 || observed.edgeEnabled !== false || observed.privateEnabled !== false
        || observed.publicEnabled !== false || !Array.isArray(observed.supabaseBrokerSecretNames)
        || observed.supabaseBrokerSecretNames.length !== 0 || !Array.isArray(observed.vercelBrokerSecretNames)
        || observed.vercelBrokerSecretNames.length !== 0) unavailable()
      const observedAt = Date.parse(observed.observedAt)
      if (!Number.isFinite(observedAt) || observedAt < started || observedAt > now()) unavailable()
      const beforeProvider = now()
      if (!Number.isFinite(beforeProvider) || beforeProvider < started || beforeProvider - started > 30_000 || signal.aborted) unavailable()
      const provider = projectOfficialProviderSchema(await readBeforeAbort(() => preflight.readProvider(STAGING_PROVIDER_TARGET), signal))
      // The read port returns the official API shape; validate and project it here.
      // Full provider settings are checked again by the rotation core before material is made.
      if (!provider || provider.identifier !== PROVIDER_IDENTIFIER || provider.enabled !== false
        || provider.jwksUrl !== RETAINED_STAGING_JWKS_URI) unavailable()
      const finished = now()
      if (!Number.isFinite(finished) || finished < started || finished - started > 30_000 || signal.aborted) unavailable()
      return Object.freeze({ target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER,
        providerEnabled: false, edgeEnabled: false, privateEnabled: false, publicEnabled: false,
        supabase: Object.freeze([]), vercel: Object.freeze([]) })
    } catch { unavailable() }
  }
}
