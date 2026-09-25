import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { armedMetadataSource, readVerifiedArtifact,
  validMetadataArtifact } from '../scripts/staging-provider-keychain-fixture-metadata-build.mjs'

const shaA = 'a'.repeat(64), shaB = 'b'.repeat(64)
const record = Object.freeze({ schema: 'tll-fixture-metadata-armed-build/v1',
  sourceSha256: shaA, binarySha256: shaB, architecture: 'arm64',
  signingIdentifier: 'tll-provider-keychain-fixture-metadata-armed-v1', signingKind: 'adhoc' })
const validStat = (mode) => ({ isFile: () => true, isSymbolicLink: () => false,
  uid: process.getuid(), nlink: 1, mode })

test('real metadata source is disabled; only a single explicit read-only arming gate qualifies', () => {
  const body = fs.readFileSync('scripts/staging-provider-keychain-fixture-metadata-diagnostic.swift', 'utf8')
  assert.equal(armedMetadataSource(body), false)
  const armed = body.replace('tllMetadataDiagnosticEnabled = false', 'tllMetadataDiagnosticEnabled = true')
  assert.equal(armedMetadataSource(armed), true)
  assert.equal(armedMetadataSource(`${armed}\nprivate let tllMetadataDiagnosticEnabled = false`), false)
  assert.equal(armedMetadataSource(`${armed}\nSecKeychainDelete()`), false)
  assert.equal(armedMetadataSource(`${armed}\nSecItemCopyMatching()`), false)
  assert.equal(armedMetadataSource(`${armed}\nSecKeychainSetUserInteractionAllowed()`), false)
  assert.equal(armedMetadataSource(`${armed}\nunlink()`), false)
})

test('artifact reader validates opened file before any content read and rejects symlinks', () => {
  let reads = 0
  const io = {
    constants: fs.constants,
    openSync: () => 3,
    fstatSync: () => ({ isFile: () => false, isSymbolicLink: () => false }),
    readSync: () => { reads += 1; return 1 },
    closeSync: () => {},
  }
  assert.throws(() => readVerifiedArtifact('/irrelevant', 0o600, 128, io))
  assert.equal(reads, 0)

  const directory = fs.mkdtempSync(join(tmpdir(), 'tll-metadata-artifact-'))
  try {
    const target = join(directory, 'target')
    const link = join(directory, 'link')
    fs.writeFileSync(target, 'owned bytes', { mode: 0o600 })
    fs.symlinkSync(target, link)
    assert.throws(() => readVerifiedArtifact(link, 0o600, 128))
    const artifact = readVerifiedArtifact(target, 0o600, 128)
    assert.equal(artifact.bytes.toString(), 'owned bytes')
    artifact.bytes.fill(0)
    assert.throws(() => readVerifiedArtifact(directory, 0o600, 128))
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('live launcher does not inspect fixture children before journalled native dispatch', () => {
  const body = fs.readFileSync('scripts/staging-provider-keychain-fixture-metadata-live-launcher.mjs', 'utf8')
  assert.match(body, /TLL_FIXTURE_METADATA_LIVE_ENABLED = false/)
  assert.doesNotMatch(body, /fixtureIdentity\(|readdirSync\(|\.flA673ACC0/)
  assert.match(body, /readVerifiedArtifact\(binary/)
  assert.match(body, /spawnSync\(snapshot, \['--read-only'\]/)
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
