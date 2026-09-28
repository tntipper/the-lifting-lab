import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { lstatSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProviderNormalizationPhaseJournal, assessProviderNormalizationPhase,
  PROVIDER_NORMALIZATION_PHASE_JOURNAL_ENABLED, PROVIDER_NORMALIZATION_PHASE_DEADLINES_MS } from '../scripts/staging-provider-normalization-phase-journal.mjs'

const runId = 'f80746e1-7a8b-4b1a-9c2d-22cd94aaaf31'
const nowMs = 1_789_000_000_000
const location = () => join(mkdtempSync(join(tmpdir(), 'tll-provider-phase-')), 'journal.json')
const make = (path, fileSystem = fs, now = () => nowMs) => createProviderNormalizationPhaseJournal({ path, fileSystem, makeRunId: () => runId, now })
const sequence = ['PREFLIGHT', 'PROVIDER_PREREAD', 'INTENT_RECORDED', 'UPDATE_DISPATCH', 'UPDATE_ACKNOWLEDGED', 'POSTREAD']

test('one private, secret-free journal advances in fixed phase order and cannot replay', () => {
  assert.equal(PROVIDER_NORMALIZATION_PHASE_JOURNAL_ENABLED, false)
  const path = location(), journal = make(path)
  assert.equal(journal.read(), null)
  let current = journal.start()
  assert.equal(lstatSync(path).mode & 0o777, 0o600)
  assert.throws(() => journal.record(current, 'UPDATE_DISPATCH'), /unavailable/)
  assert.throws(() => journal.finish(current, 'VERIFIED'), /unavailable/)
  for (const phase of sequence) current = journal.record(current, phase)
  assert.equal(current.phase, 'POSTREAD')
  const terminal = journal.finish(current, 'VERIFIED')
  assert.equal(terminal.outcome, 'VERIFIED')
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), terminal)
  assert.doesNotMatch(readFileSync(path, 'utf8'), /jwks|client_secret|bearer|https:/i)
  assert.throws(() => journal.record(current, 'POSTREAD'), /unavailable/)
  assert.throws(() => make(path).start(), /unavailable/)
})

test('early stop is before intent; post-intent holds consume the file', () => {
  const early = make(location()), launch = early.start()
  assert.equal(early.finish(launch, 'STOPPED_BEFORE_UPDATE').outcome, 'STOPPED_BEFORE_UPDATE')
  const path = location(), journal = make(path)
  let current = journal.start()
  for (const phase of sequence.slice(0, 3)) current = journal.record(current, phase)
  assert.throws(() => journal.finish(current, 'STOPPED_BEFORE_UPDATE'), /unavailable/)
  assert.equal(journal.finish(current, 'RECONCILIATION_REQUIRED').outcome, 'RECONCILIATION_REQUIRED')
  assert.throws(() => make(path).start(), /unavailable/)
})

test('phase deadline is exact and stale means read-only reconciliation', () => {
  const journal = make(location()), current = journal.start()
  const deadline = PROVIDER_NORMALIZATION_PHASE_DEADLINES_MS.LAUNCH_STARTED
  assert.equal(assessProviderNormalizationPhase(current, nowMs + deadline).status, 'ACTIVE_WITHIN_PHASE_BOUND')
  assert.equal(assessProviderNormalizationPhase(current, nowMs + deadline + 1).status, 'STALE_REQUIRES_RECONCILIATION')
  assert.equal(assessProviderNormalizationPhase(journal.finish(current, 'STOPPED_BEFORE_UPDATE'), nowMs + deadline + 1).status, 'TERMINAL')
})

test('expired phases cannot advance or complete successfully, but can record reconciliation', () => {
  let clock = nowMs
  const path = location(), journal = make(path, fs, () => clock), start = journal.start()
  clock += PROVIDER_NORMALIZATION_PHASE_DEADLINES_MS.LAUNCH_STARTED + 1
  assert.equal(assessProviderNormalizationPhase(start, clock).status, 'STALE_REQUIRES_RECONCILIATION')
  assert.throws(() => journal.record(start, 'PREFLIGHT'), /unavailable/)
  assert.throws(() => journal.finish(start, 'STOPPED_BEFORE_UPDATE'), /unavailable/)
  assert.equal(journal.read().phase, 'LAUNCH_STARTED')
  assert.equal(journal.finish(start, 'RECONCILIATION_REQUIRED').outcome, 'RECONCILIATION_REQUIRED')

  clock = nowMs
  const onBoundary = make(location(), fs, () => clock), first = onBoundary.start()
  clock += PROVIDER_NORMALIZATION_PHASE_DEADLINES_MS.LAUNCH_STARTED
  assert.equal(onBoundary.record(first, 'PREFLIGHT').phase, 'PREFLIGHT')

  clock = nowMs
  const completed = make(location(), fs, () => clock)
  let current = completed.start()
  for (const phase of sequence) current = completed.record(current, phase)
  clock += PROVIDER_NORMALIZATION_PHASE_DEADLINES_MS.POSTREAD + 1
  assert.throws(() => completed.finish(current, 'VERIFIED'), /unavailable/)
  assert.equal(completed.read().phase, 'POSTREAD')
  assert.equal(completed.finish(current, 'RECONCILIATION_REQUIRED').outcome, 'RECONCILIATION_REQUIRED')
})

test('malformed, symlinked and insecure files are hard stops', () => {
  for (const kind of ['malformed', 'symlink', 'mode']) {
    const path = location()
    if (kind === 'malformed') writeFileSync(path, '{}', { mode: 0o600 })
    if (kind === 'symlink') { const target = location(); writeFileSync(target, '{}', { mode: 0o600 }); symlinkSync(target, path) }
    if (kind === 'mode') writeFileSync(path, '{}', { mode: 0o644 })
    assert.throws(() => make(path).read(), /unavailable/)
    assert.throws(() => make(path).start(), /unavailable/)
  }
  const path = location(), journal = make(path), start = journal.start()
  writeFileSync(path, JSON.stringify({ ...start, sequence: 1 }) + '\n', { mode: 0o600 })
  assert.throws(() => journal.read(), /unavailable/)
  assert.throws(() => assessProviderNormalizationPhase({ ...start, sequence: 1 }, nowMs), /unavailable/)
})

test('short writes complete creation and replacement; zero/throw cannot report success', () => {
  const path = location(); let writes = 0
  const short = { ...fs, writeSync(fd, bytes, offset, length, position) {
    writes++; return fs.writeSync(fd, bytes, offset, Math.min(length, 7), position)
  } }
  const journal = make(path, short), start = journal.start()
  assert.equal(journal.record(start, 'PREFLIGHT').phase, 'PREFLIGHT')
  assert.ok(writes > 2)
  for (const failure of ['zero', 'throw']) {
    const creation = location(); let broken = true
    const fault = { ...fs, writeSync(fd, bytes, offset, length, position) {
      if (broken) { if (failure === 'throw') throw Error('private disk detail'); return 0 }
      return fs.writeSync(fd, bytes, offset, length, position)
    } }
    assert.throws(() => make(creation, fault).start())
    assert.throws(() => make(creation).start(), /unavailable/)
    const transitionPath = location(); broken = false
    const phase = make(transitionPath, fault), first = phase.start()
    broken = true
    assert.throws(() => phase.record(first, 'PREFLIGHT'))
    assert.equal(phase.read().phase, 'LAUNCH_STARTED')
    assert.throws(() => make(transitionPath).start(), /unavailable/)
  }
})

test('file fsync, rename and directory fsync failures never report success or permit replay', () => {
  for (const operation of ['file-fsync', 'rename', 'directory-fsync']) {
    const path = location(); let fail = false, syncs = 0
    const fault = { ...fs,
      fsyncSync(fd) {
        if (fail && ++syncs === (operation === 'directory-fsync' ? 2 : 1) && operation !== 'rename') throw Error('private sync detail')
        return fs.fsyncSync(fd)
      },
      renameSync(...args) { if (fail && operation === 'rename') throw Error('private rename detail'); return fs.renameSync(...args) },
    }
    const journal = make(path, fault), start = journal.start()
    fail = true
    assert.throws(() => journal.record(start, 'PREFLIGHT'))
    assert.equal(journal.read().phase, operation === 'directory-fsync' ? 'PREFLIGHT' : 'LAUNCH_STARTED')
    assert.throws(() => make(path).start(), /unavailable/)
    if (operation === 'directory-fsync') assert.throws(() => journal.record(start, 'PREFLIGHT'), /unavailable/)
  }
})
