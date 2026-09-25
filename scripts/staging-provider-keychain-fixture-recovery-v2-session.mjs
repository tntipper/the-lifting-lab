/** Injected V2 coordinator. No Keychain, child or filesystem operation lives here. */
const PHASES = Object.freeze([
  ['API_DELETE', 20_000], ['SIDECAR_RECONCILE', 8_000],
  ['DIRECTORY_REMOVE', 7_000], ['FINAL_VERIFY', 7_000],
])
const SHA = /^[a-f0-9]{64}$/
const fixed = (status, category = null) => Object.freeze({ status, category })
const fail = () => { throw Error('V2 recovery session unavailable') }

export function runFixtureRecoveryV2Session({ journal, identity, preflight,
  captureBaseline, verifyBaseline, preDispatch, runNative, reconcileMain,
  reconcileSidecar, reconcileFinal, now = Date.now } = {}) {
  if (!journal || ['read', 'start', 'pinBaseline', 'advance', 'finish']
    .some(name => typeof journal[name] !== 'function')
    || [preflight, captureBaseline, verifyBaseline, preDispatch, runNative,
      reconcileMain, reconcileSidecar, reconcileFinal, now]
      .some(value => typeof value !== 'function')) fail()
  if (journal.read()) return fixed('HOLD', 'REPLAY')
  let record, mutationDispatched = false
  const terminal = (outcome, category) => {
    try { journal.finish(record, outcome); return fixed(outcome, category) }
    catch { return fixed('UNCERTAIN', 'JOURNAL') }
  }
  const within = (limit = 0) => {
    const time = now()
    return Number.isFinite(time) && time >= Date.parse(record.startedAt)
      && time + limit < Date.parse(record.phaseDeadlineAt)
      && time + limit < Date.parse(record.runDeadlineAt)
  }
  try {
    record = journal.start(identity)
    if (preflight() !== true || !within(0)) return terminal('HOLD', 'PREFLIGHT')
    const capture = captureBaseline()
    if (capture?.status !== 'PASS' || !SHA.test(capture.sha256)
      || verifyBaseline(capture.sha256) !== true || !within(0)) {
      return terminal('HOLD', 'BASELINE_CAPTURE')
    }
    record = journal.pinBaseline(record, capture.sha256)
    if (verifyBaseline(record.baselineSha256) !== true) return terminal('HOLD', 'BASELINE_CHANGED')
    for (const [index, [phase, limit]] of PHASES.entries()) {
      // Check before the intent write and again afterwards. Native V2 must
      // independently check the same pinned snapshot immediately before effects.
      if (verifyBaseline(record.baselineSha256) !== true || !within(0)) {
        return terminal(mutationDispatched ? 'UNCERTAIN' : 'HOLD', 'BASELINE_CHANGED')
      }
      record = journal.advance(record, phase)
      if (verifyBaseline(record.baselineSha256) !== true || preDispatch(phase) !== true
        || !within(limit + 1_000)) {
        return terminal(mutationDispatched ? 'UNCERTAIN' : 'HOLD', 'PREDISPATCH')
      }
      if (phase !== 'FINAL_VERIFY') mutationDispatched = true
      const result = runNative(phase, limit, record.baselineSha256)
      if (result?.status !== 'PASS' || !within(0)) {
        return terminal(mutationDispatched ? 'UNCERTAIN' : 'HOLD', 'CHILD_RESULT')
      }
      if (verifyBaseline(record.baselineSha256) !== true) {
        return terminal(mutationDispatched ? 'UNCERTAIN' : 'HOLD', 'BASELINE_CHANGED')
      }
      const reconcile = [reconcileMain, reconcileSidecar, null, reconcileFinal][index]
      if (reconcile && reconcile() !== true) {
        return terminal(mutationDispatched ? 'UNCERTAIN' : 'HOLD', 'RECONCILIATION')
      }
      if (!within(0)) return terminal(mutationDispatched ? 'UNCERTAIN' : 'HOLD', 'DEADLINE')
    }
    return terminal('PASS', null)
  } catch {
    if (record?.outcome === null) {
      try { journal.finish(record, mutationDispatched ? 'UNCERTAIN' : 'HOLD') }
      catch { /* preserve last durable intent, never replay */ }
    }
    return fixed(mutationDispatched ? 'UNCERTAIN' : 'HOLD', 'EXCEPTION')
  }
}
