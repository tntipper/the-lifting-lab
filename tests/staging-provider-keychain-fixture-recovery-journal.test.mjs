import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { mkdtempSync, chmodSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFixtureRecoveryJournal } from '../scripts/staging-provider-keychain-fixture-recovery-journal.mjs'

const ID = '5a83b4b0-7ab2-4349-9f12-0123456789ab'
const IDENTITY = Object.freeze({ sourceSha256: 'a'.repeat(64), binarySha256: 'c'.repeat(64) })
function fixture(body) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-fixture-recovery-journal-'))
  chmodSync(directory, 0o700)
  const path = join(directory, 'one-use.json')
  try { return body(path, directory) } finally { rmSync(directory, { recursive: true, force: true }) }
}
const journal = path => createFixtureRecoveryJournal({ path, makeRunId: () => ID,
  now: () => Date.parse('2026-09-24T18:00:00.000Z') })

test('fixture recovery journal records one private attempt and refuses replay', () => fixture(path => {
  const record = journal(path).start(IDENTITY)
  assert.equal(record.phase, 'PREFLIGHT')
  assert.equal(journal(path).read().runId, ID)
  const running = journal(path)
  assert.throws(() => running.start(IDENTITY))
  // Only the instance that created the record may advance it.
  assert.throws(() => running.advance(record, 'API_DELETE'))
  const owner = createFixtureRecoveryJournal({ path, makeRunId: () => '982910c9-a034-443d-8be1-123456789abc', now: Date.now })
  assert.throws(() => owner.start(IDENTITY))
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).outcome, null)
}))

test('fixture recovery journal advances monotonically, finishes, and keeps its receipt', () => fixture(path => {
  const value = journal(path)
  const first = value.start(IDENTITY)
  assert.throws(() => value.advance(first, 'DIRECTORY_REMOVE'))
  const second = value.advance(first, 'API_DELETE')
  assert.throws(() => value.advance(first, 'SIDECAR_RECONCILE'))
  assert.throws(() => value.advance(second, 'PREFLIGHT'))
  const third = value.advance(second, 'SIDECAR_RECONCILE')
  assert.equal(value.finish(third, 'PASS').outcome, 'PASS')
  assert.throws(() => value.finish(third, 'PASS'))
  assert.throws(() => value.start(IDENTITY))
  assert.equal(journal(path).read().outcome, 'PASS')
}))

test('fixture recovery journal cannot renew an expired phase', () => fixture(path => {
  let clock = Date.parse('2026-09-24T18:00:00.000Z')
  const value = createFixtureRecoveryJournal({ path, makeRunId: () => ID, now: () => clock })
  const first = value.start(IDENTITY)
  clock += 15_000
  assert.throws(() => value.advance(first, 'API_DELETE'))
  assert.equal(value.read().phase, 'PREFLIGHT')
}))

test('fixture recovery journal refuses unsafe directory, symlink, or malformed receipt', () => fixture((path, directory) => {
  chmodSync(directory, 0o755)
  assert.throws(() => journal(path).start(IDENTITY))
  chmodSync(directory, 0o700)
  writeFileSync(path, '{}', { mode: 0o600 })
  assert.throws(() => journal(path).read())
  rmSync(path)
  symlinkSync(join(directory, 'missing'), path)
  assert.throws(() => journal(path).start(IDENTITY))
}))

test('fixture recovery journal completes short writes and refuses zero-progress persistence', () => fixture(path => {
  const short = new Proxy(fs, { get(target, property) {
    if (property === 'writeSync') return (descriptor, bytes, offset, count) =>
      fs.writeSync(descriptor, bytes, offset, Math.min(count, 3))
    return target[property]
  } })
  const value = createFixtureRecoveryJournal({ path, io: short, makeRunId: () => ID,
    now: () => Date.parse('2026-09-24T18:00:00.000Z') })
  assert.equal(value.start(IDENTITY).phase, 'PREFLIGHT')
  assert.equal(journal(path).read().sourceSha256, IDENTITY.sourceSha256)
}))

test('fixture recovery journal rejects a zero-byte initial write', () => fixture(path => {
  const zero = new Proxy(fs, { get(target, property) {
    return property === 'writeSync' ? () => 0 : target[property]
  } })
  assert.throws(() => createFixtureRecoveryJournal({ path, io: zero, makeRunId: () => ID,
    now: () => Date.parse('2026-09-24T18:00:00.000Z') }).start(IDENTITY))
}))
