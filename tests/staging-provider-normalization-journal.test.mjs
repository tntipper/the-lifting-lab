import test from 'node:test'
import assert from 'node:assert/strict'
import { lstatSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProviderNormalizationJournal, PROVIDER_NORMALIZATION_JOURNAL_ENABLED } from '../scripts/staging-provider-normalization-journal.mjs'

const runId = 'f80746e1-7a8b-4b1a-9c2d-22cd94aaaf31'
const make = path => createProviderNormalizationJournal({ path, makeRunId: () => runId, now: () => 1_789_000_000_000 })
const location = () => join(mkdtempSync(join(tmpdir(), 'tll-provider-normalization-journal-')), 'journal.json')

test('journal records durable intent before one update and permits only ordered terminal phases', () => {
  assert.equal(PROVIDER_NORMALIZATION_JOURNAL_ENABLED, false)
  const path = location(), journal = make(path)
  assert.equal(journal.read(), null)
  const intent = journal.recordIntent('a'.repeat(64))
  assert.equal(intent.state, 'INTENT_RECORDED')
  assert.equal(lstatSync(path).mode & 0o777, 0o600)
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), intent)
  assert.doesNotMatch(readFileSync(path, 'utf8'), /jwks|client_secret|bearer|https:/i)
  assert.throws(() => journal.transition(intent, 'NORMALIZED_VERIFIED'), /unavailable/)
  const acknowledged = journal.transition(intent, 'UPDATE_ACKNOWLEDGED')
  assert.equal(journal.read().state, 'UPDATE_ACKNOWLEDGED')
  assert.throws(() => journal.transition(intent, 'RECONCILIATION_REQUIRED'), /unavailable/)
  const verified = journal.transition(acknowledged, 'NORMALIZED_VERIFIED')
  assert.equal(verified.state, 'NORMALIZED_VERIFIED')
  assert.throws(() => journal.transition(verified, 'UPDATE_ACKNOWLEDGED'), /unavailable/)
  assert.throws(() => make(path).recordIntent('b'.repeat(64)), /unavailable/)
})

test('uncertain update consumes the journal and cross-instance replay is rejected', () => {
  const path = location(), journal = make(path)
  const intent = journal.recordIntent('b'.repeat(64))
  assert.equal(make(path).read().state, 'INTENT_RECORDED')
  assert.throws(() => make(path).recordIntent('b'.repeat(64)), /unavailable/)
  assert.equal(journal.transition(intent, 'RECONCILIATION_REQUIRED').state, 'RECONCILIATION_REQUIRED')
  assert.throws(() => make(path).recordIntent('c'.repeat(64)), /unavailable/)
})

test('malformed, symlinked and insecure journals fail closed without replacement', () => {
  for (const kind of ['malformed', 'symlink', 'mode']) {
    const path = location()
    if (kind === 'malformed') writeFileSync(path, '{}', { mode: 0o600 })
    if (kind === 'symlink') { const target = location(); writeFileSync(target, '{}', { mode: 0o600 }); symlinkSync(target, path) }
    if (kind === 'mode') writeFileSync(path, '{}', { mode: 0o644 })
    assert.throws(() => make(path).read(), /unavailable/)
    assert.throws(() => make(path).recordIntent('a'.repeat(64)), /unavailable/)
  }
  assert.throws(() => make(location()).recordIntent('not-a-hash'), /unavailable/)
})
