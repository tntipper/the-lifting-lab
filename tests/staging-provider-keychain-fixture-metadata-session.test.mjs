import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createFixtureMetadataJournal } from '../scripts/staging-provider-keychain-fixture-metadata-journal.mjs'
import { classifyMetadataChild, runMetadataSession } from '../scripts/staging-provider-keychain-fixture-metadata-session.mjs'

const identity = { sourceSha256: 'a'.repeat(64), binarySha256: 'b'.repeat(64) }

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-fixture-metadata-session-'))
  chmodSync(directory, 0o700)
  try {
    let time = 1_000_000
    const journal = createFixtureMetadataJournal({ path: join(directory, 'journal.json'),
      now: () => time, makeRunId: () => '12345678-1234-1234-1234-123456789abc' })
    run({ journal, tick: amount => { time += amount }, now: () => time })
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

test('exact native category is recorded once and child buffers are wiped', () => fixture(({ journal, now }) => {
  const stdout = Buffer.from('METADATA_MATCHED\n'), stderr = Buffer.alloc(0)
  let calls = 0
  const result = runMetadataSession({ journal, identity, now, preflight: () => true,
    runNative: () => { calls += 1; return { status: 0, stdout, stderr } } })
  assert.deepEqual(result, { status: 'OBSERVED', category: 'METADATA_MATCHED' })
  assert.equal(journal.read().result, 'METADATA_MATCHED')
  assert.equal(calls, 1)
  assert.ok(stdout.every(byte => byte === 0))
  assert.equal(runMetadataSession({ journal, identity, now, preflight: () => true,
    runNative: () => { calls += 1 } }).status, 'HOLD')
  assert.equal(calls, 1)
}))

test('changed preflight never dispatches child', () => fixture(({ journal, now }) => {
  let checks = 0, calls = 0
  const result = runMetadataSession({ journal, identity, now,
    preflight: () => ++checks === 1,
    runNative: () => { calls += 1 } })
  assert.deepEqual(result, { status: 'HOLD', category: 'PREFLIGHT' })
  assert.equal(journal.read().result, 'PREFLIGHT')
  assert.equal(calls, 0)
}))

test('timeout, bad output and deadline are terminal uncertainty, never replayed', () => {
  for (const kind of ['timeout', 'output', 'deadline']) fixture(({ journal, now, tick }) => {
    let calls = 0
    const result = runMetadataSession({ journal, identity, now, preflight: () => true,
      runNative: () => {
        calls += 1
        if (kind === 'timeout') return { error: { code: 'ETIMEDOUT' }, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }
        if (kind === 'deadline') tick(21_000)
        return { status: 0, stdout: Buffer.from(kind === 'output' ? 'RAW\n' : 'METADATA_MATCHED\n'),
          stderr: Buffer.alloc(0) }
      } })
    const category = { timeout: 'CHILD_TIMEOUT', output: 'CHILD_OUTPUT', deadline: 'DEADLINE' }[kind]
    assert.deepEqual(result, { status: 'UNCERTAIN', category })
    assert.equal(journal.read().result, category)
    assert.equal(calls, 1)
  })
})

test('native result parser accepts only fixed exact output', () => {
  assert.deepEqual(classifyMetadataChild({ status: 0, stdout: Buffer.from('MAIN_MISMATCH\n'),
    stderr: Buffer.alloc(0) }), { status: 'OBSERVED', category: 'MAIN_MISMATCH' })
  assert.equal(classifyMetadataChild({ status: 0, stdout: Buffer.from('METADATA_MATCHED\nextra'),
    stderr: Buffer.alloc(0) }).category, 'CHILD_OUTPUT')
  assert.equal(classifyMetadataChild({ status: 31, stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0) }).category, 'CHILD_EXIT')
})
