import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyRecoveryChild, runFixtureRecoverySession } from '../scripts/staging-provider-keychain-fixture-recovery-session.mjs'

const start = Date.parse('2026-09-24T19:00:00.000Z')
function fixture({ existing = false, preflight = () => true, preDispatch = () => true,
  runNative = () => ({ status: 'PASS' }),
  reconcileMain = () => true, reconcileSidecar = () => true, reconcileFinal = () => true,
  now = () => start } = {}) {
  const calls = []
  let saved = existing ? { outcome: 'PASS' } : null
  const journal = {
    read: () => saved,
    start: () => { calls.push('start'); saved = { startedAt: new Date(start).toISOString(),
      runDeadlineAt: new Date(start + 90_000).toISOString(),
      phaseDeadlineAt: new Date(start + 15_000).toISOString(), outcome: null }; return saved },
    advance: (prior, phase) => { calls.push(phase); saved = { ...prior, phase,
      phaseDeadlineAt: new Date(start + (phase === 'API_DELETE' ? 30_000
        : phase === 'SIDECAR_RECONCILE' ? 45_000 : phase === 'DIRECTORY_REMOVE' ? 55_000 : 65_000)).toISOString() }; return saved },
    finish: (prior, outcome) => { calls.push(outcome); saved = { ...prior, outcome }; return saved },
  }
  const result = runFixtureRecoverySession({ journal, identity: { sourceSha256: 'a'.repeat(64),
    binarySha256: 'b'.repeat(64) }, preflight: () => { calls.push('preflight'); return preflight() },
  preDispatch: phase => preDispatch(phase),
  runNative: phase => { calls.push(`native:${phase}`); return runNative(phase) },
  reconcileMain: () => { calls.push('main'); return reconcileMain() },
  reconcileSidecar: () => { calls.push('sidecar'); return reconcileSidecar() },
  reconcileFinal: () => { calls.push('final'); return reconcileFinal() }, now })
  return { result, calls, saved }
}

test('recovery is ordered, one-use and reconciles between all mutations', () => {
  const run = fixture()
  assert.deepEqual(run.result, { status: 'PASS', category: null })
  assert.deepEqual(run.calls, ['start', 'preflight', 'API_DELETE', 'native:API_DELETE', 'main',
    'SIDECAR_RECONCILE', 'native:SIDECAR_RECONCILE', 'sidecar',
    'DIRECTORY_REMOVE', 'native:DIRECTORY_REMOVE', 'FINAL_RECONCILIATION', 'final', 'PASS'])
  assert.deepEqual(fixture({ existing: true }).result, { status: 'HOLD', category: 'REPLAY' })
})

test('failed preflight or insufficient phase time never dispatches a child', () => {
  assert.deepEqual(fixture({ preflight: () => false }).calls, ['start', 'preflight', 'HOLD'])
  const late = fixture({ now: () => start + 89_000 })
  assert.deepEqual(late.result, { status: 'HOLD', category: 'DEADLINE' })
  assert.equal(late.calls.some(value => value.startsWith('native:')), false)
})

test('a preflight that outlives its own phase cannot renew the deadline', () => {
  let clock = start
  const run = fixture({ preflight: () => { clock += 20_000; return true }, now: () => clock })
  assert.deepEqual(run.result, { status: 'HOLD', category: 'DEADLINE' })
  assert.equal(run.calls.some(value => value.startsWith('native:')), false)
})

test('a slow reconciliation cannot authorize the next native mutation', () => {
  let clock = start
  const run = fixture({ reconcileMain: () => { clock += 31_000; return true }, now: () => clock })
  assert.deepEqual(run.result, { status: 'HOLD', category: 'DEADLINE' })
  assert.equal(run.calls.includes('native:SIDECAR_RECONCILE'), false)
})

test('a slow binary recheck cannot dispatch the native child', () => {
  let clock = start
  const run = fixture({ preDispatch: () => { clock += 31_000; return true }, now: () => clock })
  assert.deepEqual(run.result, { status: 'HOLD', category: 'DEADLINE' })
  assert.equal(run.calls.some(value => value.startsWith('native:')), false)
})

test('failed or uncertain API deletion blocks every later mutation', () => {
  const bad = fixture({ runNative: () => ({ status: 'UNCERTAIN' }) })
  assert.deepEqual(bad.result, { status: 'UNCERTAIN', category: 'CHILD_RESULT' })
  assert.deepEqual(bad.calls, ['start', 'preflight', 'API_DELETE', 'native:API_DELETE', 'UNCERTAIN'])
  const drift = fixture({ reconcileMain: () => false })
  assert.deepEqual(drift.result, { status: 'HOLD', category: 'RECONCILIATION' })
  assert.equal(drift.calls.includes('native:SIDECAR_RECONCILE'), false)
})

test('sidecar reconciliation failure blocks directory removal', () => {
  const run = fixture({ reconcileSidecar: () => false })
  assert.deepEqual(run.result, { status: 'HOLD', category: 'RECONCILIATION' })
  assert.equal(run.calls.includes('native:DIRECTORY_REMOVE'), false)
})

test('child output classifier accepts only the exact fixed phase receipt', () => {
  const phase = 'API_DELETE'
  const output = Buffer.from(`${phase}_PASS\n`)
  assert.deepEqual(classifyRecoveryChild({ status: 0, stdout: output, stderr: Buffer.alloc(0) }, phase),
    { status: 'PASS', category: null })
  assert.equal(classifyRecoveryChild({ status: 0, stdout: Buffer.from('PASS\n'),
    stderr: Buffer.alloc(0) }, phase).status, 'UNCERTAIN')
  assert.equal(classifyRecoveryChild({ status: 0, stdout: output,
    stderr: Buffer.from('unexpected') }, phase).status, 'UNCERTAIN')
  assert.equal(classifyRecoveryChild({ signal: 'SIGTERM' }, phase).status, 'UNCERTAIN')
  assert.deepEqual(classifyRecoveryChild({ status: 30 }, phase),
    { status: 'UNCERTAIN', category: 'NATIVE_HOLD_UNCLASSIFIED' })
  assert.deepEqual(classifyRecoveryChild({ status: 31 }, phase),
    { status: 'UNCERTAIN', category: 'NATIVE_GUARD' })
  assert.deepEqual(classifyRecoveryChild({ error: { code: 'ETIMEDOUT' } }, phase),
    { status: 'UNCERTAIN', category: 'CHILD_TIMEOUT' })
  assert.deepEqual(classifyRecoveryChild({ error: { code: 'ENOENT' } }, phase),
    { status: 'UNCERTAIN', category: 'CHILD_SPAWN' })
  assert.deepEqual(classifyRecoveryChild({ status: 42 }, phase),
    { status: 'UNCERTAIN', category: 'NATIVE_UNKNOWN_EXIT' })
  assert.deepEqual(classifyRecoveryChild({ signal: 'SIGTERM' }, phase),
    { status: 'UNCERTAIN', category: 'CHILD_SIGNAL' })
  assert.deepEqual(fixture({ runNative: () => ({ status: 'UNCERTAIN',
    category: 'NATIVE_HOLD_UNCLASSIFIED' }) }).result,
  { status: 'UNCERTAIN', category: 'NATIVE_HOLD_UNCLASSIFIED' })
  assert.deepEqual(fixture({ runNative: () => ({ status: 'UNCERTAIN',
    category: 'secret from untrusted child' }) }).result,
  { status: 'UNCERTAIN', category: 'CHILD_RESULT' })
})
