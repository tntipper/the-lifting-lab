/** Disabled, fixed-project Auth Admin port for Gen23 provider enable/disable. */
import { createOfficialStagingProviderClient } from './staging-provider-broker-native-binding.mjs'
import { projectOfficialProviderSchema, STAGING_AUTH_URL } from './staging-provider-broker-native-adapter.mjs'
import { PROVIDER_IDENTIFIER, STAGING_PROJECT_REF, STAGING_PROVIDER_TARGET } from './staging-provider-broker-rotation.mjs'

export const STAGING_GENERATION_23_PROVIDER_PORT_ENABLED = false
const unavailable = () => { throw Error('Generation 23 provider port unavailable') }
const sameTarget = target => target && typeof target === 'object' && !Array.isArray(target)
  && Object.keys(target).sort().join('|') === Object.keys(STAGING_PROVIDER_TARGET).sort().join('|')
  && Object.entries(STAGING_PROVIDER_TARGET).every(([key, value]) => target[key] === value)
const validSignal = signal => signal && typeof signal.aborted === 'boolean'
  && !signal.aborted && typeof signal.addEventListener === 'function'

/** The caller transfers ownership of the staging service-key buffer. */
export function createStagingGeneration23ProviderPort({ projectSecret, fetcher,
  readBackendState } = {}) {
  if (!STAGING_GENERATION_23_PROVIDER_PORT_ENABLED || !Buffer.isBuffer(projectSecret)
    || projectSecret.length < 8 || projectSecret.length > 24_576 || projectSecret.includes(0)
    || typeof fetcher !== 'function' || typeof readBackendState !== 'function') unavailable()
  const secret = Buffer.from(projectSecret)
  projectSecret.fill(0)
  let disposed = false
  const requireLive = (target, signal) => {
    if (disposed || !sameTarget(target) || !validSignal(signal)) unavailable()
  }
  const client = signal => {
    const material = Buffer.from(secret)
    try { return createOfficialStagingProviderClient({ target: STAGING_PROVIDER_TARGET,
      authUrl: STAGING_AUTH_URL, projectSecret: material, signal, fetcher }) }
    finally { material.fill(0) }
  }
  const rawProvider = async signal => {
    const response = await client(signal).auth.admin.customProviders.getProvider(PROVIDER_IDENTIFIER)
    if (response?.error !== null || !response?.data || signal.aborted) unavailable()
    projectOfficialProviderSchema(response.data)
    return response.data
  }
  return Object.freeze({
    async readBackendState(target, { signal } = {}) {
      requireLive(target, signal)
      const result = await readBackendState(STAGING_PROVIDER_TARGET, { signal })
      if (signal.aborted || !result || typeof result !== 'object' || Array.isArray(result)
        || Object.keys(result).sort().join('|') !== 'controlsEnabled|projectRef|runtimeSessions'
        || result.projectRef !== STAGING_PROJECT_REF || typeof result.controlsEnabled !== 'boolean'
        || !Number.isSafeInteger(result.runtimeSessions) || result.runtimeSessions < 0) unavailable()
      return Object.freeze({ ...result })
    },
    async readProvider(target, { signal } = {}) {
      requireLive(target, signal)
      return rawProvider(signal)
    },
    async updateProvider(target, identifier, patch, { signal } = {}) {
      requireLive(target, signal)
      if (identifier !== PROVIDER_IDENTIFIER || !patch || typeof patch !== 'object'
        || Array.isArray(patch) || Object.keys(patch).join('|') !== 'enabled'
        || typeof patch.enabled !== 'boolean') unavailable()
      const response = await client(signal).auth.admin.customProviders.updateProvider(PROVIDER_IDENTIFIER,
        { enabled: patch.enabled })
      if (response?.error !== null || !response?.data || signal.aborted) unavailable()
      const projected = projectOfficialProviderSchema(response.data)
      if (projected.identifier !== PROVIDER_IDENTIFIER || projected.enabled !== patch.enabled) unavailable()
      return Object.freeze({ status: 'UPDATED_NEEDS_READBACK', projectRef: STAGING_PROJECT_REF,
        identifier: PROVIDER_IDENTIFIER })
    },
    dispose() { if (!disposed) { disposed = true; secret.fill(0) } },
  })
}
