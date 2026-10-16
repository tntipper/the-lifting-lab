/** Disabled composition of existing read-only staging bindings; no credential discovery or launcher. */
import { createStagingAccountHostedBaselineSupabaseBinding } from './staging-account-hosted-baseline-supabase.mjs'
import { createStagingAccountHostedBaselineVercelBinding } from './staging-account-hosted-baseline-vercel.mjs'
import { createStagingAccountHostedBaselineSurfaceBinding } from './staging-account-hosted-baseline-surface.mjs'
import { BROKER_SECRET_NAME, STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'
import { PREVIEW_READINESS_TARGET } from './staging-provider-preview-readiness-session.mjs'
import { BROKER_RECOVERY_EXPECTED_SOURCE } from './staging-provider-broker-recovery-collection.mjs'

export const BROKER_RECOVERY_READ_BINDINGS_ENABLED = false
export const BROKER_RECOVERY_PINNED_DEPLOYMENT = Object.freeze({
  deploymentId: PREVIEW_READINESS_TARGET.deploymentId,
  immutableUrl: PREVIEW_READINESS_TARGET.immutableUrl,
  gitSourceCommit: BROKER_RECOVERY_EXPECTED_SOURCE,
})
const unavailable = () => { throw Error('Staging broker recovery read bindings unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const samePin = value => exact(value, Object.keys(BROKER_RECOVERY_PINNED_DEPLOYMENT))
  && Object.entries(BROKER_RECOVERY_PINNED_DEPLOYMENT).every(([key, expected]) => value[key] === expected)

/**
 * The caller transfers ownership of three credential buffers after claiming
 * the one-use journal. All are wiped after the underlying bindings copy them.
 * The surface binding receives the exact pin at construction, before it can
 * send a protection bypass to the Preview readiness route.
 */
export function createBrokerRecoveryReadBindings({ fetch: fetcher, managementToken, vercelToken,
  protectionBypassToken, createSupabase = createStagingAccountHostedBaselineSupabaseBinding,
  createVercel = createStagingAccountHostedBaselineVercelBinding,
  createSurface = createStagingAccountHostedBaselineSurfaceBinding } = {}) {
  let supabase, vercel, surface, disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    try { surface?.dispose() } finally {
      try { vercel?.dispose() } finally { supabase?.dispose() }
    }
  }
  try {
    if (typeof fetcher !== 'function' || [managementToken, vercelToken, protectionBypassToken]
      .some(value => !Buffer.isBuffer(value))
      || [createSupabase, createVercel, createSurface].some(value => typeof value !== 'function')) unavailable()
    supabase = createSupabase({ fetch: fetcher, managementToken })
    vercel = createVercel({ fetch: fetcher, vercelToken })
    surface = createSurface({ fetch: fetcher, vercelToken, protectionBypassToken,
      expectedDeployment: BROKER_RECOVERY_PINNED_DEPLOYMENT })
    if (!supabase || supabase.target !== STAGING_PROJECT_REF || !vercel || !surface
      || ['readProvider', 'readEdgeSecretNames', 'readDatabase', 'dispose'].some(key => typeof supabase[key] !== 'function')
      || ['readPreviewEnvironmentPresence', 'dispose'].some(key => typeof vercel[key] !== 'function')
      || ['readBaseline', 'dispose'].some(key => typeof surface[key] !== 'function')) unavailable()
  } catch { try { dispose() } catch {}; unavailable() }
  finally { managementToken?.fill?.(0); vercelToken?.fill?.(0); protectionBypassToken?.fill?.(0) }
  const live = () => { if (disposed) unavailable() }
  return Object.freeze({
    async readPinnedPreview({ signal, expectedDeployment } = {}) {
      live()
      if (!samePin(expectedDeployment)) unavailable()
      const observed = await surface.readBaseline({ signal })
      const flags = observed?.surface?.flags, deployment = observed?.deployment
      if (!flags || !deployment || observed?.surface?.edge?.enabled !== false
        || !samePin({ deploymentId: deployment.deploymentId,
          immutableUrl: deployment.immutableUrl, gitSourceCommit: deployment.gitSourceCommit })) unavailable()
      return Object.freeze({
        preview: Object.freeze({ deploymentId: deployment.deploymentId,
          immutableUrl: deployment.immutableUrl, projectRef: STAGING_PROJECT_REF,
          branch: PREVIEW_READINESS_TARGET.branch,
          privateCustomer: flags.privateCustomer, privateCart: flags.privateCart,
          publicCustomer: flags.publicCustomer, publicCart: flags.publicCart }),
        deployment: BROKER_RECOVERY_PINNED_DEPLOYMENT,
      })
    },
    readProvider({ signal } = {}) { live(); return supabase.readProvider({ signal }) },
    async readSupabaseNames({ signal } = {}) {
      live()
      const names = await supabase.readEdgeSecretNames({ signal })
      if (!Array.isArray(names)) unavailable()
      // The recovery assessor compares only the broker entry. Unrelated Edge
      // secrets may legitimately exist and are validated by the source binding.
      return names.filter(name => name === BROKER_SECRET_NAME)
    },
    async readVercelNames({ signal } = {}) {
      live()
      const receipt = await vercel.readPreviewEnvironmentPresence({ signal })
      if (receipt?.branch !== PREVIEW_READINESS_TARGET.branch
        || receipt?.environment !== 'preview' || typeof receipt?.brokerSecretPresent !== 'boolean') unavailable()
      return receipt.brokerSecretPresent ? [BROKER_SECRET_NAME] : []
    },
    readDatabase({ signal } = {}) { live(); return supabase.readDatabase({ signal }) },
    dispose,
  })
}
