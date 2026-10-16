import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER, STAGING_PROJECT_REF,
  STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import { createStagingGeneration23ProviderPort,
  STAGING_GENERATION_23_PROVIDER_PORT_ENABLED } from '../scripts/staging-generation-23-provider-port.mjs'

const secret = () => Buffer.from('p'.repeat(48))
const signal = () => new AbortController().signal
const provider = enabled => ({
  id: 'custom-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER,
  name: STAGING_PROVIDER_NAME, client_id: STAGING_BROKER_PROVIDER.clientId,
  acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl,
  token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl,
  jwks_uri: STAGING_BROKER_PROVIDER.jwksUrl, discovery_document: null,
  created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z',
})
async function armed() {
  const source = await readFile(new URL('../scripts/staging-generation-23-provider-port.mjs', import.meta.url), 'utf8')
  const declaration = 'export const STAGING_GENERATION_23_PROVIDER_PORT_ENABLED = false'
  assert.equal(source.split(declaration).length, 2)
  return import(`data:text/javascript;base64,${Buffer.from(source.replace(declaration,
    'export const STAGING_GENERATION_23_PROVIDER_PORT_ENABLED = true')
    .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)).toString('base64')}`)
}

test('ordinary provider port is OFF before credential or hosted access', () => {
  assert.equal(STAGING_GENERATION_23_PROVIDER_PORT_ENABLED, false)
  const key = secret()
  assert.throws(() => createStagingGeneration23ProviderPort({ projectSecret: key,
    fetcher() { throw Error('must not fetch') }, readBackendState() { throw Error('must not read') } }), /unavailable/)
  assert.equal(key.toString('utf8'), 'p'.repeat(48))
})

test('fixed official Auth Admin GET and minimal enabled-only PUT use staging target', async () => {
  const { createStagingGeneration23ProviderPort: createPort } = await armed()
  let current = provider(false)
  const calls = []
  const key = secret()
  const port = createPort({ projectSecret: key,
    readBackendState: async target => {
      assert.deepEqual(target, STAGING_PROVIDER_TARGET)
      return { projectRef: STAGING_PROJECT_REF, controlsEnabled: false, runtimeSessions: 0 }
    },
    fetcher: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body })
      if (init.method === 'PUT') {
        const patch = JSON.parse(init.body)
        assert.deepEqual(patch, { enabled: true })
        current = { ...current, enabled: true, updated_at: '2026-09-22T10:01:00.000Z' }
      }
      return new Response(JSON.stringify(current), { status: 200,
        headers: { 'content-type': 'application/json' } })
    },
  })
  assert.ok(key.every(byte => byte === 0))
  assert.deepEqual(await port.readBackendState(STAGING_PROVIDER_TARGET, { signal: signal() }),
    { projectRef: STAGING_PROJECT_REF, controlsEnabled: false, runtimeSessions: 0 })
  assert.equal((await port.readProvider(STAGING_PROVIDER_TARGET, { signal: signal() })).enabled, false)
  assert.deepEqual(await port.updateProvider(STAGING_PROVIDER_TARGET, PROVIDER_IDENTIFIER,
    { enabled: true }, { signal: signal() }), { status: 'UPDATED_NEEDS_READBACK',
    projectRef: STAGING_PROJECT_REF, identifier: PROVIDER_IDENTIFIER })
  assert.equal((await port.readProvider(STAGING_PROVIDER_TARGET, { signal: signal() })).enabled, true)
  assert.deepEqual(calls.map(call => call.method), ['GET', 'PUT', 'GET'])
  assert.ok(calls.every(call => call.url ===
    `https://${STAGING_PROJECT_REF}.supabase.co/auth/v1/admin/custom-providers/${PROVIDER_IDENTIFIER}`))
  port.dispose()
  await assert.rejects(() => port.readProvider(STAGING_PROVIDER_TARGET, { signal: signal() }), /unavailable/)
})

test('wrong project, expanded patch, abort and response drift stop before a success receipt', async () => {
  const { createStagingGeneration23ProviderPort: createPort } = await armed()
  let calls = 0
  const port = createPort({ projectSecret: secret(),
    readBackendState: async () => ({ projectRef: STAGING_PROJECT_REF,
      controlsEnabled: false, runtimeSessions: 0 }),
    fetcher: async () => { calls++; return new Response(JSON.stringify(provider(false)), { status: 200,
      headers: { 'content-type': 'application/json' } }) },
  })
  await assert.rejects(() => port.readProvider({ ...STAGING_PROVIDER_TARGET, branch: 'main' },
    { signal: signal() }), /unavailable/)
  await assert.rejects(() => port.updateProvider(STAGING_PROVIDER_TARGET, PROVIDER_IDENTIFIER,
    { enabled: true, jwks_uri: 'https://wrong.invalid' }, { signal: signal() }), /unavailable/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(() => port.readProvider(STAGING_PROVIDER_TARGET,
    { signal: controller.signal }), /unavailable/)
  assert.equal(calls, 0)
  await assert.rejects(() => port.updateProvider(STAGING_PROVIDER_TARGET, PROVIDER_IDENTIFIER,
    { enabled: true }, { signal: signal() }), /unavailable/)
  assert.equal(calls, 1)
  port.dispose()
})
