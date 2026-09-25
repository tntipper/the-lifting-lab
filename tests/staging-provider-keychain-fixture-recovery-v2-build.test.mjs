import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { sourceForKind, validRecoveryArtifact } from '../scripts/staging-provider-keychain-fixture-recovery-v2-build.mjs'

test('V2 builder requires exactly one disabled switch in ordinary source', () => {
  const body = readFileSync(resolve(import.meta.dirname,
    '../scripts/staging-provider-keychain-fixture-recovery-v2-native.swift'), 'utf8')
  assert.doesNotThrow(() => sourceForKind(body, 'disabled'))
  assert.throws(() => sourceForKind(body, 'armed'))
  assert.throws(() => sourceForKind(body.replace('TLL_FIXTURE_RECOVERY_V2_ENABLED = false',
    'TLL_FIXTURE_RECOVERY_V2_ENABLED = true'), 'disabled'))
})

test('V2 build receipt cannot be substituted with V1 identity', () => {
  const hash = 'a'.repeat(64), binaryHash = 'b'.repeat(64)
  const record = { schema: 'tll-fixture-recovery-v2-disabled-build/v2',
    sourceSha256: hash, binarySha256: binaryHash, architecture: 'arm64',
    signingIdentifier: 'tll-provider-keychain-fixture-recovery-v2-disabled', signingKind: 'adhoc' }
  const actual = { sourceSha256: hash, binarySha256: binaryHash, architecture: 'arm64',
    signingIdentifier: record.signingIdentifier, signingKind: 'adhoc' }
  const binaryStat = { isFile: () => true, isSymbolicLink: () => false, uid: 501,
    nlink: 1, mode: 0o700 }
  const receiptStat = { ...binaryStat, mode: 0o600 }
  assert.equal(validRecoveryArtifact(record, actual, binaryStat, receiptStat, 501, 'disabled'), true)
  assert.equal(validRecoveryArtifact({ ...record, schema: 'tll-fixture-recovery-disabled-build/v1' },
    actual, binaryStat, receiptStat, 501, 'disabled'), false)
})
