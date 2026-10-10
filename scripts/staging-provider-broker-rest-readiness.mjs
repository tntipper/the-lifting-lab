/** Disabled adapter from strict staging observations to the broker rotation preflight. */
import { STAGING_PROJECT_REF, STAGING_PROVIDER_TARGET } from './staging-provider-broker-rotation.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from './staging-account-hosted-baseline-database.mjs'
import { BROKER_RECOVERY_PINNED_DEPLOYMENT } from './staging-provider-broker-recovery-read-bindings.mjs'
import { createStagingProviderBrokerRotationReadiness } from './staging-provider-broker-rotation-readiness.mjs'

export const STAGING_BROKER_REST_READINESS_ENABLED = false
const unavailable = () => { throw new Error('Staging broker REST readiness unavailable') }
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

function exactTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)
    || Object.keys(target).sort().join('|') !== Object.keys(STAGING_PROVIDER_TARGET).sort().join('|')) unavailable()
  for (const [key, expected] of Object.entries(STAGING_PROVIDER_TARGET)) if (target[key] !== expected) unavailable()
}

function acceptPreview(value) {
  const preview = value?.preview
  if (!value || typeof value !== 'object' || !same(value.deployment, BROKER_RECOVERY_PINNED_DEPLOYMENT)
    || !preview || preview.projectRef !== STAGING_PROJECT_REF || preview.branch !== STAGING_PROVIDER_TARGET.branch
    || preview.deploymentId !== BROKER_RECOVERY_PINNED_DEPLOYMENT.deploymentId
    || preview.immutableUrl !== BROKER_RECOVERY_PINNED_DEPLOYMENT.immutableUrl
    || preview.privateCustomer !== false || preview.privateCart !== false
    || preview.publicCustomer !== false || preview.publicCart !== false) unavailable()
}

function acceptDatabase(value) {
  if (!value || value.status !== 'PASS' || value.target !== STAGING_PROJECT_REF
    || value.queryId !== STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID
    || typeof value.receiptHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.receiptHash)
    || !value.counts || value.counts.controlsEnabled !== 0 || value.counts.runtimeSessions !== 0
    || value.counts.executionEdges !== 0 || value.counts.operatorEdges !== 5
    || value.counts.runtimeRoles !== 5 || value.counts.migrations !== 15) unavailable()
}

function acceptNames(value) {
  if (!Array.isArray(value) || value.length !== 0) unavailable()
}

/**
 * The binding must be the existing pinned protected-Preview/database/provider
 * reader. This adapter neither discovers credentials nor owns a network port.
 */
export function createStagingProviderBrokerRestReadiness({ bindings, now = Date.now } = {}) {
  if (!bindings || ['readPinnedPreview', 'readDatabase', 'readSupabaseNames', 'readVercelNames', 'readProvider']
    .some(name => typeof bindings[name] !== 'function') || typeof now !== 'function') unavailable()
  return createStagingProviderBrokerRotationReadiness({ now, openPreflight: signal => Object.freeze({
    async preflight(target) {
      exactTarget(target)
      if (signal.aborted) unavailable()
      acceptPreview(await bindings.readPinnedPreview({ signal, expectedDeployment: BROKER_RECOVERY_PINNED_DEPLOYMENT }))
      if (signal.aborted) unavailable()
      acceptDatabase(await bindings.readDatabase({ signal }))
      if (signal.aborted) unavailable()
      acceptNames(await bindings.readSupabaseNames({ signal }))
      if (signal.aborted) unavailable()
      acceptNames(await bindings.readVercelNames({ signal }))
      if (signal.aborted) unavailable()
      const observedAt = new Date(now()).toISOString()
      return Object.freeze({ target: STAGING_PROVIDER_TARGET, observedAt,
        controls: Object.freeze({ customer: false, cart: false, broker: false, provisional: false, bridge: false }),
        runtimeSessions: 0, edgeEnabled: false, privateEnabled: false, publicEnabled: false,
        supabaseBrokerSecretNames: Object.freeze([]), vercelBrokerSecretNames: Object.freeze([]) })
    },
    async readProvider(target) { exactTarget(target); if (signal.aborted) unavailable(); return bindings.readProvider({ signal }) },
  }) })
}
