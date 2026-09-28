import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, chmodSync, lstatSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStagingPreviewDeploymentJournal, STAGING_PREVIEW_DEPLOYMENT_JOURNAL_ENABLED } from '../scripts/staging-surface-preview-deployment-journal.mjs'

const input = Object.freeze({ branch: 'codex/tll-integration', sourceCommit: 'a'.repeat(40),
  manifestSha256: 'b'.repeat(64), publicCustomer: false, publicCart: false })
const runId = '85af5555-aaaa-4bbb-8ccc-777777777777'
function fixture() {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-preview-journal-')), 'private', 'journal.json')
  const journal = createStagingPreviewDeploymentJournal({ path, makeRunId: () => runId,
    now: () => Date.parse('2026-09-25T12:00:00.000Z') })
  return { path, journal }
}

test('one-use journal persists claim, dispatch, accepted ID and verified result with owner-only permissions', () => {
  assert.equal(STAGING_PREVIEW_DEPLOYMENT_JOURNAL_ENABLED, false)
  const { path, journal } = fixture()
  const claimed = journal.claim(input)
  assert.equal(claimed.phase, 'CLAIMED')
  assert.equal(lstatSync(path).mode & 0o777, 0o600)
  assert.equal(lstatSync(join(path, '..')).mode & 0o777, 0o700)
  const dispatched = journal.dispatch(claimed)
  assert.equal(journal.read().phase, 'POST_DISPATCH')
  const accepted = journal.accepted(dispatched, 'dpl_new123')
  assert.equal(accepted.deploymentId, 'dpl_new123')
  const verified = journal.verified(accepted)
  assert.equal(verified.phase, 'VERIFIED')
  assert.deepEqual(journal.read(), verified)
  assert.throws(() => journal.claim(input), /unavailable/)
  assert.throws(() => journal.dispatch(claimed), /unavailable/)
  assert.doesNotMatch(readFileSync(path, 'utf8'), /token|bypass|password|secret/i)
})

test('pre-dispatch hold is terminal; wrong transition or ID cannot rewrite the record', () => {
  const { journal } = fixture(), claimed = journal.claim(input)
  assert.throws(() => journal.accepted(claimed, 'dpl_new123'), /unavailable/)
  assert.throws(() => journal.dispatch({ ...claimed, sourceCommit: 'c'.repeat(40) }), /unavailable/)
  const held = journal.holdBeforeDispatch(claimed)
  assert.equal(held.phase, 'HOLD_PRE_DISPATCH')
  assert.throws(() => journal.dispatch(held), /unavailable/)
  assert.throws(() => journal.claim(input), /unavailable/)
  const second = fixture(), start = second.journal.claim(input), dispatch = second.journal.dispatch(start)
  assert.throws(() => second.journal.accepted(dispatch, 'wrong-id'), /unavailable/)
  assert.equal(second.journal.read().phase, 'POST_DISPATCH')
})

test('another journal instance cannot take over a claimed attempt', () => {
  const { path, journal } = fixture(), claimed = journal.claim(input)
  const other = createStagingPreviewDeploymentJournal({ path, makeRunId: () => runId })
  assert.throws(() => other.claim(input), /unavailable/)
  assert.throws(() => other.dispatch(claimed), /unavailable/)
})

test('file permissions, content tampering and a symbolic link fail closed', () => {
  const loose = fixture(), claimed = loose.journal.claim(input)
  chmodSync(loose.path, 0o644)
  assert.throws(() => loose.journal.dispatch(claimed), /unavailable/)
  const tampered = fixture(), record = tampered.journal.claim(input)
  writeFileSync(tampered.path, JSON.stringify({ ...record, sourceCommit: 'c'.repeat(40) }))
  assert.throws(() => tampered.journal.dispatch(record), /unavailable/)
  const linked = fixture(), target = join(mkdtempSync(join(tmpdir(), 'tll-preview-target-')), 'target')
  writeFileSync(target, 'not a journal')
  mkdirSync(join(linked.path, '..'), { recursive: true, mode: 0o700 })
  symlinkSync(target, linked.path)
  assert.throws(() => linked.journal.claim(input), /unavailable/)
})
