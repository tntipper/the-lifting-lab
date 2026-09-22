import test from 'node:test'
import assert from 'node:assert/strict'
import { BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_ALIAS, STAGING_SURFACE_TARGET } from '../scripts/staging-surface-activation-transport.mjs'
import { VERCEL_PROJECT, VERCEL_PROJECT_ID, VERCEL_SCOPE, VERCEL_TEAM_ID } from '../scripts/staging-surface-activation-native-binding.mjs'
import {
  createStagingAccountHostedBaselineComposition,
  HOSTED_BASELINE_COMPOSITION_ENABLED,
  HOSTED_BASELINE_COMPOSITION_ERROR,
} from '../scripts/staging-account-hosted-baseline-composition.mjs'

const signal = () => new AbortController().signal
const database = Object.freeze({ status: 'PASS', target: 'qdmvngjwkcsilzmqksme', queryId: 'tll-staging-hosted-baseline-database/v1', receiptHash: 'a'.repeat(64), counts: Object.freeze({ migrations: 15, controlsEnabled: 0, runtimeRoles: 5, runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 }) })
const provider = Object.freeze({
  id: 'provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER, name: 'TLL staging subject broker', client_id: STAGING_BROKER_PROVIDER.clientId,
  acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true, attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false, authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: '', discovery_document: null, created_at: '2026-09-22T12:00:00.000Z', updated_at: '2026-09-22T12:00:00.000Z',
})
const surfaceObservation = Object.freeze({
  surface: Object.freeze({
    edge: Object.freeze({ target: STAGING_SURFACE_TARGET, functionName: 'customer-subject-broker', enabled: false }),
    flags: Object.freeze({ target: STAGING_SURFACE_TARGET, privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false }),
  }),
  deployment: Object.freeze({ projectId: VERCEL_PROJECT_ID, project: VERCEL_PROJECT, teamId: VERCEL_TEAM_ID, scope: VERCEL_SCOPE,
    branch: 'codex/tll-integration', alias: STAGING_ALIAS, deploymentId: 'dpl_A1b2c3', immutableUrl: 'https://the-lifting-lab-abc123.vercel.app',
    gitProvider: 'github', repositoryId: '998877', gitSourceCommit: 'b'.repeat(40), applicationManifestSha256: 'c'.repeat(64) }),
})
const project = Object.freeze({ target: Object.freeze({ projectId: VERCEL_PROJECT_ID, project: VERCEL_PROJECT, scope: VERCEL_SCOPE, teamId: VERCEL_TEAM_ID, environment: 'preview', branch: 'codex/tll-integration' }),
  repository: Object.freeze({ provider: 'github', repoId: 998877, org: 'tntipper', repo: 'the-lifting-lab', ownerId: 776655, productionBranch: 'main', sourceless: false }) })

function fixture({ brokerAtSupabase = false, brokerAtVercel = false, projectOverride = project, failAt = null } = {}) {
  const calls = []; let disposed = 0; let vercelDisposed = 0; let surfaceDisposed = 0; let surfaceReads = 0
  const read = (name, value) => { calls.push(name); if (name === failAt) throw Error('private provider response and token'); return value }
  const supabase = {
    readDatabase: async () => read('database', database),
    readProvider: async () => read('provider', provider),
    readEdgeSecretNames: async () => read('supabase-secrets', brokerAtSupabase ? [BROKER_SECRET_NAME] : []),
    dispose: () => { disposed += 1 },
  }
  const vercel = {
    readProject: async () => read('project', projectOverride),
    readPreviewEnvironmentPresence: async () => read('vercel-secrets', { brokerSecretPresent: brokerAtVercel }),
    dispose: () => { vercelDisposed += 1 },
  }
  const surface = { readBaseline: async () => { surfaceReads += 1; return read('surface', surfaceObservation) }, dispose: () => { surfaceDisposed += 1 } }
  return { calls, get disposed() { return disposed }, get vercelDisposed() { return vercelDisposed }, get surfaceDisposed() { return surfaceDisposed }, get surfaceReads() { return surfaceReads }, composition: createStagingAccountHostedBaselineComposition({ supabase, vercel, surface }) }
}

test('composition is disabled, observes each hosted surface once, and returns an honest merged PASS receipt', async () => {
  assert.equal(HOSTED_BASELINE_COMPOSITION_ENABLED, false)
  assert.throws(() => createStagingAccountHostedBaselineComposition(), new RegExp(HOSTED_BASELINE_COMPOSITION_ERROR))
  const f = fixture()
  const result = await f.composition.observe({ signal: signal() })
  assert.equal(result.status, 'PASS'); assert.equal(result.vercel.repositoryId, '998877')
  assert.equal(result.vercel.gitSourceCommit, 'b'.repeat(40)); assert.equal(result.vercel.applicationManifestSha256, 'c'.repeat(64))
  assert.equal(f.surfaceReads, 1); assert.equal(f.disposed, 1); assert.equal(f.vercelDisposed, 1); assert.equal(f.surfaceDisposed, 1)
  assert.equal(f.calls.filter(name => name === 'database').length, 1)
  for (const name of ['provider', 'supabase-secrets', 'vercel-secrets', 'project', 'surface']) assert.equal(f.calls.filter(item => item === name).length, 1)
  assert.doesNotMatch(JSON.stringify(result), /password|client_secret|api_key/i)
})

test('secret presence is composed as HOLD without exposing inventories or values', async () => {
  const result = await fixture({ brokerAtSupabase: true, brokerAtVercel: true }).composition.observe({ signal: signal() })
  assert.equal(result.status, 'HOLD')
  assert.deepEqual(result.reasonCodes, ['broker_secret_present_supabase', 'broker_secret_present_vercel'])
  assert.deepEqual(result.brokerSecrets, { supabasePresent: true, vercelPresent: true })
})

test('each fixed hosted read reports only its allowlisted operation label', async () => {
  const cases = [
    ['database', 'database_read_unavailable'],
    ['provider', 'provider_read_unavailable'],
    ['supabase-secrets', 'supabase_secret_names_read_unavailable'],
    ['vercel-secrets', 'vercel_environment_read_unavailable'],
    ['surface', 'surface_read_unavailable'],
    ['project', 'vercel_project_read_unavailable'],
  ]
  for (const [failAt, code] of cases) {
    const f = fixture({ failAt })
    await assert.rejects(f.composition.observe({ signal: signal() }), error => {
      assert.equal(error.code, code)
      assert.equal(error.message, HOSTED_BASELINE_COMPOSITION_ERROR)
      assert.doesNotMatch(JSON.stringify(error), /private provider response|token/)
      return true
    })
    assert.equal(f.disposed, 1); assert.equal(f.vercelDisposed, 1); assert.equal(f.surfaceDisposed, 1)
  }
})

test('repository disagreement fails closed, disposes Supabase, and cannot be replayed', async () => {
  const mismatched = { ...project, repository: { ...project.repository, repoId: 112233 } }
  const f = fixture({ projectOverride: mismatched })
  await assert.rejects(f.composition.observe({ signal: signal() }), new RegExp(HOSTED_BASELINE_COMPOSITION_ERROR))
  assert.equal(f.disposed, 1); assert.equal(f.vercelDisposed, 1); assert.equal(f.surfaceDisposed, 1); assert.equal(f.surfaceReads, 1)
  await assert.rejects(f.composition.observe({ signal: signal() }), new RegExp(HOSTED_BASELINE_COMPOSITION_ERROR))
  assert.equal(f.surfaceReads, 1)
})

test('a sibling failure aborts composed reads and waits for nested reads before disposal', async () => {
  let childAborted = false; let disposed = 0; let settlePending; let rejectProvider
  const pending = new Promise(resolve => { settlePending = resolve })
  const supabase = {
    readDatabase: async () => database,
    readProvider: async () => new Promise((resolve, reject) => { rejectProvider = reject }),
    readEdgeSecretNames: async ({ signal }) => {
      signal.addEventListener('abort', () => { childAborted = true }, { once: true })
      return pending
    },
    dispose: () => { disposed += 1 },
  }
  const vercel = {
    readProject: async () => project,
    readPreviewEnvironmentPresence: async () => ({ brokerSecretPresent: false }),
    dispose: () => {},
  }
  const surface = { readBaseline: async () => surfaceObservation }
  surface.dispose = () => {}
  const run = createStagingAccountHostedBaselineComposition({ supabase, vercel, surface }).observe({ signal: signal() })
  let finished = false; run.then(() => { finished = true }, () => { finished = true })
  await new Promise(resolve => setImmediate(resolve))
  rejectProvider(Error('provider failure'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(childAborted, true); assert.equal(finished, false); assert.equal(disposed, 0)
  settlePending([])
  await assert.rejects(run, new RegExp(HOSTED_BASELINE_COMPOSITION_ERROR))
  assert.equal(disposed, 1)
})

test('malformed or pre-aborted first input is terminal and disposes credential bindings', async () => {
  for (const input of [{}, { signal: AbortSignal.abort() }]) {
    const f = fixture()
    await assert.rejects(f.composition.observe(input), new RegExp(HOSTED_BASELINE_COMPOSITION_ERROR))
    assert.equal(f.disposed, 1); assert.equal(f.vercelDisposed, 1); assert.equal(f.surfaceDisposed, 1); assert.equal(f.surfaceReads, 0)
    await assert.rejects(f.composition.observe({ signal: signal() }), new RegExp(HOSTED_BASELINE_COMPOSITION_ERROR))
    assert.equal(f.disposed, 1)
  }
})

test('explicit dispose before observation is idempotent and terminal', async () => {
  const f = fixture()
  f.composition.dispose(); f.composition.dispose()
  assert.equal(f.disposed, 1); assert.equal(f.vercelDisposed, 1); assert.equal(f.surfaceDisposed, 1)
  await assert.rejects(f.composition.observe({ signal: signal() }), new RegExp(HOSTED_BASELINE_COMPOSITION_ERROR))
})

test('composition source owns no credentials, network, process, target, URL or SQL input', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../scripts/staging-account-hosted-baseline-composition.mjs', import.meta.url), 'utf8'))
  assert.doesNotMatch(source, /child_process|process\.|fetch\(|https?\.request|keychain|dotenv/i)
  assert.doesNotMatch(source, /new URL\(|URLSearchParams|projectRef|productionProject/i)
})
