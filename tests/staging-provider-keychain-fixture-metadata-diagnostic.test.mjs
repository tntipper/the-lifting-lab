import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const source = resolve('scripts/staging-provider-keychain-fixture-metadata-diagnostic.swift')

test('fixture diagnostic is disabled, read-only, and classifies injected metadata offline', () => {
  const body = readFileSync(source, 'utf8')
  assert.match(body, /tllMetadataDiagnosticEnabled = false/)
  for (const forbidden of ['SecKeychainDelete', 'SecKeychainOpen', 'SecKeychainFind',
    'SecKeychainSet', 'unlink', 'removeItem', 'Data(contentsOf:', 'URLSession']) {
    assert.doesNotMatch(body, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  const directory = mkdtempSync(join(tmpdir(), 'tll-fixture-metadata-offline-'))
  try {
    const executable = join(directory, 'offline')
    const compile = spawnSync('/usr/bin/swiftc', ['-parse-as-library', '-D',
      'TLL_FIXTURE_METADATA_OFFLINE_TEST', source, '-o', executable], {
      encoding: 'utf8', timeout: 60_000, maxBuffer: 16_384,
    })
    assert.equal(compile.status, 0, compile.stderr)
    const run = spawnSync(executable, [], { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.stdout.trim(), 'PASS 9 offline metadata categories; live diagnostic disabled')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
