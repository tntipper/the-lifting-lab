import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOwnerSuccessorWholeRouteJournal,
  OWNER_SUCCESSOR_NATIVE_WHOLE_ROUTE_JOURNAL_ENABLED,
  WHOLE_ROUTE_STAGING_TARGET } from '../scripts/staging-owner-successor-whole-route-journal.mjs'
import { PHASES } from '../scripts/staging-owner-successor-whole-run.mjs'

const runId = '11111111-1111-4111-8111-111111111111'
const now = () => Date.parse('2026-09-27T10:00:00.000Z')
const path = () => join(mkdtempSync(join(tmpdir(), 'tll-gen23-whole-route-')), 'record.json')

import { successorFixtureModules } from './fixtures/owner-successor-native-modules.mjs'
const startedAt = '2026-09-27T10:00:00.000Z', expiresAt = '2026-09-27T10:45:00.000Z'
const identity = { windowId: 'cd4130c8-a8b8-462b-bdbe-5c3e6250a02d', sourceCommit: 'a'.repeat(40), executionCommit: 'b'.repeat(40), manifestSha256: 'c'.repeat(64), startedAt, expiresAt }
const fixture = await successorFixtureModules({ startedAt, expiresAt })
const armed = () => fixture.import('staging-owner-successor-whole-route-journal.mjs')

test('whole-route journal is disabled by default and fixes its staging target', () => {
  assert.equal(OWNER_SUCCESSOR_NATIVE_WHOLE_ROUTE_JOURNAL_ENABLED, false)
  assert.equal(WHOLE_ROUTE_STAGING_TARGET, 'tll-stage3-protected-staging')
  assert.throws(() => createOwnerSuccessorWholeRouteJournal({ path: path() }), /unavailable/)
})

test('records each fixed phase dispatch and verification through a terminal pass', async () => {
  const { createOwnerSuccessorWholeRouteJournal: create } = await armed()
  const location = path(), journal = create({ identity, path: location, makeRunId: () => runId, now })
  let record = journal.claim()
  assert.equal(statSync(location).mode & 0o777, 0o600)
  assert.equal(record.phases[0].summary, 'BASELINE_DISPATCHED')
  for (const [index, phase] of PHASES.entries()) {
    assert.equal(record.pendingPhase, phase)
    assert.throws(() => journal.verify(record, PHASES[index + 1] ?? 'wrong'), /unavailable/)
    record = journal.verify(record, phase)
    if (index + 1 < PHASES.length) record = journal.dispatch(record, PHASES[index + 1])
  }
  assert.equal(record.state, 'PASS')
  assert.equal(record.pendingPhase, null)
  assert.equal(record.phases.length, PHASES.length)
  assert.equal(record.phases.at(-1).summary, 'FINALREADBACK_VERIFIED')
  assert.doesNotMatch(readFileSync(location, 'utf8'), /https?:|password|token|email|@/i)
  assert.throws(() => journal.dispatch(record, PHASES[0]), /unavailable/)
  assert.throws(() => create({ identity, path: location, now }).claim(), /unavailable/)
})

test('known owner failure continues through shutdown and never becomes PASS', async () => {
  const { createOwnerSuccessorWholeRouteJournal: create } = await armed()
  const location = path(), journal = create({ identity, path: location, makeRunId: () => runId, now })
  let record = journal.claim()
  for (const [index, phase] of PHASES.entries()) {
    if (phase === 'ownerJourney') {
      assert.throws(() => journal.ownerFailure(record, 'unknown'), /unavailable/)
      record = journal.ownerFailure(record, 'OWNER_JOURNEY_FAILED_VERIFIED')
      assert.equal(record.phases.at(-1).state, 'FAILED_VERIFIED')
      assert.equal(record.state, 'ACTIVE')
    } else record = journal.verify(record, phase)
    if (index + 1 < PHASES.length) record = journal.dispatch(record, PHASES[index + 1])
  }
  assert.equal(record.state, 'OWNER_FAILURE_SHUTDOWN_VERIFIED')
  assert.equal(record.phases.at(-1).summary, 'FINALREADBACK_VERIFIED')
  assert.equal(record.phases.find(value => value.phase === 'ownerJourney').reason,
    'OWNER_JOURNEY_FAILED_VERIFIED')
  assert.equal(create({ identity, path: location, now }).read().state, 'OWNER_FAILURE_SHUTDOWN_VERIFIED')
  assert.throws(() => create({ identity, path: location, now }).claim(), /unavailable/)
})

test('owner may be skipped for budget while shutdown continues', async () => {
  const { createOwnerSuccessorWholeRouteJournal: create } = await armed()
  const location = path(), journal = create({ identity, path: location, makeRunId: () => runId, now })
  let record = journal.claim()
  for (const [index, phase] of PHASES.entries()) {
    if (phase === 'ownerJourney') record = journal.skipOwner(record)
    else record = journal.verify(record, phase)
    if (index + 1 < PHASES.length && PHASES[index + 1] !== 'ownerJourney') {
      record = journal.dispatch(record, PHASES[index + 1])
    }
  }
  assert.equal(record.state, 'OWNER_FAILURE_SHUTDOWN_VERIFIED')
  assert.equal(record.phases.find(value => value.phase === 'ownerJourney').state, 'SKIPPED_VERIFIED')
  assert.equal(create({ identity, path: location, now }).read().state, 'OWNER_FAILURE_SHUTDOWN_VERIFIED')
})

test('an unstarted later phase records a terminal hold without claiming an effect', async () => {
  const { createOwnerSuccessorWholeRouteJournal: create } = await armed()
  const location = path(), journal = create({ identity, path: location, makeRunId: () => runId, now })
  const baseline = journal.verify(journal.claim(), 'baseline')
  const held = journal.holdBeforeDispatch(baseline, 'settings')
  assert.equal(held.state, 'HOLD')
  assert.equal(held.phases.at(-1).state, 'NOT_DISPATCHED_HOLD')
  assert.equal(create({ identity, path: location, now }).read().state, 'HOLD')
  assert.throws(() => journal.dispatch(held, 'settings'), /unavailable/)
})

test('an uncertain dispatched phase becomes a terminal hold and cannot replay', async () => {
  const { createOwnerSuccessorWholeRouteJournal: create } = await armed()
  const location = path(), journal = create({ identity, path: location, makeRunId: () => runId, now })
  const claimed = journal.claim()
  const held = journal.hold(claimed, 'baseline')
  assert.equal(held.state, 'HOLD')
  assert.deepEqual(held.phases, [{ phase: 'baseline', state: 'HOLD', summary: 'BASELINE_HOLD' }])
  assert.throws(() => journal.verify(claimed, 'baseline'), /unavailable/)
  assert.throws(() => create({ identity, path: location, now }).claim(), /unavailable/)
  assert.equal(create({ identity, path: location, now }).read().state, 'HOLD')
})

test('well-shaped alteration, partial write and unknown record fail closed', async () => {
  const { createOwnerSuccessorWholeRouteJournal: create } = await armed()
  const location = path(), journal = create({ identity, path: location, makeRunId: () => runId, now })
  const claimed = journal.claim()
  const changed = { ...claimed, updatedAt: '2026-09-27T10:00:01.000Z' }
  writeFileSync(location, `${JSON.stringify(changed)}\n`, { mode: 0o600 })
  assert.throws(() => journal.verify(claimed, 'baseline'), /unavailable/)

  const partialPath = path()
  const actualFs = await import('node:fs')
  const failingFs = new Proxy(actualFs, { get(target, key) {
    if (key === 'writeSync') return () => 0
    return target[key]
  } })
  const partial = create({ identity, path: partialPath, fileSystem: failingFs, makeRunId: () => runId, now })
  assert.throws(() => partial.claim(), /unavailable/)
  assert.throws(() => partial.claim(), /unavailable/)
  assert.throws(() => create({ identity, path: partialPath, now }).read(), /unavailable/)
})

test('an interrupted replacement makes the owning process stop and preserves the prior record', async () => {
  const { createOwnerSuccessorWholeRouteJournal: create } = await armed()
  const location = path()
  const actualFs = await import('node:fs')
  const failingFs = new Proxy(actualFs, { get(target, key) {
    if (key === 'renameSync') return () => { throw new Error('injected rename failure') }
    return target[key]
  } })
  const journal = create({ identity, path: location, fileSystem: failingFs, makeRunId: () => runId, now })
  const claimed = journal.claim()
  assert.throws(() => journal.verify(claimed, 'baseline'), /injected rename failure/)
  assert.equal(create({ identity, path: location, now }).read().state, 'ACTIVE')
  assert.throws(() => journal.hold(claimed, 'baseline'), /unavailable/)
})
