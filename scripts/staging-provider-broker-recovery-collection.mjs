/** Offline composition only. No credential lookup, network primitive or live entry point. */
import { assessBrokerRecovery, assessBrokerRecoveryReceipts } from './staging-provider-broker-reconciliation.mjs'
import { PREVIEW_READINESS_TARGET } from './staging-provider-preview-readiness-session.mjs'
import { STAGING_PROVIDER_TARGET } from './staging-provider-broker-rotation.mjs'

export const BROKER_RECOVERY_COLLECTION_ENABLED = false
export const BROKER_RECOVERY_EXPECTED_SOURCE = 'abd5a5258dd1072daf83a4447ce7110465f445e1'
export const BROKER_RECOVERY_COLLECTION_DEADLINE_MS = 45_000
const fixed = status => Object.freeze({ status })
const unavailable = () => fixed('READ_UNAVAILABLE')
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/**
 * All ports are injected. The Preview port must be the existing pinned surface
 * binding, which checks deployment/source before sending its bypass token and
 * checks the alias again afterwards. A later live launcher must supply a
 * durable one-use journal and a parent deadline before calling this core.
 */
export function createBrokerRecoveryCollection({ readPhase, readRotation, readPinnedPreview,
  readProvider, readSupabaseNames, readVercelNames, readDatabase, now = Date.now,
  timeoutMs = BROKER_RECOVERY_COLLECTION_DEADLINE_MS } = {}) {
  if ([readPhase, readRotation, readPinnedPreview, readProvider, readSupabaseNames,
    readVercelNames, readDatabase, now].some(value => typeof value !== 'function')
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > BROKER_RECOVERY_COLLECTION_DEADLINE_MS) {
    throw Error('Staging broker recovery collection unavailable')
  }
  let consumed = false
  return Object.freeze({
    async observe({ signal } = {}) {
      if (consumed) return fixed('REPLAY_REJECTED')
      consumed = true
      if (signal !== undefined && (!signal || typeof signal.aborted !== 'boolean'
        || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) return unavailable()
      if (signal?.aborted) return unavailable()
      const controller = new AbortController()
      const timeout = Symbol('expired')
      const expired = new Promise(resolve => controller.signal.addEventListener('abort', () => resolve(timeout), { once: true }))
      const parentAbort = () => controller.abort()
      signal?.addEventListener('abort', parentAbort, { once: true })
      if (signal?.aborted) controller.abort()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let phase, rotation
      try {
        phase = await Promise.race([Promise.resolve().then(readPhase), expired])
        if (controller.signal.aborted || phase === timeout) return unavailable()
        rotation = await Promise.race([Promise.resolve().then(readRotation), expired])
        if (controller.signal.aborted) return unavailable()
        // This assessment deliberately runs before any hosted port. Active
        // and stale windows must be resolved through a separate process first.
        const preflight = assessBrokerRecoveryReceipts({ phase, rotation, nowMs: now() })
        if (preflight.status !== 'READY_FOR_OBSERVATION') return preflight
        if (controller.signal.aborted) return unavailable()
        const surface = await Promise.race([readPinnedPreview({ signal: controller.signal,
          expectedDeployment: Object.freeze({ deploymentId: PREVIEW_READINESS_TARGET.deploymentId,
            immutableUrl: PREVIEW_READINESS_TARGET.immutableUrl,
            gitSourceCommit: BROKER_RECOVERY_EXPECTED_SOURCE }) }), expired])
        if (controller.signal.aborted || surface === timeout) return unavailable()
        if (!exact(surface, ['preview', 'deployment'])
          || !exact(surface.deployment, ['deploymentId', 'immutableUrl', 'gitSourceCommit'])
          || surface.deployment.deploymentId !== PREVIEW_READINESS_TARGET.deploymentId
          || surface.deployment.immutableUrl !== PREVIEW_READINESS_TARGET.immutableUrl
          || surface.deployment.gitSourceCommit !== BROKER_RECOVERY_EXPECTED_SOURCE) return fixed('PREVIEW_IDENTITY_CHANGED')
        const observations = await Promise.race([Promise.all([
          readProvider({ signal: controller.signal }), readSupabaseNames({ signal: controller.signal }),
          readVercelNames({ signal: controller.signal }), readDatabase({ signal: controller.signal }),
        ]), expired])
        if (controller.signal.aborted || observations === timeout) return unavailable()
        const [provider, supabase, vercel, database] = observations
        return assessBrokerRecovery({ phase, rotation, evidence: {
          provider, names: { target: STAGING_PROVIDER_TARGET, supabase, vercel },
          database, preview: surface.preview,
        }, nowMs: now() })
      } catch { return unavailable() } finally {
        clearTimeout(timer); controller.abort()
        signal?.removeEventListener('abort', parentAbort)
      }
    },
  })
}
