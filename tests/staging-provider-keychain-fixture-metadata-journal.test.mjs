import assert from 'node:assert/strict'
import { mkdtempSync, chmodSync, readFileSync, symlinkSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createFixtureMetadataJournal } from '../scripts/staging-provider-keychain-fixture-metadata-journal.mjs'

const identity = { sourceSha256: 'a'.repeat(64), binarySha256: 'b'.repeat(64) }
const runId = '12345678-1234-1234-1234-123456789abc'

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-fixture-metadata-journal-'))
  chmodSync(directory, 0o700)
  const path = join(directory, 'journal.json')
  try { run({ directory, path }) }
  finally { rmSync(directory, { recursive: true, force: true }) }
}

test('one-use metadata journal records dispatch and fixed result without replay', () => fixture(({ path }) => {
  let time = 1_000_000
  const journal = createFixtureMetadataJournal({ path, now: () => time, makeRunId: () => runId })
  const start = journal.start(identity)
  assert.equal(start.state, 'PREPARED')
  assert.equal(journal.read().state, 'PREPARED')
  assert.throws(() => journal.start(identity))
  time += 100
  const dispatched = journal.dispatch(start)
  assert.equal(dispatched.state, 'DISPATCHED')
  assert.throws(() => journal.dispatch(start))
  time += 100
  const terminal = journal.finish(dispatched, 'METADATA_MATCHED')
  assert.equal(terminal.state, 'TERMINAL')
  assert.equal(terminal.result, 'METADATA_MATCHED')
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), terminal)
  assert.throws(() => journal.start(identity))
  assert.throws(() => journal.finish(dispatched, 'METADATA_MATCHED'))
}))

test('pre-dispatch outcomes cannot claim a native read', () => fixture(({ path }) => {
  const journal = createFixtureMetadataJournal({ path, now: () => 1_000_000, makeRunId: () => runId })
  const start = journal.start(identity)
  assert.throws(() => journal.finish(start, 'METADATA_MATCHED'))
  assert.equal(journal.finish(start, 'PREFLIGHT').result, 'PREFLIGHT')
}))

test('late dispatch and non-enumerated result fail closed', () => fixture(({ path }) => {
  let time = 1_000_000
  const journal = createFixtureMetadataJournal({ path, now: () => time, makeRunId: () => runId })
  const start = journal.start(identity)
  time += 10_001
  assert.throws(() => journal.dispatch(start))
  assert.throws(() => journal.finish(start, 'RAW_SECRET'))
  assert.equal(journal.finish(start, 'DEADLINE').result, 'DEADLINE')
}))

test('foreign, malformed and symlinked records cannot be used', () => fixture(({ path, directory }) => {
  const journal = createFixtureMetadataJournal({ path, now: () => 1_000_000, makeRunId: () => runId })
  const start = journal.start(identity)
  assert.throws(() => journal.dispatch({ ...start, sourceSha256: 'c'.repeat(64) }))
  writeFileSync(path, '{}\n', { mode: 0o600 })
  assert.throws(() => journal.read())
  rmSync(path)
  const target = join(directory, 'target.json')
  writeFileSync(target, '{}\n', { mode: 0o600 })
  symlinkSync(target, path)
  assert.throws(() => journal.read())
}))

test('journal requires an owner-only parent directory', () => fixture(({ path, directory }) => {
  chmodSync(directory, 0o755)
  const journal = createFixtureMetadataJournal({ path })
  assert.throws(() => journal.start(identity))
}))
