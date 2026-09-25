import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const source = resolve('scripts/staging-provider-keychain-search-domain-diagnostic.swift')

test('search-domain diagnostic stays disabled and reports only bounded categories', () => {
  const body = readFileSync(source, 'utf8')
  assert.match(body, /tllSearchDomainDiagnosticEnabled = false/)
  for (const forbidden of ['SecKeychainOpen', 'SecKeychainDelete', 'SecKeychainFind',
    'SecKeychainSet', 'SecKeychainCopyContent', 'SecItemCopyMatching',
    'SecKeychainSetPreferenceDomain', 'URLSession', 'removeItem']) {
    assert.doesNotMatch(body, new RegExp(forbidden + '\\s*\\('))
  }
  const directory = mkdtempSync(join(tmpdir(), 'tll-search-domain-offline-'))
  try {
    const executable = join(directory, 'offline')
    const compile = spawnSync('/usr/bin/swiftc', ['-parse-as-library', '-D',
      'TLL_SEARCH_DOMAIN_OFFLINE_TEST', source, '-o', executable], {
      encoding: 'utf8', timeout: 60_000, maxBuffer: 16_384,
    })
    assert.equal(compile.status, 0, compile.stderr)
    const run = spawnSync(executable, [], { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.stdout.trim(), 'PASS 9 offline search-domain cases; live diagnostic disabled')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
