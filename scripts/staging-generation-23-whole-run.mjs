/** Disabled, injected-only flight plan for a complete protected Stage 3 rehearsal. */
export const STAGING_GENERATION_23_WHOLE_RUN_ENABLED = false

// Each operation is supplied by the test or, after separate review, a bounded
// staging connector. This module owns no credentials and makes no requests.
export const PHASES = Object.freeze([
  'baseline',
  'settings',
  'databaseSetup',
  'restrictedConnections',
  'providerEnable',
  'databaseEnable',
  'surfaceEnable',
  'ownerJourney',
  'backendDisable',
  'surfaceFreeze',
  'databaseRetire',
  'finalReadback',
])

export const REQUIRED_RESULTS = Object.freeze(Object.fromEntries(
  PHASES.map(phase => [phase, `PASS_${phase.toUpperCase()}`]),
))

const CUSTOMER_PHASE = PHASES.indexOf('ownerJourney')
const SETTINGS_PHASE = PHASES.indexOf('settings')
const FINAL_PHASE = PHASES.indexOf('finalReadback')
const MAX_WINDOW_MS = 60 * 60 * 1000
const MIN_SHUTDOWN_RESERVE_MS = 15 * 60 * 1000
export const MAX_OWNER_JOURNEY_MS = 10 * 60 * 1000
const unavailable = () => { throw new Error('Generation 23 whole-run rehearsal unavailable') }

function classifyFailure(index, wasDispatched) {
  if (!wasDispatched && index === 0) return 'CHECK_STARTING_STATE'
  if (index <= 3) return 'READ_ONLY_RECONCILIATION'
  if (index <= CUSTOMER_PHASE) return 'RECONCILE_ENABLED_SURFACES_THEN_SHUT_DOWN'
  return 'RECONCILE_SHUTDOWN_BEFORE_RETRY'
}

/**
 * One process, one ordered attempt. The caller must durably journal every
 * external effect before binding a connector; no failed phase is retried here.
 * The owner-journey connector must enforce phaseDeadlineAt and settle after
 * cancellation. A separate parent process supervisor must kill a stuck child.
 */
export async function rehearseStagingGeneration23WholeRun({ operations, now = Date.now,
  windowExpiresAt, signal } = {}) {
  if (!STAGING_GENERATION_23_WHOLE_RUN_ENABLED || !operations || typeof operations !== 'object'
    || Array.isArray(operations) || typeof now !== 'function' || !signal
    || typeof signal.addEventListener !== 'function' || signal.aborted
    || typeof windowExpiresAt !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(windowExpiresAt)
    || PHASES.some(phase => typeof operations[phase] !== 'function')) unavailable()
  const startedAt = now(), expires = Date.parse(windowExpiresAt)
  if (!Number.isFinite(startedAt) || !Number.isFinite(expires)
    || expires <= startedAt || expires - startedAt > MAX_WINDOW_MS) unavailable()

  const timeline = []
  let lastTime = startedAt, ownerFailure = null
  for (let index = 0; index < PHASES.length; index++) {
    const phase = PHASES[index]
    const before = now()
    const insufficientReserve = index >= SETTINGS_PHASE && index <= CUSTOMER_PHASE
      && expires - before < MIN_SHUTDOWN_RESERVE_MS
        + (index === CUSTOMER_PHASE ? MAX_OWNER_JOURNEY_MS : 0)
    if (!Number.isFinite(before) || before < lastTime || signal.aborted
      || before >= expires || insufficientReserve) {
      timeline.push(Object.freeze({ phase, state: 'NOT_DISPATCHED', atMs: before - startedAt }))
      // The Preview is already enabled here. Skipping the owner journey due to
      // its time budget is a known non-effect, so proceed to the reserved OFF path.
      if (index === CUSTOMER_PHASE && insufficientReserve && Number.isFinite(before)
        && before >= lastTime && before < expires && !signal.aborted) {
        ownerFailure = 'INSUFFICIENT_OWNER_BUDGET'
        lastTime = before
        continue
      }
      return Object.freeze({ status: 'HOLD', failedPhase: phase,
        nextAction: classifyFailure(index, false),
        ...(ownerFailure ? { priorOwnerFailure: ownerFailure } : {}),
        timeline: Object.freeze(timeline) })
    }
    lastTime = before
    // A phase is counted as dispatched before the supplied function runs.
    // An exception or lost reply therefore cannot be mistaken for a no-op.
    timeline.push(Object.freeze({ phase, state: 'DISPATCHED', atMs: before - startedAt }))
    let result
    const phaseDeadlineAt = index === CUSTOMER_PHASE
      ? new Date(Math.min(before + MAX_OWNER_JOURNEY_MS,
        expires - MIN_SHUTDOWN_RESERVE_MS)).toISOString() : windowExpiresAt
    try { result = await operations[phase]({ signal, windowExpiresAt,
      phaseDeadlineAt }) } catch { /* uncertain effect */ }
    const after = now()
    if (index === CUSTOMER_PHASE && Number.isFinite(after) && after >= lastTime
      && after < expires && !signal.aborted
      && result && typeof result === 'object' && !Array.isArray(result)
      && Object.keys(result).length === 1 && result.status === 'OWNER_JOURNEY_FAILED_VERIFIED') {
      timeline.push(Object.freeze({ phase, state: 'FAILED_VERIFIED', atMs: after - startedAt }))
      ownerFailure = 'OWNER_JOURNEY_FAILED_VERIFIED'
      lastTime = after
      continue
    }
    if (index === CUSTOMER_PHASE && Number.isFinite(after) && after >= Date.parse(phaseDeadlineAt)
      && after < expires && !signal.aborted
      && result && typeof result === 'object' && !Array.isArray(result)
      && Object.keys(result).length === 1 && result.status === REQUIRED_RESULTS[phase]) {
      timeline.push(Object.freeze({ phase, state: 'LATE_VERIFIED', atMs: after - startedAt }))
      ownerFailure = 'OWNER_JOURNEY_OVERRAN_BUDGET'
      lastTime = after
      continue
    }
    if (!Number.isFinite(after) || after < lastTime || after >= expires || signal.aborted
      || (index === CUSTOMER_PHASE && after >= Date.parse(phaseDeadlineAt))
      || !result || typeof result !== 'object' || Array.isArray(result)
      || Object.keys(result).length !== 1 || result.status !== REQUIRED_RESULTS[phase]) {
      timeline.push(Object.freeze({ phase, state: 'UNCONFIRMED', atMs: after - startedAt }))
      return Object.freeze({ status: 'HOLD', failedPhase: phase,
        nextAction: classifyFailure(index, true),
        ...(ownerFailure ? { priorOwnerFailure: ownerFailure } : {}),
        timeline: Object.freeze(timeline) })
    }
    lastTime = after
    timeline.push(Object.freeze({ phase, state: 'VERIFIED', atMs: after - startedAt }))
  }
  if (ownerFailure) return Object.freeze({ status: 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED',
    failedPhase: 'ownerJourney', reason: ownerFailure, completedPhases: FINAL_PHASE,
    elapsedMs: lastTime - startedAt, timeline: Object.freeze(timeline) })
  return Object.freeze({ status: 'LOCAL_SEQUENCE_PASS', completedPhases: FINAL_PHASE + 1,
    elapsedMs: lastTime - startedAt, timeline: Object.freeze(timeline) })
}
