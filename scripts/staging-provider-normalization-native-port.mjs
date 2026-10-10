/** Injected-only Admin API port. A future journaled launcher must own invocation. */
import { PROVIDER_IDENTIFIER, STAGING_PROVIDER_TARGET } from './staging-provider-broker-rotation.mjs'
import { projectOfficialProviderSchema, STAGING_AUTH_URL } from './staging-provider-broker-native-adapter.mjs'
import { createOfficialStagingProviderClient } from './staging-provider-broker-native-binding.mjs'
import { buildStagingProviderNormalizationPatch, verifyStagingProviderNormalization } from './staging-provider-normalization-contract.mjs'

export const NATIVE_STAGING_PROVIDER_NORMALIZATION_ENABLED = false
const unavailable = () => { throw new Error('Staging provider normalization native port unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function validateTarget(value) {
  if (!exact(value, Object.keys(STAGING_PROVIDER_TARGET))) unavailable()
  for (const [key, expected] of Object.entries(STAGING_PROVIDER_TARGET)) if (value[key] !== expected) unavailable()
}

function providerData(result) {
  if (!exact(result, ['data', 'error']) || result.error !== null || !result.data
    || typeof result.data !== 'object' || Array.isArray(result.data)) unavailable()
  projectOfficialProviderSchema(result.data)
  return result.data
}

export function createStagingProviderNormalizationNativePort({ projectSecret, execute, fetcher } = {}) {
  if (!Buffer.isBuffer(projectSecret) || projectSecret.length < 1 || projectSecret.length > 24_576
    || typeof execute !== 'function' || typeof fetcher !== 'function') unavailable()
  let updateAttempted = false

  async function bounded(operation) {
    try {
      const result = await execute(async signal => {
        if (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || signal.aborted) unavailable()
        const client = createOfficialStagingProviderClient({ target: STAGING_PROVIDER_TARGET,
          authUrl: STAGING_AUTH_URL, projectSecret, signal, fetcher })
        return operation(client.auth.admin.customProviders)
      })
      if (!exact(result, ['status', 'value']) || result.status !== 'COMPLETED') unavailable()
      return result.value
    } catch { unavailable() }
  }

  return Object.freeze({
    readProvider: async target => {
      validateTarget(target)
      return bounded(async providers => providerData(await providers.getProvider(PROVIDER_IDENTIFIER)))
    },
    updateProvider: async (target, before) => {
      validateTarget(target)
      let patch
      try { patch = buildStagingProviderNormalizationPatch(before) } catch { unavailable() }
      if (updateAttempted) unavailable()
      updateAttempted = true
      await bounded(async providers => {
        const updated = providerData(await providers.updateProvider(PROVIDER_IDENTIFIER, patch))
        verifyStagingProviderNormalization(before, updated)
        return null
      })
      return Object.freeze({ status: 'UPDATED_NEEDS_INDEPENDENT_READBACK',
        target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER })
    },
  })
}
