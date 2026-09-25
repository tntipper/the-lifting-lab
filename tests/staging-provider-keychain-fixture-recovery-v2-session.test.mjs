import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFixtureRecoveryV2Journal } from '../scripts/staging-provider-keychain-fixture-recovery-v2-journal.mjs'
import { runFixtureRecoveryV2Session } from '../scripts/staging-provider-keychain-fixture-recovery-v2-session.mjs'

const identity = { sourceSha256: 'a'.repeat(64), binarySha256: 'b'.repeat(64) }
const digest = 'c'.repeat(64)

function fixture(override = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-recovery-v2-session-'))
  chmodSync(directory, 0o700)
  try {
    const calls = []
    let baselineGood = true
    const journal = createFixtureRecoveryV2Journal({ path: join(directory, 'v2.json'),
      now: () => 1_000_000, makeRunId: () => '12345678-1234-1234-1234-123456789abc' })
    const run = runFixtureRecoveryV2Session({ journal, identity, now: () => 1_000_000,
      preflight: () => { calls.push('preflight'); return true },
      captureBaseline: () => { calls.push('capture'); return { status: 'PASS', sha256: digest } },
      verifyBaseline: expected => { calls.push('verify'); return expected === digest && baselineGood },
      preDispatch: phase => { calls.push(`ready:${phase}`); return true },
      runNative: (phase, _limit, expected) => {
        calls.push(`native:${phase}`)
        assert.equal(expected, digest)
        if (override.driftAfterNative === phase) baselineGood = false
        return { status: 'PASS' }
      },
      reconcileMain: () => { calls.push('main'); if (override.driftAfterMain) baselineGood = false; return true },
      reconcileSidecar: () => { calls.push('sidecar'); if (override.driftAfterSidecar) baselineGood = false; return true },
      reconcileFinal: () => { calls.push('final'); return true },
    })
    return { result: run, calls, record: journal.read(), replay: () => runFixtureRecoveryV2Session({ journal }) }
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

test('V2 captures once, checks the same digest through each phase and final native read', () => {
  const run = fixture()
  assert.deepEqual(run.result, { status: 'PASS', category: null })
  assert.equal(run.record.baselineSha256, digest)
  assert.deepEqual(run.calls.filter(item => item.startsWith('native:')),
    ['native:API_DELETE', 'native:SIDECAR_RECONCILE',
      'native:DIRECTORY_REMOVE', 'native:FINAL_VERIFY'])
  assert.ok(run.calls.indexOf('capture') < run.calls.indexOf('native:API_DELETE'))
})

test('between-phase drift blocks the next destructive child', () => {
  const afterMain = fixture({ driftAfterMain: true })
  assert.deepEqual(afterMain.result, { status: 'UNCERTAIN', category: 'BASELINE_CHANGED' })
  assert.deepEqual(afterMain.calls.filter(item => item.startsWith('native:')),
    ['native:API_DELETE'])
  const afterSidecar = fixture({ driftAfterSidecar: true })
  assert.deepEqual(afterSidecar.result, { status: 'UNCERTAIN', category: 'BASELINE_CHANGED' })
  assert.deepEqual(afterSidecar.calls.filter(item => item.startsWith('native:')),
    ['native:API_DELETE', 'native:SIDECAR_RECONCILE'])
})

test('post-delete drift is uncertain and stops every later mutation', () => {
  const run = fixture({ driftAfterNative: 'API_DELETE' })
  assert.deepEqual(run.result, { status: 'UNCERTAIN', category: 'BASELINE_CHANGED' })
  assert.deepEqual(run.calls.filter(item => item.startsWith('native:')),
    ['native:API_DELETE'])
})
