import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER, STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import { createProviderNormalizationJournal } from '../scripts/staging-provider-normalization-journal.mjs'
import { disableStagingProviderSupabaseOnly, SUPABASE_ONLY_PROVIDER_DISABLE_ENABLED } from '../scripts/staging-provider-supabase-only-coordinator.mjs'

const runId = 'f80746e1-7a8b-4b1a-9c2d-22cd94aaaf31'
const provider = () => ({
  id: 'custom-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER,
  name: STAGING_PROVIDER_NAME, client_id: STAGING_BROKER_PROVIDER.clientId,
  acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: true, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: 'https://staging.example.test/jwks', discovery_document: null,
  created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z',
})

function fixture({ prereadFails = false, updateFails = false, drift = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-supabase-only-'))
  const journal = createProviderNormalizationJournal({ path: join(directory, 'intent.json'), makeRunId: () => runId,
    now: () => 1_789_000_000_000 })
  let state = provider(), reads = 0, updates = 0
  const port = {
    readProvider: async target => {
      assert.deepEqual(target, STAGING_PROVIDER_TARGET)
      if (prereadFails) throw Error('offline simulated read failure')
      reads++
      return structuredClone(state)
    },
    updateProvider: async (target, before) => {
      assert.deepEqual(target, STAGING_PROVIDER_TARGET)
      assert.deepEqual(before, provider())
      updates++
      if (updateFails) throw Error('offline simulated uncertain update')
      state = { ...state, enabled: false, jwks_uri: '', updated_at: '2026-09-23T10:00:00.000Z',
        ...(drift ? { client_id: 'unexpected-client' } : {}) }
      return { status: 'UPDATED_NEEDS_INDEPENDENT_READBACK', target: STAGING_PROVIDER_TARGET,
        providerIdentifier: PROVIDER_IDENTIFIER }
    },
  }
  return { port, journal, counts: () => ({ reads, updates }) }
}

test('disabled Supabase-only coordinator makes one update and verifies all fields', async () => {
  assert.equal(SUPABASE_ONLY_PROVIDER_DISABLE_ENABLED, false)
  const f = fixture()
  assert.equal((await disableStagingProviderSupabaseOnly(f)).status, 'NORMALIZED_VERIFIED')
  assert.deepEqual(f.counts(), { reads: 2, updates: 1 })
  assert.equal(f.journal.read().state, 'NORMALIZED_VERIFIED')
  assert.equal((await disableStagingProviderSupabaseOnly(f)).status, 'REPLAY_REJECTED')
  assert.deepEqual(f.counts(), { reads: 2, updates: 1 })
})

test('failed preread stops before durable intent or update', async () => {
  const f = fixture({ prereadFails: true })
  assert.equal((await disableStagingProviderSupabaseOnly(f)).status, 'STOPPED_BEFORE_UPDATE')
  assert.equal(f.journal.read(), null)
  assert.deepEqual(f.counts(), { reads: 0, updates: 0 })
})

test('uncertain update consumes intent and cannot retry', async () => {
  const f = fixture({ updateFails: true })
  assert.equal((await disableStagingProviderSupabaseOnly(f)).status, 'RECONCILIATION_REQUIRED')
  assert.equal(f.journal.read().state, 'RECONCILIATION_REQUIRED')
  assert.equal((await disableStagingProviderSupabaseOnly(f)).status, 'REPLAY_REJECTED')
  assert.deepEqual(f.counts(), { reads: 1, updates: 1 })
})

test('unrelated provider field drift rejects success and cannot retry', async () => {
  const f = fixture({ drift: true })
  assert.equal((await disableStagingProviderSupabaseOnly(f)).status, 'RECONCILIATION_REQUIRED')
  assert.equal(f.journal.read().state, 'RECONCILIATION_REQUIRED')
  assert.deepEqual(f.counts(), { reads: 2, updates: 1 })
})
