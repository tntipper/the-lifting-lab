import test from 'node:test'
import assert from 'node:assert/strict'
import { createStagingProviderNormalizationPreflight, STAGING_PROVIDER_NORMALIZATION_PREFLIGHT_ENABLED } from '../scripts/staging-provider-normalization-preflight.mjs'
import { STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME } from '../scripts/staging-provider-broker-rotation.mjs'
import { createStagingAccountHostedBaselineVercelBinding, HOSTED_BASELINE_VERCEL_TARGET } from '../scripts/staging-account-hosted-baseline-vercel.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from '../scripts/staging-account-hosted-baseline-database.mjs'
import { STAGING_SURFACE_TARGET } from '../scripts/staging-surface-activation-transport.mjs'
import { STAGING_EDGE_FUNCTION } from '../scripts/staging-surface-activation-native-adapter.mjs'

const nowMs = 1_789_000_000_000
const database = () => ({ status: 'PASS', target: STAGING_PROVIDER_TARGET.projectRef,
  queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID, receiptHash: 'a'.repeat(64),
  counts: { migrations: 15, controlsEnabled: 0, runtimeRoles: 5, runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 } })
const project = () => ({ target: HOSTED_BASELINE_VERCEL_TARGET, repository: { provider: 'github', repoId: 1264363509,
  org: HOSTED_BASELINE_VERCEL_TARGET.githubOrg, repo: HOSTED_BASELINE_VERCEL_TARGET.githubRepository } })
const presence = () => ({ target: HOSTED_BASELINE_VERCEL_TARGET, environment: 'preview',
  branch: STAGING_PROVIDER_TARGET.branch, brokerSecretPresent: false })
const surface = () => ({ surface: { edge: { target: STAGING_SURFACE_TARGET, functionName: STAGING_EDGE_FUNCTION, enabled: false },
  flags: { target: STAGING_SURFACE_TARGET, privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false } },
  deployment: { projectId: HOSTED_BASELINE_VERCEL_TARGET.projectId, teamId: HOSTED_BASELINE_VERCEL_TARGET.teamId,
    alias: STAGING_SURFACE_TARGET.alias, project: STAGING_PROVIDER_TARGET.vercelProject, scope: STAGING_PROVIDER_TARGET.vercelScope,
    branch: STAGING_PROVIDER_TARGET.branch, gitProvider: 'github', repositoryId: '1264363509' } })

function fixture(change = {}) {
  const signal = new AbortController().signal, calls = []
  let clock = nowMs
  const factory = createStagingProviderNormalizationPreflight({ signal, now: () => clock,
    openSupabase: () => ({ target: STAGING_PROVIDER_TARGET.projectRef,
      readDatabase: async () => { calls.push('database'); return change.database ?? database() },
      readEdgeSecretNames: async () => { calls.push('supabase-names'); return change.supabaseNames ?? [] },
      readProvider: async () => { calls.push('provider'); if (change.providerFailure) throw Error('private provider detail'); return { id: 'provider' } },
      dispose: () => { calls.push('supabase-dispose'); if (change.disposeFailure) throw Error('private cleanup detail') } }),
    openVercel: change.openVercel ?? (() => ({
      readProject: async () => { calls.push('project'); return change.project ?? project() },
      readPreviewEnvironmentPresence: async () => { calls.push('vercel-names'); return change.presence ?? presence() },
      dispose: () => calls.push('vercel-dispose') })),
    openSurface: () => ({ readBaseline: async () => { calls.push('surface'); clock += change.delay ?? 0; return change.surface ?? surface() },
      dispose: () => calls.push('surface-dispose') }),
  })
  return { factory, calls }
}

test('fresh exact staging reads return only frozen flags and use fresh provider binding', async () => {
  assert.equal(STAGING_PROVIDER_NORMALIZATION_PREFLIGHT_ENABLED, false)
  const { factory, calls } = fixture()
  assert.deepEqual(await factory.preflight(STAGING_PROVIDER_TARGET), {
    target: STAGING_PROVIDER_TARGET, observedAt: new Date(nowMs).toISOString(),
    controls: { customer: false, cart: false, broker: false, provisional: false, bridge: false },
    runtimeSessions: 0, edgeEnabled: false, privateEnabled: false, publicEnabled: false,
    supabaseBrokerSecretNames: [], vercelBrokerSecretNames: [],
  })
  assert.deepEqual(await factory.readProvider(STAGING_PROVIDER_TARGET), { id: 'provider' })
  assert.deepEqual(calls, ['database', 'supabase-names', 'project', 'vercel-names', 'surface',
    'supabase-dispose', 'vercel-dispose', 'surface-dispose', 'provider', 'supabase-dispose'])
})

test('unsafe database, secret, surface, project and freshness evidence fails closed', async () => {
  for (const change of [
    { database: { ...database(), queryId: 'other' } },
    { database: { ...database(), counts: { ...database().counts, runtimeSessions: 1 } } },
    { supabaseNames: [BROKER_SECRET_NAME] },
    { presence: { ...presence(), brokerSecretPresent: true } },
    { surface: { ...surface(), surface: { ...surface().surface, flags: { ...surface().surface.flags, privateCart: true } } } },
    { surface: { ...surface(), surface: { ...surface().surface, edge: { ...surface().surface.edge, enabled: true } } } },
    { surface: { ...surface(), deployment: { ...surface().deployment, repositoryId: '2' } } },
    { project: { ...project(), target: { ...HOSTED_BASELINE_VERCEL_TARGET, projectId: 'production' } } },
    { delay: 30_001 },
  ]) {
    const { factory, calls } = fixture(change)
    await assert.rejects(factory.preflight(STAGING_PROVIDER_TARGET), /preflight unavailable/)
    assert.ok(calls.includes('supabase-dispose'))
  }
  const { factory } = fixture()
  await assert.rejects(factory.preflight({ ...STAGING_PROVIDER_TARGET, projectRef: 'wrhgscovsgsudtedbljr' }), /preflight unavailable/)
})

test('actual Vercel binding with synthetic HTTP receipts composes without a binding-level target', async () => {
  const { factory } = fixture({ openVercel: () => createStagingAccountHostedBaselineVercelBinding({
    vercelToken: Buffer.from('private-test-token'),
    fetch: async url => new Response(JSON.stringify(url.includes('/env?')
      ? { envs: [], pagination: { next: null } }
      : { id: HOSTED_BASELINE_VERCEL_TARGET.projectId, name: HOSTED_BASELINE_VERCEL_TARGET.project,
          accountId: HOSTED_BASELINE_VERCEL_TARGET.teamId, link: { type: 'github', repoId: 1264363509,
            repoOwnerId: 776655, org: HOSTED_BASELINE_VERCEL_TARGET.githubOrg,
            repo: HOSTED_BASELINE_VERCEL_TARGET.githubRepository,
            productionBranch: HOSTED_BASELINE_VERCEL_TARGET.githubProductionBranch, sourceless: true } }), { status: 200 }),
  }) })
  assert.equal((await factory.preflight(STAGING_PROVIDER_TARGET)).runtimeSessions, 0)
})

test('failed binding cleanup cannot return a passing receipt or leak its error', async () => {
  const { factory } = fixture({ disposeFailure: true })
  await assert.rejects(factory.preflight(STAGING_PROVIDER_TARGET), error => error.message === 'Staging provider normalization preflight unavailable')
  await assert.rejects(factory.readProvider(STAGING_PROVIDER_TARGET), error => error.message === 'Staging provider normalization preflight unavailable')
})

test('provider read errors are fixed and dispose the fresh Supabase binding', async () => {
  const { factory, calls } = fixture({ providerFailure: true })
  await assert.rejects(factory.readProvider(STAGING_PROVIDER_TARGET), error => error.message === 'Staging provider normalization preflight unavailable')
  assert.deepEqual(calls, ['provider', 'supabase-dispose'])
})
