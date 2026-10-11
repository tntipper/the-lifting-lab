import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildStagingProviderNormalizationPatch,
  STAGING_PROVIDER_NORMALIZATION_ENABLED,
  verifyStagingProviderNormalization,
} from '../scripts/staging-provider-normalization-contract.mjs'
import { PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'

const before = Object.freeze({
  id: 'staging-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER,
  name: STAGING_PROVIDER_NAME, client_id: STAGING_BROKER_PROVIDER.clientId,
  acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: true, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl,
  token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl,
  jwks_uri: 'https://staging.example.test/jwks', discovery_document: null,
  created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z',
})
const after = Object.freeze({ ...before, enabled: false, jwks_uri: '', updated_at: '2026-09-23T10:00:00.000Z' })

test('disabled contract proposes only two provider fields and returns a redacted verified receipt', () => {
  assert.equal(STAGING_PROVIDER_NORMALIZATION_ENABLED, false)
  assert.deepEqual(buildStagingProviderNormalizationPatch(before), { enabled: false, jwks_uri: '' })
  const receipt = verifyStagingProviderNormalization(before, after)
  assert.deepEqual(receipt, { status: 'PROVIDER_NORMALIZED_VERIFIED', identifier: PROVIDER_IDENTIFIER,
    enabled: false, jwksConfigured: false })
  assert.doesNotMatch(JSON.stringify(receipt), /staging\.example|client_secret/)
  const observed = { ...before, name: STAGING_BROKER_PROVIDER.clientId, scopes: [] }
  const observedAfter = { ...observed, enabled: false, jwks_uri: '', updated_at: after.updated_at }
  assert.deepEqual(buildStagingProviderNormalizationPatch(observed), { enabled: false, jwks_uri: '' })
  assert.equal(verifyStagingProviderNormalization(observed, observedAfter).status, 'PROVIDER_NORMALIZED_VERIFIED')
})

test('normalization holds any unrelated drift or incomplete readback', () => {
  for (const state of [
    { ...before, scopes: ['openid'] }, { ...before, name: 'other' }, { ...before, client_id: 'other' },
    { ...before, jwks_uri: '' }, { ...before, enabled: false },
    { ...before, client_secret: 'hidden' }, { ...before, extra: 'unknown' },
  ]) assert.throws(() => buildStagingProviderNormalizationPatch(state), /unavailable/)
  for (const state of [
    { ...after, enabled: true }, { ...after, jwks_uri: before.jwks_uri },
    { ...after, client_id: 'other' }, { ...after, id: 'other' },
    { ...after, scopes: [] }, { ...after, updated_at: '2026-09-21T10:00:00.000Z' },
    { ...after, discovery_document: {} },
    Object.fromEntries(Object.entries(after).filter(([key]) => key !== 'discovery_document')),
  ]) assert.throws(() => verifyStagingProviderNormalization(before, state), /unavailable/)
})

test('normalization module contains no ambient mutation or credential reader', () => {
  const source = readFileSync(new URL('../scripts/staging-provider-normalization-contract.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\bfetch\b|child_process|process\.env|keychain|createClient\(/i)
})
