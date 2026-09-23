import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER, STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import { verifyStagingProviderNormalization } from '../scripts/staging-provider-normalization-contract.mjs'
import {
  createStagingProviderNormalizationNativePort,
  NATIVE_STAGING_PROVIDER_NORMALIZATION_ENABLED,
} from '../scripts/staging-provider-normalization-native-port.mjs'

const secret = Buffer.from('p'.repeat(48))
const provider = (overrides = {}) => ({
  id: 'custom-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER,
  name: STAGING_PROVIDER_NAME, client_id: STAGING_BROKER_PROVIDER.clientId,
  acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: true, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl,
  token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl,
  jwks_uri: 'https://staging.example.test/jwks', discovery_document: null,
  created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z', ...overrides,
})
const completed = async operation => ({ status: 'COMPLETED', value: await operation(new AbortController().signal) })
const response = data => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })

test('SDK port sends one fixed partial update and requires a separate validated readback', async () => {
  assert.equal(NATIVE_STAGING_PROVIDER_NORMALIZATION_ENABLED, false)
  const calls = [], before = provider({ name: STAGING_BROKER_PROVIDER.clientId, scopes: [] })
  const after = { ...before, enabled: false, jwks_uri: '', updated_at: '2026-09-23T10:00:00.000Z' }
  let current = before
  const port = createStagingProviderNormalizationNativePort({ projectSecret: Buffer.from(secret), execute: completed,
    fetcher: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body, redirect: init.redirect, signal: init.signal })
      if (init.method === 'PUT') current = after
      return response(current)
    } })
  const readBefore = await port.readProvider(STAGING_PROVIDER_TARGET)
  const receipt = await port.updateProvider(STAGING_PROVIDER_TARGET, readBefore)
  const readAfter = await port.readProvider(STAGING_PROVIDER_TARGET)
  assert.equal(verifyStagingProviderNormalization(readBefore, readAfter).status, 'PROVIDER_NORMALIZED_VERIFIED')
  assert.deepEqual(receipt, { status: 'UPDATED_NEEDS_INDEPENDENT_READBACK', target: STAGING_PROVIDER_TARGET,
    providerIdentifier: PROVIDER_IDENTIFIER })
  assert.deepEqual(calls.map(call => call.method), ['GET', 'PUT', 'GET'])
  assert.ok(calls.every(call => call.url === `https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/admin/custom-providers/${PROVIDER_IDENTIFIER}`
    && call.redirect === 'error' && call.signal.aborted === false))
  assert.deepEqual(JSON.parse(calls[1].body), { enabled: false, jwks_uri: '' })
  assert.doesNotMatch(JSON.stringify(receipt), /staging\.example|client_secret/)
  await assert.rejects(() => port.updateProvider(STAGING_PROVIDER_TARGET, readBefore), /unavailable/)
  assert.equal(calls.filter(call => call.method === 'PUT').length, 1)
})

test('target, pre-update state, transport errors and malformed response fail closed', async () => {
  let calls = 0
  const make = (fetcher, execute = completed) => createStagingProviderNormalizationNativePort({ projectSecret: Buffer.from(secret), execute, fetcher })
  const port = make(async () => { calls++; return response(provider()) })
  await assert.rejects(() => port.readProvider({ ...STAGING_PROVIDER_TARGET, projectRef: 'wrhgscovsgsudtedbljr' }), /unavailable/)
  await assert.rejects(() => port.updateProvider(STAGING_PROVIDER_TARGET, provider({ jwks_uri: '' })), /unavailable/)
  await assert.rejects(() => port.updateProvider(STAGING_PROVIDER_TARGET, provider({ scopes: ['openid'] })), /unavailable/)
  assert.equal(calls, 0)
  const originalConsoleError = console.error
  console.error = () => {}
  try {
    await assert.rejects(() => make(async () => { throw Error('private transport error') }).readProvider(STAGING_PROVIDER_TARGET),
      error => error.message === 'Staging provider normalization native port unavailable')
  } finally { console.error = originalConsoleError }
  await assert.rejects(() => make(async () => response(provider({ client_secret: 'hidden' }))).readProvider(STAGING_PROVIDER_TARGET), /unavailable/)
  await assert.rejects(() => make(async () => response(provider()), async () => ({ status: 'CANCELLED', value: null })).readProvider(STAGING_PROVIDER_TARGET), /unavailable/)
  await assert.rejects(() => make(async () => response(provider())).updateProvider(STAGING_PROVIDER_TARGET, provider()), /unavailable/)
  const changed = provider({ enabled: false, jwks_uri: '', scopes: [] })
  await assert.rejects(() => make(async () => response(changed)).updateProvider(STAGING_PROVIDER_TARGET, provider()), /unavailable/)
})

test('normalization port has no ambient credential source, process runner or launcher', () => {
  const source = readFileSync(new URL('../scripts/staging-provider-normalization-native-port.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /child_process|process\.env|keychain|spawn\(|exec\(/i)
  assert.throws(() => createStagingProviderNormalizationNativePort(), /unavailable/)
})
