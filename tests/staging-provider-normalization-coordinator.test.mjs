import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER, STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import { createProviderNormalizationJournal } from '../scripts/staging-provider-normalization-journal.mjs'
import { normalizeStagingProviderOnce, STAGING_PROVIDER_NORMALIZATION_COORDINATOR_ENABLED } from '../scripts/staging-provider-normalization-coordinator.mjs'

const nowMs = 1_789_000_000_000
const observedAt = new Date(nowMs).toISOString()
const baseline = (timestamp = observedAt) => ({ target: STAGING_PROVIDER_TARGET, observedAt: timestamp,
  controls: { customer: false, cart: false, broker: false, provisional: false, bridge: false }, runtimeSessions: 0,
  edgeEnabled: false, privateEnabled: false, publicEnabled: false,
  supabaseBrokerSecretNames: [], vercelBrokerSecretNames: [] })
const provider = (overrides = {}) => ({
  id: 'custom-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER,
  name: STAGING_PROVIDER_NAME, client_id: STAGING_BROKER_PROVIDER.clientId,
  acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: true, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl,
  token_url: STAGING_BROKER_PROVIDER.tokenUrl, userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl,
  jwks_uri: 'https://staging.example.test/jwks', discovery_document: null,
  created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z', ...overrides,
})
const journalAt = () => {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-provider-coordinator-')), 'journal.json')
  return { path, journal: createProviderNormalizationJournal({ path,
    makeRunId: () => 'f80746e1-7a8b-4b1a-9c2d-22cd94aaaf31', now: () => nowMs }) }
}

test('one frozen baseline, intent, update, separate provider read and frozen postflight reach verified', async () => {
  assert.equal(STAGING_PROVIDER_NORMALIZATION_COORDINATOR_ENABLED, false)
  const { path, journal } = journalAt(), calls = []
  const before = provider({ name: STAGING_BROKER_PROVIDER.clientId, scopes: [] })
  const after = { ...before, enabled: false, jwks_uri: '', updated_at: '2026-09-23T10:00:00.000Z' }
  let current = before
  const ports = {
    preflight: async target => { assert.deepEqual(target, STAGING_PROVIDER_TARGET); calls.push('preflight')
      return baseline(calls.filter(call => call === 'preflight').length === 1 ? new Date(nowMs - 1).toISOString() : observedAt) },
    readProvider: async target => { assert.deepEqual(target, STAGING_PROVIDER_TARGET); calls.push('read'); return current },
    updateProvider: async (target, observed) => {
      assert.deepEqual(target, STAGING_PROVIDER_TARGET); assert.deepEqual(observed, before)
      assert.equal(journal.read().state, 'INTENT_RECORDED')
      observed.scopes.push('caller-mutation-must-not-change-baseline')
      calls.push('update'); current = after
      return { status: 'UPDATED_NEEDS_INDEPENDENT_READBACK', target, providerIdentifier: PROVIDER_IDENTIFIER }
    },
  }
  const result = await normalizeStagingProviderOnce({ ports, journal, now: () => nowMs })
  assert.equal(result.status, 'NORMALIZED_VERIFIED')
  assert.deepEqual(calls, ['preflight', 'read', 'update', 'read', 'preflight'])
  assert.equal(journal.read().state, 'NORMALIZED_VERIFIED')
  assert.doesNotMatch(readFileSync(path, 'utf8'), /staging\.example|client_secret|https:/)
  assert.equal((await normalizeStagingProviderOnce({ ports, journal, now: () => nowMs })).status, 'REPLAY_REJECTED')
})

test('stale or unsafe preflight and provider drift stop before intent or mutation', async () => {
  for (const drift of [
    { ...baseline(), observedAt: new Date(nowMs - 31_000).toISOString() },
    { ...baseline(), target: { ...STAGING_PROVIDER_TARGET, projectRef: 'wrhgscovsgsudtedbljr' } },
    { ...baseline(), controls: { ...baseline().controls, customer: true } },
    { ...baseline(), runtimeSessions: 1 }, { ...baseline(), vercelBrokerSecretNames: ['TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET'] },
  ]) {
    const { journal } = journalAt(); let updates = 0
    const result = await normalizeStagingProviderOnce({ ports: {
      preflight: async () => drift, readProvider: async () => provider(), updateProvider: async () => { updates++ },
    }, journal, now: () => nowMs })
    assert.equal(result.status, 'STOPPED_BEFORE_UPDATE'); assert.equal(updates, 0); assert.equal(journal.read(), null)
  }
  const { journal } = journalAt(); let updates = 0
  const result = await normalizeStagingProviderOnce({ ports: {
    preflight: async () => baseline(), readProvider: async () => provider({ scopes: ['openid'] }), updateProvider: async () => { updates++ },
  }, journal, now: () => nowMs })
  assert.equal(result.status, 'STOPPED_BEFORE_UPDATE'); assert.equal(updates, 0); assert.equal(journal.read(), null)
})

test('provider read consuming preflight freshness stops before durable intent', async () => {
  const { journal } = journalAt(); let clock = nowMs, updates = 0
  const result = await normalizeStagingProviderOnce({ ports: {
    preflight: async () => baseline(),
    readProvider: async () => { clock += 31_000; return provider() },
    updateProvider: async () => { updates++ },
  }, journal, now: () => clock })
  assert.equal(result.status, 'STOPPED_BEFORE_UPDATE')
  assert.equal(updates, 0)
  assert.equal(journal.read(), null)
})

test('journal persistence consuming preflight freshness reconciles without dispatch', async () => {
  const { journal } = journalAt(); let clock = nowMs, updates = 0
  const delayedJournal = {
    read: () => journal.read(),
    recordIntent: hash => { const receipt = journal.recordIntent(hash); clock += 31_000; return receipt },
    transition: (receipt, state) => journal.transition(receipt, state),
  }
  const result = await normalizeStagingProviderOnce({ ports: {
    preflight: async () => baseline(), readProvider: async () => provider(),
    updateProvider: async () => { updates++ },
  }, journal: delayedJournal, now: () => clock })
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(updates, 0)
  assert.equal(journal.read().state, 'RECONCILIATION_REQUIRED')
})

test('uncertain update or post-read mismatch consumes journal without a second update', async () => {
  for (const failure of ['update', 'postread', 'postflight', 'stale-postflight']) {
    const { journal } = journalAt(); let reads = 0, updates = 0, preflights = 0
    const ports = {
      preflight: async () => { preflights++; return failure === 'postflight' && preflights === 2
        ? { ...baseline(), controls: { ...baseline().controls, cart: true } }
        : baseline(preflights === 1 || failure === 'stale-postflight' ? new Date(nowMs - 1).toISOString() : observedAt) },
      readProvider: async () => { reads++; return failure === 'postread' && reads === 2
        ? provider({ enabled: false, jwks_uri: '', scopes: [] })
        : reads === 1 ? provider() : provider({ enabled: false, jwks_uri: '', updated_at: '2026-09-23T10:00:00.000Z' }) },
      updateProvider: async () => { updates++; if (failure === 'update') throw Error('private transport error')
        return { status: 'UPDATED_NEEDS_INDEPENDENT_READBACK', target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER } },
    }
    const result = await normalizeStagingProviderOnce({ ports, journal, now: () => nowMs })
    assert.equal(result.status, 'RECONCILIATION_REQUIRED'); assert.equal(updates, 1)
    assert.equal(journal.read().state, 'RECONCILIATION_REQUIRED')
    assert.equal((await normalizeStagingProviderOnce({ ports, journal, now: () => nowMs })).status, 'REPLAY_REJECTED')
    assert.equal(updates, 1)
  }
})
