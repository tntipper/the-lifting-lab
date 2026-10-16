import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { mkdtempSync, chmodSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFixturePhaseJournal } from '../scripts/staging-provider-keychain-fixture-phase-journal.mjs'

const ID = '5a83b4b0-7ab2-4349-9f12-0123456789ab'
const IDENTITY = Object.freeze({ sourceSha256: 'a'.repeat(64), fixtureSha256: 'b'.repeat(64),
  binarySha256: 'c'.repeat(64) })
function fixture(body) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-fixture-journal-'))
  chmodSync(directory, 0o700)
  const path = join(directory, 'one-use.json')
  try { return body(path, directory) } finally { rmSync(directory, { recursive: true, force: true }) }
}
const journal = path => createFixturePhaseJournal({ path, makeRunId: () => ID,
  now: () => Date.parse('2026-09-24T18:00:00.000Z') })

test('fixture journal records one private attempt and refuses replay', () => fixture(path => {
  const record = journal(path).start(IDENTITY)
  assert.equal(record.phase, 'PREFLIGHT')
  assert.equal(journal(path).read().runId, ID)
  const running = journal(path)
  assert.throws(() => running.start(IDENTITY))
  // Only the instance that created the record may advance it.
  assert.throws(() => running.advance(record, 'NATIVE_ATTEMPT'))
  const owner = createFixturePhaseJournal({ path, makeRunId: () => '982910c9-a034-443d-8be1-123456789abc', now: Date.now })
  assert.throws(() => owner.start(IDENTITY))
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).outcome, null)
}))

test('fixture journal advances monotonically, finishes, and keeps its receipt', () => fixture(path => {
  const value = journal(path)
  const first = value.start(IDENTITY)
  const second = value.advance(first, 'NATIVE_ATTEMPT')
  assert.throws(() => value.advance(first, 'LOCAL_RECONCILIATION'))
  assert.throws(() => value.advance(second, 'PREFLIGHT'))
  const third = value.advance(second, 'LOCAL_RECONCILIATION')
  assert.equal(value.finish(third, 'PASS').outcome, 'PASS')
  assert.throws(() => value.finish(third, 'PASS'))
  assert.throws(() => value.start(IDENTITY))
  assert.equal(journal(path).read().outcome, 'PASS')
}))

test('fixture journal refuses unsafe directory, symlink, or malformed receipt', () => fixture((path, directory) => {
  chmodSync(directory, 0o755)
  assert.throws(() => journal(path).start(IDENTITY))
  chmodSync(directory, 0o700)
  writeFileSync(path, '{}', { mode: 0o600 })
  assert.throws(() => journal(path).read())
  rmSync(path)
  symlinkSync(join(directory, 'missing'), path)
  assert.throws(() => journal(path).start(IDENTITY))
}))

test('fixture journal completes short writes and refuses zero-progress persistence', () => fixture(path => {
  const short = new Proxy(fs, { get(target, property) {
    if (property === 'writeSync') return (descriptor, bytes, offset, count) =>
      fs.writeSync(descriptor, bytes, offset, Math.min(count, 3))
    return target[property]
  } })
  const value = createFixturePhaseJournal({ path, io: short, makeRunId: () => ID,
    now: () => Date.parse('2026-09-24T18:00:00.000Z') })
  assert.equal(value.start(IDENTITY).phase, 'PREFLIGHT')
  assert.equal(journal(path).read().sourceSha256, IDENTITY.sourceSha256)
}))

test('fixture journal rejects a zero-byte initial write', () => fixture(path => {
  const zero = new Proxy(fs, { get(target, property) {
    return property === 'writeSync' ? () => 0 : target[property]
  } })
  assert.throws(() => createFixturePhaseJournal({ path, io: zero, makeRunId: () => ID,
    now: () => Date.parse('2026-09-24T18:00:00.000Z') }).start(IDENTITY))
}))
