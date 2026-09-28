import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync,
  writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFixtureRecoveryV2Journal } from '../scripts/staging-provider-keychain-fixture-recovery-v2-journal.mjs'

const identity = { sourceSha256: 'a'.repeat(64), binarySha256: 'b'.repeat(64) }
const digest = 'c'.repeat(64)
const runId = '12345678-1234-1234-1234-123456789abc'

function fixture(body) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-recovery-v2-journal-'))
  chmodSync(directory, 0o700)
  const path = join(directory, 'v2-only.json')
  try {
    let time = 1_000_000
    const make = () => createFixtureRecoveryV2Journal({ path, now: () => time, makeRunId: () => runId })
    body({ path, directory, make, tick: delta => { time += delta } })
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

test('V2 pins one baseline before any destructive phase and refuses replay', () => fixture(({ make }) => {
  const owner = make(), initial = owner.start(identity)
  assert.equal(initial.phase, 'CAPTURE_BASELINE')
  assert.equal(initial.baselineSha256, null)
  assert.throws(() => owner.advance(initial, 'API_DELETE'))
  const pinned = owner.pinBaseline(initial, digest)
  assert.equal(pinned.baselineSha256, digest)
  assert.throws(() => owner.pinBaseline(pinned, digest))
  assert.throws(() => owner.advance(initial, 'API_DELETE'))
  const api = owner.advance(pinned, 'API_DELETE')
  const sidecar = owner.advance(api, 'SIDECAR_RECONCILE')
  const directory = owner.advance(sidecar, 'DIRECTORY_REMOVE')
  const final = owner.advance(directory, 'FINAL_VERIFY')
  assert.equal(owner.finish(final, 'PASS').outcome, 'PASS')
  assert.throws(() => owner.start(identity))
  assert.throws(() => make().start(identity))
}))

test('V2 rejects changed immutable fields and stale previous records', () => fixture(({ make, path }) => {
  const owner = make(), initial = owner.start(identity), pinned = owner.pinBaseline(initial, digest)
  const tampered = { ...pinned, baselineSha256: 'd'.repeat(64) }
  assert.throws(() => owner.advance(tampered, 'API_DELETE'))
  assert.throws(() => owner.advance({ ...pinned, runId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }, 'API_DELETE'))
  const disk = JSON.parse(readFileSync(path, 'utf8'))
  writeFileSync(path, `${JSON.stringify({ ...disk, binarySha256: 'e'.repeat(64) })}\n`, { mode: 0o600 })
  assert.throws(() => owner.advance(pinned, 'API_DELETE'))
}))

test('V2 refuses malformed, linked, or permissive one-use records', () => fixture(({ make, path, directory }) => {
  chmodSync(directory, 0o755)
  assert.throws(() => make().start(identity))
  chmodSync(directory, 0o700)
  symlinkSync(join(directory, 'missing'), path)
  assert.throws(() => make().start(identity))
}))

test('V2 cannot extend the capture or run deadline', () => fixture(({ make, tick }) => {
  const owner = make(), initial = owner.start(identity)
  tick(15_000)
  assert.throws(() => owner.pinBaseline(initial, digest))
}))

test('V2 terminal hold before pinning cannot resume', () => fixture(({ make }) => {
  const owner = make(), initial = owner.start(identity)
  assert.equal(owner.finish(initial, 'HOLD').outcome, 'HOLD')
  assert.throws(() => owner.pinBaseline(initial, digest))
  assert.throws(() => make().start(identity))
}))
