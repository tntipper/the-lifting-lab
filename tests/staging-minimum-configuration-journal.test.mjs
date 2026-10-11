import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStagingMinimumConfigurationJournal,
  STAGING_MINIMUM_CONFIGURATION_JOURNAL_PATH } from '../scripts/staging-minimum-configuration-journal.mjs'

const journal = () => {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-minimum-journal-')), 'journal.json')
  return { path, value: createStagingMinimumConfigurationJournal({ path }) }
}

test('new Supabase read has its own journal path and stores only a result digest', () => {
  assert.match(STAGING_MINIMUM_CONFIGURATION_JOURNAL_PATH, /tll-minimum-configuration-supabase-v1\.json$/)
  const { path, value } = journal(), claim = value.claim()
  assert.equal(claim.state, 'CLAIMED')
  assert.equal(statSync(path).mode & 0o777, 0o600)
  const outcome = { status: 'DISABLED_BASELINE_OBSERVED', projectRef: 'qdmvngjwkcsilzmqksme' }
  const final = value.finish(claim, outcome.status, outcome)
  assert.equal(final.state, 'FINISHED')
  assert.match(final.resultSha256, /^[a-f0-9]{64}$/)
  assert.doesNotMatch(readFileSync(path, 'utf8'), /secret|password|token/i)
  assert.throws(() => createStagingMinimumConfigurationJournal({ path }).claim(), /unavailable/)
})

test('an interrupted or tampered record cannot be replayed', () => {
  const { path, value } = journal()
  value.claim()
  assert.throws(() => createStagingMinimumConfigurationJournal({ path }).claim(), /unavailable/)
  writeFileSync(path, '{"state":"CLAIMED"}\n', { mode: 0o600 })
  assert.throws(() => value.read(), /unavailable/)
})
