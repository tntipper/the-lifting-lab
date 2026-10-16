import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import { existsSync, mkdtempSync, readFileSync, lstatSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createCredentialReadinessPhaseJournal } from '../scripts/staging-provider-credential-readiness-phase-journal.mjs'
import { runCredentialReadinessSession, CREDENTIAL_READINESS_DEADLINE_MS } from '../scripts/staging-provider-credential-readiness-session.mjs'
import { createCredentialReadinessNative, CREDENTIAL_READINESS_PYTHON } from '../scripts/staging-provider-credential-readiness-native.mjs'

const runId = 'f80746e1-7a8b-4b1a-9c2d-22cd94aaaf31'
const startMs = 1_789_000_000_000
const location = () => join(mkdtempSync(join(tmpdir(), 'tll-credential-readiness-')), 'phase.json')
const mutationReceipts = ['tll-provider-normalization-phase-v1.json', 'tll-provider-normalization-v1.json']
  .map(name => resolve(import.meta.dirname, '../../implementation-state/staging', name))
const mutationSnapshot = () => mutationReceipts.map(path => existsSync(path)
  ? createHash('sha256').update(readFileSync(path)).digest('hex') : null)
const fixture = (change = {}) => {
  const path = location(); let clock = startMs
  const journal = createCredentialReadinessPhaseJournal({ path, makeRunId: () => runId, now: () => clock })
  const calls = [], buffers = []
  const readCredential = selector => {
    calls.push(selector)
    const value = Buffer.from(`private-${selector}-token`)
    buffers.push(value)
    if (change.failOn === selector) return { status: 'HOLD', category: change.category ?? 'COMMAND', value }
    if (change.advanceOn === selector) clock += CREDENTIAL_READINESS_DEADLINE_MS + 1
    return { status: 'PASS', value }
  }
  return { path, journal, phaseJournal: journal, calls, buffers, readCredential, now: () => clock, advance: ms => { clock += ms } }
}

test('three reads occur in order, wipe owned buffers, leave one secret-free terminal receipt', () => {
  const f = fixture()
  const mutationBefore = mutationSnapshot()
  const result = runCredentialReadinessSession(f)
  assert.deepEqual(result, { status: 'PASS', category: null, elapsedSeconds: 0 })
  assert.deepEqual(f.calls, ['supabase', 'vercel', 'vercel-bypass'])
  for (const buffer of f.buffers) assert.deepEqual([...buffer], Array(buffer.length).fill(0))
  assert.equal(lstatSync(f.path).mode & 0o777, 0o600)
  assert.equal(f.journal.read().outcome, 'PASS')
  assert.doesNotMatch(readFileSync(f.path, 'utf8'), /private-|token|secret|bearer/i)
  assert.equal(runCredentialReadinessSession(f).status, 'HOLD')
  assert.equal(f.calls.length, 3)
  assert.deepEqual(mutationSnapshot(), mutationBefore)
})

test('first helper failure stops later reads and records its fixed category', () => {
  const f = fixture({ failOn: 'vercel', category: 'TIMEOUT' })
  assert.deepEqual(runCredentialReadinessSession(f), { status: 'HOLD', category: 'TIMEOUT', elapsedSeconds: 0 })
  assert.deepEqual(f.calls, ['supabase', 'vercel'])
  assert.equal(f.journal.read().phase, 'READ_VERCEL')
  assert.equal(f.journal.read().outcome, 'HOLD')
  assert.equal(f.journal.read().category, 'TIMEOUT')
  for (const buffer of f.buffers) assert.deepEqual([...buffer], Array(buffer.length).fill(0))
})

test('deadline and invalid output hold without a further credential read', () => {
  const slow = fixture({ advanceOn: 'supabase' })
  assert.equal(runCredentialReadinessSession(slow).category, 'DEADLINE')
  assert.deepEqual(slow.calls, ['supabase'])
  assert.equal(slow.journal.read().outcome, 'HOLD')
  const invalid = fixture()
  assert.equal(runCredentialReadinessSession({ ...invalid, readCredential: () => ({ status: 'PASS', value: Buffer.from('bad value') }) }).category, 'FORMAT')
  assert.equal(invalid.journal.read().outcome, 'HOLD')
})

test('a slow journal transition cannot start a child with too little time remaining', () => {
  const f = fixture()
  const phaseJournal = { ...f.journal, record(previous, phase) {
    const next = f.journal.record(previous, phase)
    f.advance(49_000)
    return next
  } }
  assert.equal(runCredentialReadinessSession({ ...f, phaseJournal }).category, 'DEADLINE')
  assert.deepEqual(f.calls, [])
  assert.equal(f.journal.read().outcome, 'HOLD')
})

test('a slow initial journal creation uses the receipt deadline, not a later session clock', () => {
  const f = fixture()
  const phaseJournal = { ...f.journal, start() {
    const record = f.journal.start()
    f.advance(9_000)
    return record
  } }
  const readCredential = selector => {
    f.calls.push(selector)
    f.advance(15_000)
    return { status: 'PASS', value: Buffer.from('private-token') }
  }
  assert.equal(runCredentialReadinessSession({ ...f, phaseJournal, readCredential }).category, 'DEADLINE')
  assert.deepEqual(f.calls, ['supabase', 'vercel'])
  assert.equal(f.journal.read().outcome, 'HOLD')
})

test('phase assessor distinguishes active and stale at the recorded deadline', () => {
  const f = fixture(), first = f.journal.start()
  assert.equal(f.journal.assess(first, startMs + 10_000).status, 'ACTIVE_WITHIN_PHASE_BOUND')
  assert.equal(f.journal.assess(first, startMs + 10_001).status, 'STALE_REQUIRES_RECONCILIATION')
  assert.equal(Date.parse(first.deadlineAt) - Date.parse(first.startedAt), CREDENTIAL_READINESS_DEADLINE_MS)
})

test('injected child adapter uses exact helper process settings and wipes raw stdout', () => {
  const raw = Buffer.from('private-token')
  const calls = []
  const read = createCredentialReadinessNative({ root: '/tmp/tll-readiness', helper: '/tmp/tll-readiness/helper.py',
    spawnChild: (...args) => { calls.push(args); return { status: 0, stdout: raw } } })
  const result = read('vercel')
  assert.equal(result.status, 'PASS')
  assert.equal(result.value.toString(), 'private-token')
  assert.deepEqual([...raw], Array(raw.length).fill(0))
  assert.equal(calls[0][0], CREDENTIAL_READINESS_PYTHON)
  assert.deepEqual(calls[0][1], ['-I', '-S', '/tmp/tll-readiness/helper.py', 'vercel'])
  assert.deepEqual(calls[0][2], { cwd: '/tmp/tll-readiness', env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer: 4_097 })
  result.value.fill(0)
})

test('injected child adapter maps fixed failures and erases raw output', () => {
  const cases = [
    [{ status: 11 }, 'GUARD'], [{ status: 12 }, 'TIMEOUT'], [{ status: 13 }, 'COMMAND'],
    [{ status: 14 }, 'FORMAT'], [{ status: 15 }, 'OUTPUT'], [{ status: 16 }, 'INTERNAL'],
    [{ status: 0, error: { code: 'ETIMEDOUT' } }, 'TIMEOUT'],
    [{ status: 0, error: { code: 'EIO' } }, 'INTERNAL'],
    [{ status: 0, signal: 'SIGTERM' }, 'INTERNAL'],
    [{ status: 0, stdout: Buffer.from('bad value') }, 'FORMAT'],
  ]
  for (const [outcome, category] of cases) {
    const raw = outcome.stdout ?? Buffer.from('private-token')
    const read = createCredentialReadinessNative({ root: '/tmp/tll-readiness', helper: '/tmp/tll-readiness/helper.py',
      spawnChild: () => ({ ...outcome, stdout: raw }) })
    assert.deepEqual(read('supabase'), { status: 'HOLD', category })
    assert.deepEqual([...raw], Array(raw.length).fill(0))
  }
  let calls = 0
  const read = createCredentialReadinessNative({ root: '/tmp/tll-readiness', helper: '/tmp/tll-readiness/helper.py',
    spawnChild: () => { calls++; throw Error('private-token') } })
  assert.deepEqual(read('unknown'), { status: 'HOLD', category: 'GUARD' })
  assert.deepEqual(read('supabase'), { status: 'HOLD', category: 'INTERNAL' })
  assert.equal(calls, 1)
})

test('malformed or symlinked private receipt blocks before any read', () => {
  for (const kind of ['malformed', 'symlink']) {
    const f = fixture()
    if (kind === 'malformed') writeFileSync(f.path, '{}', { mode: 0o600 })
    else { const target = location(); writeFileSync(target, '{}', { mode: 0o600 }); symlinkSync(target, f.path) }
    assert.equal(runCredentialReadinessSession(f).status, 'HOLD')
    assert.deepEqual(f.calls, [])
  }
})

test('short writes persist; failed journal creation never reads a credential', () => {
  const f = fixture(), short = { ...fs, writeSync(fd, bytes, offset, length, position) {
    return fs.writeSync(fd, bytes, offset, Math.min(length, 7), position)
  } }
  const journal = createCredentialReadinessPhaseJournal({ path: f.path, fileSystem: short,
    makeRunId: () => runId, now: () => startMs })
  assert.equal(runCredentialReadinessSession({ readCredential: f.readCredential, phaseJournal: journal, now: f.now }).status, 'PASS')
  const failed = fixture(), broken = { ...fs, writeSync() { return 0 } }
  const badJournal = createCredentialReadinessPhaseJournal({ path: failed.path, fileSystem: broken,
    makeRunId: () => runId, now: () => startMs })
  assert.equal(runCredentialReadinessSession({ readCredential: failed.readCredential, phaseJournal: badJournal, now: failed.now }).status, 'HOLD')
  assert.deepEqual(failed.calls, [])
})
