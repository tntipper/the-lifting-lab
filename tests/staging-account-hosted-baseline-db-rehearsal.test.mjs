import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { runStagingDatabaseRehearsal } from '../scripts/staging-account-hosted-baseline-db-rehearsal.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL } from '../scripts/staging-account-hosted-baseline-database.mjs'

const launcher = readFileSync(resolve(import.meta.dirname, '../scripts/staging-account-hosted-baseline-db-rehearsal-live-launcher.mjs'), 'utf8')
const receipt = JSON.parse(STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL.match(/SELECT '([^']+)'::jsonb AS tll_staging_hosted_baseline_database;/)[1])

test('database rehearsal launcher remains disabled and fixes the Keychain selector', () => {
  assert.match(launcher, /NATIVE_DB_REHEARSAL_ENABLED = false/)
  assert.match(launcher, /\['find-generic-password', '-w', '-s', 'Supabase CLI', '-a', 'supabase'\]/)
  assert.match(launcher, /createStagingWindowPhaseJournal/)
})

function journal () {
  let intent; let terminal; let claims = 0
  return { read: () => null, claim: () => { claims++; intent = { runId: 'test', state: 'INTENT_RECORDED', startedAt: new Date().toISOString() }; return intent },
    finish: (_intent, value) => { terminal = value }, get claims () { return claims }, get terminal () { return terminal } }
}

test('rehearsal sends exact read-only staging query once and records only receipt hash', async () => {
  const trace = []; const j = journal(); const credential = Buffer.from('private-test-credential')
  const result = await runStagingDatabaseRehearsal({ journal: j, readCredential: async () => credential,
    fetch: async (url, options) => {
      trace.push({ url, method: options.method, body: JSON.parse(options.body) })
      return new Response(JSON.stringify([{ tll_staging_hosted_baseline_database: receipt }]), { status: 201, headers: { 'content-type': 'application/json' } })
    } })
  assert.equal(result.status, 'PASS')
  assert.equal(j.claims, 1)
  assert.equal(j.terminal.state, 'OBSERVATION_RECORDED')
  assert.equal(j.terminal.observationHash, createHash('sha256').update(JSON.stringify(receipt)).digest('hex'))
  assert.equal(JSON.stringify(j.terminal).includes('private-test-credential'), false)
  assert.deepEqual(trace, [{ url: 'https://api.supabase.com/v1/projects/qdmvngjwkcsilzmqksme/database/query', method: 'POST',
    body: { query: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL, read_only: true } }])
  assert(credential.every(byte => byte === 0))
})

test('rehearsal does not claim intent when credential is absent', async () => {
  const j = journal()
  const result = await runStagingDatabaseRehearsal({ journal: j, readCredential: async () => { throw Error('absent') },
    fetch: () => { throw Error('unexpected request') } })
  assert.equal(result.status, 'CREDENTIAL_UNAVAILABLE')
  assert.equal(j.claims, 0)
})

test('provider failure is reduced to a fixed reason and erases the credential', async () => {
  const j = journal(); const credential = Buffer.from('private-test-credential')
  const result = await runStagingDatabaseRehearsal({ journal: j, readCredential: async () => credential,
    fetch: async () => new Response('provider-private-error', { status: 500 }) })
  assert.deepEqual(result.reasonCodes, ['database_read_unavailable'])
  assert.equal(j.terminal.state, 'OBSERVATION_FAILED')
  assert.equal(JSON.stringify(j.terminal).includes('provider-private-error'), false)
  assert(credential.every(byte => byte === 0))
})

test('deadline abort settles the request before terminal failure', async () => {
  const j = journal(); const credential = Buffer.from('private-test-credential')
  let settled = false
  const result = await runStagingDatabaseRehearsal({ journal: j, readCredential: async () => credential,
    setTimer: callback => { queueMicrotask(callback); return 1 }, clearTimer: () => {},
    fetch: (_url, options) => new Promise(resolve => options.signal.addEventListener('abort', () => {
      settled = true
      resolve(new Response('{}', { status: 201 }))
    }, { once: true })) })
  assert.equal(settled, true)
  assert.deepEqual(result.reasonCodes, ['deadline_or_abort'])
  assert.equal(j.terminal.state, 'OBSERVATION_FAILED')
  assert(credential.every(byte => byte === 0))
})
