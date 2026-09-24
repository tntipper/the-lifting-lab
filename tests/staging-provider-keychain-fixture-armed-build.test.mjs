import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { armedSources, validArmedFixtureArtifact } from '../scripts/staging-provider-keychain-fixture-armed-build.mjs'

const root = resolve(import.meta.dirname, '..')
const script = resolve(root, 'scripts/staging-provider-keychain-fixture-armed-build.mjs')
const native = resolve(root, 'scripts/staging-provider-keychain-fixture-native.swift')

test('armed fixture build is unavailable while fixture source is disabled', () => {
  const body = readFileSync(script, 'utf8')
  assert.match(body, /const name = 'tll-provider-keychain-fixture-armed-v1'/)
  assert.match(body, /!\/\\bTLL_FIXTURE_NATIVE_ENABLED\\s\*=\\s\*true\\b\/\.test\(bodies\[1\]\)/)
  assert.match(body, /TLL_KEYCHAIN_FIXTURE/)
  assert.match(readFileSync(native, 'utf8'), /TLL_FIXTURE_NATIVE_ENABLED = false/)
  for (const option of ['--check', '--build']) {
    const result = spawnSync(process.execPath, [script, option], {
      cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000,
    })
    assert.equal(result.status, 2)
    assert.equal(result.stdout.toString('utf8'), '{"status":"HOLD"}\n')
  }
})

test('armed fixture build validates exact source, binary, signer and private file identity', () => {
  const hashes = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]
  const signer = { architecture: 'arm64', signingIdentifier: 'tll-provider-keychain-fixture-armed-v1',
    signingKind: 'adhoc' }
  const file = (mode, overrides = {}) => ({ isFile: () => true, isSymbolicLink: () => false,
    uid: 501, nlink: 1, mode, ...overrides })
  const record = { schema: 'tll-armed-disposable-keychain-build/v1', sourceSha256: hashes[0],
    fixtureSha256: hashes[1], binarySha256: hashes[2], ...signer }
  const valid = (changes = {}) => validArmedFixtureArtifact(changes.record ?? record,
    changes.hashes ?? hashes, changes.signer ?? signer,
    changes.binary ?? file(0o700), changes.receipt ?? file(0o600), 501)
  assert.equal(valid(), true)
  assert.equal(valid({ hashes: [hashes[0], hashes[1], 'd'.repeat(64)] }), false)
  assert.equal(valid({ hashes: ['d'.repeat(64), hashes[1], hashes[2]] }), false)
  assert.equal(valid({ signer: { ...signer, signingKind: 'none' } }), false)
  assert.equal(valid({ signer: { ...signer, signingIdentifier: 'other' } }), false)
  assert.equal(valid({ binary: file(0o755) }), false)
  assert.equal(valid({ binary: file(0o700, { nlink: 2 }) }), false)
  assert.equal(valid({ receipt: file(0o600, { isSymbolicLink: () => true }) }), false)
  assert.equal(valid({ record: { ...record, extra: true } }), false)
})

test('armed source gate accepts only a disabled production reader and enabled fixture', () => {
  assert.doesNotThrow(() => armedSources([
    'private let TLL_NATIVE_READER_ENABLED = false',
    'private let TLL_FIXTURE_NATIVE_ENABLED = true',
  ]))
  assert.throws(() => armedSources([
    'private let TLL_NATIVE_READER_ENABLED = true',
    'private let TLL_FIXTURE_NATIVE_ENABLED = true',
  ]))
  assert.throws(() => armedSources([
    'private let TLL_NATIVE_READER_ENABLED = false',
    'private let TLL_FIXTURE_NATIVE_ENABLED = false',
  ]))
})
