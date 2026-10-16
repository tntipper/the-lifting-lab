import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER, STAGING_PROVIDER_TARGET, createProviderBrokerRotationJournal, rotateStagingProviderBroker } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_AUTH_URL, STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import {
  createOfficialStagingProviderClient,
  createStagingProviderBrokerNativeBinding,
  NATIVE_STAGING_PROVIDER_BROKER_BINDING_ENABLED,
  STAGING_PROVIDER_ROOT_URL,
} from '../scripts/staging-provider-broker-native-binding.mjs'

const projectSecret = Buffer.from('p'.repeat(48))
const provider = ({ enabled = false, ...overrides } = {}) => ({
  id: 'custom-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER, name: STAGING_PROVIDER_NAME,
  client_id: STAGING_BROKER_PROVIDER.clientId, acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled, email_optional: true, issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: STAGING_BROKER_PROVIDER.jwksUrl, discovery_document: null,
  created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z', ...overrides,
})
const completed = async operation => ({ status: 'COMPLETED', value: await operation(new AbortController().signal) })
const frozen = async target => ({ target, providerIdentifier: PROVIDER_IDENTIFIER, providerEnabled: false, edgeEnabled: false, privateEnabled: false, publicEnabled: false, supabase: [], vercel: [] })

function response(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

test('official SDK uses the exact project-root URL and requests the provider endpoint once without doubled auth paths', async () => {
  const calls = []
  const client = createOfficialStagingProviderClient({
    target: STAGING_PROVIDER_TARGET, authUrl: STAGING_AUTH_URL, projectSecret: Buffer.from(projectSecret), signal: new AbortController().signal,
    fetcher: async (url, init) => { calls.push({ url, init }); return response(provider()) },
  })
  const result = await client.auth.admin.customProviders.getProvider(PROVIDER_IDENTIFIER)
  assert.equal(STAGING_AUTH_URL, STAGING_PROVIDER_ROOT_URL)
  assert.equal(result.error, null)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/admin/custom-providers/${PROVIDER_IDENTIFIER}`)
  assert.equal(calls[0].init.redirect, 'error')
  assert.equal(calls[0].init.signal.aborted, false)
  assert.doesNotMatch(calls[0].url, /auth\/v1\/auth\/v1/)
})

test('binding constructs only exact secret-host commands and returns names rather than secret material', async () => {
  const calls = []; const staged = Buffer.from('b'.repeat(48)); const secretText = staged.toString('utf8')
  const fetcher = async () => response(provider())
  const runner = kind => async (args, input, fd, { signal }) => {
    calls.push({ kind, args, input, fd, signal })
    assert.equal(signal.aborted, false)
    if (args.includes('list') || args.includes('ls')) {
      return kind === 'supabase'
        ? JSON.stringify([{ name: BROKER_SECRET_NAME }, { name: 'OTHER_SAFE_NAME' }])
        : JSON.stringify({ envs: [{ key: BROKER_SECRET_NAME, gitBranch: STAGING_PROVIDER_TARGET.branch, target: ['preview'] }, { key: 'OTHER_SAFE_NAME', gitBranch: 'main', target: ['preview'] }] })
    }
    return ''
  }
  const binding = createStagingProviderBrokerNativeBinding({ projectSecret: Buffer.from(projectSecret), readFrozenState: frozen, execute: completed, fetcher, runVercel: runner('vercel'), runSupabase: runner('supabase') })
  await binding.stageVercelBrokerSecret(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, staged)
  await binding.stageSupabaseBrokerSecret(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, staged)
  assert.deepEqual(await binding.readbackSecretNames(STAGING_PROVIDER_TARGET), { target: STAGING_PROVIDER_TARGET, supabase: [BROKER_SECRET_NAME], vercel: [BROKER_SECRET_NAME] })
  await binding.removeVercelBrokerSecret(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME)
  await binding.removeSupabaseBrokerSecret(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME)
  assert.equal(staged.toString('utf8'), secretText)
  const commandLines = calls.map(call => call.args.join(' '))
  assert.deepEqual(commandLines, [
    '--yes vercel env add TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET preview --git-branch codex/tll-integration --project the-lifting-lab --scope my-lifting-lab-s-projects --non-interactive --no-color --sensitive --force',
    'secrets set --env-file /dev/fd/3 --project-ref qdmvngjwkcsilzmqksme --output json',
    'secrets list --project-ref qdmvngjwkcsilzmqksme --output json',
    '--yes vercel env ls preview codex/tll-integration --project the-lifting-lab --scope my-lifting-lab-s-projects --non-interactive --no-color --json',
    '--yes vercel env rm TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET preview codex/tll-integration --project the-lifting-lab --scope my-lifting-lab-s-projects --non-interactive --no-color --yes',
    'secrets unset TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET --project-ref qdmvngjwkcsilzmqksme --output json',
  ])
  assert.equal(calls[0].fd, 0); assert.equal(calls[1].fd, 3)
  assert.doesNotMatch(calls[0].args.join(' '), new RegExp(secretText))
  assert.doesNotMatch(calls[1].args.join(' '), new RegExp(secretText))
  assert.ok(calls[0].input.every(byte => byte === 0))
  assert.ok(calls[1].input.every(byte => byte === 0))
})

test('composed binding rotation ignores unrelated validated host names while preserving exact broker presence and absence projections', async () => {
  const present = { supabase: false, vercel: false }; let current = provider()
  const fetcher = async (_url, init) => {
    if (init.method === 'PUT') current = provider()
    return response(current)
  }
  const runner = async (args) => {
    const joined = args.join(' ')
    if (joined.includes(' env add ')) present.vercel = true
    if (joined.startsWith('secrets set ')) present.supabase = true
    if (joined.includes(' env rm ')) present.vercel = false
    if (joined.startsWith('secrets unset ')) present.supabase = false
    if (joined.includes('secrets list')) return JSON.stringify([{ name: 'UNRELATED_EDGE_SECRET' }, ...(present.supabase ? [{ name: BROKER_SECRET_NAME }] : [])])
    if (joined.includes('env ls')) return JSON.stringify({ envs: [
      { key: 'UNRELATED_PREVIEW_SECRET', gitBranch: STAGING_PROVIDER_TARGET.branch, target: ['preview'] },
      ...(present.vercel ? [{ key: BROKER_SECRET_NAME, gitBranch: STAGING_PROVIDER_TARGET.branch, target: ['preview'] }] : []),
    ] })
    return ''
  }
  const binding = createStagingProviderBrokerNativeBinding({ projectSecret: Buffer.from(projectSecret), readFrozenState: frozen, execute: completed, fetcher, runVercel: runner, runSupabase: runner })
  assert.deepEqual(await binding.readbackSecretNames(STAGING_PROVIDER_TARGET), { target: STAGING_PROVIDER_TARGET, supabase: [], vercel: [] })
  const journal = createProviderBrokerRotationJournal({ path: join(mkdtempSync(join(tmpdir(), 'tll-binding-rotation-')), 'journal.json'), makeRunId: () => 'binding-rotation-run' })
  const result = await rotateStagingProviderBroker({ ports: binding, journal, randomBytes: size => Buffer.from('r'.repeat(size)), now: () => 1_789_000_000_000 })
  assert.equal(result.status, 'ROTATION_VERIFIED')
  assert.equal(journal.read().state, 'ROTATION_VERIFIED')
  assert.equal(present.vercel, true); assert.equal(present.supabase, true)
})

test('binding forwards executor abort signals and fails closed for redirects, target drift, malformed output and runner errors', async () => {
  const controller = new AbortController(); const calls = []
  const client = createOfficialStagingProviderClient({
    target: STAGING_PROVIDER_TARGET, authUrl: STAGING_AUTH_URL, projectSecret: Buffer.from(projectSecret), signal: controller.signal,
    fetcher: async (_url, init) => { calls.push(init.signal); return { redirected: false, url: 'https://attacker.invalid', json: async () => provider(), text: async () => '' } },
  })
  const originalError = console.error
  console.error = () => {}
  let redirected
  try { redirected = await client.auth.admin.customProviders.getProvider(PROVIDER_IDENTIFIER) } finally { console.error = originalError }
  assert.ok(redirected.error)
  assert.equal(calls[0], controller.signal)
  const runner = async (args) => args.includes('list') ? '{"envs":[{"key":"bad-name","gitBranch":"codex/tll-integration","target":["preview"]}]}' : ''
  const binding = createStagingProviderBrokerNativeBinding({ projectSecret: Buffer.from(projectSecret), readFrozenState: frozen, execute: completed, fetcher: async () => response(provider()), runVercel: runner, runSupabase: runner })
  await assert.rejects(() => binding.readbackSecretNames(STAGING_PROVIDER_TARGET), /unavailable/)
  await assert.rejects(() => binding.getProvider({ ...STAGING_PROVIDER_TARGET, branch: 'main' }, PROVIDER_IDENTIFIER), /unavailable/)
  const rawFailure = createStagingProviderBrokerNativeBinding({ projectSecret: Buffer.from(projectSecret), readFrozenState: frozen, execute: completed, fetcher: async () => { throw Error('secret diagnostic') }, runVercel: runner, runSupabase: runner })
  console.error = () => {}
  try { await assert.rejects(() => rawFailure.getProvider(STAGING_PROVIDER_TARGET, PROVIDER_IDENTIFIER), error => error.message === 'Staging provider native adapter unavailable') } finally { console.error = originalError }
})

test('binding has no ambient live runner, credential reader, launcher or enabled native path', async () => {
  assert.equal(NATIVE_STAGING_PROVIDER_BROKER_BINDING_ENABLED, false)
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../scripts/staging-provider-broker-native-binding.mjs', import.meta.url), 'utf8'))
  assert.doesNotMatch(source, /child_process|spawn\(|exec\(|keychain|process\.env|runPrivateCli|runSupabasePrivateCli/i)
  assert.throws(() => createStagingProviderBrokerNativeBinding({}), /unavailable/)
})
