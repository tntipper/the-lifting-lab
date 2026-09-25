import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { BROKER_RECOVERY_PINNED_DEPLOYMENT } from '../scripts/staging-provider-broker-recovery-read-bindings.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from '../scripts/staging-account-hosted-baseline-database.mjs'
import { PROVIDER_IDENTIFIER, RETAINED_STAGING_JWKS_URI, STAGING_BROKER_PROVIDER,
  STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import { createStagingProviderBrokerRestPorts, STAGING_BROKER_REST_PORTS_ENABLED } from '../scripts/staging-provider-broker-rest-ports.mjs'

const nowMs = Date.parse('2026-09-25T12:00:00.000Z')
const phaseJournal = () => ({ read: () => ({ schema: 'tll-staging-provider-broker-phase/v1',
  projectRef: STAGING_PROVIDER_TARGET.projectRef, providerIdentifier: PROVIDER_IDENTIFIER,
  runId: randomUUID(), sequence: 0, phase: 'LAUNCH_STARTED', outcome: null,
  history: [{ phase: 'LAUNCH_STARTED', at: new Date(nowMs).toISOString() }] }) })
const provider = () => ({
  id: 'synthetic-provider', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER, name: STAGING_PROVIDER_NAME,
  client_id: STAGING_BROKER_PROVIDER.clientId, acceptable_client_ids: [], scopes: [], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: RETAINED_STAGING_JWKS_URI,
  discovery_document: null, created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z',
})

function fixture(overrides = {}) {
  const calls = []
  const tokens = [Buffer.from('fixture-supabase-token'), Buffer.from('fixture-vercel-token'), Buffer.from('fixture-bypass-token')]
  const roleSecret = Buffer.from('r'.repeat(48))
  const readBinding = {
    async readPinnedPreview({ expectedDeployment }) {
      calls.push('preview'); assert.equal(expectedDeployment, BROKER_RECOVERY_PINNED_DEPLOYMENT)
      return { deployment: BROKER_RECOVERY_PINNED_DEPLOYMENT,
        preview: { deploymentId: expectedDeployment.deploymentId, immutableUrl: expectedDeployment.immutableUrl,
          projectRef: STAGING_PROVIDER_TARGET.projectRef, branch: STAGING_PROVIDER_TARGET.branch,
          privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false } }
    },
    async readDatabase() { calls.push('database'); return { status: 'PASS', target: STAGING_PROVIDER_TARGET.projectRef,
      queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID, receiptHash: 'a'.repeat(64),
      counts: { controlsEnabled: 0, runtimeSessions: 0, executionEdges: 0, operatorEdges: 5, runtimeRoles: 5, migrations: 15 } } },
    async readSupabaseNames() { calls.push('supabase-names'); return [] },
    async readVercelNames() { calls.push('vercel-names'); return [] },
    async readProvider() { calls.push('provider'); return provider() },
    dispose() { calls.push('reads-dispose') },
  }
  const roleReader = { async readProjectSecret({ signal }) { assert.equal(signal.aborted, false); calls.push('project-secret'); return roleSecret },
    dispose() { calls.push('role-dispose') } }
  const host = name => ({ stage() {}, remove() {}, readNames() {}, dispose() { calls.push(`${name}-dispose`) } })
  const options = {
    phaseJournal: phaseJournal(), now: () => nowMs,
    managementToken: tokens[0], vercelToken: tokens[1], protectionBypassToken: tokens[2],
    fetch() {}, stopWorkerGroup() {},
    execute: async operation => ({ status: 'COMPLETED', value: await operation(new AbortController().signal) }),
    createReads: ({ managementToken, vercelToken, protectionBypassToken }) => {
      assert.ok(managementToken.length > 0 && vercelToken.length > 0 && protectionBypassToken.length > 0)
      calls.push('reads-create'); return readBinding
    },
    createRoleReader: () => { calls.push('role-create'); return roleReader },
    createVercel: () => { calls.push('vercel-create'); return host('vercel') },
    createSupabase: () => { calls.push('supabase-create'); return host('supabase') },
    createProviderClient: () => ({ auth: { admin: { customProviders: {
      getProvider: async () => ({ data: provider(), error: null }), updateProvider: async () => { throw Error('no update') },
    } } } }),
    ...overrides,
  }
  return { calls, tokens, roleSecret, options }
}

test('fresh phase gates acquisition, assembled preflight works, and disposal clears held service key', async () => {
  assert.equal(STAGING_BROKER_REST_PORTS_ENABLED, false)
  const f = fixture()
  const ports = await createStagingProviderBrokerRestPorts(f.options)
  assert.deepEqual(f.calls.slice(0, 5), ['reads-create', 'role-create', 'vercel-create', 'supabase-create', 'project-secret'])
  assert.ok(f.tokens.every(value => value.every(byte => byte === 0)))
  const result = await ports.preflight(STAGING_PROVIDER_TARGET)
  assert.equal(result.providerEnabled, false)
  assert.deepEqual(f.calls.slice(5, 10), ['preview', 'database', 'supabase-names', 'vercel-names', 'provider'])
  ports.dispose()
  assert.ok(f.roleSecret.every(byte => byte === 0))
  assert.deepEqual(f.calls.slice(-4), ['vercel-dispose', 'supabase-dispose', 'reads-dispose', 'role-dispose'])
})

test('missing or stale durable phase refuses setup before any constructor and wipes input tokens', async () => {
  for (const bad of [null, { ...phaseJournal().read(), phase: 'PREFLIGHT' },
    { ...phaseJournal().read(), history: [{ phase: 'LAUNCH_STARTED', at: new Date(nowMs - 61_000).toISOString() }] }]) {
    const f = fixture({ phaseJournal: { read: () => bad } })
    await assert.rejects(createStagingProviderBrokerRestPorts(f.options))
    assert.deepEqual(f.calls, [])
    assert.ok(f.tokens.every(value => value.every(byte => byte === 0)))
  }
})

test('project-key read failure closes all constructed readers and hosts', async () => {
  const f = fixture({ execute: async () => { throw Error('read failed') } })
  await assert.rejects(createStagingProviderBrokerRestPorts(f.options))
  assert.deepEqual(f.calls, ['reads-create', 'role-create', 'vercel-create', 'supabase-create',
    'vercel-dispose', 'supabase-dispose', 'reads-dispose', 'role-dispose'])
  assert.ok(f.tokens.every(value => value.every(byte => byte === 0)))
})

test('deadline rejection after a returned project key still wipes that key', async () => {
  const f = fixture({ execute: async operation => {
    await operation(new AbortController().signal)
    throw Error('deadline crossed after key read')
  } })
  await assert.rejects(createStagingProviderBrokerRestPorts(f.options))
  assert.ok(f.roleSecret.every(byte => byte === 0))
  assert.deepEqual(f.calls.slice(-4), ['vercel-dispose', 'supabase-dispose', 'reads-dispose', 'role-dispose'])
})
