import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, platform } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sources = [
  'staging-provider-noninteractive-keychain.swift',
  'staging-provider-keychain-fixture-native.swift',
  'staging-provider-keychain-fixture-build.mjs',
]

test('fixture build is disabled, source-bound and never executed by ordinary tests',
  { skip: platform() !== 'darwin' }, () => {
    const temporary = mkdtempSync(join(tmpdir(), 'tll-keychain-fixture-build-'))
    try {
      const repository = join(temporary, 'repo')
      const scripts = join(repository, 'scripts')
      const staging = join(temporary, 'implementation-state', 'staging')
      mkdirSync(scripts, { recursive: true })
      mkdirSync(staging, { recursive: true, mode: 0o700 })
      for (const name of sources) copyFileSync(join(root, 'scripts', name), join(scripts, name))
      const command = argument => spawnSync(process.execPath,
        [join(scripts, 'staging-provider-keychain-fixture-build.mjs'), argument],
        { cwd: repository, encoding: 'utf8', timeout: 60_000, maxBuffer: 4_096 })
      const built = command('--build')
      assert.equal(built.status, 0, built.stderr || built.stdout)
      const receipt = JSON.parse(built.stdout)
      assert.equal(receipt.status, 'DISABLED_FIXTURE_BINARY_VERIFIED')
      assert.equal(receipt.architecture, 'arm64')
      assert.equal(receipt.signingIdentifier, 'tll-provider-keychain-fixture-disabled-v1')
      assert.equal(receipt.signingKind, 'adhoc')
      assert.equal(command('--check').status, 0)
      assert.equal(command('--build').status, 2, 'must not overwrite a fixed binary')
      const file = join(scripts, 'staging-provider-keychain-fixture-native.swift')
      const body = readFileSync(file, 'utf8')
      assert.match(body, /private let TLL_FIXTURE_NATIVE_ENABLED = false/)
      assert.doesNotMatch(body, /TLL_FIXTURE_NATIVE_ENABLED = true/)
      writeFileSync(file, `${body}\n// later source drift\n`)
      assert.equal(command('--check').status, 2)
    } finally { rmSync(temporary, { recursive: true, force: true }) }
  })
