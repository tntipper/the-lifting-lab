import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER, STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import {
  createStagingAccountHostedBaselineSupabaseBinding,
  HOSTED_BASELINE_SUPABASE_BINDING_ENABLED,
  HOSTED_BASELINE_SUPABASE_ENDPOINTS,
  HOSTED_BASELINE_SUPABASE_ERROR,
  HOSTED_BASELINE_SUPABASE_TARGET,
} from '../scripts/staging-account-hosted-baseline-supabase.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL } from '../scripts/staging-account-hosted-baseline-database.mjs'

const token = () => Buffer.from('private-management-api-token')
const receipt = Object.freeze({
  queryId: 'tll-staging-hosted-baseline-database/v2', projectRef: 'qdmvngjwkcsilzmqksme', generation: 21,
  windowId: 'a5511645-77af-4fc9-9e4c-f5c8a474d5fa', status: 'PASS_RETIRED', migrations: 15, runtimeRoles: 5,
  controlsEnabled: 0, passwordsConfigured: 0, validUntilInfinity: 5, operatorEdges: 5, executionEdges: 0, runtimeSessions: 0,
})
const database = () => [{ tll_staging_hosted_baseline_database: receipt }]
const keys = () => [
  { name: 'anon', type: 'legacy', api_key: 'a'.repeat(64), arbitraryAdditiveField: true },
  { name: 'service_role', type: 'legacy', api_key: 's'.repeat(64), arbitraryAdditiveField: true },
]
const provider = () => ({
  id: 'custom-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER, name: STAGING_PROVIDER_NAME,
  client_id: STAGING_BROKER_PROVIDER.clientId, acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true, issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: STAGING_BROKER_PROVIDER.jwksUrl, discovery_document: null,
  created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z',
})
const jsonResponse = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers })

function binding ({ fetch = async url => {
  if (url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.database) return jsonResponse(database(), 201)
  if (url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.secrets) return jsonResponse([{ name: 'UNRELATED_SECRET', value: 'must-not-escape' }])
  if (url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.apiKeys) return jsonResponse(keys())
  throw Error('unexpected URL')
}, onSecret, providerResult = provider() } = {}) {
  return createStagingAccountHostedBaselineSupabaseBinding({
    fetch,
    managementToken: token(),
    createProviderClient: ({ target, authUrl, projectSecret, signal, fetcher }) => {
      assert.deepEqual(target, STAGING_PROVIDER_TARGET); assert.equal(authUrl, 'https://qdmvngjwkcsilzmqksme.supabase.co')
      assert.equal(signal.aborted, false); onSecret?.(projectSecret)
      return { auth: { admin: { customProviders: { getProvider: async identifier => {
        assert.equal(identifier, PROVIDER_IDENTIFIER); assert.equal(typeof fetcher, 'function'); assert.notEqual(fetcher, fetch)
        return { data: providerResult, error: null }
      } } } } }
    },
  })
}

test('binding is disabled, fixed to staging, and posts the one read-only database query', async () => {
  assert.equal(HOSTED_BASELINE_SUPABASE_BINDING_ENABLED, false)
  assert.equal(HOSTED_BASELINE_SUPABASE_TARGET, 'qdmvngjwkcsilzmqksme')
  assert.throws(() => createStagingAccountHostedBaselineSupabaseBinding(), new RegExp(HOSTED_BASELINE_SUPABASE_ERROR))
  const calls = []
  const ports = binding({ fetch: async (url, options) => {
    calls.push({ url, options })
    if (url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.database) return jsonResponse(database(), 201)
    if (url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.secrets) return jsonResponse([])
    return jsonResponse(keys())
  } })
  const result = await ports.readDatabase({ signal: new AbortController().signal })
  assert.equal(result.status, 'PASS')
  assert.deepEqual(calls.map(call => call.url), [HOSTED_BASELINE_SUPABASE_ENDPOINTS.database])
  assert.equal(calls[0].options.method, 'POST'); assert.equal(calls[0].options.redirect, 'error')
  assert.deepEqual(JSON.parse(calls[0].options.body), { query: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL, read_only: true })
  assert.deepEqual(calls[0].options.headers, { authorization: calls[0].options.headers.authorization, accept: 'application/json', 'content-type': 'application/json', 'accept-encoding': 'identity' })
})

test('secrets output is names only and never returns sensitive values', async () => {
  const ports = binding()
  const names = await ports.readEdgeSecretNames({ signal: new AbortController().signal })
  assert.deepEqual(names, ['UNRELATED_SECRET']); assert.ok(Object.isFrozen(names))
  assert.doesNotMatch(JSON.stringify(names), /must-not-escape|value/i)
  for (const invalid of [[{ name: 'lowercase' }], [{ name: 'ONE' }, { name: 'ONE' }], { secrets: [] }]) {
    const invalidPorts = binding({ fetch: async url => url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.secrets ? jsonResponse(invalid) : jsonResponse(url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.database ? database() : keys(), url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.database ? 201 : 200) })
    await assert.rejects(invalidPorts.readEdgeSecretNames({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SUPABASE_ERROR))
  }
})

test('provider read selects only one legacy service-role key, validates data, and wipes the secret buffer', async () => {
  let supplied
  const ports = binding({ onSecret: value => { supplied = value } })
  const result = await ports.readProvider({ signal: new AbortController().signal })
  assert.equal(result.identifier, PROVIDER_IDENTIFIER); assert.equal(result.enabled, false)
  assert.ok(Buffer.isBuffer(supplied)); assert.deepEqual([...supplied], Array(supplied.length).fill(0))
  assert.equal(Object.hasOwn(result, 'client_secret'), false)
  for (const invalid of [
    [], [{ name: 'service_role', type: 'legacy', api_key: 's'.repeat(64) }, { name: 'service_role', type: 'legacy', api_key: 'q'.repeat(64) }],
    [{ name: 'service_role', type: 'new', api_key: 's'.repeat(64) }], [{ name: 'service_role', type: 'legacy', api_key: '' }],
  ]) {
    const bad = binding({ fetch: async url => url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.apiKeys ? jsonResponse(invalid) : jsonResponse(url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.database ? database() : [], url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.database ? 201 : 200) })
    await assert.rejects(bad.readProvider({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SUPABASE_ERROR))
  }
  const unrelatedNullable = [{ name: 'publishable', type: null, api_key: null }, { name: 'other' }, { name: 'service_role', type: 'legacy', api_key: 's'.repeat(64) }]
  const nullable = binding({ fetch: async url => url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.apiKeys ? jsonResponse(unrelatedNullable) : jsonResponse([], url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.database ? 201 : 200) })
  await nullable.readProvider({ signal: new AbortController().signal })
  const withSecret = binding({ providerResult: { ...provider(), client_secret: 'must-not-escape' } })
  await assert.rejects(withSecret.readProvider({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SUPABASE_ERROR))
})

test('one fixed Management API key read returns only the selected private Buffer', async () => {
  const calls = [], ports = binding({ fetch: async (url, options) => {
    calls.push({ url, options })
    return jsonResponse(keys())
  } })
  const signal = new AbortController().signal
  const selected = await ports.readProjectSecret({ signal })
  assert.ok(Buffer.isBuffer(selected))
  assert.equal(selected.toString('utf8'), 's'.repeat(64))
  assert.deepEqual(calls.map(call => call.url), [HOSTED_BASELINE_SUPABASE_ENDPOINTS.apiKeys])
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls[0].options.signal, signal)
  selected.fill(0)
  ports.dispose()
  await assert.rejects(ports.readProjectSecret({ signal }), new RegExp(HOSTED_BASELINE_SUPABASE_ERROR))

  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(binding().readProjectSecret({ signal: aborted.signal }), new RegExp(HOSTED_BASELINE_SUPABASE_ERROR))
  for (const invalid of [[], [{ name: 'service_role', type: 'legacy', api_key: 's'.repeat(64) },
    { name: 'service_role', type: 'legacy', api_key: 'q'.repeat(64) }], [{ name: 'service_role', type: 'new', api_key: 's'.repeat(64) }]]) {
    const bad = binding({ fetch: async () => jsonResponse(invalid) })
    await assert.rejects(bad.readProjectSecret({ signal }), error => error.message === HOSTED_BASELINE_SUPABASE_ERROR)
    bad.dispose()
  }
})

test('pending key fetch or body cannot deliver privileged material after binding disposal', async () => {
  let releaseFetch
  const pendingFetch = new Promise(resolve => { releaseFetch = resolve })
  const fetchPorts = binding({ fetch: async () => pendingFetch })
  const fetchRead = fetchPorts.readProjectSecret({ signal: new AbortController().signal })
  fetchPorts.dispose()
  releaseFetch(jsonResponse(keys()))
  await assert.rejects(fetchRead, error => error.message === HOSTED_BASELINE_SUPABASE_ERROR)

  let bodyController, bodyStarted
  const started = new Promise(resolve => { bodyStarted = resolve })
  const stream = new ReadableStream({ start(controller) { bodyController = controller } })
  const bodyPorts = binding({ fetch: async () => {
    bodyStarted()
    return new Response(stream, { status: 200 })
  } })
  const bodyRead = bodyPorts.readProjectSecret({ signal: new AbortController().signal })
  await started
  bodyPorts.dispose()
  bodyController.enqueue(new TextEncoder().encode(JSON.stringify(keys())))
  bodyController.close()
  await assert.rejects(bodyRead, error => error.message === HOSTED_BASELINE_SUPABASE_ERROR)
})

test('wrong response status, redirects, URL drift, framing, compression and oversize streams are rejected', async () => {
  const expected = HOSTED_BASELINE_SUPABASE_ENDPOINTS.database
  const cases = [
    async () => ({ status: 200, redirected: false, url: expected, body: jsonResponse(database()).body, headers: new Headers() }),
    async () => ({ status: 201, redirected: true, url: expected, body: jsonResponse(database()).body, headers: new Headers() }),
    async () => ({ status: 201, redirected: false, url: 'https://attacker.invalid', body: jsonResponse(database()).body, headers: new Headers() }),
    async () => jsonResponse(database(), 201, { 'content-encoding': 'gzip' }),
    async () => jsonResponse(database(), 201, { 'transfer-encoding': 'gzip' }),
    async () => jsonResponse(database(), 201, { 'content-length': '1048577' }),
  ]
  for (const fetch of cases) {
    const ports = binding({ fetch: async url => url === expected ? fetch() : jsonResponse([]) })
    await assert.rejects(ports.readDatabase({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SUPABASE_ERROR))
  }
  const oversized = new Uint8Array(1_048_577); oversized.fill(97)
  const ports = binding({ fetch: async url => url === expected
    ? { status: 201, redirected: false, url: expected, headers: new Headers(), body: new ReadableStream({ start (controller) { controller.enqueue(oversized); controller.close() } }) }
    : jsonResponse([]) })
  await assert.rejects(ports.readDatabase({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SUPABASE_ERROR))
})

test('standard chunked response is read within the byte cap and validated', async () => {
  const ports = binding({ fetch: async () => jsonResponse(database(), 201, { 'transfer-encoding': 'chunked' }) })
  const result = await ports.readDatabase({ signal: new AbortController().signal })
  assert.equal(result.status, 'PASS')
  ports.dispose()
})

test('midstream abort cancels the body, invalid bodies are cancelled, and dispose prevents reuse', async () => {
  let cancelled = 0
  let started
  const readerStarted = new Promise(resolve => { started = resolve })
  const pendingBody = { getReader: () => ({ read: () => new Promise(() => {}), cancel: () => { cancelled += 1 }, releaseLock: () => {} }) }
  const ports = binding({ fetch: async url => url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.database
    ? { status: 201, redirected: false, url, headers: new Headers(), body: { getReader: () => { started(); return pendingBody.getReader() } } }
    : jsonResponse([]) })
  const controller = new AbortController(); const pending = ports.readDatabase({ signal: controller.signal })
  await readerStarted; controller.abort()
  await assert.rejects(pending, new RegExp(HOSTED_BASELINE_SUPABASE_ERROR)); assert.equal(cancelled, 1)
  ports.dispose()
  await assert.rejects(ports.readDatabase({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SUPABASE_ERROR))
})

test('abort races settle during fetch, discard a late response, and reject an already-aborted reader setup', async () => {
  let resolveFetch; let lateCancelled = 0
  const late = new Promise(resolve => { resolveFetch = resolve })
  const ports = binding({ fetch: async url => url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.database ? late : jsonResponse([]) })
  const controller = new AbortController(); const pending = ports.readDatabase({ signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, new RegExp(HOSTED_BASELINE_SUPABASE_ERROR))
  resolveFetch({ status: 201, redirected: false, url: HOSTED_BASELINE_SUPABASE_ENDPOINTS.database, headers: new Headers(), body: { getReader: () => ({ cancel: () => { lateCancelled += 1 }, releaseLock: () => {} }) } })
  await new Promise(resolve => setImmediate(resolve)); assert.equal(lateCancelled, 1)

  let sameTurnCancelled = 0
  const sameTurnController = new AbortController()
  const sameTurn = binding({ fetch: async url => {
    sameTurnController.abort()
    return { status: 201, redirected: false, url, headers: new Headers(), body: { getReader: () => ({ cancel: () => { sameTurnCancelled += 1 }, releaseLock: () => {} }) } }
  } })
  await assert.rejects(sameTurn.readDatabase({ signal: sameTurnController.signal }), new RegExp(HOSTED_BASELINE_SUPABASE_ERROR))
  await new Promise(resolve => setImmediate(resolve)); assert.equal(sameTurnCancelled, 1)

  const aborting = new AbortController()
  const currentAbort = binding({ fetch: async url => ({ status: 201, redirected: false, url, headers: new Headers(), body: { getReader: () => {
    aborting.abort(); return { read: () => new Promise(() => {}), cancel: () => {}, releaseLock: () => {} }
  } } }) })
  await assert.rejects(currentAbort.readDatabase({ signal: aborting.signal }), new RegExp(HOSTED_BASELINE_SUPABASE_ERROR))
})

test('default official provider client is constrained to the exact GET and rejects 202 or overlarge provider bodies', async () => {
  const providerUrl = 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/admin/custom-providers/custom:tll-staging-subject-broker-v1'
  const originalError = console.error
  console.error = () => {}
  try {
    for (const mode of ['202', 'oversized']) {
      const ports = createStagingAccountHostedBaselineSupabaseBinding({
        managementToken: token(),
        fetch: async (url, options) => {
          if (url === HOSTED_BASELINE_SUPABASE_ENDPOINTS.apiKeys) return jsonResponse(keys())
          assert.equal(url, providerUrl); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error')
          assert.equal(new Headers(options.headers).get('accept-encoding'), 'identity')
          if (mode === '202') return jsonResponse(provider(), 202)
          const bytes = new Uint8Array(1_048_577); bytes.fill(97)
          return { status: 200, redirected: false, url, headers: new Headers(), body: new ReadableStream({ start (controller) { controller.enqueue(bytes); controller.close() } }) }
        },
      })
      await assert.rejects(ports.readProvider({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SUPABASE_ERROR))
    }
  } finally { console.error = originalError }
})

test('rejects caller-supplied targets and has no ambient capability or generic request surface', () => {
  const source = readFileSync('scripts/staging-account-hosted-baseline-supabase.mjs', 'utf8')
  assert.doesNotMatch(source, /child_process|spawn\(|exec\(|process\.|keychain|dotenv|globalThis\.fetch|https?\.request/i)
  assert.doesNotMatch(source, /new URL\(|URLSearchParams|caller.*url/i)
  assert.match(source, /api-keys\?reveal=true/); assert.match(source, /read_only: true/)
  const ports = binding()
  assert.equal(ports.target, HOSTED_BASELINE_SUPABASE_TARGET)
  assert.equal(Object.hasOwn(ports, 'request'), false)
})
