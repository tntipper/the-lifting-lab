import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProviderNormalizationPhaseJournal } from '../scripts/staging-provider-normalization-phase-journal.mjs'
import { BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER,
  STAGING_PROJECT_REF } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from '../scripts/staging-account-hosted-baseline-database.mjs'
import { reconcileSafeHeldProviderOnce, RETAINED_STAGING_JWKS_URI } from '../scripts/staging-provider-safe-held-reconciliation.mjs'

const provider = () => ({
  id: 'staging-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER,
  name: STAGING_BROKER_PROVIDER.clientId, client_id: STAGING_BROKER_PROVIDER.clientId,
  acceptable_client_ids: [], scopes: [], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl,
  token_url: STAGING_BROKER_PROVIDER.tokenUrl, userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl,
  jwks_uri: RETAINED_STAGING_JWKS_URI, discovery_document: null,
  created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-25T10:00:00.000Z',
})
const database = () => ({ status: 'PASS', target: STAGING_PROJECT_REF,
  queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID, receiptHash: 'a'.repeat(64),
  counts: { migrations: 15, controlsEnabled: 0, runtimeRoles: 5,
    runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 } })

function fixture(change = {}) {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-provider-safe-held-')), 'journal.json')
  const journal = createProviderNormalizationPhaseJournal({ path })
  const token = Buffer.from('private-management-token')
  const calls = []
  const options = { journal,
    readCredential: async () => { calls.push('credential'); if (change.credentialFailure) throw Error('unavailable'); return token },
    openSupabase: supplied => {
      assert.equal(supplied, token)
      return { target: STAGING_PROJECT_REF,
        readDatabase: async () => { calls.push('database'); return change.databaseFailure
          ? { ...database(), counts: { ...database().counts, controlsEnabled: 1 } } : database() },
        readEdgeSecretNames: async () => { calls.push('secrets'); return change.brokerSecret ? [BROKER_SECRET_NAME] : [] },
        readProvider: async () => { calls.push('provider'); return { ...provider(), ...change.provider } },
        dispose: () => { calls.push('dispose') },
      }
    },
    execute: async operation => { calls.push('execute'); return { status: 'COMPLETED',
      value: await operation(new AbortController().signal) } },
  }
  return { options, calls, token, journal }
}

test('one read-only reconciliation proves disabled known-JWKS holding state', async () => {
  const f = fixture()
  assert.equal((await reconcileSafeHeldProviderOnce(f.options)).status, 'SAFE_HELD_PROVIDER_OBSERVED')
  assert.deepEqual(f.calls, ['credential', 'execute', 'database', 'secrets', 'execute', 'provider', 'dispose'])
  assert.equal(f.journal.read().outcome, 'STOPPED_BEFORE_UPDATE')
  assert.ok(f.token.every(byte => byte === 0))
  assert.equal((await reconcileSafeHeldProviderOnce(f.options)).status, 'REPLAY_REJECTED')
  assert.equal(f.calls.length, 7)
})

for (const [name, change, expectedReads] of [
  ['credential failure', { credentialFailure: true }, 1],
  ['database controls enabled', { databaseFailure: true }, 3],
  ['broker secret present', { brokerSecret: true }, 4],
  ['provider enabled', { provider: { enabled: true } }, 6],
  ['different JWKS', { provider: { jwks_uri: 'https://other.example/jwks' } }, 6],
  ['unexpected provider field', { provider: { scopes: ['openid'] } }, 6],
]) {
  test(`${name} stops without mutation and consumes the one-use read`, async () => {
    const f = fixture(change)
    assert.equal((await reconcileSafeHeldProviderOnce(f.options)).status, 'READ_UNAVAILABLE')
    assert.equal(f.journal.read().outcome, 'RECONCILIATION_REQUIRED')
    assert.equal(f.calls.filter(call => call !== 'dispose').length, expectedReads)
    if (!change.credentialFailure) assert.ok(f.token.every(byte => byte === 0))
    assert.equal((await reconcileSafeHeldProviderOnce(f.options)).status, 'REPLAY_REJECTED')
  })
}

test('two slow preflight reads share one deadline before provider access', async () => {
  let clock = Date.parse('2026-09-25T10:00:00.000Z'), executions = 0, providerReads = 0
  const path = join(mkdtempSync(join(tmpdir(), 'tll-provider-safe-held-clock-')), 'journal.json')
  const journal = createProviderNormalizationPhaseJournal({ path, now: () => clock })
  const token = Buffer.from('private-management-token')
  const result = await reconcileSafeHeldProviderOnce({ journal, readCredential: async () => token,
    openSupabase: () => ({ target: STAGING_PROJECT_REF,
      readDatabase: async () => { clock += 25_000; return database() },
      readEdgeSecretNames: async () => { clock += 25_000; return [] },
      readProvider: async () => { providerReads++; return provider() },
      dispose: () => {},
    }),
    execute: async operation => {
      executions++
      const started = clock, value = await operation(new AbortController().signal)
      if (clock - started > 30_000) throw Error('shared deadline exceeded')
      return { status: 'COMPLETED', value }
    },
  })
  assert.equal(result.status, 'READ_UNAVAILABLE')
  assert.equal(executions, 1)
  assert.equal(providerReads, 0)
  assert.equal(journal.read().outcome, 'RECONCILIATION_REQUIRED')
  assert.ok(token.every(byte => byte === 0))
})
