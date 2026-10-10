import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { runStagingDatabaseDiagnostic } from '../scripts/staging-account-hosted-baseline-db-diagnostic.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL } from '../scripts/staging-account-hosted-baseline-database.mjs'
import { createStagingWindowPhaseJournal } from '../scripts/staging-account-hosted-baseline-session.mjs'

const receipt = JSON.parse(STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL.match(/SELECT '([^']+)'::jsonb AS tll_staging_hosted_baseline_database;/)[1])
const launcher = readFileSync(resolve(import.meta.dirname, '../scripts/staging-account-hosted-baseline-db-diagnostic-live-launcher.mjs'), 'utf8')
function journal () {
  let intent; let terminal; let claims = 0
  return { read: () => null, claim: () => { claims++; intent = { runId: 'test', state: 'INTENT_RECORDED', startedAt: new Date().toISOString() }; return intent },
    finish: (_intent, value) => { terminal = value }, get claims () { return claims }, get terminal () { return terminal } }
}
const token = () => Buffer.from('private-test-management-token')
const json = (value, status) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

test('diagnostic launcher is disabled and fixed to one credential selector and journal', () => {
  assert.match(launcher, /NATIVE_DB_DIAGNOSTIC_ENABLED = false/)
  assert.match(launcher, /\['find-generic-password', '-w', '-s', 'Supabase CLI', '-a', 'supabase'\]/)
  assert.match(launcher, /createStagingWindowPhaseJournal/)
})

test('exact staging read-only SQL gives PASS only after receipt validation', async () => {
  const calls = []; const j = journal(); const credential = token()
  const result = await runStagingDatabaseDiagnostic({ journal: j, readCredential: async () => credential,
    fetch: async (url, options) => {
      calls.push({ url, method: options.method, redirect: options.redirect, body: JSON.parse(options.body) })
      return json([{ tll_staging_hosted_baseline_database: receipt }], 201)
    } })
  assert.equal(result.status, 'PASS')
  assert.equal(j.claims, 1)
  assert.equal(j.terminal.status, 'PASS')
  assert.deepEqual(calls, [{ url: 'https://api.supabase.com/v1/projects/qdmvngjwkcsilzmqksme/database/query', method: 'POST',
    redirect: 'error', body: { query: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL, read_only: true } }])
  assert(credential.every(byte => byte === 0))
})

test('standard chunked framing still requires the exact validated receipt', async () => {
  const j = journal()
  const result = await runStagingDatabaseDiagnostic({ journal: j, readCredential: async () => token(),
    fetch: async () => new Response(JSON.stringify([{ tll_staging_hosted_baseline_database: receipt }]),
      { status: 201, headers: { 'transfer-encoding': 'chunked' } }) })
  assert.equal(result.status, 'PASS')
  assert.equal(j.terminal.status, 'PASS')
})

test('SQL errors project only status, SQLSTATE and a known guard code', async () => {
  const j = journal(); const credential = token()
  const result = await runStagingDatabaseDiagnostic({ journal: j, readCredential: async () => credential,
    fetch: async () => json({ code: '42501', message: 'Hosted baseline runtime credential mismatch', token: 'must-not-escape' }, 400) })
  assert.deepEqual(result.reasonCodes, ['HTTP_400', 'SQLSTATE_42501', 'SQL_GUARD_RUNTIME_CREDENTIAL_MISMATCH'])
  assert.equal(j.terminal.status, 'HOLD')
  assert.equal(JSON.stringify(j.terminal).includes('must-not-escape'), false)
  assert(credential.every(byte => byte === 0))
})

test('HTTP failure, malformed receipt, framing drift and missing credential cannot pass', async () => {
  const outcomes = [
    { response: json({ message: 'secret value' }, 403), reasons: ['HTTP_403'] },
    { response: json([{ tll_staging_hosted_baseline_database: { ...receipt, runtimeSessions: 1 } }], 201), reasons: ['RECEIPT_MISMATCH'] },
    { response: new Response('[]', { status: 201, headers: { 'content-encoding': 'gzip' } }), reasons: ['HTTP_201', 'RESPONSE_CONTENT_ENCODING'] },
    { response: new Response('[]', { status: 201, headers: { 'transfer-encoding': 'gzip' } }), reasons: ['HTTP_201', 'RESPONSE_TRANSFER_ENCODING'] },
    { response: new Response('[]', { status: 201, headers: { 'content-length': '1048577' } }), reasons: ['HTTP_201', 'RESPONSE_CONTENT_LENGTH'] },
    { response: new Response('access denied', { status: 401 }), reasons: ['HTTP_401', 'BODY_INVALID_JSON'] },
    { response: new Response('forbidden', { status: 403 }), reasons: ['HTTP_403', 'BODY_INVALID_JSON'] },
    { response: new Response('upstream unavailable', { status: 502 }), reasons: ['HTTP_502', 'BODY_INVALID_JSON'] },
  ]
  for (const item of outcomes) {
    const j = journal(); const credential = token()
    const result = await runStagingDatabaseDiagnostic({ journal: j, readCredential: async () => credential, fetch: async () => item.response })
    assert.deepEqual(result.reasonCodes, item.reasons)
    assert.equal(j.terminal.status, 'HOLD')
    assert(credential.every(byte => byte === 0))
  }
  const j = journal()
  assert.equal((await runStagingDatabaseDiagnostic({ journal: j, readCredential: async () => { throw Error('absent') }, fetch: () => { throw Error('unexpected') } })).status, 'CREDENTIAL_UNAVAILABLE')
  assert.equal(j.claims, 0)
})

test('real journal stores a finite HOLD classification without response data', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'tll-db-diagnostic-'))
  const path = resolve(dir, 'journal.json')
  try {
    const j = createStagingWindowPhaseJournal({ path })
    const result = await runStagingDatabaseDiagnostic({ journal: j, readCredential: async () => token(),
      fetch: async () => json({ message: 'provider-private-text' }, 403) })
    assert.deepEqual(result.reasonCodes, ['HTTP_403'])
    assert.equal(statSync(path).mode & 0o777, 0o600)
    assert.equal(j.read().status, 'HOLD')
    assert.equal(readFileSync(path, 'utf8').includes('provider-private-text'), false)
    assert.equal((await runStagingDatabaseDiagnostic({ journal: createStagingWindowPhaseJournal({ path }), readCredential: async () => token(),
      fetch: () => { throw Error('second request forbidden') } })).status, 'JOURNAL_UNAVAILABLE')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('deadline abort settles request and records only bounded classification', async () => {
  const j = journal(); const credential = token(); let settled = false; let bodyCanceled = false
  const result = await runStagingDatabaseDiagnostic({ journal: j, readCredential: async () => credential,
    setTimer: callback => { queueMicrotask(callback); return 1 }, clearTimer: () => {},
    fetch: (_url, options) => new Promise(resolve => options.signal.addEventListener('abort', () => {
      settled = true; resolve(new Response(new ReadableStream({ cancel () { bodyCanceled = true } }), { status: 201 }))
    }, { once: true })) })
  assert.equal(settled, true)
  assert.equal(bodyCanceled, true)
  assert.deepEqual(result.reasonCodes, ['DEADLINE_ABORT'])
  assert.equal(j.terminal.status, 'HOLD')
  assert(credential.every(byte => byte === 0))
})

test('late body cancellation failure leaves journal intent unresolved', async () => {
  const j = journal(); const credential = token()
  const result = await runStagingDatabaseDiagnostic({ journal: j, readCredential: async () => credential,
    setTimer: callback => { queueMicrotask(callback); return 1 }, clearTimer: () => {},
    fetch: (_url, options) => new Promise(resolve => options.signal.addEventListener('abort', () => resolve({
      status: 201, redirected: false, headers: new Headers(),
      body: { cancel: async () => { throw Error('private cleanup failure') } },
    }), { once: true })) })
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(j.terminal, undefined)
  assert(credential.every(byte => byte === 0))
})
