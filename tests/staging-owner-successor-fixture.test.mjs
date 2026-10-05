import test from 'node:test'
import assert from 'node:assert/strict'
import { createSuccessorFixtureJournal, SUCCESSOR_PHASES, SHUTDOWN_PHASES, FIXTURE_CHECKS,
  SHUTDOWN_RESERVE_MS, PHASE_BUDGET_MS } from '../scripts/staging-owner-successor-fixture.mjs'
const start = Date.parse('2026-10-05T14:00:00.000Z')
const plan = () => ({ windowId: '0644f1f6-a9c5-4dd3-8124-78cbd85fa671', sourceSha: 'a'.repeat(40),
  startedAtMs: start, expiresAtMs: start + 60 * 60_000 })
const proof = (phase, p = plan()) => ({ phase, windowId: p.windowId, sourceSha: p.sourceSha,
  receiptSha256: 'b'.repeat(64), checks: Object.fromEntries(FIXTURE_CHECKS[phase].map(k => [k, true])) })
function through(target) {
  const journal = createSuccessorFixtureJournal(plan())
  let record = journal.begin(), now = start
  for (const phase of SUCCESSOR_PHASES) {
    record = journal.dispatch(record, phase, ++now)
    if (phase === target) return { journal, record, now }
    record = journal.observe(record, proof(phase), ++now)
  }
  return { journal, record, now }
}
test('complete fixture includes existing MyStack and checkout obligations, but grants no authority', () => {
  const { record, journal } = through()
  assert.equal(record.state, 'FIXTURE_PASS')
  assert.equal(record.authorization, 'NONE')
  assert.equal(record.provenance, 'UNVERIFIED_FIXTURE')
  assert.equal(record.historicalWholeRouteOutcome, 'UNKNOWN')
  assert.deepEqual(record.entries.map(e => e.phase), SUCCESSOR_PHASES)
  assert.ok(record.entries.every(e => e.state === 'OBSERVED'))
  assert.throws(() => journal.begin())
  assert.throws(() => journal.dispatch(record, 'baseline', start + 50))
})
for (const phase of SUCCESSOR_PHASES) {
  test(`${phase}: malformed or incomplete proof cannot advance; dispatch stays consumed`, () => {
    const { journal, record, now } = through(phase)
    for (const field of Object.keys(proof(phase))) {
      const value = proof(phase); delete value[field]
      assert.throws(() => journal.observe(record, value, now + 1))
    }
    for (const key of FIXTURE_CHECKS[phase]) {
      const value = proof(phase); value.checks[key] = false
      assert.throws(() => journal.observe(record, value, now + 1))
    }
    for (const delta of [{ windowId: plan().sourceSha }, { sourceSha: 'c'.repeat(40) },
      { receiptSha256: 'not-a-digest' }, { extra: 'unstructured secret' }]) {
      assert.throws(() => journal.observe(record, { ...proof(phase), ...delta }, now + 1))
    }
    assert.throws(() => journal.dispatch(record, phase, now + 1))
    const held = journal.hold(record, now + 1)
    assert.equal(held.state, 'SHUTDOWN_REQUIRED')
    assert.equal(held.entries.at(-1).state, 'DISPATCHED')
    if (SHUTDOWN_PHASES.includes(phase)) assert.throws(() => journal.recover(held, now + 2))
    else {
      let recovering = journal.recover(held, now + 2), t = now + 2
      for (const shutdown of SHUTDOWN_PHASES) {
        recovering = journal.dispatch(recovering, shutdown, ++t)
        recovering = journal.observe(recovering, proof(shutdown), ++t)
      }
      assert.equal(recovering.state, 'FIXTURE_FAILURE_SHUTDOWN')
      assert.equal(recovering.authorization, 'NONE')
      assert.ok(recovering.entries.some(e => e.state === 'DISPATCHED'))
    }
  })
}
test('reserve stops new work and preserves all four shutdown phases', () => {
  const { journal, record } = through('settings')
  const held = journal.hold(record, start + 100)
  let recovery = journal.recover(held, start + 101)
  const now = plan().expiresAtMs - SHUTDOWN_RESERVE_MS
  recovery = journal.dispatch(recovery, 'backendDisable', now)
  assert.equal(recovery.pending, 'backendDisable')
  const fresh = createSuccessorFixtureJournal(plan()), initial = fresh.begin()
  const denied = fresh.dispatch(initial, 'baseline', now)
  assert.equal(denied.state, 'HOLD'); assert.equal(denied.entries.length, 0)
})
test('loss of reserve after completed setup enters shutdown without dispatching another write', () => {
  const { journal, record, now } = through('settings')
  const observed = journal.observe(record, proof('settings'), now + 1)
  const held = journal.dispatch(observed, 'databaseSetup', plan().expiresAtMs - SHUTDOWN_RESERVE_MS)
  assert.equal(held.state, 'SHUTDOWN_REQUIRED')
  assert.equal(held.pending, null)
  assert.equal(held.entries.at(-1).phase, 'settings')
})
for (const phase of ['surfaceEnable', 'ownerJourney']) {
  test(`${phase}: separate build/check or owner budget cannot overrun`, () => {
    const { journal, record, now } = through(phase)
    const budget = phase === 'surfaceEnable' ? 12 : 9
    assert.throws(() => journal.observe(record, proof(phase), now + budget * 60_000 + 1))
    assert.equal(journal.hold(record, now + budget * 60_000 + 1).state, 'SHUTDOWN_REQUIRED')
  })
}
test('old identities, invalid horizons, foreign snapshots and expired clocks fail closed', () => {
  for (const windowId of ['759bc8ed-5ecd-475c-8a4c-e35fcf628a73', 'd5180b08-79ee-43e8-96d4-4f73621fecbf', 'unknown'])
    assert.throws(() => createSuccessorFixtureJournal({ ...plan(), windowId }))
  for (const expiresAtMs of [start + 44 * 60_000, start + 61 * 60_000, Infinity])
    assert.throws(() => createSuccessorFixtureJournal({ ...plan(), expiresAtMs }))
  const { journal, record, now } = through('baseline')
  assert.throws(() => journal.observe({ ...record }, proof('baseline'), now + 1))
  assert.throws(() => journal.observe(record, proof('baseline'), now - 1))
  assert.throws(() => journal.observe(record, proof('baseline'), plan().expiresAtMs))
  assert.throws(() => { record.entries.at(-1).state = 'OBSERVED' })
})

test('completed shutdown phases cannot be restarted after an interruption between phases', () => {
  const { journal, record, now } = through('backendDisable')
  const observed = journal.observe(record, proof('backendDisable'), now + 1)
  const held = journal.hold(observed, now + 2)
  assert.throws(() => journal.recover(held, now + 3))
  assert.throws(() => journal.dispatch(held, 'backendDisable', now + 3))
})

for (const phase of ['surfaceEnable', 'ownerJourney']) {
  test(`${phase}: entire phase budget plus shutdown reserve is required before dispatch`, () => {
    const previous = SUCCESSOR_PHASES[SUCCESSOR_PHASES.indexOf(phase) - 1]
    const { journal, record, now } = through(previous)
    const ready = journal.observe(record, proof(previous), now + 1)
    const threshold = plan().expiresAtMs - SHUTDOWN_RESERVE_MS - PHASE_BUDGET_MS[phase]
    const held = journal.dispatch(ready, phase, threshold)
    assert.equal(held.state, 'SHUTDOWN_REQUIRED'); assert.equal(held.pending, null)
    assert.equal(held.entries.at(-1).phase, previous)
    const fresh = through(previous)
    const ready2 = fresh.journal.observe(fresh.record, proof(previous), fresh.now + 1)
    const dispatched = fresh.journal.dispatch(ready2, phase, threshold - 1)
    assert.equal(dispatched.pending, phase)
    const observed = fresh.journal.observe(dispatched, proof(phase), threshold - 1 + PHASE_BUDGET_MS[phase])
    assert.equal(observed.pending, null)
  })
}
