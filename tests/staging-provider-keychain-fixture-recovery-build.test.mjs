import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { sourceForKind, validRecoveryArtifact } from '../scripts/staging-provider-keychain-fixture-recovery-build.mjs'

const root = resolve(import.meta.dirname, '..')
const script = resolve(root, 'scripts/staging-provider-keychain-fixture-recovery-build.mjs')

test('source guard accepts only its selected disabled or armed state', () => {
  assert.match(readFileSync(script, 'utf8'), /TLL_KEYCHAIN_FIXTURE_RECOVERY/)
  sourceForKind('private let TLL_FIXTURE_RECOVERY_ENABLED = false', 'disabled')
  sourceForKind('private let TLL_FIXTURE_RECOVERY_ENABLED = true', 'armed')
  assert.throws(() => sourceForKind('private let TLL_FIXTURE_RECOVERY_ENABLED = false', 'armed'))
  assert.throws(() => sourceForKind('private let TLL_FIXTURE_RECOVERY_ENABLED = true', 'disabled'))
  assert.throws(() => sourceForKind('TLL_FIXTURE_RECOVERY_ENABLED = true\nTLL_FIXTURE_RECOVERY_ENABLED = true', 'armed'))
})

test('build identity validator rejects drift, unsafe files and wrong signer', () => {
  const kind = 'armed', name = 'tll-provider-keychain-fixture-recovery-armed-v1'
  const actual = { sourceSha256: 'a'.repeat(64), binarySha256: 'b'.repeat(64),
    architecture: 'arm64', signingIdentifier: name, signingKind: 'adhoc' }
  const record = { schema: 'tll-fixture-recovery-armed-build/v1', ...actual }
  const file = (mode, changes = {}) => ({ isFile: () => true, isSymbolicLink: () => false,
    uid: 501, nlink: 1, mode, ...changes })
  const valid = (changes = {}) => validRecoveryArtifact(changes.record ?? record,
    changes.actual ?? actual, changes.binary ?? file(0o700), changes.receipt ?? file(0o600), 501, kind)
  assert.equal(valid(), true)
  assert.equal(valid({ actual: { ...actual, binarySha256: 'c'.repeat(64) } }), false)
  assert.equal(valid({ actual: { ...actual, signingIdentifier: 'other' } }), false)
  assert.equal(valid({ binary: file(0o755) }), false)
  assert.equal(valid({ binary: file(0o700, { nlink: 2 }) }), false)
  assert.equal(valid({ receipt: file(0o600, { isSymbolicLink: () => true }) }), false)
  assert.equal(valid({ record: { ...record, extra: true } }), false)
})

test('armed build and check refuse the current disabled source', () => {
  for (const argument of ['--check-armed', '--build-armed']) {
    const result = spawnSync(process.execPath, [script, argument], { cwd: root,
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 })
    assert.equal(result.status, 2)
    assert.equal(result.stdout.toString('utf8'), '{"status":"HOLD"}\n')
  }
})
