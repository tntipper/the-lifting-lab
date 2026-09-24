/** Injected-only coordinator; never imports or invokes native Keychain code. */
export const FIXTURE_SESSION_DEADLINE_MS = 90_000
const nativeCategories = new Set(['NOT_RUN', 'SUCCESS', 'INTERACTION_REQUIRED', 'AUTHENTICATION_FAILED',
  'ITEM_MISSING', 'KEYCHAIN_UNAVAILABLE', 'CONFIGURATION_FAILED', 'DECODE_FAILED', 'CANCELLED',
  'INVALID_OUTPUT', 'INTERACTION_CONTROL_FAILED', 'RESTORATION_FAILED', 'OUTPUT_FAILED', 'UNCLASSIFIED'])
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const fixed = (status, category = null) => Object.freeze({ status, category })
const fail = () => { throw Error('Disposable Keychain fixture session unavailable') }

export function classifyFixtureNative({ status, signal, error, stdout, stderr } = {}) {
  if (error || signal) return fixed('UNCERTAIN', 'NATIVE')
  if (![0, 30, 31, 32].includes(status) || !Buffer.isBuffer(stdout)
    || !Buffer.isBuffer(stderr) || stderr.length !== 0 || stdout.length > 1_024) return fixed('HOLD', 'FORMAT')
  let value
  try { value = JSON.parse(stdout.toString('utf8')) } catch { return fixed('HOLD', 'FORMAT') }
  if (!exact(value, ['schema', 'setup', 'allowed', 'missing', 'denied', 'locked', 'allowedExact', 'cleanup'])
    || value.schema !== 'tll-stage3-keychain-fixture/v1'
    || !['PASS', 'HOLD'].includes(value.setup)
    || !['NOT_RUN', 'PASS', 'FAIL'].includes(value.allowedExact)
    || !['NOT_RUN', 'PASS', 'HOLD'].includes(value.cleanup)
    || ['allowed', 'missing', 'denied', 'locked'].some(key => !nativeCategories.has(value[key]))) {
    return fixed('HOLD', 'FORMAT')
  }
  const pass = status === 0 && value.setup === 'PASS' && value.allowed === 'SUCCESS'
    && value.missing === 'ITEM_MISSING' && value.denied === 'INTERACTION_REQUIRED'
    && value.locked === 'INTERACTION_REQUIRED' && value.allowedExact === 'PASS'
    && value.cleanup === 'PASS'
  return fixed(pass ? 'PASS' : 'HOLD', pass ? null : 'NATIVE')
}

const nativeOperations = Object.freeze(['CREATE', 'ALLOWED_ITEM', 'DENIED_ITEM', 'ACL_CHECK',
  'READ_ALLOWED', 'READ_MISSING', 'READ_DENIED', 'LOCK', 'READ_LOCKED', 'UNLOCK', 'CLEANUP'])
const readOperations = new Set(['READ_ALLOWED', 'READ_MISSING', 'READ_DENIED', 'READ_LOCKED'])
export function assessFixtureNativeReceipt(value, parent) {
  if (!exact(value, ['schema', 'runId', 'sourceSha256', 'fixtureSha256', 'binarySha256',
    'runDeadlineAt', 'phaseDeadlineAt', 'sequence', 'operation', 'status', 'updatedAt', 'outcome', 'category'])
    || !parent || value.schema !== 'tll-stage3-disposable-keychain-native/v1'
    || value.runId !== parent.runId || value.sourceSha256 !== parent.sourceSha256
    || value.fixtureSha256 !== parent.fixtureSha256 || value.binarySha256 !== parent.binarySha256
    || value.runDeadlineAt !== parent.runDeadlineAt
    || value.phaseDeadlineAt !== parent.phaseDeadlineAt
    || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || value.sequence > 21
    || !nativeOperations.includes(value.operation)
    || value.status !== (value.sequence % 2 === 0 ? 'INTENT' : 'COMPLETE')
    || (value.status === 'INTENT' ? value.outcome !== null || value.category !== null
      : !['PASS', 'HOLD'].includes(value.outcome)
        || !(readOperations.has(value.operation) ? nativeCategories.has(value.category)
          && value.category !== 'NOT_RUN' : ['PASS', 'HOLD'].includes(value.category)))
    || !Number.isFinite(Date.parse(value.updatedAt))
    || Date.parse(value.updatedAt) < Date.parse(parent.startedAt)
    || Date.parse(value.updatedAt) > Date.parse(parent.runDeadlineAt)
    || Date.parse(value.updatedAt) > Date.parse(parent.phaseDeadlineAt)) return 'HOLD'
  if (value.operation === 'CLEANUP' && value.sequence === 21
    && value.status === 'COMPLETE' && value.outcome === 'PASS'
    && value.category === 'PASS') return 'PASS'
  return 'HOLD'
}

export function runFixtureSession({ journal, identity, preflight, runNative, reconcile, now = Date.now } = {}) {
  if (!journal || ['read', 'start', 'advance', 'finish'].some(name => typeof journal[name] !== 'function')
    || typeof preflight !== 'function' || typeof runNative !== 'function'
    || typeof reconcile !== 'function' || typeof now !== 'function') fail()
  if (journal.read()) return fixed('HOLD', 'REPLAY')
  let record, nativeStarted = false
  try {
    record = journal.start(identity)
    const started = Date.parse(record.startedAt)
    if (!Number.isFinite(started) || !Number.isFinite(Date.parse(record.runDeadlineAt))
      || !Number.isFinite(Date.parse(record.phaseDeadlineAt)) || !preflight()) {
      journal.finish(record, 'HOLD')
      return fixed('HOLD', 'PREFLIGHT')
    }
    const beforeNative = now()
    if (!Number.isFinite(beforeNative) || beforeNative < started
      || beforeNative >= Date.parse(record.phaseDeadlineAt)
      || beforeNative - started > FIXTURE_SESSION_DEADLINE_MS - 60_000) {
      journal.finish(record, 'HOLD')
      return fixed('HOLD', 'DEADLINE')
    }
    record = journal.advance(record, 'NATIVE_ATTEMPT')
    const afterIntent = now()
    if (!Number.isFinite(afterIntent) || afterIntent < beforeNative
      || afterIntent + 61_000 > Date.parse(record.phaseDeadlineAt)
      || afterIntent + 61_000 > Date.parse(record.runDeadlineAt)) {
      journal.finish(record, 'HOLD')
      return fixed('HOLD', 'DEADLINE')
    }
    nativeStarted = true
    const result = runNative()
    if (result?.status === 'UNCERTAIN') {
      journal.finish(record, 'UNCERTAIN')
      return fixed('UNCERTAIN', 'NATIVE')
    }
    const afterNative = now()
    if (!result || !['PASS', 'HOLD'].includes(result.status)
      || !Number.isFinite(afterNative) || afterNative < beforeNative
      || afterNative > Date.parse(record.phaseDeadlineAt)
      || afterNative > Date.parse(record.runDeadlineAt)) {
      journal.finish(record, 'UNCERTAIN')
      return fixed('UNCERTAIN', 'NATIVE')
    }
    const nativeIntent = record
    record = journal.advance(record, 'LOCAL_RECONCILIATION')
    const clean = reconcile(nativeIntent, result)
    const afterReconciliation = now()
    const withinDeadline = Number.isFinite(afterReconciliation) && afterReconciliation >= afterNative
      && afterReconciliation <= Date.parse(record.phaseDeadlineAt)
      && afterReconciliation <= Date.parse(record.runDeadlineAt)
    const outcome = result.status === 'PASS' && clean === true && withinDeadline ? 'PASS' : 'HOLD'
    journal.finish(record, outcome)
    return fixed(outcome, outcome === 'PASS' ? null : !withinDeadline ? 'DEADLINE'
      : clean === true ? 'NATIVE' : 'CLEANUP')
  } catch {
    // Once the child may have started, uncertain effects must not be cleaned up
    // or retried by this coordinator. A separate read-only reconciliation follows.
    const outcome = nativeStarted ? 'UNCERTAIN' : 'HOLD'
    try { if (record?.outcome === null) journal.finish(record, outcome) } catch { /* receipt remains held */ }
    return fixed(outcome, nativeStarted ? 'NATIVE' : 'PREFLIGHT')
  }
}
