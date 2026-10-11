import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStagingMinimumConfigurationJournal } from '../scripts/staging-minimum-configuration-journal.mjs'
import { runStagingMinimumConfigurationObservation, STAGING_MINIMUM_CONFIGURATION_OBSERVER_ENABLED } from '../scripts/staging-minimum-configuration-observer.mjs'
import { REQUIRED_EDGE_NAMES } from '../scripts/staging-minimum-configuration-assessment.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from '../scripts/staging-account-hosted-baseline-database.mjs'
import { STAGING_BROKER_PROVIDER, STAGING_PROJECT_REF } from '../scripts/staging-provider-broker-rotation.mjs'

const database = () => ({ status: 'PASS', target: STAGING_PROJECT_REF,
  queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID, receiptHash: 'a'.repeat(64),
  counts: { migrations: 15, controlsEnabled: 0, runtimeRoles: 5, runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 } })
const provider = () => ({ id: 'provider-id', provider_type: 'oauth2', identifier: STAGING_BROKER_PROVIDER.identifier,
  name: 'TLL staging subject broker', client_id: STAGING_BROKER_PROVIDER.clientId,
  acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true, enabled: false,
  email_optional: true, attribute_mapping: null, authorization_params: null,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl,
  token_url: STAGING_BROKER_PROVIDER.tokenUrl, userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl,
  jwks_uri: STAGING_BROKER_PROVIDER.jwksUrl,
  created_at: '2026-09-25T10:00:00Z', updated_at: '2026-09-25T11:00:00Z' })
function journal() {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-minimum-supabase-')), 'journal.json')
  return { path, record: createStagingMinimumConfigurationJournal({ path }) }
}

test('claim precedes credential and fixed reads; result is nonsecret and cannot replay', async () => {
  assert.equal(STAGING_MINIMUM_CONFIGURATION_OBSERVER_ENABLED, false)
  const { path, record } = journal(), events = [], token = Buffer.from('synthetic-token')
  const run = () => runStagingMinimumConfigurationObservation({
    journal: record,
    readCredential: async () => { events.push('credential'); assert.equal(record.read().state, 'CLAIMED'); return token },
    openSupabase: () => ({ target: STAGING_PROJECT_REF,
      readDatabase: async () => { events.push('database'); return database() },
      readEdgeSecretNames: async () => { events.push('names'); return [...REQUIRED_EDGE_NAMES] },
      readProvider: async () => { events.push('provider'); return provider() },
      dispose: () => events.push('dispose') }),
  })
  const result = await run()
  assert.equal(result.status, 'DISABLED_BASELINE_OBSERVED')
  assert.deepEqual(events, ['credential', 'database', 'names', 'provider', 'dispose'])
  assert.equal(token.every(byte => byte === 0), true)
  assert.equal(record.read().state, 'FINISHED')
  assert.equal(record.read().outcome, 'DISABLED_BASELINE_OBSERVED')
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.equal((await run()).status, 'REPLAY_REJECTED')
  assert.deepEqual(events, ['credential', 'database', 'names', 'provider', 'dispose'])
})

test('project mismatch stops before any Supabase read and consumes record', async () => {
  const { record } = journal(); let calls = 0
  const result = await runStagingMinimumConfigurationObservation({ journal: record,
    readCredential: async () => Buffer.from('synthetic-token'),
    openSupabase: () => ({ target: 'wrhgscovsgsudtedbljr',
      readDatabase: async () => { calls++ }, readEdgeSecretNames: async () => { calls++ },
      readProvider: async () => { calls++ }, dispose: () => {} }) })
  assert.equal(result.status, 'READ_UNAVAILABLE')
  assert.equal(calls, 0)
  assert.equal(record.read().outcome, 'READ_UNAVAILABLE')
})

test('slow credential is wiped after deadline and no reader opens', async () => {
  const { record } = journal(); let deliver
  const pending = new Promise(resolve => { deliver = resolve })
  const result = await runStagingMinimumConfigurationObservation({ journal: record,
    readCredential: async () => pending, openSupabase: () => { throw Error('must not open') },
    setTimer: callback => { queueMicrotask(callback); return 1 }, clearTimer: () => {} })
  assert.equal(result.status, 'READ_UNAVAILABLE')
  const late = Buffer.from('synthetic-late-token')
  deliver(late)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(late.every(byte => byte === 0), true)
  assert.equal(record.read().outcome, 'READ_UNAVAILABLE')
})

test('changed provider remains a terminal unavailable result', async () => {
  const { record } = journal()
  const result = await runStagingMinimumConfigurationObservation({ journal: record,
    readCredential: async () => Buffer.from('synthetic-token'),
    openSupabase: () => ({ target: STAGING_PROJECT_REF,
      readDatabase: async () => database(), readEdgeSecretNames: async () => [...REQUIRED_EDGE_NAMES],
      readProvider: async () => ({ ...provider(), enabled: true }), dispose: () => {} }) })
  assert.equal(result.status, 'READ_UNAVAILABLE')
  assert.equal(record.read().outcome, 'READ_UNAVAILABLE')
})
