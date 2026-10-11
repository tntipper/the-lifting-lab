import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStagingGeneration23PredecessorJournal,
  STAGING_GENERATION_23_PREDECESSOR_JOURNAL_ENABLED } from '../scripts/staging-generation-23-predecessor-journal.mjs'

const id = '11111111-1111-4111-8111-111111111111'
const digest = 'a'.repeat(64)
function fixture() {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-gen23-predecessor-')), 'record.json')
  const journal = createStagingGeneration23PredecessorJournal({ path, makeRunId: () => id,
    now: () => Date.parse('2026-09-26T20:00:00.000Z') })
  return { path, journal }
}

test('one read has a private dispatch record before it can pass and cannot replay', () => {
  assert.equal(STAGING_GENERATION_23_PREDECESSOR_JOURNAL_ENABLED, false)
  const { path, journal } = fixture()
  const claim = journal.claim()
  assert.equal(claim.state, 'CLAIMED')
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.throws(() => journal.finish(claim, 'PASS_RETIRED', digest), /unavailable/)
  const dispatched = journal.dispatch(claim)
  assert.equal(dispatched.state, 'DISPATCHED')
  assert.throws(() => journal.dispatch(claim), /unavailable/)
  const final = journal.finish(dispatched, 'PASS_RETIRED', digest)
  assert.equal(final.state, 'FINISHED')
  assert.equal(final.receiptSha256, digest)
  assert.throws(() => journal.claim(), /unavailable/)
  assert.throws(() => journal.finish(dispatched, 'PASS_RETIRED', digest), /unavailable/)
  assert.doesNotMatch(readFileSync(path, 'utf8'), /sbp_|password|token|secret|value/i)
})

test('an unavailable read consumes the claim and a lost reply keeps dispatch visible', () => {
  const first = fixture().journal
  const claim = first.claim()
  const unavailable = first.finish(claim, 'READ_UNAVAILABLE')
  assert.equal(unavailable.outcome, 'READ_UNAVAILABLE')
  assert.equal(unavailable.receiptSha256, null)
  assert.throws(() => first.claim(), /unavailable/)

  const second = fixture()
  second.journal.dispatch(second.journal.claim())
  const foreign = createStagingGeneration23PredecessorJournal({ path: second.path })
  assert.equal(foreign.read().state, 'DISPATCHED')
  assert.throws(() => foreign.claim(), /unavailable/)
  assert.throws(() => foreign.finish(foreign.read(), 'PASS_RETIRED', digest), /unavailable/)
})

test('altered or broad-access records fail closed', () => {
  const { path, journal } = fixture()
  const claim = journal.claim()
  writeFileSync(path, JSON.stringify({ ...claim, projectRef: 'wrhgscovsgsudtedbljr' }), { mode: 0o600 })
  assert.throws(() => journal.read(), /unavailable/)
  assert.throws(() => journal.dispatch(claim), /unavailable/)
  const other = fixture()
  other.journal.claim()
  const file = other.path
  const stat = statSync(file)
  assert.equal(stat.mode & 0o777, 0o600)
  chmodSync(file, 0o644)
  assert.throws(() => other.journal.read(), /unavailable/)
})
