import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { mkdtempSync, lstatSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assessBrokerPhase, BROKER_PHASE_DEADLINES_MS, BROKER_PHASE_JOURNAL_ENABLED,
  createBrokerPhaseJournal } from '../scripts/staging-provider-broker-phase-journal.mjs'

const runId = 'd80746e1-7a8b-4b1a-9c2d-22cd94aaaf31'
const startMs = Date.parse('2026-09-25T12:00:00.000Z')
const location = () => join(mkdtempSync(join(tmpdir(), 'tll-broker-phase-')), 'journal.json')
const make = (path = location(), fileSystem = fs, now = () => startMs) => createBrokerPhaseJournal({ path, fileSystem, makeRunId: () => runId, now })
const advance = (journal, current, phases) => phases.reduce((value, phase) => journal.record(value, phase), current)
const beforeStage = ['PREFLIGHT', 'PROVIDER_PREREAD', 'INTENT_RECORDED']
const success = [...beforeStage, 'VERCEL_STAGE_DISPATCH', 'VERCEL_STAGE_ACK', 'SUPABASE_STAGE_DISPATCH',
  'SUPABASE_STAGE_ACK', 'PROVIDER_UPDATE_DISPATCH', 'PROVIDER_UPDATE_ACK', 'PROVIDER_POSTREAD', 'HOST_NAMES_READBACK']

test('success records every dispatch before acknowledgement in a private, single-use, secret-free file', () => {
  assert.equal(BROKER_PHASE_JOURNAL_ENABLED, false)
  const path = location(), journal = make(path)
  let phase = journal.start()
  assert.equal(lstatSync(path).mode & 0o777, 0o600)
  assert.throws(() => journal.record(phase, 'PROVIDER_UPDATE_DISPATCH'), /unavailable/)
  phase = advance(journal, phase, success)
  assert.equal(journal.finish(phase, 'VERIFIED').outcome, 'VERIFIED')
  const text = readFileSync(path, 'utf8')
  assert.doesNotMatch(text, /client_secret|password|bearer|https:|jwks|token/i)
  assert.deepEqual(JSON.parse(text).history.map(event => event.phase), ['LAUNCH_STARTED', ...success])
  assert.throws(() => make(path).start(), /unavailable/)
  assert.throws(() => journal.record(phase, 'PREFLIGHT'), /unavailable/)
})

test('an interrupted host dispatch cannot be called a safe stop without acknowledged cleanup and readback', () => {
  const journal = make(), first = advance(journal, journal.start(), [...beforeStage, 'VERCEL_STAGE_DISPATCH'])
  assert.throws(() => journal.finish(first, 'STOPPED_BEFORE_UPDATE'), /unavailable/)
  let phase = journal.record(first, 'VERCEL_REMOVE_DISPATCH')
  assert.throws(() => journal.finish(phase, 'STOPPED_BEFORE_UPDATE'), /unavailable/)
  phase = advance(journal, phase, ['VERCEL_REMOVE_ACK', 'REMOVAL_READBACK'])
  assert.equal(journal.finish(phase, 'STOPPED_BEFORE_UPDATE').outcome, 'STOPPED_BEFORE_UPDATE')

  const second = make(), staged = advance(second, second.start(), [...beforeStage, 'VERCEL_STAGE_DISPATCH',
    'VERCEL_STAGE_ACK', 'SUPABASE_STAGE_DISPATCH'])
  const failed = advance(second, staged, ['VERCEL_REMOVE_DISPATCH', 'VERCEL_REMOVE_ACK',
    'SUPABASE_REMOVE_DISPATCH', 'REMOVAL_READBACK'])
  assert.throws(() => second.finish(failed, 'STOPPED_BEFORE_UPDATE'), /unavailable/)
  assert.equal(second.finish(failed, 'RECONCILIATION_REQUIRED').outcome, 'RECONCILIATION_REQUIRED')
})

test('provider dispatch or lost acknowledgement always needs reconciliation, never pre-update cleanup', () => {
  for (const stopAt of ['PROVIDER_UPDATE_DISPATCH', 'PROVIDER_UPDATE_ACK', 'PROVIDER_POSTREAD']) {
    const journal = make(), phases = success.slice(0, success.indexOf(stopAt) + 1)
    const phase = advance(journal, journal.start(), phases)
    assert.throws(() => journal.finish(phase, 'STOPPED_BEFORE_UPDATE'), /unavailable/)
    assert.throws(() => journal.finish(phase, 'VERIFIED'), /unavailable/)
    assert.equal(journal.finish(phase, 'RECONCILIATION_REQUIRED').outcome, 'RECONCILIATION_REQUIRED')
  }
})

test('phase deadline is exact and a stale phase can only record reconciliation', () => {
  let clock = startMs
  const journal = make(location(), fs, () => clock), phase = journal.start()
  const bound = BROKER_PHASE_DEADLINES_MS.LAUNCH_STARTED
  assert.equal(assessBrokerPhase(phase, clock + bound).status, 'ACTIVE_WITHIN_PHASE_BOUND')
  assert.equal(assessBrokerPhase(phase, clock + bound + 1).status, 'STALE_REQUIRES_RECONCILIATION')
  clock += bound + 1
  assert.throws(() => journal.record(phase, 'PREFLIGHT'), /unavailable/)
  assert.throws(() => journal.finish(phase, 'STOPPED_BEFORE_UPDATE'), /unavailable/)
  const held = journal.finish(phase, 'RECONCILIATION_REQUIRED')
  assert.deepEqual(assessBrokerPhase(held, clock), { status: 'TERMINAL', phase: 'LAUNCH_STARTED', outcome: 'RECONCILIATION_REQUIRED' })
})

test('malformed, symlinked and insecure receipts fail closed', () => {
  for (const kind of ['malformed', 'symlink', 'mode']) {
    const path = location()
    if (kind === 'malformed') writeFileSync(path, '{}', { mode: 0o600 })
    if (kind === 'symlink') { const target = location(); writeFileSync(target, '{}', { mode: 0o600 }); symlinkSync(target, path) }
    if (kind === 'mode') writeFileSync(path, '{}', { mode: 0o644 })
    assert.throws(() => make(path).read(), /unavailable/)
    assert.throws(() => make(path).start(), /unavailable/)
  }
  const path = location(), journal = make(path), first = journal.start()
  writeFileSync(path, JSON.stringify({ ...first, sequence: 1 }) + '\n', { mode: 0o600 })
  assert.throws(() => journal.read(), /unavailable/)
})

test('a path replacement during open or read cannot substitute an unchecked receipt', () => {
  const original = location(), source = make(original); source.start()
  const target = location(); writeFileSync(target, readFileSync(original), { mode: 0o644 })
  let swapped = false
  const beforeOpen = { ...fs, openSync(path, flags, mode) {
    if (path === original && !swapped) {
      assert.equal(flags & fs.constants.O_NOFOLLOW, fs.constants.O_NOFOLLOW)
      assert.equal(flags & fs.constants.O_NONBLOCK, fs.constants.O_NONBLOCK)
      swapped = true
      renameSync(original, `${original}.saved`)
      symlinkSync(target, original)
    }
    return fs.openSync(path, flags, mode)
  } }
  assert.throws(() => make(original, beforeOpen).read(), /unavailable/)

  const next = location(), nextSource = make(next); nextSource.start()
  let replaced = false
  const afterOpen = { ...fs, readSync(fd, buffer, offset, length, position) {
    const count = fs.readSync(fd, buffer, offset, length, position)
    if (!replaced) {
      replaced = true
      renameSync(next, `${next}.saved`)
      writeFileSync(next, readFileSync(`${next}.saved`), { mode: 0o600 })
    }
    return count
  } }
  assert.throws(() => make(next, afterOpen).read(), /unavailable/)
})

test('short writes complete; failed write or sync cannot report success or permit replay', () => {
  const path = location(), short = { ...fs, writeSync(fd, bytes, offset, length, position) {
    return fs.writeSync(fd, bytes, offset, Math.min(length, 7), position)
  } }
  const journal = make(path, short), first = journal.start()
  assert.equal(journal.record(first, 'PREFLIGHT').phase, 'PREFLIGHT')
  for (const failAt of ['write', 'fsync']) {
    const target = location(); let faultEnabled = false
    const faulty = { ...fs,
      writeSync(...args) { if (faultEnabled && failAt === 'write') return 0; return fs.writeSync(...args) },
      fsyncSync(fd) { if (faultEnabled && failAt === 'fsync') throw Error('disk fault'); return fs.fsyncSync(fd) },
    }
    const handle = make(target, faulty), started = handle.start()
    faultEnabled = true
    assert.throws(() => handle.record(started, 'PREFLIGHT'))
    assert.equal(make(target).read().phase, 'LAUNCH_STARTED')
    assert.throws(() => make(target).start(), /unavailable/)
  }
})
