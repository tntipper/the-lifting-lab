import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BROKER_RECOVERY_PINNED_DEPLOYMENT } from '../scripts/staging-provider-broker-recovery-read-bindings.mjs'
import { PROVIDER_IDENTIFIER, RETAINED_STAGING_JWKS_URI, STAGING_BROKER_PROVIDER,
  STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from '../scripts/staging-account-hosted-baseline-database.mjs'
import { createStagingProviderBrokerRestReadiness, STAGING_BROKER_REST_READINESS_ENABLED } from '../scripts/staging-provider-broker-rest-readiness.mjs'

const nowMs = Date.parse('2026-09-25T12:00:00.000Z')
const provider = () => ({
  id: 'synthetic-provider', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER, name: STAGING_PROVIDER_NAME,
  client_id: STAGING_BROKER_PROVIDER.clientId, acceptable_client_ids: [], scopes: [], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: RETAINED_STAGING_JWKS_URI,
  discovery_document: null, created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z',
})
const preview = () => ({ deployment: BROKER_RECOVERY_PINNED_DEPLOYMENT,
  preview: { deploymentId: BROKER_RECOVERY_PINNED_DEPLOYMENT.deploymentId,
    immutableUrl: BROKER_RECOVERY_PINNED_DEPLOYMENT.immutableUrl,
    projectRef: STAGING_PROVIDER_TARGET.projectRef, branch: STAGING_PROVIDER_TARGET.branch,
    privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false } })
const database = () => ({ status: 'PASS', target: STAGING_PROVIDER_TARGET.projectRef,
  queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID, receiptHash: 'a'.repeat(64),
  counts: { controlsEnabled: 0, runtimeSessions: 0, executionEdges: 0, operatorEdges: 5, runtimeRoles: 5, migrations: 15 } })

function make(overrides = {}) {
  const calls = []
  const bindings = {
    async readPinnedPreview(input) { calls.push('preview'); assert.equal(input.expectedDeployment, BROKER_RECOVERY_PINNED_DEPLOYMENT); return preview() },
    async readDatabase() { calls.push('database'); return database() },
    async readSupabaseNames() { calls.push('supabase-names'); return [] },
    async readVercelNames() { calls.push('vercel-names'); return [] },
    async readProvider() { calls.push('provider'); return provider() },
    ...overrides,
  }
  return { calls, read: createStagingProviderBrokerRestReadiness({ bindings, now: () => nowMs }) }
}

test('pinned Preview, disabled database, absent broker names and disabled provider yield frozen receipt', async () => {
  assert.equal(STAGING_BROKER_REST_READINESS_ENABLED, false)
  const { calls, read } = make()
  const result = await read(STAGING_PROVIDER_TARGET, { signal: new AbortController().signal })
  assert.equal(result.providerEnabled, false)
  assert.deepEqual(result.supabase, [])
  assert.deepEqual(result.vercel, [])
  assert.deepEqual(calls, ['preview', 'database', 'supabase-names', 'vercel-names', 'provider'])
})

test('enabled Preview flag stops before database and provider reads', async () => {
  const { calls, read } = make({ async readPinnedPreview() { calls.push('preview'); const value = preview(); value.preview.publicCart = true; return value } })
  await assert.rejects(read(STAGING_PROVIDER_TARGET, { signal: new AbortController().signal }))
  assert.deepEqual(calls, ['preview'])
})

test('active database session stops before any secret or provider read', async () => {
  const { calls, read } = make({ async readDatabase() { calls.push('database'); const value = database(); value.counts.runtimeSessions = 1; return value } })
  await assert.rejects(read(STAGING_PROVIDER_TARGET, { signal: new AbortController().signal }))
  assert.deepEqual(calls, ['preview', 'database'])
})

test('broker name presence stops before provider read', async () => {
  const { calls, read } = make({ async readSupabaseNames() { calls.push('supabase-names'); return ['TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET'] } })
  await assert.rejects(read(STAGING_PROVIDER_TARGET, { signal: new AbortController().signal }))
  assert.deepEqual(calls, ['preview', 'database', 'supabase-names'])
})

test('wrong target, provider state and aborted signal fail closed', async () => {
  const { read } = make({ async readProvider() { const value = provider(); value.enabled = true; return value } })
  await assert.rejects(read(STAGING_PROVIDER_TARGET, { signal: new AbortController().signal }))
  await assert.rejects(read({ ...STAGING_PROVIDER_TARGET, projectRef: 'wrong' }, { signal: new AbortController().signal }))
  const controller = new AbortController(); controller.abort()
  await assert.rejects(read(STAGING_PROVIDER_TARGET, { signal: controller.signal }))
})
