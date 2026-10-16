/** Fixed fresh-window preparation. All capabilities/evidence here are synthetic only. */
import { ownerSuccessorRegistrationDescriptor, OWNER_SUCCESSOR_WINDOW_ID, OWNER_SUCCESSOR_EDGE_REVISION,
  OWNER_SUCCESSOR_TARGETS } from './staging-owner-successor-registration.mjs'
import { SUCCESSOR_PHASES } from './staging-owner-successor-fixture.mjs'
import { PREDECESSOR_WINDOW_ID, PREDECESSOR_EXPIRES_AT } from './staging-owner-successor-predecessor-check.mjs'
export const OWNER_SUCCESSOR_WINDOW_NATIVE_ENABLED = false
const issued = new WeakMap(), bindings = new WeakSet(), denied = () => { throw Error('Successor synthetic window binding unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const time = value => Number.isSafeInteger(value) && value >= 0 && value % 1000 === 0
const iso = value => {
  if (!time(value)) denied()
  const result = new Date(value).toISOString()
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(result)) denied()
  return result
}
export function prepareSyntheticSuccessorWindow({ pins, startedAtMs, expiresAtMs, predecessor } = {}) {
  const descriptor = ownerSuccessorRegistrationDescriptor(pins)
  if (!time(startedAtMs) || !time(expiresAtMs) || expiresAtMs - startedAtMs < 45 * 60_000
    || expiresAtMs - startedAtMs > 60 * 60_000 || !exact(predecessor,
      ['windowId', 'expiresAt', 'state', 'runtimeSessions', 'controlsEnabled', 'providerEnabled', 'retiredRoles', 'provenance'])
    || predecessor.windowId !== PREDECESSOR_WINDOW_ID || predecessor.expiresAt !== PREDECESSOR_EXPIRES_AT
    || Date.parse(predecessor.expiresAt) >= startedAtMs || predecessor.state !== 'retired'
    || predecessor.runtimeSessions !== 0 || predecessor.controlsEnabled !== false
    || predecessor.providerEnabled !== false || predecessor.retiredRoles !== 5
    || predecessor.provenance !== 'SYNTHETIC_STUB') denied()
  const binding = Object.freeze({ authorization: 'NONE', provenance: 'SYNTHETIC_STUB', historicalOutcome: 'UNKNOWN',
    windowId: OWNER_SUCCESSOR_WINDOW_ID, edgeRevision: OWNER_SUCCESSOR_EDGE_REVISION,
    source: descriptor.descriptor.pins, sourceDigest: descriptor.digest, projectRef: OWNER_SUCCESSOR_TARGETS.supabase,
    startedAt: iso(startedAtMs), expiresAt: iso(expiresAtMs),
    readiness: `${OWNER_SUCCESSOR_WINDOW_ID}|${iso(startedAtMs)}|${iso(expiresAtMs)}`,
    predecessor: Object.freeze({ ...predecessor }),
    recordNames: Object.freeze(Object.fromEntries(SUCCESSOR_PHASES.map(phase =>
      [phase, `tll-owner-successor-${OWNER_SUCCESSOR_WINDOW_ID}-${phase}.json`]))),
  })
  bindings.add(binding)
  const capability = Object.freeze({})
  issued.set(capability, { binding, startedAtMs, expiresAtMs, admissionUntilMs: startedAtMs + 30_000 })
  return Object.freeze({ binding, capability })
}
/** One-use mock source proof must precede any synthetic material construction. */
export function consumeSyntheticSuccessorWindow(capability, observedPins, nowMs) {
  const grant = issued.get(capability); issued.delete(capability)
  if (!grant || !Number.isSafeInteger(nowMs) || nowMs < grant.startedAtMs
    || nowMs >= grant.admissionUntilMs || nowMs >= grant.expiresAtMs) denied()
  const observed = ownerSuccessorRegistrationDescriptor(observedPins)
  if (observed.digest !== grant.binding.sourceDigest) denied()
  return grant.binding
}
export function validateSyntheticSuccessorPhaseReceipt(binding, receipt) {
  if (!bindings.has(binding) || binding.authorization !== 'NONE' || binding.provenance !== 'SYNTHETIC_STUB'
    || binding.windowId !== OWNER_SUCCESSOR_WINDOW_ID || !exact(receipt,
      ['phase', 'status', 'windowId', 'edgeRevision', 'sourceSha', 'provenance'])
    || !SUCCESSOR_PHASES.includes(receipt.phase) || receipt.status !== `PASS_${receipt.phase.toUpperCase()}`
    || receipt.windowId !== binding.windowId || receipt.edgeRevision !== binding.edgeRevision
    || receipt.sourceSha !== binding.source.sourceSha || receipt.provenance !== 'SYNTHETIC_STUB') denied()
  return Object.freeze({ phase: receipt.phase, status: receipt.status, authorization: 'NONE', provenance: 'SYNTHETIC_STUB' })
}
export function bindOwnerSuccessorNativeWindow() {
  return Object.freeze({ status: 'NATIVE_WINDOW_BINDING_DISABLED', authorization: 'NONE' })
}
