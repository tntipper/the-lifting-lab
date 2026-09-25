import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

test('V2 native safety predicates run offline with the live switch disabled', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-v2-native-offline-'))
  try {
    const source = resolve(import.meta.dirname,
      '../scripts/staging-provider-keychain-fixture-recovery-v2-native.swift')
    const body = readFileSync(source, 'utf8')
    assert.match(body, /TLL_FIXTURE_RECOVERY_V2_ENABLED = false/)
    const binary = join(directory, 'offline')
    const build = spawnSync('/usr/bin/swiftc', ['-parse-as-library', '-D',
      'TLL_KEYCHAIN_FIXTURE_RECOVERY_V2', '-D', 'TLL_FIXTURE_RECOVERY_V2_NATIVE_TEST',
      source, '-o', binary], { timeout: 30_000, maxBuffer: 8192 })
    assert.equal(build.status, 0, build.stderr?.toString('utf8'))
    const run = spawnSync(binary, [], { timeout: 5000, maxBuffer: 1024 })
    assert.equal(run.status, 0, run.stderr?.toString('utf8'))
    assert.match(run.stdout.toString('utf8'), /^PASS 40 offline native fixture recovery groups\n$/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
