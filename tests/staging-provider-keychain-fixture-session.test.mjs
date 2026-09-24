import test from 'node:test'
import assert from 'node:assert/strict'
import { assessFixtureNativeReceipt, classifyFixtureNative, runFixtureSession } from '../scripts/staging-provider-keychain-fixture-session.mjs'

const start = Date.parse('2026-09-24T18:00:00.000Z')
function fixture({ existing = false, preflight = () => true, runNative = () => ({ status: 'PASS' }),
  reconcile = () => true, now = () => start } = {}) {
  const calls = []
  let record = existing ? { outcome: 'PASS' } : null
  const journal = {
    read: () => record,
    start: () => { calls.push('start'); record = { startedAt: new Date(start).toISOString(),
      phaseDeadlineAt: new Date(start + 15_000).toISOString(),
      runDeadlineAt: new Date(start + 90_000).toISOString(), outcome: null }; return record },
    advance: (prior, phase) => { calls.push(phase); record = { ...prior, phase,
      phaseDeadlineAt: new Date(start + (phase === 'NATIVE_ATTEMPT' ? 65_000 : 75_000)).toISOString() }; return record },
    finish: (prior, outcome) => { calls.push(outcome); record = { ...prior, outcome }; return record },
  }
  const result = runFixtureSession({ journal, preflight: () => { calls.push('preflight'); return preflight() },
    runNative: () => { calls.push('native'); return runNative() },
    reconcile: () => { calls.push('reconcile'); return reconcile() }, now })
  return { result, calls, record }
}

test('fixture session performs one native attempt after a private intent and reconciles', () => {
  const run = fixture()
  assert.deepEqual(run.result, { status: 'PASS', category: null })
  assert.deepEqual(run.calls, ['start', 'preflight', 'NATIVE_ATTEMPT', 'native',
    'LOCAL_RECONCILIATION', 'reconcile', 'PASS'])
})

test('fixture session refuses replay and failed preflight before native work', () => {
  assert.deepEqual(fixture({ existing: true }).calls, [])
  const failed = fixture({ preflight: () => false })
  assert.deepEqual(failed.result, { status: 'HOLD', category: 'PREFLIGHT' })
  assert.deepEqual(failed.calls, ['start', 'preflight', 'HOLD'])
})

test('fixture session holds a known native failure after read-only reconciliation', () => {
  const failed = fixture({ runNative: () => ({ status: 'HOLD' }) })
  assert.deepEqual(failed.result, { status: 'HOLD', category: 'NATIVE' })
  assert.equal(failed.calls.filter(call => call === 'native').length, 1)
  const leftover = fixture({ reconcile: () => false })
  assert.deepEqual(leftover.result, { status: 'HOLD', category: 'CLEANUP' })
})

test('fixture timeout or native exception is terminal uncertainty without cleanup or replay', () => {
  for (const runNative of [() => ({ status: 'UNCERTAIN' }), () => { throw Error('lost') }]) {
    const run = fixture({ runNative })
    assert.deepEqual(run.result, { status: 'UNCERTAIN', category: 'NATIVE' })
    assert.equal(run.calls.includes('reconcile'), false)
    assert.equal(run.calls.at(-1), 'UNCERTAIN')
  }
})

test('fixture deadline prevents dispatch when the available window is too short', () => {
  const run = fixture({ now: () => start + 31_000 })
  assert.deepEqual(run.result, { status: 'HOLD', category: 'DEADLINE' })
  assert.equal(run.calls.includes('native'), false)
})

test('fixture rechecks the deadline after persisting native intent', () => {
  let tick = 0
  const run = fixture({ now: () => start + (tick++ === 0 ? 0 : 10_000) })
  assert.deepEqual(run.result, { status: 'HOLD', category: 'DEADLINE' })
  assert.equal(run.calls.includes('native'), false)
})

test('fixture cannot report PASS after slow local reconciliation', () => {
  let tick = 0
  const run = fixture({ now: () => start + (tick++ < 3 ? 0 : 76_000) })
  assert.deepEqual(run.result, { status: 'HOLD', category: 'DEADLINE' })
  assert.equal(run.calls.includes('reconcile'), true)
  assert.equal(run.calls.at(-1), 'HOLD')
})

test('fixture native result parser requires exact categories and completed cleanup', () => {
  const successful = { schema: 'tll-stage3-keychain-fixture/v1', setup: 'PASS',
    allowed: 'SUCCESS', missing: 'ITEM_MISSING', denied: 'INTERACTION_REQUIRED',
    locked: 'INTERACTION_REQUIRED', allowedExact: 'PASS', cleanup: 'PASS' }
  const result = (value, status = 0) => classifyFixtureNative({ status, signal: null, error: null,
    stdout: Buffer.from(`${JSON.stringify(value)}\n`), stderr: Buffer.alloc(0) })
  assert.deepEqual(result(successful), { status: 'PASS', category: null })
  assert.deepEqual(result({ ...successful, cleanup: 'HOLD' }), { status: 'HOLD', category: 'NATIVE' })
  assert.deepEqual(result({ ...successful, extra: 'unreviewed' }), { status: 'HOLD', category: 'FORMAT' })
  assert.deepEqual(result({ ...successful, denied: 'SUCCESS' }), { status: 'HOLD', category: 'NATIVE' })
  assert.deepEqual(result(successful, 31), { status: 'HOLD', category: 'NATIVE' })
  assert.deepEqual(classifyFixtureNative({ status: null, signal: 'SIGTERM', error: null,
    stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }), { status: 'UNCERTAIN', category: 'NATIVE' })
})

test('fixture native receipt must match the parent identity and complete cleanup', () => {
  const parent = { runId: '5a83b4b0-7ab2-4349-9f12-0123456789ab',
    sourceSha256: 'a'.repeat(64), fixtureSha256: 'b'.repeat(64), binarySha256: 'c'.repeat(64),
    startedAt: '2026-09-24T18:00:00.000Z', runDeadlineAt: '2026-09-24T18:01:30.000Z',
    phaseDeadlineAt: '2026-09-24T18:01:05.000Z' }
  const value = { schema: 'tll-stage3-disposable-keychain-native/v1', runId: parent.runId,
    sourceSha256: parent.sourceSha256, fixtureSha256: parent.fixtureSha256,
    binarySha256: parent.binarySha256, runDeadlineAt: parent.runDeadlineAt,
    phaseDeadlineAt: parent.phaseDeadlineAt,
    sequence: 21, operation: 'CLEANUP', status: 'COMPLETE',
    updatedAt: '2026-09-24T18:00:12.123Z', outcome: 'PASS', category: 'PASS' }
  assert.equal(assessFixtureNativeReceipt(value, parent), 'PASS')
  for (const changed of [{ ...value, binarySha256: 'd'.repeat(64) },
    { ...value, sequence: 20, status: 'INTENT', outcome: null, category: null },
    { ...value, operation: 'READ_DENIED' },
    { ...value, updatedAt: '2026-09-24T18:01:31.000Z' },
    { ...value, extra: true }]) assert.equal(assessFixtureNativeReceipt(changed, parent), 'HOLD')
})
