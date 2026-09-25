import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { armedMetadataSource, validMetadataArtifact } from '../scripts/staging-provider-keychain-fixture-metadata-build.mjs'

const shaA = 'a'.repeat(64), shaB = 'b'.repeat(64)
const record = Object.freeze({ schema: 'tll-fixture-metadata-armed-build/v1',
  sourceSha256: shaA, binarySha256: shaB, architecture: 'arm64',
  signingIdentifier: 'tll-provider-keychain-fixture-metadata-armed-v1', signingKind: 'adhoc' })
const validStat = (mode) => ({ isFile: () => true, isSymbolicLink: () => false,
  uid: process.getuid(), nlink: 1, mode })

test('real metadata source is disabled; only a single explicit read-only arming gate qualifies', () => {
  const body = readFileSync('scripts/staging-provider-keychain-fixture-metadata-diagnostic.swift', 'utf8')
  assert.equal(armedMetadataSource(body), false)
  const armed = body.replace('tllMetadataDiagnosticEnabled = false', 'tllMetadataDiagnosticEnabled = true')
  assert.equal(armedMetadataSource(armed), true)
  assert.equal(armedMetadataSource(`${armed}\nprivate let tllMetadataDiagnosticEnabled = false`), false)
  assert.equal(armedMetadataSource(`${armed}\nSecKeychainDelete()`), false)
  assert.equal(armedMetadataSource(`${armed}\nSecItemCopyMatching()`), false)
  assert.equal(armedMetadataSource(`${armed}\nSecKeychainSetUserInteractionAllowed()`), false)
  assert.equal(armedMetadataSource(`${armed}\nunlink()`), false)
})

test('build receipt is bound to source, binary, signer and private file identity', () => {
  const actual = { sourceSha256: shaA, binarySha256: shaB, architecture: 'arm64',
    signingIdentifier: record.signingIdentifier, signingKind: 'adhoc' }
  assert.equal(validMetadataArtifact(record, actual, validStat(0o700), validStat(0o600), process.getuid()), true)
  assert.equal(validMetadataArtifact(record, { ...actual, binarySha256: 'c'.repeat(64) },
    validStat(0o700), validStat(0o600), process.getuid()), false)
  assert.equal(validMetadataArtifact(record, actual, validStat(0o755), validStat(0o600), process.getuid()), false)
  assert.equal(validMetadataArtifact(record, actual, validStat(0o700), validStat(0o644), process.getuid()), false)
  assert.equal(validMetadataArtifact({ ...record, extra: true }, actual,
    validStat(0o700), validStat(0o600), process.getuid()), false)
})
