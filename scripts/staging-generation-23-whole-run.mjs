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
const ACTIVATION_PHASE = PHASES.indexOf('providerEnable')
const FINAL_PHASE = PHASES.indexOf('finalReadback')
const MAX_WINDOW_MS = 60 * 60 * 1000
const MIN_SHUTDOWN_RESERVE_MS = 15 * 60 * 1000
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
  let lastTime = startedAt
  for (let index = 0; index < PHASES.length; index++) {
    const phase = PHASES[index]
    const before = now()
    if (!Number.isFinite(before) || before < lastTime || signal.aborted
      || before >= expires || ([ACTIVATION_PHASE, CUSTOMER_PHASE].includes(index)
        && expires - before < MIN_SHUTDOWN_RESERVE_MS)) {
      timeline.push(Object.freeze({ phase, state: 'NOT_DISPATCHED', atMs: before - startedAt }))
      return Object.freeze({ status: 'HOLD', failedPhase: phase,
        nextAction: classifyFailure(index, false), timeline: Object.freeze(timeline) })
    }
    lastTime = before
    // A phase is counted as dispatched before the supplied function runs.
    // An exception or lost reply therefore cannot be mistaken for a no-op.
    timeline.push(Object.freeze({ phase, state: 'DISPATCHED', atMs: before - startedAt }))
    let result
    try { result = await operations[phase]({ signal, windowExpiresAt }) } catch { /* uncertain effect */ }
    const after = now()
    if (!Number.isFinite(after) || after < lastTime || after >= expires || signal.aborted
      || !result || typeof result !== 'object' || Array.isArray(result)
      || Object.keys(result).length !== 1 || result.status !== REQUIRED_RESULTS[phase]) {
      timeline.push(Object.freeze({ phase, state: 'UNCONFIRMED', atMs: after - startedAt }))
      return Object.freeze({ status: 'HOLD', failedPhase: phase,
        nextAction: classifyFailure(index, true), timeline: Object.freeze(timeline) })
    }
    lastTime = after
    timeline.push(Object.freeze({ phase, state: 'VERIFIED', atMs: after - startedAt }))
  }
  return Object.freeze({ status: 'LOCAL_SEQUENCE_PASS', completedPhases: FINAL_PHASE + 1,
    elapsedMs: lastTime - startedAt, timeline: Object.freeze(timeline) })
}
