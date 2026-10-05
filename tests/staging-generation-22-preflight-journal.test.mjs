import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStagingGeneration22PreflightJournal,
  assertStagingGeneration22DispatchRecordsAbsent,
  STAGING_GENERATION_22_PREFLIGHT_JOURNAL_ENABLED } from '../scripts/staging-generation-22-preflight-journal.mjs'
import { JOURNAL_PATH } from '../scripts/staging-generation-22-journal.mjs'
import { RECOVERY_JOURNAL_PATH } from '../scripts/staging-generation-22-recovery-journal.mjs'

const id = '11111111-1111-4111-8111-111111111111'
const fixture = mode => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-gen22-preflight-'))
  const path = join(directory, 'record.json')
  const journal = createStagingGeneration22PreflightJournal({ mode, path, makeRunId: () => id,
    now: () => Date.parse('2026-09-26T12:00:00.000Z') })
  return { path, journal }
}

test('new Vercel preflight record is exclusive, private and cannot be replayed', () => {
  assert.equal(STAGING_GENERATION_22_PREFLIGHT_JOURNAL_ENABLED, false)
  const { path, journal } = fixture('vercel')
  const claim = journal.claim()
  assert.equal(claim.state, 'CLAIMED')
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.throws(() => journal.claim(), /unavailable/)
  assert.throws(() => createStagingGeneration22PreflightJournal({ mode: 'supabase', path }).read(), /unavailable/)
  const result = { status: 'GENERATION_22_NAMES_ABSENT', present: [] }
  const final = journal.finish(claim, result.status, result)
  assert.equal(final.state, 'FINISHED')
  assert.equal(final.outcome, result.status)
  assert.match(final.resultSha256, /^[a-f0-9]{64}$/)
  assert.throws(() => journal.finish(claim, result.status, result), /unavailable/)
  assert.throws(() => createStagingGeneration22PreflightJournal({ mode: 'vercel', path }).claim(), /unavailable/)
  assert.doesNotMatch(readFileSync(path, 'utf8'), /token|password|value/i)
})

test('Supabase record accepts only its own result and a failed read is consumed', () => {
  const { journal } = fixture('supabase')
  const claim = journal.claim()
  assert.throws(() => journal.finish(claim, 'GENERATION_22_NAMES_ABSENT', {}), /unavailable/)
  const final = journal.finish(claim, 'READ_UNAVAILABLE', null)
  assert.equal(final.outcome, 'READ_UNAVAILABLE')
  assert.equal(final.resultSha256, null)
  assert.throws(() => journal.claim(), /unavailable/)
})

test('changed record and a foreign owner cannot finish a claimed read', () => {
  const { path, journal } = fixture('vercel')
  const claim = journal.claim()
  const foreign = createStagingGeneration22PreflightJournal({ mode: 'vercel', path })
  assert.throws(() => foreign.finish(claim, 'HOLD', { status: 'HOLD' }), /unavailable/)
  const altered = { ...JSON.parse(readFileSync(path, 'utf8')), mode: 'supabase' }
  writeFileSync(path, JSON.stringify(altered), { mode: 0o600 })
  assert.throws(() => journal.read(), /unavailable/)
  assert.throws(() => journal.finish(claim, 'HOLD', { status: 'HOLD' }), /unavailable/)
})

test('preflight checks fixed dispatch-record absence without opening write journals', () => {
  const checked = []
  const missing = { lstatSync(path) { checked.push(path); throw Object.assign(Error('missing'), { code: 'ENOENT' }) } }
  assert.equal(assertStagingGeneration22DispatchRecordsAbsent({ fileSystem: missing }), true)
  assert.deepEqual(checked, [JOURNAL_PATH, RECOVERY_JOURNAL_PATH])
  assert.throws(() => assertStagingGeneration22DispatchRecordsAbsent({ fileSystem: {
    lstatSync: () => ({ isFile: () => true }),
  } }), /unavailable/)
  assert.throws(() => assertStagingGeneration22DispatchRecordsAbsent({ fileSystem: {
    lstatSync: () => { throw Object.assign(Error('denied'), { code: 'EACCES' }) },
  } }), /unavailable/)
})
