import test from 'node:test'
import assert from 'node:assert/strict'
import { createStagingProviderBrokerRotationReadiness } from '../scripts/staging-provider-broker-rotation-readiness.mjs'
import { PROVIDER_IDENTIFIER, RETAINED_STAGING_JWKS_URI, STAGING_PROVIDER_TARGET, STAGING_BROKER_PROVIDER } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'

const t0 = 1_789_000_000_000
const frozen = () => ({ target: STAGING_PROVIDER_TARGET, observedAt: new Date(t0).toISOString(),
  controls: { customer: false, cart: false, broker: false, provisional: false, bridge: false },
  runtimeSessions: 0, edgeEnabled: false, privateEnabled: false, publicEnabled: false,
  supabaseBrokerSecretNames: [], vercelBrokerSecretNames: [] })
const provider = () => ({
  id: 'custom-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER, name: STAGING_PROVIDER_NAME,
  client_id: STAGING_BROKER_PROVIDER.clientId, acceptable_client_ids: [], scopes: [], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true, issuer: '', discovery_url: '',
  skip_nonce_check: false, authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl,
  token_url: STAGING_BROKER_PROVIDER.tokenUrl, userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl,
  jwks_uri: RETAINED_STAGING_JWKS_URI, discovery_document: null,
  created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z',
})
const signal = () => new AbortController().signal
function fixture(changes = {}) {
  const calls = []
  let clock = t0
  const preflight = {
    preflight: async () => { calls.push('baseline'); clock += changes.delayBefore ?? 0; return changes.baseline ?? frozen() },
    readProvider: async () => { calls.push('provider'); clock += changes.delayAfter ?? 0; return changes.provider ?? provider() },
  }
  return { read: createStagingProviderBrokerRotationReadiness({ openPreflight: ownSignal => {
    assert.ok(ownSignal); return preflight
  }, now: () => clock }), calls }
}

test('exact disabled staging baseline and provider yield the frozen rotation receipt', async () => {
  const { read, calls } = fixture()
  assert.deepEqual(await read(STAGING_PROVIDER_TARGET, { signal: signal() }), {
    target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER, providerEnabled: false,
    edgeEnabled: false, privateEnabled: false, publicEnabled: false, supabase: [], vercel: [],
  })
  assert.deepEqual(calls, ['baseline', 'provider'])
})

test('wrong target or aborted signal stops before any read', async () => {
  const { read, calls } = fixture()
  await assert.rejects(read({ ...STAGING_PROVIDER_TARGET, projectRef: 'production' }, { signal: signal() }), /readiness unavailable/)
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(read(STAGING_PROVIDER_TARGET, { signal: aborted.signal }), /readiness unavailable/)
  assert.deepEqual(calls, [])
})

test('unsafe baseline refuses provider read; provider drift and elapsed deadline refuse receipt', async () => {
  for (const bad of [
    { ...frozen(), target: { ...STAGING_PROVIDER_TARGET, projectRef: 'production' } },
    { ...frozen(), controls: { ...frozen().controls, cart: true } },
    { ...frozen(), runtimeSessions: 1 },
    { ...frozen(), supabaseBrokerSecretNames: ['TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET'] },
    { ...frozen(), vercelBrokerSecretNames: ['TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET'] },
    { ...frozen(), observedAt: new Date(t0 - 1000).toISOString() },
  ]) {
    const { read, calls } = fixture({ baseline: bad })
    await assert.rejects(read(STAGING_PROVIDER_TARGET, { signal: signal() }), /readiness unavailable/)
    assert.deepEqual(calls, ['baseline'])
  }
  for (const bad of [
    { ...provider(), enabled: true },
    { ...provider(), jwks_uri: 'https://unexpected.example/jwks' },
    { ...provider(), identifier: 'custom:other' },
  ]) {
    const { read } = fixture({ provider: bad })
    await assert.rejects(read(STAGING_PROVIDER_TARGET, { signal: signal() }), /readiness unavailable/)
  }
  const { read } = fixture({ delayAfter: 30_001 })
  await assert.rejects(read(STAGING_PROVIDER_TARGET, { signal: signal() }), /readiness unavailable/)
  const late = fixture({ delayBefore: 30_001 })
  await assert.rejects(late.read(STAGING_PROVIDER_TARGET, { signal: signal() }), /readiness unavailable/)
  assert.deepEqual(late.calls, ['baseline'])
})

test('caller cancellation is bound to the preflight and stops a later provider read', async () => {
  const controller = new AbortController(), calls = []
  const read = createStagingProviderBrokerRotationReadiness({ now: () => t0,
    openPreflight: ownSignal => {
      assert.equal(ownSignal, controller.signal)
      return { preflight: async () => { calls.push('baseline'); controller.abort(); return frozen() },
        readProvider: async () => { calls.push('provider'); return provider() } }
    } })
  await assert.rejects(read(STAGING_PROVIDER_TARGET, { signal: controller.signal }), /readiness unavailable/)
  assert.deepEqual(calls, ['baseline'])
})

test('a stalled read returns on caller abort without dispatching the provider read', async () => {
  const controller = new AbortController(), calls = []
  const read = createStagingProviderBrokerRotationReadiness({ now: () => t0,
    openPreflight: ownSignal => {
      assert.equal(ownSignal, controller.signal)
      return { preflight: () => { calls.push('baseline'); return new Promise(() => {}) },
        readProvider: () => { calls.push('provider'); return provider() } }
    } })
  const pending = read(STAGING_PROVIDER_TARGET, { signal: controller.signal })
  await Promise.resolve(); await Promise.resolve()
  controller.abort()
  await assert.rejects(pending, /readiness unavailable/)
  assert.deepEqual(calls, ['baseline'])
})
