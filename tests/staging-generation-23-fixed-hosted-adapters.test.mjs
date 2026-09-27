import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { EDGE_PASSWORD_NAME, EDGE_READINESS_WINDOW_NAME } from '../scripts/staging-generation-23-password-material.mjs'

const script = new URL('../scripts/staging-generation-23-fixed-hosted-adapters.mjs', import.meta.url)
const source = await readFile(script, 'utf8')
const armed = await import(`data:text/javascript;base64,${Buffer.from(source
  .replace('export const STAGING_GENERATION_23_FIXED_HOSTED_ADAPTERS_ENABLED = false',
    'export const STAGING_GENERATION_23_FIXED_HOSTED_ADAPTERS_ENABLED = true')
  .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)).toString('base64')}`)
const broker = await import(new URL('../scripts/staging-provider-broker-rotation.mjs', import.meta.url))
const surfaceTransport = await import(new URL('../scripts/staging-surface-activation-transport.mjs', import.meta.url))

const credentials = () => ({ managementToken: Buffer.from(`sbp_${'a'.repeat(40)}`),
  vercelToken: Buffer.from('vercel-token'), previewBypass: Buffer.from('preview-bypass') })
const expectedDeployment = { deploymentId: 'dpl_fixed', immutableUrl: 'https://fixed.vercel.app',
  gitSourceCommit: 'a'.repeat(40) }
const testExpiry = new Date(Math.ceil(Date.now() / 1000) * 1000 + 45 * 60_000).toISOString()

function provider () {
  return {
    id: 'synthetic-staging-provider', provider_type: 'oauth2', identifier: broker.PROVIDER_IDENTIFIER,
    name: 'TLL staging subject broker', client_id: broker.BROKER_CLIENT_ID, acceptable_client_ids: [], scopes: ['subject'],
    pkce_enabled: true, attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true,
    issuer: '', discovery_url: '', skip_nonce_check: false,
    authorization_url: broker.STAGING_BROKER_PROVIDER.authorizationUrl, token_url: broker.STAGING_BROKER_PROVIDER.tokenUrl,
    userinfo_url: broker.STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: broker.STAGING_BROKER_PROVIDER.jwksUrl,
    discovery_document: null, created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
  }
}

function makeFactories (calls, { retainedSecret = true, passwordNames = [EDGE_PASSWORD_NAME], repository = { provider: 'github', repoId: 1264363509,
  repo: 'the-lifting-lab', org: 'tntipper', sourceless: true } } = {}) {
  const records = { state: null, gateInstalled: false }
  const factories = {
    async readPredecessor () { calls.push('gen23Predecessor'); return { status: 'PASS_RETIRED', receiptSha256: 'a'.repeat(64) } },
    createSupabase () { return {
      async readDatabase () { assert.fail('the obsolete Gen21 baseline database query must not run') },
      async readProvider () { calls.push('provider'); return provider() },
      async readEdgeSecretNames () { calls.push('edgeNames'); return retainedSecret ? [broker.BROKER_SECRET_NAME, ...passwordNames,
        ...(records.gateInstalled ? [EDGE_READINESS_WINDOW_NAME] : [])] : [] },
      dispose () { calls.push('disposeSupabase') },
    } },
    createVercel () { return {
      async readProject () { calls.push('project'); return { repository } },
      async readPreviewEnvironmentPresence () { calls.push('previewPresence'); return { environment: 'preview', branch: 'codex/tll-integration', brokerSecretPresent: retainedSecret } },
      dispose () { calls.push('disposeVercel') },
    } },
    createSurface () { return {
      async readBaseline () { calls.push('surface'); return { surface: { edge: { enabled: false }, flags: { ...surfaceTransport.HELD_SURFACE_FLAGS } },
        deployment: { ...expectedDeployment, branch: 'codex/tll-integration', alias: surfaceTransport.STAGING_ALIAS } } },
      dispose () { calls.push('disposeSurface') },
    } },
    createInventory () { return { async readTargets () { calls.push('inventory'); return [{ name: 'a' }] }, dispose () {} } },
    createEdge () { return { dispose () {} } },
    createReplacer () { return { dispose () {} } },
    createCoordinator ({ journal: input }) { assert.equal(input, testJournal); return { async run () { calls.push('replace'); records.state = 'FINISHED'; records.gateInstalled = true; return { status: 'SETTINGS_REPLACED_UNVERIFIED' } } } },
    createReadback ({ readVercelTargets, readEdgeNames }) { return { async prove ({ expectedTargets, signal }) {
      calls.push('readback'); assert.deepEqual(expectedTargets, [{ name: 'a' }])
      assert.deepEqual(await readVercelTargets({ signal }), [{ name: 'a' }])
      assert.deepEqual(await readEdgeNames({ signal }), [broker.BROKER_SECRET_NAME, EDGE_PASSWORD_NAME, EDGE_READINESS_WINDOW_NAME])
      return { status: 'SETTINGS_METADATA_VERIFIED' }
    } } },
  }
  const testJournal = { read: () => records.state ? { state: records.state } : null, claim () {}, dispatch () {}, confirm () {}, hold () {} }
  return { factories, testJournal }
}

test('ordinary fixed hosted adapter source remains OFF', async () => {
  const ordinary = await import(`${script.href}?ordinary=${Date.now()}`)
  assert.throws(() => ordinary.createStagingGeneration23FixedHostedAdapters({}), /unavailable/)
})

test('uses Generation 23 baseline semantics: retained broker secret is required while all customer controls remain held', async () => {
  const calls = [], owned = credentials()
  const { factories, testJournal } = makeFactories(calls)
  const factory = armed.createStagingGeneration23FixedHostedAdapters({ credentials: owned, fetch: async () => assert.fail('network'),
    expiresAt: testExpiry, expectedDeployment, settingsJournal: testJournal, factories })
  const signal = new AbortController().signal
  assert.deepEqual(await factory.ports.readBaseline({ signal }), { status: 'BASELINE_HELD_VERIFIED' })
  assert.deepEqual(await factory.ports.replaceSettings({ signal }), { status: 'SETTINGS_METADATA_VERIFIED' })
  assert.deepEqual(await factory.ports.readSettings({ signal }), { status: 'SETTINGS_METADATA_VERIFIED' })
  assert.deepEqual(calls, ['gen23Predecessor', 'edgeNames', 'provider', 'project', 'previewPresence', 'surface',
    'disposeSupabase', 'disposeVercel', 'disposeSurface', 'inventory', 'replace', 'readback', 'inventory', 'edgeNames', 'disposeSupabase'])
  const material = factory.getDatabaseMaterial()
  assert.equal(Object.keys(material.passwords).length, 5)
  assert.equal(Object.keys(material.verifiers).length, 5)
  factory.dispose()
  assert.throws(() => factory.getDatabaseMaterial(), /unavailable/)
})

test('fails closed if the deliberately retained broker secret is missing from either fixed host', async () => {
  const calls = [], { factories, testJournal } = makeFactories(calls, { retainedSecret: false })
  const factory = armed.createStagingGeneration23FixedHostedAdapters({ credentials: credentials(), fetch: async () => assert.fail('network'),
    expiresAt: '2099-01-01T00:00:00.000Z', expectedDeployment, settingsJournal: testJournal, factories })
  await assert.rejects(factory.ports.readBaseline({ signal: new AbortController().signal }), /unavailable/)
  assert.ok(calls.includes('provider'))
  assert.ok(calls.includes('disposeSupabase'))
  factory.dispose()
})

test('baseline requires exactly one retained Edge database-password name', async () => {
  for (const passwordNames of [[], [EDGE_PASSWORD_NAME, EDGE_PASSWORD_NAME]]) {
    const { factories, testJournal } = makeFactories([], { passwordNames })
    const factory = armed.createStagingGeneration23FixedHostedAdapters({ credentials: credentials(),
      fetch: async () => assert.fail('network'), expiresAt: '2099-01-01T00:00:00.000Z',
      expectedDeployment, settingsJournal: testJournal, factories })
    await assert.rejects(factory.ports.readBaseline({ signal: new AbortController().signal }), /unavailable/)
    factory.dispose()
  }
})

test('the live Git-linked sourceless flag cannot replace the pinned repository identity', async () => {
  for (const repository of [
    { provider: 'github', repoId: 123, repo: 'the-lifting-lab', org: 'tntipper', sourceless: true },
    { provider: 'github', repoId: 1264363509, repo: 'the-lifting-lab', org: 'tntipper', sourceless: 'true' },
  ]) {
    const { factories, testJournal } = makeFactories([], { repository })
    const factory = armed.createStagingGeneration23FixedHostedAdapters({ credentials: credentials(),
      fetch: async () => assert.fail('network'), expiresAt: '2099-01-01T00:00:00.000Z',
      expectedDeployment, settingsJournal: testJournal, factories })
    await assert.rejects(factory.ports.readBaseline({ signal: new AbortController().signal }), /unavailable/)
    factory.dispose()
  }
})
