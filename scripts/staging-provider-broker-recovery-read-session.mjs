/** Disabled, injected-only coordination. A live credential/transport launcher does not exist. */
import { assessBrokerRecoveryReceipts } from './staging-provider-broker-reconciliation.mjs'
import { createBrokerRecoveryCollection } from './staging-provider-broker-recovery-collection.mjs'

export const BROKER_RECOVERY_READ_SESSION_ENABLED = false
export const BROKER_RECOVERY_READ_SESSION_DEADLINE_MS = 55_000
const fixed = status => Object.freeze({ status })
const TERMINAL = new Set(['SAFE_HELD_CONFIGURATION_OBSERVED', 'CONFIGURATION_CONSISTENT_SECRET_UNPROVEN',
  'RECONCILIATION_REQUIRED', 'READ_UNAVAILABLE', 'PREVIEW_IDENTITY_CHANGED'])
const BINDING_KEYS = ['readPinnedPreview', 'readProvider', 'readSupabaseNames', 'readVercelNames', 'readDatabase', 'dispose']
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/**
 * Local receipt reads precede the durable claim. Only after that claim does
 * acquireBindings run. The later live adapter must expose only these read ports,
 * construct the Preview binding with the expected source before bypass use,
 * and make dispose synchronously wipe its credential buffers.
 */
export function createBrokerRecoveryReadSession({ readPhase, readRotation, journal, acquireBindings,
  now = Date.now, deadlineMs = BROKER_RECOVERY_READ_SESSION_DEADLINE_MS } = {}) {
  if ([readPhase, readRotation, acquireBindings, now].some(value => typeof value !== 'function')
    || !journal || ['read', 'claim', 'assertClaim', 'finish', 'close'].some(name => typeof journal[name] !== 'function')
    || !Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > BROKER_RECOVERY_READ_SESSION_DEADLINE_MS) {
    throw Error('Staging broker recovery read session unavailable')
  }
  let consumed = false
  return Object.freeze({
    async run() {
      if (consumed) return fixed('REPLAY_REJECTED')
      consumed = true
      let phase, rotation
      try {
        if (journal.read()) return fixed('REPLAY_REJECTED')
        phase = await readPhase(); rotation = await readRotation()
      } catch { return fixed('RECONCILIATION_REQUIRED') }
      const preflight = assessBrokerRecoveryReceipts({ phase, rotation, nowMs: now() })
      if (preflight.status !== 'READY_FOR_OBSERVATION') return preflight
      let intent
      try { intent = journal.claim({ phaseRunId: phase.runId }) }
      catch { return fixed('RECONCILIATION_REQUIRED') }
      const controller = new AbortController()
      const expired = new Promise(resolve => controller.signal.addEventListener('abort', () => resolve(null), { once: true }))
      const timer = setTimeout(() => controller.abort(), deadlineMs)
      let binding, status = 'READ_UNAVAILABLE'
      try {
        journal.assertClaim(intent)
        const pending = Promise.resolve().then(() => acquireBindings({ signal: controller.signal }))
        void pending.then(value => {
          if (controller.signal.aborted) { try { value?.dispose?.() } catch {} }
        }, () => {})
        binding = await Promise.race([pending, expired])
        if (controller.signal.aborted || !exact(binding, BINDING_KEYS)
          || BINDING_KEYS.some(key => typeof binding[key] !== 'function')) throw Error('Read bindings unavailable')
        const collector = createBrokerRecoveryCollection({ readPhase: () => phase, readRotation: () => rotation,
          readPinnedPreview: binding.readPinnedPreview, readProvider: binding.readProvider,
          readSupabaseNames: binding.readSupabaseNames, readVercelNames: binding.readVercelNames,
          readDatabase: binding.readDatabase, now,
          timeoutMs: Math.min(45_000, deadlineMs) })
        const observed = await collector.observe({ signal: controller.signal })
        status = TERMINAL.has(observed.status) ? observed.status : 'RECONCILIATION_REQUIRED'
        if (controller.signal.aborted) status = 'READ_UNAVAILABLE'
      } catch { status = 'READ_UNAVAILABLE' } finally {
        clearTimeout(timer); controller.abort()
        try { if (binding && binding.dispose() !== undefined) status = 'READ_UNAVAILABLE' }
        catch { status = 'READ_UNAVAILABLE' }
      }
      try { journal.finish(intent, status); return fixed(status) }
      catch { return fixed('RECONCILIATION_REQUIRED') }
      finally { try { journal.close() } catch {} }
    },
  })
}
