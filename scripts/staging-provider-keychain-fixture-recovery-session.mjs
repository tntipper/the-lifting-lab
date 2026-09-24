/** Injected-only one-shot coordinator for the preserved synthetic fixture. */
export const RECOVERY_RUN_DEADLINE_MS = 90_000
const phases = Object.freeze([
  ['API_DELETE', 20_000, 'main'],
  ['SIDECAR_RECONCILE', 8_000, 'sidecar'],
  ['DIRECTORY_REMOVE', 7_000, 'directory'],
])
const fixed = (status, category = null) => Object.freeze({ status, category })
const fail = () => { throw Error('Synthetic fixture recovery session unavailable') }

export function classifyRecoveryChild({ status, signal, error, stdout, stderr } = {}, phase) {
  if (!phases.some(item => item[0] === phase) || error || signal) return fixed('UNCERTAIN', 'CHILD')
  if (!Buffer.isBuffer(stdout) || !Buffer.isBuffer(stderr) || stderr.length !== 0
    || stdout.length > 128 || status !== 0) return fixed('UNCERTAIN', 'CHILD')
  const expected = `${phase}_PASS\n`
  return stdout.toString('utf8') === expected ? fixed('PASS') : fixed('UNCERTAIN', 'OUTPUT')
}

export function runFixtureRecoverySession({ journal, identity, preflight, preDispatch, runNative,
  reconcileMain, reconcileSidecar, reconcileFinal, now = Date.now } = {}) {
  if (!journal || ['read', 'start', 'advance', 'finish'].some(name => typeof journal[name] !== 'function')
    || typeof preflight !== 'function' || typeof preDispatch !== 'function'
    || typeof runNative !== 'function'
    || typeof reconcileMain !== 'function' || typeof reconcileSidecar !== 'function'
    || typeof reconcileFinal !== 'function' || typeof now !== 'function') fail()
  if (journal.read()) return fixed('HOLD', 'REPLAY')
  let record, childMayHaveStarted = false
  const terminal = (outcome, category) => { journal.finish(record, outcome); return fixed(outcome, category) }
  try {
    record = journal.start(identity)
    if (!preflight()) return terminal('HOLD', 'PREFLIGHT')
    const afterPreflight = now()
    if (!Number.isFinite(afterPreflight) || afterPreflight < Date.parse(record.startedAt)
      || afterPreflight >= Date.parse(record.phaseDeadlineAt)
      || afterPreflight >= Date.parse(record.runDeadlineAt)) return terminal('HOLD', 'DEADLINE')
    const reconciliations = [reconcileMain, reconcileSidecar]
    for (const [index, [phase, childLimit]] of phases.entries()) {
      const before = now()
      if (!Number.isFinite(before) || before < Date.parse(record.startedAt)
        || before >= Date.parse(record.phaseDeadlineAt)
        || before + childLimit + 1_000 >= Date.parse(record.runDeadlineAt)) return terminal('HOLD', 'DEADLINE')
      record = journal.advance(record, phase)
      const afterIntent = now()
      if (!Number.isFinite(afterIntent) || afterIntent < before
        || afterIntent + childLimit + 1_000 >= Date.parse(record.phaseDeadlineAt)
        || afterIntent + childLimit + 1_000 >= Date.parse(record.runDeadlineAt)) return terminal('HOLD', 'DEADLINE')
      if (preDispatch(phase) !== true) return terminal('HOLD', 'BUILD')
      const readyAt = now()
      if (!Number.isFinite(readyAt) || readyAt < afterIntent
        || readyAt + childLimit + 1_000 >= Date.parse(record.phaseDeadlineAt)
        || readyAt + childLimit + 1_000 >= Date.parse(record.runDeadlineAt)) return terminal('HOLD', 'DEADLINE')
      childMayHaveStarted = true
      const result = runNative(phase, childLimit)
      const after = now()
      if (result?.status !== 'PASS' || !Number.isFinite(after) || after < afterIntent
        || after > Date.parse(record.phaseDeadlineAt) || after > Date.parse(record.runDeadlineAt)) {
        return terminal('UNCERTAIN', 'CHILD')
      }
      childMayHaveStarted = false
      if (index < reconciliations.length && reconciliations[index]() !== true) {
        return terminal('HOLD', 'RECONCILIATION')
      }
      const afterReconciliation = now()
      if (!Number.isFinite(afterReconciliation) || afterReconciliation < after
        || afterReconciliation >= Date.parse(record.phaseDeadlineAt)
        || afterReconciliation >= Date.parse(record.runDeadlineAt)) return terminal('HOLD', 'DEADLINE')
    }
    if (now() >= Date.parse(record.phaseDeadlineAt)) return terminal('HOLD', 'DEADLINE')
    record = journal.advance(record, 'FINAL_RECONCILIATION')
    if (reconcileFinal() !== true || now() > Date.parse(record.phaseDeadlineAt)
      || now() > Date.parse(record.runDeadlineAt)) return terminal('HOLD', 'RECONCILIATION')
    return terminal('PASS', null)
  } catch {
    const outcome = childMayHaveStarted ? 'UNCERTAIN' : 'HOLD'
    try { if (record?.outcome === null) journal.finish(record, outcome) } catch { /* preserve intent */ }
    return fixed(outcome, childMayHaveStarted ? 'CHILD' : 'PREFLIGHT')
  }
}
