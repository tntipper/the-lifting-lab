import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER,
  STAGING_PROJECT_REF, STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import { createProviderNormalizationJournal } from '../scripts/staging-provider-normalization-journal.mjs'
import { createProviderNormalizationPhaseJournal } from '../scripts/staging-provider-normalization-phase-journal.mjs'
import { runSupabaseOnlyProviderSession, SUPABASE_ONLY_PROVIDER_SESSION_ENABLED } from '../scripts/staging-provider-supabase-only-session.mjs'

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

function fixture(change = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-supabase-session-'))
  const journal = createProviderNormalizationJournal({ path: join(directory, 'one-use.json'),
    makeRunId: () => 'f80746e1-7a8b-4b1a-9c2d-22cd94aaaf31', now: () => 1_789_000_000_000 })
  const phaseJournal = createProviderNormalizationPhaseJournal({ path: join(directory, 'phase.json'),
    makeRunId: () => 'f80746e1-7a8b-4b1a-9c2d-22cd94aaaf31', now: () => 1_789_000_000_000 })
  const management = Buffer.from('private-management-token'), key = Buffer.from('private-service-role-key')
  let state = provider(), updates = 0, credentialsRead = 0, disposed = 0, nativeCreated = 0
  const options = {
    journal, phaseJournal,
    readManagementCredential: async () => { credentialsRead++; if (change.credentialFailure) throw Error('credential unavailable'); return management },
    openSupabase: token => {
      assert.equal(token, management)
      return {
        target: STAGING_PROJECT_REF,
        readDatabase: async () => change.databaseFailure ? { status: 'FAIL' } : {
          status: 'PASS', target: STAGING_PROJECT_REF,
          counts: { migrations: 15, controlsEnabled: 0, runtimeRoles: 5, runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 },
        },
        readEdgeSecretNames: async () => change.brokerSecretPresent ? [BROKER_SECRET_NAME] : [],
        readProjectSecret: async () => { if (change.keyFailure) throw Error('key unavailable'); return key },
        dispose: () => { disposed++ },
      }
    },
    execute: async operation => ({ status: 'COMPLETED', value: await operation(new AbortController().signal) }),
    makeNativePort: ({ projectSecret }) => {
      nativeCreated++
      assert.equal(projectSecret, key)
      return {
        readProvider: async () => structuredClone(state),
        updateProvider: async (target, before) => {
          assert.deepEqual(target, STAGING_PROVIDER_TARGET)
          assert.deepEqual(before, provider())
          updates++
          if (change.updateFailure) throw Error('offline simulated uncertain dispatch')
          state = { ...state, enabled: false, jwks_uri: '', updated_at: '2026-09-23T10:00:00.000Z' }
          return { status: 'UPDATED_NEEDS_INDEPENDENT_READBACK', target, providerIdentifier: PROVIDER_IDENTIFIER }
        },
      }
    },
  }
  return { options, journal, phaseJournal, management, key, counts: () => ({ updates, credentialsRead, disposed, nativeCreated }) }
}

test('uncertain provider dispatch leaves both records consumed and never repeats', async () => {
  const f = fixture({ updateFailure: true })
  assert.equal((await runSupabaseOnlyProviderSession(f.options)).status, 'RECONCILIATION_REQUIRED')
  assert.equal(f.journal.read().state, 'RECONCILIATION_REQUIRED')
  assert.equal(f.phaseJournal.read().phase, 'UPDATE_DISPATCH')
  assert.equal(f.phaseJournal.read().outcome, 'RECONCILIATION_REQUIRED')
  assert.equal((await runSupabaseOnlyProviderSession(f.options)).status, 'REPLAY_REJECTED')
  assert.deepEqual(f.counts(), { updates: 1, credentialsRead: 1, disposed: 1, nativeCreated: 1 })
})

test('disabled session checks database and secrets before one provider update and wipes credentials', async () => {
  assert.equal(SUPABASE_ONLY_PROVIDER_SESSION_ENABLED, false)
  const f = fixture()
  assert.equal((await runSupabaseOnlyProviderSession(f.options)).status, 'NORMALIZED_VERIFIED')
  assert.equal(f.journal.read().state, 'NORMALIZED_VERIFIED')
  assert.equal(f.phaseJournal.read().outcome, 'VERIFIED')
  assert.deepEqual(f.counts(), { updates: 1, credentialsRead: 1, disposed: 1, nativeCreated: 1 })
  assert.deepEqual([...f.management], Array(f.management.length).fill(0))
  assert.deepEqual([...f.key], Array(f.key.length).fill(0))
  assert.equal((await runSupabaseOnlyProviderSession(f.options)).status, 'REPLAY_REJECTED')
  assert.equal(f.counts().credentialsRead, 1)
})

for (const [name, change] of [
  ['credential access fails', { credentialFailure: true }],
  ['database control check fails', { databaseFailure: true }],
  ['broker secret is present', { brokerSecretPresent: true }],
  ['service-role read fails', { keyFailure: true }],
]) {
  test(`${name} before provider intent or update`, async () => {
    const f = fixture(change)
    assert.equal((await runSupabaseOnlyProviderSession(f.options)).status, 'STOPPED_BEFORE_UPDATE')
    assert.equal(f.journal.read(), null)
    assert.equal(f.phaseJournal.read(), null)
    assert.equal(f.counts().updates, 0)
    assert.equal(f.counts().nativeCreated, 0)
    if (!change.credentialFailure) assert.deepEqual([...f.management], Array(f.management.length).fill(0))
  })
}
