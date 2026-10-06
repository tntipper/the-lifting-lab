import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir, platform } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = resolve(root, 'scripts/staging-provider-noninteractive-keychain.swift')
const tests = resolve(root, 'tests/staging_provider_noninteractive_keychain_test.swift')

test('disabled native Keychain reader passes injected offline tests without a real-item port',
  { skip: platform() !== 'darwin' }, () => {
    const body = readFileSync(source, 'utf8')
    assert.match(body, /private let TLL_NATIVE_READER_ENABLED = false/)
    assert.match(body, /#if !TLL_KEYCHAIN_TEST\nprivate let TLL_NATIVE_READER_ENABLED = false/)
    assert.doesNotMatch(body, /TLL_NATIVE_READER_ENABLED = true/)
    const directory = mkdtempSync(join(tmpdir(), 'tll-keychain-offline-'))
    try {
      const binary = join(directory, 'offline-tests')
      const compiled = spawnSync('/usr/bin/swiftc', [
        '-parse-as-library', '-D', 'TLL_KEYCHAIN_TEST', source, tests, '-o', binary,
      ], { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 8_192 })
      assert.equal(compiled.status, 0, compiled.stderr || String(compiled.error))
      const result = spawnSync(binary, [], {
        cwd: directory, encoding: 'utf8', timeout: 10_000, maxBuffer: 8_192,
      })
      assert.equal(result.status, 0, result.stderr || String(result.error))
      assert.equal(result.stderr, '')
      assert.deepEqual(result.stdout.trimEnd().split('\n'), [
        'PASS exact selectors and ordered noninteractive read',
        'PASS unknown selector never touches Keychain',
        'PASS interaction setting failure stops before read',
        'PASS restoration failure suppresses output',
        'PASS OSStatus categories stay distinct and secret-free',
        'PASS invalid and oversized values never write',
        'PASS output failure remains categorical',
        'PASS pipe write loop handles partial and interrupted writes',
        'PASS owned mutable buffer wipe',
        'PASS 9 offline native reader groups',
      ])
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
