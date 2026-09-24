import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir, platform } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = resolve(root, 'scripts/staging-provider-keychain-fixture-recovery-native.swift')

test('native fixture recovery mechanics pass in the offline-only test main', { skip: platform() !== 'darwin' }, () => {
  const body = readFileSync(source, 'utf8')
  assert.match(body, /private let TLL_FIXTURE_RECOVERY_ENABLED = false/)
  for (const phase of ['API_DELETE', 'SIDECAR_RECONCILE', 'DIRECTORY_REMOVE']) assert.match(body, new RegExp(`= "${phase}"`))
  assert.match(body, /#if !TLL_FIXTURE_RECOVERY_NATIVE_TEST/)
  assert.match(body, /@main private struct TLLRecoveryOfflineTests/)
  assert.doesNotMatch(body, /unlink\(tllRecoveryDirectory \+ "\/" \+ tllRecoveryMain\)/)
  assert.match(body, /tllHashOpenFile\(leafFD, expected:/)
  assert.match(body, /tllHashBoundRegularPath\(executable\.path\) == binary/)
  assert.match(body, /object\["sequence"\] as\? Int == expected\.expectedSequence/)
  assert.match(body, /tllBaseline\(\) == tllExpectedBaseline/)
  const directory = mkdtempSync(join(tmpdir(), 'tll-native-fixture-recovery-offline-'))
  try {
    const binary = join(directory, 'offline-test-main')
    const compiled = spawnSync('/usr/bin/swiftc', ['-parse-as-library', '-D', 'TLL_KEYCHAIN_FIXTURE_RECOVERY', '-D', 'TLL_FIXTURE_RECOVERY_NATIVE_TEST', source, '-o', binary], { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 65_536 })
    assert.equal(compiled.status, 0, compiled.stderr || String(compiled.error))
    const run = spawnSync(binary, [], { cwd: directory, encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 })
    assert.equal(run.status, 0, run.stderr || String(run.error))
    assert.equal(run.stderr, '')
    assert.match(run.stdout.trimEnd(), /^PASS \d+ offline native fixture recovery groups$/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
