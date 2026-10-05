import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStagingPreviewEnvironmentJournal, STAGING_PREVIEW_ENVIRONMENT_JOURNAL_PATH } from '../scripts/staging-preview-environment-journal.mjs'

test('successor journal uses a fresh v2 path while v1 remains terminal', () => {
  assert.match(STAGING_PREVIEW_ENVIRONMENT_JOURNAL_PATH, /tll-preview-environment-inventory-v2\.json$/)
})

const now = () => Date.parse('2026-09-26T10:00:00.000Z')
const journal = () => {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-preview-inventory-')), 'journal.json')
  return { path, value: createStagingPreviewEnvironmentJournal({ path, now,
    makeRunId: () => '84d5c9d2-2b9a-4b92-a1c3-d884f2740177' }) }
}

test('claim is durable and exclusive before any credential read; finish records only a digest', () => {
  const { path, value } = journal(), claim = value.claim()
  assert.equal(claim.state, 'CLAIMED'); assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.throws(() => value.claim(), /unavailable/)
  const result = { status: 'HOLD', missing: ['TLL_STAGING_CUSTOMER_DATABASE_PASSWORD'] }
  const final = value.finish(claim, 'HOLD', result)
  assert.equal(final.state, 'FINISHED'); assert.match(final.resultSha256, /^[a-f0-9]{64}$/)
  assert.doesNotMatch(readFileSync(path, 'utf8'), /DATABASE_PASSWORD|secret|token/i)
  assert.throws(() => value.finish(claim, 'HOLD', result), /unavailable/)
  assert.throws(() => createStagingPreviewEnvironmentJournal({ path }).claim(), /unavailable/)
})

test('a failed or interrupted read remains unreplayable', () => {
  const interrupted = journal(); interrupted.value.claim()
  assert.equal(interrupted.value.read().state, 'CLAIMED')
  assert.throws(() => createStagingPreviewEnvironmentJournal({ path: interrupted.path }).claim(), /unavailable/)
  const failed = journal(), claim = failed.value.claim()
  const final = failed.value.finish(claim, 'READ_UNAVAILABLE', null)
  assert.equal(final.resultSha256, null); assert.equal(failed.value.read().outcome, 'READ_UNAVAILABLE')
})

test('tampered journal fails closed', () => {
  const { path, value } = journal(); value.claim()
  writeFileSync(path, '{"state":"CLAIMED"}\n', { mode: 0o600 })
  assert.throws(() => value.read(), /unavailable/)
  assert.throws(() => value.claim(), /unavailable/)
})
