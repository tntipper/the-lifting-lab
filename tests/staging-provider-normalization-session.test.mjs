import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER, STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from '../scripts/staging-account-hosted-baseline-database.mjs'
import { HOSTED_BASELINE_VERCEL_TARGET } from '../scripts/staging-account-hosted-baseline-vercel.mjs'
import { STAGING_EDGE_FUNCTION } from '../scripts/staging-surface-activation-native-adapter.mjs'
import { STAGING_SURFACE_TARGET } from '../scripts/staging-surface-activation-transport.mjs'
import { createProviderNormalizationJournal } from '../scripts/staging-provider-normalization-journal.mjs'
import { createProviderNormalizationPhaseJournal } from '../scripts/staging-provider-normalization-phase-journal.mjs'
import { runStagingProviderNormalizationSession, PROVIDER_NORMALIZATION_SESSION_ENABLED } from '../scripts/staging-provider-normalization-session.mjs'
import { createStagingProviderNormalizationNativePort } from '../scripts/staging-provider-normalization-native-port.mjs'
import { STAGING_PROVIDER_NORMALIZATION_PREVIEW } from '../scripts/staging-provider-normalization-preflight.mjs'

const nowMs = 1_789_000_000_000
const runId = 'f80746e1-7a8b-4b1a-9c2d-22cd94aaaf31'
const provider = (overrides = {}) => ({
  id: 'custom-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER,
  name: STAGING_PROVIDER_NAME, client_id: STAGING_BROKER_PROVIDER.clientId,
  acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: true, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: 'https://staging.example.test/jwks', discovery_document: null,
  created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z', ...overrides,
})

function fixture(change = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-provider-session-'))
  let clock = nowMs, updateCalls = 0, current = provider({ name: STAGING_BROKER_PROVIDER.clientId, scopes: [] })
  const credentials = { supabase: Buffer.from('private-supabase-token'), vercel: Buffer.from('private-vercel-token'),
    bypass: Buffer.from('private-bypass-token') }
  const projectKey = Buffer.from('p'.repeat(48))
  const intentJournal = createProviderNormalizationJournal({ path: join(directory, 'intent.json'), makeRunId: () => runId, now: () => clock })
  const phaseJournal = createProviderNormalizationPhaseJournal({ path: join(directory, 'phase.json'), makeRunId: () => runId, now: () => clock })
  const options = { now: () => clock, intentJournal, phaseJournal,
    readCredentials: async () => credentials,
    openSupabase: () => ({ target: STAGING_PROVIDER_TARGET.projectRef,
      readProjectSecret: async () => projectKey,
      readDatabase: async () => ({ status: 'PASS', target: STAGING_PROVIDER_TARGET.projectRef,
        queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID, receiptHash: 'a'.repeat(64),
        counts: { migrations: 15, controlsEnabled: 0, runtimeRoles: 5, runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 } }),
      readEdgeSecretNames: async () => [], dispose: () => {} }),
    openVercel: () => ({ readProject: async () => ({ target: HOSTED_BASELINE_VERCEL_TARGET,
      repository: { provider: 'github', repoId: 1264363509, org: 'tntipper', repo: 'the-lifting-lab' } }),
      readPreviewEnvironmentPresence: async () => ({ target: HOSTED_BASELINE_VERCEL_TARGET,
        environment: 'preview', branch: STAGING_PROVIDER_TARGET.branch, brokerSecretPresent: false }), dispose: () => {} }),
    openSurface: () => ({ readBaseline: async () => ({ surface: {
      edge: { target: STAGING_SURFACE_TARGET, functionName: STAGING_EDGE_FUNCTION, enabled: false },
      flags: { target: STAGING_SURFACE_TARGET, privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false },
    }, deployment: { projectId: HOSTED_BASELINE_VERCEL_TARGET.projectId, teamId: HOSTED_BASELINE_VERCEL_TARGET.teamId,
      alias: STAGING_SURFACE_TARGET.alias, project: STAGING_PROVIDER_TARGET.vercelProject,
      scope: STAGING_PROVIDER_TARGET.vercelScope, branch: STAGING_PROVIDER_TARGET.branch,
      gitProvider: 'github', repositoryId: '1264363509', ...STAGING_PROVIDER_NORMALIZATION_PREVIEW } }), dispose: () => {} }),
    makeNativePort: change.realNative ? ({ projectSecret, execute }) => createStagingProviderNormalizationNativePort({
      projectSecret, execute, fetcher: async (url, init) => {
        assert.equal(url, `https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/admin/custom-providers/${PROVIDER_IDENTIFIER}`)
        if (init.method === 'PUT') {
          updateCalls++
          assert.deepEqual(JSON.parse(init.body), { enabled: false, jwks_uri: '' })
          current = { ...current, enabled: false, jwks_uri: '', updated_at: '2026-09-23T10:00:00.000Z' }
        } else if (init.method === 'GET' && !current.enabled) clock += 1
        return new Response(JSON.stringify(current), { status: 200, headers: { 'content-type': 'application/json' } })
      },
    }) : () => ({
      readProvider: async () => { if (current.enabled === false) clock += 1; return current },
      updateProvider: async target => { updateCalls++; if (change.updateFailure) throw Error('private update detail')
        current = { ...current, enabled: false, jwks_uri: '', updated_at: '2026-09-23T10:00:00.000Z' }
        return { status: 'UPDATED_NEEDS_INDEPENDENT_READBACK', target, providerIdentifier: PROVIDER_IDENTIFIER } },
    }),
  }
  return { options, credentials, projectKey, intentJournal, phaseJournal, updates: () => updateCalls,
    advanceClock: milliseconds => { clock += milliseconds } }
}

test('disabled session uses one key, one intent/update, independent postread and wipes material', async () => {
  assert.equal(PROVIDER_NORMALIZATION_SESSION_ENABLED, false)
  const f = fixture()
  const result = await runStagingProviderNormalizationSession(f.options)
  assert.equal(result.status, 'NORMALIZED_VERIFIED')
  assert.equal(f.updates(), 1)
  assert.equal(f.intentJournal.read().state, 'NORMALIZED_VERIFIED')
  assert.equal(f.phaseJournal.read().outcome, 'VERIFIED')
  assert.deepEqual([...f.projectKey], Array(f.projectKey.length).fill(0))
  for (const credential of Object.values(f.credentials)) assert.deepEqual([...credential], Array(credential.length).fill(0))
  assert.equal((await runStagingProviderNormalizationSession(f.options)).status, 'REPLAY_REJECTED')
})

test('actual official native port composes through GET, one PUT and independent GET', async () => {
  const f = fixture({ realNative: true })
  const result = await runStagingProviderNormalizationSession(f.options)
  assert.equal(result.status, 'NORMALIZED_VERIFIED')
  assert.equal(f.updates(), 1)
  assert.equal(f.intentJournal.read().state, 'NORMALIZED_VERIFIED')
  assert.equal(f.phaseJournal.read().outcome, 'VERIFIED')
  assert.deepEqual([...f.projectKey], Array(f.projectKey.length).fill(0))
})

test('an uncertain provider update consumes both journals and never retries', async () => {
  const f = fixture({ updateFailure: true })
  const result = await runStagingProviderNormalizationSession(f.options)
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(f.updates(), 1)
  assert.equal(f.intentJournal.read().state, 'RECONCILIATION_REQUIRED')
  assert.equal(f.phaseJournal.read().outcome, 'RECONCILIATION_REQUIRED')
  assert.equal((await runStagingProviderNormalizationSession(f.options)).status, 'REPLAY_REJECTED')
})

test('credential failure is journaled before any secret or provider read', async () => {
  const f = fixture(); let opened = 0
  f.options.readCredentials = async () => { throw Error('private keychain detail') }
  f.options.openSupabase = () => { opened++; throw Error('must not open') }
  const result = await runStagingProviderNormalizationSession(f.options)
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(opened, 0)
  assert.equal(f.intentJournal.read(), null)
  assert.equal(f.phaseJournal.read().outcome, 'RECONCILIATION_REQUIRED')
})

test('unsafe surface evidence stops before provider intent or update', async () => {
  const f = fixture(), original = f.options.openSurface
  f.options.openSurface = (...args) => {
    const binding = original(...args)
    return { ...binding, readBaseline: async input => {
      const value = await binding.readBaseline(input)
      return { ...value, surface: { ...value.surface,
        flags: { ...value.surface.flags, privateCart: true } } }
    } }
  }
  const result = await runStagingProviderNormalizationSession(f.options)
  assert.equal(result.status, 'STOPPED_BEFORE_UPDATE')
  assert.equal(f.updates(), 0)
  assert.equal(f.intentJournal.read(), null)
  assert.equal(f.phaseJournal.read().outcome, 'STOPPED_BEFORE_UPDATE')
})

test('update timeout aborts and consumes one intent without retry', async () => {
  const f = fixture(); let latestTimer, updateCalls = 0
  f.options.setTimer = callback => { latestTimer = callback; return 1 }
  f.options.clearTimer = () => {}
  const original = f.options.makeNativePort
  f.options.makeNativePort = args => {
    const native = original(args)
    return { ...native, updateProvider: async () => {
      updateCalls++
      latestTimer()
      return new Promise(() => {})
    } }
  }
  const result = await runStagingProviderNormalizationSession(f.options)
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(updateCalls, 1)
  assert.equal(f.intentJournal.read().state, 'RECONCILIATION_REQUIRED')
  assert.equal(f.phaseJournal.read().outcome, 'RECONCILIATION_REQUIRED')
  assert.deepEqual([...f.projectKey], Array(f.projectKey.length).fill(0))
})

test('slow dispatch-phase persistence cannot spend preflight freshness and still update', async () => {
  const f = fixture(), original = f.options.phaseJournal
  const makeNative = f.options.makeNativePort
  f.options.makeNativePort = args => {
    const native = makeNative(args); let reads = 0
    return { ...native, readProvider: async target => {
      const value = await native.readProvider(target)
      if (++reads === 1) f.advanceClock(2_000)
      return value
    } }
  }
  f.options.phaseJournal = { ...original, record(previous, name) {
    const receipt = original.record(previous, name)
    if (name === 'UPDATE_DISPATCH') f.advanceClock(29_001)
    return receipt
  } }
  const result = await runStagingProviderNormalizationSession(f.options)
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(f.updates(), 0)
  assert.equal(f.intentJournal.read().state, 'RECONCILIATION_REQUIRED')
  assert.equal(f.phaseJournal.read().outcome, 'RECONCILIATION_REQUIRED')
})
