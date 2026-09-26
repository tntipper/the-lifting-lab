import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, platform } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = resolve(root, 'scripts/staging-provider-noninteractive-keychain.swift')
const buildScript = resolve(root, 'scripts/staging-provider-noninteractive-keychain-build.mjs')

test('disabled native build uses immutable private source and checks binary identity',
  { skip: platform() !== 'darwin' }, () => {
    const temporary = mkdtempSync(join(tmpdir(), 'tll-keychain-build-'))
    try {
      const repository = join(temporary, 'repo')
      const scripts = join(repository, 'scripts')
      const staging = join(temporary, 'implementation-state', 'staging')
      mkdirSync(scripts, { recursive: true })
      mkdirSync(staging, { recursive: true, mode: 0o700 })
      copyFileSync(source, join(scripts, 'staging-provider-noninteractive-keychain.swift'))
      copyFileSync(buildScript, join(scripts, 'staging-provider-noninteractive-keychain-build.mjs'))
      const command = argument => spawnSync(process.execPath,
        [join(scripts, 'staging-provider-noninteractive-keychain-build.mjs'), argument],
        { cwd: repository, encoding: 'utf8', timeout: 30_000, maxBuffer: 4_096 })
      const built = command('--build')
      assert.equal(built.status, 0, built.stderr || built.stdout)
      const receipt = JSON.parse(built.stdout)
      assert.equal(receipt.status, 'DISABLED_BINARY_VERIFIED')
      assert.equal(receipt.architecture, 'arm64')
      assert.equal(receipt.signingIdentifier, 'tll-provider-noninteractive-keychain-disabled-v2')
      assert.equal(receipt.signingKind, 'adhoc')
      assert.equal(command('--check').status, 0)
      assert.equal(command('--build').status, 2, 'must not replace a fixed binary')
      const file = join(scripts, 'staging-provider-noninteractive-keychain.swift')
      const sourceText = readFileSync(file, 'utf8')
      assert.match(sourceText, /guard TLL_NATIVE_READER_ENABLED else \{ Darwin\.exit\(TLLCredentialExit\.guardFailed\.rawValue\) \}/)
      assert.match(sourceText, /private let TLL_NATIVE_READER_ENABLED = false/)
      writeFileSync(file, `${sourceText}\n// changed after build\n`)
      assert.equal(command('--check').status, 2, 'source drift must fail closed')
    } finally { rmSync(temporary, { recursive: true, force: true }) }
  })
