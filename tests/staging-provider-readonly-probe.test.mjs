import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProviderNormalizationPhaseJournal } from '../scripts/staging-provider-normalization-phase-journal.mjs'
import { runStagingProviderReadOnlyProbe } from '../scripts/staging-provider-readonly-probe.mjs'
import { PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER, STAGING_PROJECT_REF } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from '../scripts/staging-account-hosted-baseline-database.mjs'

const makeJournal = () => {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-provider-readonly-')), 'probe.json')
  return { path, journal: createProviderNormalizationPhaseJournal({ path }) }
}
const credential = () => Buffer.from('staging-management-secret')
const database = () => Object.freeze({ status: 'PASS', target: STAGING_PROJECT_REF,
  queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID, receiptHash: 'a'.repeat(64),
  counts: Object.freeze({ migrations: 15, controlsEnabled: 0, runtimeRoles: 5,
    runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 }) })
const provider = () => ({ id: 'staging-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER,
  name: STAGING_BROKER_PROVIDER.clientId, client_id: STAGING_BROKER_PROVIDER.clientId,
  acceptable_client_ids: [], scopes: [], pkce_enabled: true, attribute_mapping: {}, authorization_params: {},
  enabled: true, email_optional: true, issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: 'https://staging.example.test/jwks',
  discovery_document: null, created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z' })

test('one read-only pass verifies strict database, secret absence and full provider contract without an update', async () => {
  const { path, journal } = makeJournal(); const token = credential(); const calls = []
  const result = await runStagingProviderReadOnlyProbe({ journal, readCredential: async () => token,
    openSupabase: supplied => {
      assert.equal(supplied, token)
      return { target: STAGING_PROJECT_REF, readDatabase: async () => { calls.push('database'); return database() },
        readEdgeSecretNames: async () => { calls.push('secrets'); return ['TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED'] },
        readProvider: async () => { calls.push('provider'); return provider() }, dispose: () => calls.push('dispose') }
    } })
  assert.deepEqual(calls, ['database', 'secrets', 'provider', 'dispose'])
  assert.deepEqual(result, { status: 'READONLY_PROVIDER_PRECONDITION_VERIFIED', target: STAGING_PROJECT_REF,
    providerIdentifier: PROVIDER_IDENTIFIER, databaseReceiptHash: 'a'.repeat(64) })
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.equal(journal.read().outcome, 'STOPPED_BEFORE_UPDATE')
  assert.doesNotMatch(readFileSync(path, 'utf8'), /staging-management-secret|staging\.example/)
  assert.deepEqual(await runStagingProviderReadOnlyProbe({ journal,
    readCredential: () => { throw Error('replay read') }, openSupabase: () => { throw Error('replay open') } }),
  { status: 'REPLAY_REJECTED', target: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER })
  assert.ok(token.every(byte => byte === 0))
})

test('wrong target or malformed strict database receipt stops before provider GET and wipes credential', async () => {
  for (const defective of ['target', 'database']) {
    const { journal } = makeJournal(); const token = credential(); let reads = 0
    const result = await runStagingProviderReadOnlyProbe({ journal, readCredential: async () => token,
      openSupabase: () => ({ target: defective === 'target' ? 'wrhgscovsgsudtedbljr' : STAGING_PROJECT_REF,
        readDatabase: async () => defective === 'database' ? { ...database(), counts: { ...database().counts, controlsEnabled: 1 } } : database(),
        readEdgeSecretNames: async () => [], readProvider: async () => { reads++; return provider() }, dispose: () => {} }) })
    assert.equal(result.status, 'READONLY_UNAVAILABLE')
    assert.equal(reads, 0)
    assert.equal(journal.read().outcome, 'RECONCILIATION_REQUIRED')
    assert.ok(token.every(byte => byte === 0))
  }
})

test('provider drift or broker secret presence consumes probe without update authority', async () => {
  for (const defective of ['provider', 'secret']) {
    const { journal } = makeJournal(); const token = credential(); let providerReads = 0
    const result = await runStagingProviderReadOnlyProbe({ journal, readCredential: async () => token,
      openSupabase: () => ({ target: STAGING_PROJECT_REF, readDatabase: async () => database(),
        readEdgeSecretNames: async () => defective === 'secret' ? ['TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET'] : [],
        readProvider: async () => { providerReads++; return defective === 'provider' ? { ...provider(), scopes: ['openid'] } : provider() },
        dispose: () => {} }) })
    assert.equal(result.status, 'READONLY_UNAVAILABLE')
    assert.equal(providerReads, defective === 'secret' ? 0 : 1)
    assert.equal(journal.read().outcome, 'RECONCILIATION_REQUIRED')
    assert.ok(token.every(byte => byte === 0))
  }
})

test('deadline during credential read wipes a late Buffer and consumes one probe', async () => {
  const { journal } = makeJournal(); let release
  const pending = new Promise(resolve => { release = resolve })
  const token = credential()
  const result = await runStagingProviderReadOnlyProbe({ journal, readCredential: () => pending,
    openSupabase: () => { throw Error('must not open') }, setTimer: callback => { callback(); return 1 }, clearTimer: () => {} })
  assert.equal(result.status, 'READONLY_UNAVAILABLE')
  assert.equal(journal.read().outcome, 'RECONCILIATION_REQUIRED')
  release(token)
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(token.every(byte => byte === 0))
})
