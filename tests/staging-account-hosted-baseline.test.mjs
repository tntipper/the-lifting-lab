import test from 'node:test'
import assert from 'node:assert/strict'
import { BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_ALIAS, STAGING_SURFACE_TARGET } from '../scripts/staging-surface-activation-transport.mjs'
import { VERCEL_PROJECT, VERCEL_PROJECT_ID, VERCEL_SCOPE, VERCEL_TEAM_ID } from '../scripts/staging-surface-activation-native-binding.mjs'
import { PROJECT_REF, STAGING_ACCOUNT_HOSTED_BASELINE_ENABLED, STAGING_ACCOUNT_HOSTED_BASELINE_SCHEMA, createStagingAccountHostedBaseline } from '../scripts/staging-account-hosted-baseline.mjs'

const signal = () => new AbortController().signal
const database = Object.freeze({ status: 'PASS', target: PROJECT_REF, queryId: 'tll-staging-hosted-baseline-database/v1', receiptHash: 'a'.repeat(64), counts: Object.freeze({ migrations: 15, controlsEnabled: 0, runtimeRoles: 5, runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 }) })
const provider = Object.freeze({
  id: 'provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER, name: 'TLL staging subject broker', client_id: STAGING_BROKER_PROVIDER.clientId,
  acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true, attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false, authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: '', discovery_document: null, created_at: '2026-09-22T12:00:00.000Z', updated_at: '2026-09-22T12:00:00.000Z',
})
const surface = Object.freeze({ edge: Object.freeze({ target: STAGING_SURFACE_TARGET, functionName: 'customer-subject-broker', enabled: false }), flags: Object.freeze({ target: STAGING_SURFACE_TARGET, privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false }) })
const vercel = Object.freeze({ projectId: VERCEL_PROJECT_ID, project: VERCEL_PROJECT, teamId: VERCEL_TEAM_ID, scope: VERCEL_SCOPE, branch: 'codex/tll-integration', alias: STAGING_ALIAS, deploymentId: 'dpl_A1b2c3', immutableUrl: 'https://the-lifting-lab-abc123.vercel.app', gitSourceCommit: 'b'.repeat(40), applicationManifestSha256: 'c'.repeat(64), repositoryId: '987654321', gitProvider: 'github' })
function baseline(overrides = {}) {
  return createStagingAccountHostedBaseline({
    readDatabase: async () => database, readProvider: async () => provider, readBrokerSecrets: async () => ({ supabase: [], vercel: [] }),
    readSurface: async () => surface, readVercel: async () => vercel, ...overrides,
  })
}

test('closed baseline composes only five injected read ports into a frozen allowlisted PASS observation', async () => {
  assert.equal(STAGING_ACCOUNT_HOSTED_BASELINE_ENABLED, false)
  const result = await baseline().observe({ signal: signal() })
  assert.equal(result.schema, STAGING_ACCOUNT_HOSTED_BASELINE_SCHEMA); assert.equal(result.status, 'PASS')
  assert.deepEqual(result.reasonCodes, []); assert.equal(result.target, PROJECT_REF); assert.match(result.observationHash, /^[a-f0-9]{64}$/)
  assert.deepEqual(Object.keys(result).sort(), ['brokerSecrets', 'database', 'observationHash', 'provider', 'reasonCodes', 'schema', 'status', 'surface', 'target', 'vercel'])
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.provider), true)
  assert.doesNotMatch(JSON.stringify(result), /client_secret|password/i)
})

test('safe completed observation retains classified provider, secret and surface drift as HOLD', async () => {
  const result = await baseline({
    readProvider: async () => ({ ...provider, enabled: true, jwks_uri: 'https://example.test/jwks.json' }),
    readBrokerSecrets: async () => ({ supabase: [BROKER_SECRET_NAME], vercel: [BROKER_SECRET_NAME] }),
    readSurface: async () => ({ ...surface, edge: { ...surface.edge, enabled: true } }),
  }).observe({ signal: signal() })
  assert.equal(result.status, 'HOLD')
  assert.deepEqual(result.reasonCodes, ['provider_enabled', 'provider_jwks_configured', 'broker_secret_present_supabase', 'broker_secret_present_vercel', 'surface_enabled'])
  assert.equal(result.brokerSecrets.supabasePresent, true); assert.equal(result.surface.edge, true)
})

test('missing application manifest metadata is retained as an explicit HOLD rather than invented evidence', async () => {
  const result = await baseline({ readVercel: async () => ({ ...vercel, applicationManifestSha256: null }) }).observe({ signal: signal() })
  assert.equal(result.status, 'HOLD')
  assert.deepEqual(result.reasonCodes, ['application_manifest_evidence_absent'])
  assert.equal(result.vercel.applicationManifestSha256, null)
})

test('every provider security-relevant desired-state drift is retained as an explicit HOLD reason', async () => {
  const result = await baseline({
    readProvider: async () => ({ ...provider, name: 'different', client_id: 'different-client', acceptable_client_ids: ['other'], scopes: [],
      pkce_enabled: false, email_optional: false, attribute_mapping: { sub: 'subject' }, authorization_params: { prompt: 'login' }, skip_nonce_check: true,
      authorization_url: 'https://example.test/authorize', token_url: 'https://example.test/token', userinfo_url: 'https://example.test/userinfo',
      issuer: 'https://example.test/issuer', discovery_url: 'https://example.test/discovery' }),
  }).observe({ signal: signal() })
  assert.equal(result.status, 'HOLD')
  assert.deepEqual(result.reasonCodes, [
    'provider_name_drift', 'provider_pkce_disabled', 'provider_client_id_drift', 'provider_acceptable_client_ids_drift', 'provider_scopes_drift',
    'provider_email_policy_drift', 'provider_attribute_mapping_drift', 'provider_authorization_params_drift', 'provider_skip_nonce_check_enabled',
    'provider_authorization_endpoint_drift', 'provider_token_endpoint_drift', 'provider_userinfo_endpoint_drift', 'provider_issuer_configured',
  ])
  assert.deepEqual(result.provider.acceptableClientIds, ['other']); assert.equal(result.provider.attributeMappingPresent, true)
  assert.equal(result.provider.authorizationParamsPresent, true); assert.equal(result.provider.skipNonceCheck, true)
})

test('drifted provider endpoint text never enters evidence', async () => {
  const syntheticSecret = 'synthetic-secret-that-must-not-escape'
  for (const token_url of [
    `https://user:synthetic-password@example.test/token?api_key=${syntheticSecret}`,
    `https://example.test/token#${syntheticSecret}`,
    `https://example.test/token/${syntheticSecret}`,
  ]) {
    const result = await baseline({ readProvider: async () => ({ ...provider, token_url }) }).observe({ signal: signal() })
    assert.equal(result.status, 'HOLD')
    assert.deepEqual(result.reasonCodes, ['provider_token_endpoint_drift'])
    assert.equal(result.provider.tokenEndpointMatches, false)
    assert.doesNotMatch(JSON.stringify(result), /synthetic-password|synthetic-secret|api_key/)
  }
})

test('database, target, source and schema drift reject before a misleading receipt can be returned', async () => {
  for (const override of [
    { readDatabase: async () => ({ ...database, counts: { ...database.counts, runtimeSessions: 1 } }) },
    { readVercel: async () => ({ ...vercel, gitSourceCommit: 'not-a-commit' }) },
    { readSurface: async () => ({ ...surface, edge: { ...surface.edge, target: { ...STAGING_SURFACE_TARGET, projectRef: 'wrhgscovsgsudtedbljr' } } }) },
    { readProvider: async () => ({ ...provider, identifier: 'other' }) },
    { readBrokerSecrets: async () => ({ supabase: 'not-array', vercel: [] }) },
  ]) await assert.rejects(() => baseline(override).observe({ signal: signal() }), /unavailable/)
})

test('ports are exact, signal-bound, and no caller can add SQL, URLs, targets or additional operations', async () => {
  const calls = []
  const observer = baseline({
    readDatabase: async input => { calls.push(['db', Object.keys(input)]); return database },
    readProvider: async input => { calls.push(['provider', Object.keys(input)]); return provider },
    readBrokerSecrets: async input => { calls.push(['secrets', Object.keys(input)]); return { supabase: [], vercel: [] } },
    readSurface: async input => { calls.push(['surface', Object.keys(input)]); return surface },
    readVercel: async input => { calls.push(['vercel', Object.keys(input)]); return vercel },
  })
  await assert.rejects(() => observer.observe({ signal: signal(), projectRef: 'wrhgscovsgsudtedbljr', sql: 'DROP TABLE x', url: 'https://example.test' }), /unavailable/)
  assert.deepEqual(calls, [])
  const result = await observer.observe({ signal: signal() })
  assert.equal(result.status, 'PASS'); assert.deepEqual(calls, [['db', ['signal']], ['provider', ['signal']], ['secrets', ['signal']], ['surface', ['signal']], ['vercel', ['signal']]])
  assert.throws(() => createStagingAccountHostedBaseline({ readDatabase: async () => {}, readProvider: async () => {}, readBrokerSecrets: async () => {}, readSurface: async () => {} }))
})

test('a signal that aborts between dependent reads prevents subsequent hosted reads', async () => {
  const controller = new AbortController(); let providerReads = 0
  const observer = baseline({
    readDatabase: async () => { controller.abort(); return database },
    readProvider: async () => { providerReads += 1; return provider },
  })
  await assert.rejects(() => observer.observe({ signal: controller.signal }), /unavailable/)
  assert.equal(providerReads, 0)
})

test('a rejecting parallel read aborts every sibling and waits for an abort-aware pending sibling to settle', async () => {
  let aborted = false; let resolvePending; let settled = false
  const pending = new Promise(resolve => { resolvePending = resolve })
  const observer = baseline({
    readProvider: async () => { throw Error('provider failed') },
    readBrokerSecrets: async ({ signal: child }) => { child.addEventListener('abort', () => { aborted = true }); return pending },
  })
  const run = observer.observe({ signal: signal() }); run.then(() => { settled = true }, () => { settled = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(aborted, true); assert.equal(settled, false)
  resolvePending({ supabase: [], vercel: [] })
  await assert.rejects(() => run, /unavailable/)
})

test('external cancellation aborts all parallel reads and waits for their settled results', async () => {
  const controller = new AbortController(); let aborted = 0
  const readUntilAbort = ({ signal: child }) => new Promise(resolve => child.addEventListener('abort', () => { aborted += 1; resolve(undefined) }, { once: true }))
  const observer = baseline({ readProvider: readUntilAbort, readBrokerSecrets: readUntilAbort, readSurface: readUntilAbort, readVercel: readUntilAbort })
  const run = observer.observe({ signal: controller.signal })
  await new Promise(resolve => setImmediate(resolve)); controller.abort()
  await assert.rejects(() => run, /unavailable/)
  assert.equal(aborted, 4)
})

test('core source has no live default, credential reader, network client or launcher', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../scripts/staging-account-hosted-baseline.mjs', import.meta.url), 'utf8'))
  assert.doesNotMatch(source, /child_process|process\.argv|process\.env|fetch\(|https\.request|Keychain/)
  assert.match(source, /STAGING_ACCOUNT_HOSTED_BASELINE_ENABLED = false/)
})
