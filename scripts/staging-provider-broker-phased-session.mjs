/** Disabled, injected-only phase wiring for a future bounded staging rotation launcher. */
import { BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, rotateStagingProviderBroker, STAGING_PROVIDER_TARGET } from './staging-provider-broker-rotation.mjs'

export const BROKER_PHASED_ROTATION_LIVE_ENABLED = false
const unavailable = () => { throw Error('Staging provider broker phased rotation unavailable') }
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const receipt = (value, status) => exact(value, ['status', 'target', 'name']) && value.status === status
  && value.name === BROKER_SECRET_NAME && same(value.target, STAGING_PROVIDER_TARGET)
const providerReceipt = value => exact(value, ['status', 'target', 'providerIdentifier']) && value.status === 'UPDATED'
  && value.providerIdentifier === PROVIDER_IDENTIFIER && same(value.target, STAGING_PROVIDER_TARGET)

/** Claim the phase record before acquiring ports; every mutation is preceded by a durable dispatch event. */
export async function runPhasedBrokerRotation({ acquirePorts, phaseJournal, rotationJournal, randomBytes, now } = {}) {
  if (typeof acquirePorts !== 'function' || !phaseJournal || typeof phaseJournal.start !== 'function'
    || typeof phaseJournal.read !== 'function' || typeof phaseJournal.record !== 'function' || typeof phaseJournal.finish !== 'function'
    || !rotationJournal || typeof rotationJournal.read !== 'function' || typeof rotationJournal.recordIntent !== 'function'
    || typeof rotationJournal.transition !== 'function' || typeof randomBytes !== 'function' || typeof now !== 'function') unavailable()
  // A consumed or uncertain run is never recycled, including a phase-only attempt.
  if (phaseJournal.read() || rotationJournal.read()) return Object.freeze({ status: 'REPLAY_REJECTED' })
  let phase = phaseJournal.start(), ports, acquired = false, disposed = false
  const mark = name => { phase = phaseJournal.record(phase, name) }
  const effect = (name, acknowledgement, port, valid) => async (...args) => {
    mark(name)
    const result = await port(...args)
    if (!valid(result)) unavailable()
    mark(acknowledgement)
    return result
  }
  try {
    ports = await acquirePorts()
    acquired = true
    if (!ports || typeof ports.dispose !== 'function') unavailable()
    const required = ['preflight', 'getProvider', 'stageVercelBrokerSecret', 'stageSupabaseBrokerSecret', 'updateProvider',
      'readProvider', 'readbackSecretNames', 'removeVercelBrokerSecret', 'removeSupabaseBrokerSecret']
    if (required.some(name => typeof ports[name] !== 'function')) unavailable()
    const wrapped = {
      preflight: async (...args) => { mark('PREFLIGHT'); return ports.preflight(...args) },
      getProvider: async (...args) => { mark('PROVIDER_PREREAD'); return ports.getProvider(...args) },
      stageVercelBrokerSecret: effect('VERCEL_STAGE_DISPATCH', 'VERCEL_STAGE_ACK', ports.stageVercelBrokerSecret, value => receipt(value, 'STAGED')),
      stageSupabaseBrokerSecret: effect('SUPABASE_STAGE_DISPATCH', 'SUPABASE_STAGE_ACK', ports.stageSupabaseBrokerSecret, value => receipt(value, 'STAGED')),
      updateProvider: effect('PROVIDER_UPDATE_DISPATCH', 'PROVIDER_UPDATE_ACK', ports.updateProvider, providerReceipt),
      readProvider: async (...args) => { mark('PROVIDER_POSTREAD'); return ports.readProvider(...args) },
      readbackSecretNames: async (...args) => {
        mark(phase.history.some(event => event.phase === 'PROVIDER_UPDATE_DISPATCH') ? 'HOST_NAMES_READBACK' : 'REMOVAL_READBACK')
        return ports.readbackSecretNames(...args)
      },
      removeVercelBrokerSecret: effect('VERCEL_REMOVE_DISPATCH', 'VERCEL_REMOVE_ACK', ports.removeVercelBrokerSecret, value => receipt(value, 'REMOVED')),
      removeSupabaseBrokerSecret: effect('SUPABASE_REMOVE_DISPATCH', 'SUPABASE_REMOVE_ACK', ports.removeSupabaseBrokerSecret, value => receipt(value, 'REMOVED')),
    }
    const journal = {
      read: () => rotationJournal.read(),
      recordIntent: () => {
        mark('INTENT_RECORDED')
        // Use the durable phase marker as the sole intent timestamp. A second
        // clock sample can jump past the first dispatch and create receipts
        // that the recovery checker cannot reconcile.
        const intent = rotationJournal.recordIntent({ nowMs: Date.parse(phase.history.at(-1).at) })
        if (intent.runId !== phase.runId) unavailable()
        return intent
      },
      transition: (...args) => rotationJournal.transition(...args),
    }
    const result = await rotateStagingProviderBroker({ ports: wrapped, journal, randomBytes, now })
    const outcome = result.status === 'ROTATION_VERIFIED' ? 'VERIFIED'
      : result.status === 'STOPPED_BEFORE_PROVIDER_UPDATE' && !phase.history.some(event => event.phase === 'INTENT_RECORDED')
        ? 'STOPPED_BEFORE_UPDATE'
        : result.status === 'STOPPED_BEFORE_PROVIDER_UPDATE' && phase.phase === 'REMOVAL_READBACK'
          ? 'STOPPED_BEFORE_UPDATE' : 'RECONCILIATION_REQUIRED'
    // Credential-bearing adapters must close before a terminal success is recorded.
    disposed = true; await ports.dispose()
    phase = phaseJournal.finish(phase, outcome)
    return Object.freeze({ ...result, phaseOutcome: outcome })
  } catch {
    try { phase = phaseJournal.finish(phase, 'RECONCILIATION_REQUIRED') } catch { /* preserve the uncertain phase */ }
    return Object.freeze({ status: 'RECONCILIATION_REQUIRED', phaseOutcome: phase?.outcome ?? null })
  } finally {
    if (acquired && !disposed && typeof ports?.dispose === 'function') {
      try { await ports.dispose() } catch { /* a disposal failure never changes the recorded outcome */ }
    }
  }
}
