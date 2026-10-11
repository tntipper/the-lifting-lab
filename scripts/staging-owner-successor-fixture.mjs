/** Pure phase-journal rehearsal. No persistence, transport, secrets or live authority. */
import { PHASES } from './staging-generation-23-whole-run.mjs'
export const SUCCESSOR_PHASES = PHASES
export const SHUTDOWN_PHASES = Object.freeze(PHASES.slice(-4))
export const SHUTDOWN_RESERVE_MS = 15 * 60_000
export const PHASE_BUDGET_MS = Object.freeze({ surfaceEnable: 12 * 60_000, ownerJourney: 9 * 60_000 })
export const FIXTURE_CHECKS = Object.freeze({
  baseline: ['authenticatedReads', 'databaseRetired', 'sessionsDrained', 'providerOff', 'brokerWindowAbsent',
    'websiteOff', 'protectedPreview', 'sourceAndManifestPinned', 'ciAndReviewPass', 'rootCauseReviewed', 'preventionVerified'],
  settings: ['stagingOnly', 'existingSecureTransport', 'ephemeralSecrets'],
  databaseSetup: ['exactPermissions', 'expiryBound', 'freshWindow'],
  restrictedConnections: ['allFiveRoles', 'noExtraAuthority'],
  consumerReadiness: ['protectedPreview', 'sourceAndManifestPinned', 'exactBrokerRevision'],
  providerEnable: ['fullFieldReadback'], databaseEnable: ['exactControlsReadback'],
  surfaceEnable: ['protectedPreview', 'sourceAndManifestPinned', 'enabledFlagsReadback'],
  ownerJourney: ['accountIdentity', 'stackReloadContinuity', 'guestTransfer', 'exactVariant', 'storefrontPrice',
    'quantityAndSubtotal', 'stagingCheckoutHandoff', 'noPurchase', 'logoutVerified'],
  backendDisable: ['providerOff', 'databaseOff'], surfaceFreeze: ['websiteOff', 'checkoutOff', 'protectedPreview'],
  databaseRetire: ['rolesNoLogin', 'passwordsNull', 'membershipsRevoked', 'sessionsDrained', 'brokerWindowAbsent'],
  finalReadback: ['authenticatedReads', 'allControlsOff', 'exactTargets', 'noLateWrites', 'sessionsDrained'],
})
const OLD_WINDOWS = ['759bc8ed-5ecd-475c-8a4c-e35fcf628a73', 'd5180b08-79ee-43e8-96d4-4f73621fecbf']
const keys = (v, expected) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join('|') === [...expected].sort().join('|')
const hash = (v, n) => typeof v === 'string' && new RegExp(`^[a-f0-9]{${n}}$`).test(v)
const validTime = v => Number.isSafeInteger(v) && v >= 0
const unavailable = () => { throw new Error('Successor fixture unavailable') }
const output = record => Object.freeze({ ...record, authorization: 'NONE', provenance: 'UNVERIFIED_FIXTURE',
  historicalWholeRouteOutcome: 'UNKNOWN', entries: Object.freeze(record.entries.map(e => Object.freeze({ ...e }))) })

/** Each journal instance consumes one synthetic identity, including failed attempts. */
export function createSuccessorFixtureJournal(plan) {
  if (!keys(plan, ['windowId', 'sourceSha', 'startedAtMs', 'expiresAtMs'])
    || typeof plan.windowId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(plan.windowId)
    || OLD_WINDOWS.includes(plan.windowId) || !hash(plan.sourceSha, 40)
    || !validTime(plan.startedAtMs) || !validTime(plan.expiresAtMs)
    || plan.expiresAtMs - plan.startedAtMs < 45 * 60_000
    || plan.expiresAtMs - plan.startedAtMs > 60 * 60_000) unavailable()
  const binding = Object.freeze({ ...plan })
  let consumed = false, current
  const own = previous => { if (previous !== current) unavailable() }
  const clock = (now, cleanup = false) => {
    if (!validTime(now) || now < current.updatedAtMs || now >= binding.expiresAtMs + (cleanup ? SHUTDOWN_RESERVE_MS : 0)) unavailable()
  }
  const save = changes => { current = output({ ...current, ...changes }); return current }
  return Object.freeze({
    begin() {
      if (consumed) unavailable()
      consumed = true
      current = output({ schema: 'tll-owner-successor-fixture/v1', ...binding, updatedAtMs: binding.startedAtMs,
        state: 'ACTIVE', pending: null, next: PHASES[0], failed: false, entries: [] })
      return current
    },
    dispatch(previous, phase, now) {
      own(previous); clock(now, SHUTDOWN_PHASES.includes(phase))
      if (!['ACTIVE', 'RECOVERING'].includes(current.state) || current.pending !== null || current.next !== phase) unavailable()
      if (!SHUTDOWN_PHASES.includes(phase) && binding.expiresAtMs - now <= SHUTDOWN_RESERVE_MS + (PHASE_BUDGET_MS[phase] ?? 0)) {
        return save({ state: current.entries.length ? 'SHUTDOWN_REQUIRED' : 'HOLD', failed: true, updatedAtMs: now })
      }
      return save({ pending: phase, updatedAtMs: now,
        entries: [...current.entries, { phase, state: 'DISPATCHED', dispatchedAtMs: now }] })
    },
    observe(previous, proof, now) {
      own(previous); clock(now, SHUTDOWN_PHASES.includes(current.pending))
      const phase = current.pending, entry = current.entries.at(-1)
      if (!phase || !keys(proof, ['phase', 'windowId', 'sourceSha', 'receiptSha256', 'checks'])
        || proof.phase !== phase || proof.windowId !== binding.windowId || proof.sourceSha !== binding.sourceSha
        || !hash(proof.receiptSha256, 64) || !keys(proof.checks, FIXTURE_CHECKS[phase])
        || Object.values(proof.checks).some(v => v !== true)
        || phase === 'surfaceEnable' && now - entry.dispatchedAtMs > PHASE_BUDGET_MS.surfaceEnable
        || phase === 'ownerJourney' && (now - entry.dispatchedAtMs > PHASE_BUDGET_MS.ownerJourney
          || binding.expiresAtMs - now <= SHUTDOWN_RESERVE_MS)) unavailable()
      const next = PHASES[PHASES.indexOf(phase) + 1] ?? null
      return save({ pending: null, next, updatedAtMs: now,
        state: next ? current.state : current.failed ? 'FIXTURE_FAILURE_SHUTDOWN' : 'FIXTURE_PASS',
        entries: [...current.entries.slice(0, -1), { ...entry, state: 'OBSERVED', receiptSha256: proof.receiptSha256 }] })
    },
    hold(previous, now) {
      own(previous)
      if (!validTime(now) || now < current.updatedAtMs || !['ACTIVE', 'RECOVERING'].includes(current.state)) unavailable()
      // Uncertain dispatches stay recorded. Recovery never retries the failed phase.
      return save({ failed: true, updatedAtMs: now,
        state: current.entries.length === 0 ? 'HOLD' : 'SHUTDOWN_REQUIRED' })
    },
    recover(previous, now) {
      own(previous); clock(now, true)
      if (current.state !== 'SHUTDOWN_REQUIRED') unavailable()
      // An uncertain shutdown cannot restart: reconciliation needs a separate reviewed action.
      if (current.entries.some(entry => SHUTDOWN_PHASES.includes(entry.phase))) unavailable()
      return save({ state: 'RECOVERING', pending: null, next: SHUTDOWN_PHASES[0], updatedAtMs: now })
    },
  })
}
