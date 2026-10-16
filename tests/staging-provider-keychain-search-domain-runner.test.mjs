import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { armedSearchDomainSource } from '../scripts/staging-provider-keychain-search-domain-build.mjs'
import { createSearchDomainJournal, observedSearchDomainCategory,
  validSearchDomainCategory } from '../scripts/staging-provider-keychain-search-domain-journal.mjs'
import { classifySearchDomainChild,
  runSearchDomainSession } from '../scripts/staging-provider-keychain-search-domain-session.mjs'

const identity = { sourceSha256: 'a'.repeat(64), binarySha256: 'b'.repeat(64) }
const observation = 'DOMAIN_USER:CURRENT_3:USER_1:EXACT_1:SAMEFILE_1:USER_EXACT_1:LISTS_DIFFERENT:IDENTITY_COMPLETE'

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-search-domain-session-'))
  chmodSync(directory, 0o700)
  try {
    let time = 1_000_000
    const journal = createSearchDomainJournal({ path: join(directory, 'journal.json'),
      now: () => time, makeRunId: () => '12345678-1234-1234-1234-123456789abc' })
    run({ journal, now: () => time, tick: ms => { time += ms } })
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

test('search-domain source cannot be built while disabled and rejects added Security calls', () => {
  const source = readFileSync('scripts/staging-provider-keychain-search-domain-diagnostic.swift', 'utf8')
  assert.equal(armedSearchDomainSource(source), false)
  const armed = source.replace('tllSearchDomainDiagnosticEnabled = false',
    'tllSearchDomainDiagnosticEnabled = true')
  assert.equal(armedSearchDomainSource(armed), true)
  assert.equal(armedSearchDomainSource(`${armed}\nSecKeychainDelete(nil)`), false)
  assert.equal(armedSearchDomainSource(`${armed}\ntllSearchDomainDiagnosticEnabled = true`), false)
})

test('only exact categorical output is accepted and private buffers are wiped', () => fixture(({ journal, now }) => {
  const stdout = Buffer.from(`${observation}\n`), stderr = Buffer.alloc(0)
  let calls = 0
  const result = runSearchDomainSession({ journal, identity, now, preflight: () => true,
    runNative: () => { calls += 1; return { status: 0, stdout, stderr } } })
  assert.deepEqual(result, { status: 'OBSERVED', category: observation })
  assert.equal(journal.read().result, observation)
  assert.ok(stdout.every(byte => byte === 0))
  assert.equal(runSearchDomainSession({ journal, identity, now, preflight: () => true,
    runNative: () => { calls += 1 } }).status, 'HOLD')
  assert.equal(calls, 1)
}))

test('changed preflight records no child dispatch', () => fixture(({ journal, now }) => {
  let checks = 0, calls = 0
  const result = runSearchDomainSession({ journal, identity, now,
    preflight: () => ++checks === 1, runNative: () => { calls += 1 } })
  assert.deepEqual(result, { status: 'HOLD', category: 'PREFLIGHT' })
  assert.equal(journal.read().result, 'PREFLIGHT')
  assert.equal(calls, 0)
}))

test('timeout and unexpected output are terminal uncertainty', () => {
  for (const kind of ['timeout', 'output']) fixture(({ journal, now }) => {
    const result = runSearchDomainSession({ journal, identity, now, preflight: () => true,
      runNative: () => kind === 'timeout'
        ? { error: { code: 'ETIMEDOUT' }, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }
        : { status: 0, stdout: Buffer.from('DOMAIN_USER:CURRENT_1:/private/path\n'), stderr: Buffer.alloc(0) } })
    assert.equal(result.status, 'UNCERTAIN')
    assert.equal(journal.read().result, kind === 'timeout' ? 'CHILD_TIMEOUT' : 'CHILD_OUTPUT')
  })
})

test('result grammar excludes paths, raw errors and unbounded numbers', () => {
  assert.equal(observedSearchDomainCategory(observation), true)
  assert.equal(observedSearchDomainCategory('READ_UNAVAILABLE'), true)
  for (const value of [observation + ':/tmp/path', observation.replace('CURRENT_3', 'CURRENT_99'),
    observation.replace('DOMAIN_USER', 'DOMAIN_OTHER'), 'OSSTATUS_-50', 'PREFLIGHT']) {
    assert.equal(observedSearchDomainCategory(value), false)
  }
  assert.equal(validSearchDomainCategory('PREFLIGHT'), true)
  assert.deepEqual(classifySearchDomainChild({ status: 0,
    stdout: Buffer.from(`${observation}\nextra`), stderr: Buffer.alloc(0) }),
  { status: 'UNCERTAIN', category: 'CHILD_OUTPUT' })
})

test('launcher remains off and checks its own build before journal dispatch', () => {
  const body = readFileSync('scripts/staging-provider-keychain-search-domain-live-launcher.mjs', 'utf8')
  assert.match(body, /TLL_SEARCH_DOMAIN_LIVE_ENABLED = false/)
  assert.match(body, /createSearchDomainJournal/)
  assert.match(body, /buildIdentity\(\)/)
  assert.doesNotMatch(body, /tllFixture|SecKeychainDelete|security\s+delete-keychain/)
})
