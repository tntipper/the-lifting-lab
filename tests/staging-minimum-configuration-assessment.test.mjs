import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessStagingMinimumSupabase, REQUIRED_EDGE_NAMES, MISSING_EDGE_NAME } from '../scripts/staging-minimum-configuration-assessment.mjs'
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

test('accepts the post-rotation disabled Supabase state without claiming secret value equality', () => {
  assert.deepEqual(assessStagingMinimumSupabase({ database: database(), edgeNames: [...REQUIRED_EDGE_NAMES], provider: provider() }), {
    status: 'DISABLED_BASELINE_OBSERVED', projectRef: STAGING_PROJECT_REF,
    missingEdgeNames: [], brokerDatabasePasswordAlreadyPresent: false,
  })
})

test('holds if the intended new Edge password is already present', () => {
  const result = assessStagingMinimumSupabase({ database: database(), edgeNames: [...REQUIRED_EDGE_NAMES, MISSING_EDGE_NAME], provider: provider() })
  assert.equal(result.status, 'HOLD')
  assert.equal(result.brokerDatabasePasswordAlreadyPresent, true)
})

test('holds when an existing broker or CA name has disappeared', () => {
  const result = assessStagingMinimumSupabase({ database: database(), edgeNames: REQUIRED_EDGE_NAMES.slice(1), provider: provider() })
  assert.deepEqual(result.missingEdgeNames, [REQUIRED_EDGE_NAMES[0]])
})

test('rejects changed provider, project, or enabled database controls', () => {
  for (const evidence of [
    { database: database(), edgeNames: [...REQUIRED_EDGE_NAMES], provider: { ...provider(), enabled: true } },
    { database: database(), edgeNames: [...REQUIRED_EDGE_NAMES], provider: { ...provider(), jwks_uri: 'https://example.com/jwks.json' } },
    { database: { ...database(), target: 'wrhgscovsgsudtedbljr' }, edgeNames: [...REQUIRED_EDGE_NAMES], provider: provider() },
    { database: { ...database(), counts: { ...database().counts, controlsEnabled: 1 } }, edgeNames: [...REQUIRED_EDGE_NAMES], provider: provider() },
  ]) assert.throws(() => assessStagingMinimumSupabase(evidence), /unavailable/)
})
