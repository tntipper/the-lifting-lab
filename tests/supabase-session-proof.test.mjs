import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'
import { SignJWT, jwtVerify } from 'jose'
import { createCustomerConnectionFoundation, connectionConfigHash, STAGING_SHOP_ID, STAGING_CUSTOMER_CLIENT_ID, STAGING_ISSUER, STAGING_DISCOVERY } from '../lib/identity/customer-connection.ts'

const entry = 'lib/identity/supabase-session-proof.ts'
const bundled = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createStagingSupabaseSessionReader: reader } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const nativeBundle = await build({ stdin: { contents: `export * from './${entry}'; export { probe } from './tests/fixtures/customer-https-probe.mjs'`, resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent', plugins: [{ name: 'offline-native-https', setup(build) {
    build.onResolve({ filter: /^node:https$/ }, () => ({ path: resolve('tests/fixtures/customer-https-probe.mjs') }))
  } }] })
const native = await import(`data:text/javascript;base64,${Buffer.from(nativeBundle.outputFiles[0].text).toString('base64')}`)
const ISSUER = 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1', USER = ISSUER + '/user'
const NOW = Date.parse('2026-09-15T22:00:00Z'), SECONDS = NOW / 1000
const USER_ID = 'd94849fa-eeba-456a-8051-9f578a835497', SESSION_ID = '20967116-9900-4560-bdc8-29c4c372a8d7'
const OTHER_SESSION = 'cde3e272-68f2-4cdb-9dba-83ea6f47ae57', OTHER_USER = '9bc324d8-690a-4933-8b9a-f993cc7963d9'
const KEY = 'sb_publishable_synthetic_public_test_only', SIGNING_KEY = new TextEncoder().encode('synthetic-HS256-signing-key-never-used-outside-tests')
const claims = () => ({ iss: ISSUER, sub: USER_ID, session_id: SESSION_ID, aud: 'authenticated', role: 'authenticated',
  is_anonymous: false, iat: SECONDS - 30, exp: SECONDS + 3600, amr: [{ method: 'password', timestamp: SECONDS - 60 }] })
const user = () => ({ id: USER_ID, aud: 'authenticated', role: 'authenticated', is_anonymous: false,
  last_sign_in_at: new Date(NOW).toISOString(), email: 'private-contact@synthetic.invalid', user_metadata: { private: 'private-user-metadata' } })
const response = (data = user(), changes = {}) => ({ url: USER, status: 200, headers: [['content-type', 'application/json; charset=utf-8']], body: Buffer.from(JSON.stringify(data)), ...changes })
const jwt = (changes = {}, key = SIGNING_KEY) => new SignJWT({ ...claims(), ...changes }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key)
const unsafeJwt = (payload = claims(), header = { alg: 'HS256', typ: 'JWT' }, signature = Buffer.alloc(32)) => [Buffer.from(JSON.stringify(header)).toString('base64url'), Buffer.from(JSON.stringify(payload)).toString('base64url'), signature.toString('base64url')].join('.')
const config = (token, transport = async () => response()) => ({ enabled: true, publishableKey: KEY, readAccessToken: async () => token, transport, now: () => NOW })

test('default disabled, browser context and invalid configuration never access SSR tokens or HTTP', async () => {
  let reads = 0, calls = 0
  const base = { readAccessToken: async () => { reads++; return await jwt() }, transport: async () => { calls++; return response() }, now: () => NOW }
  for (const changes of [{}, { enabled: false, publishableKey: KEY }, { enabled: true }, { enabled: true, publishableKey: 'sb_secret_synthetic_secret_key' },
    { enabled: true, publishableKey: await jwt() }, { enabled: true, publishableKey: KEY + '\n' },
    { enabled: true, publishableKey: KEY, timeoutMs: 0 }, { enabled: true, publishableKey: KEY, timeoutMs: 10001 }]) {
    assert.equal(await reader({ ...base, ...changes }).currentSession(), null)
  }
  globalThis.window = {}
  try { assert.equal(await reader({ ...base, enabled: true, publishableKey: KEY }).currentSession(), null) } finally { delete globalThis.window }
  assert.equal(reads, 0); assert.equal(calls, 0)
})
test('only exact trusted SSR token is sent to pinned GET; output contains proof alone', async () => {
  const token = await jwt(); let request, reads = 0
  const r = reader({ ...config(token, async input => { request = input; return response() }), readAccessToken: async () => { reads++; return token } })
  const proof = await r.currentSession()
  assert.deepEqual(proof, { userId: USER_ID, sessionId: SESSION_ID, authenticatedAt: NOW - 60000, expiresAt: NOW + 3600000,
    issuer: ISSUER, audience: 'authenticated', anonymous: false, checkedAt: NOW })
  assert.equal(reads, 2); assert.equal(request.url, USER); assert.equal(request.method, 'GET'); assert.equal(request.body, undefined)
  assert.equal(request.headers.apikey, KEY); assert.equal(request.headers.authorization, `Bearer ${token}`)
  assert.equal(request.headers['accept-encoding'], 'identity'); assert.equal(request.headers['cache-control'], 'no-store')
  assert.equal(request.headers['user-agent'], 'TheLiftingLab-Staging/1.0 (current authentication session verification)')
  assert.equal(request.maxBytes, 131072); assert.equal(request.signal.aborted, true)
  assert.equal(Object.isFrozen(proof), true); assert.equal(JSON.stringify(r), '{}')
  assert.doesNotMatch(JSON.stringify(proof), /private-|email|metadata|access_token|apikey|Bearer/)
})
test('fresh iat and refresh AMR never make a stale password proof recent, even with newer global last_sign_in_at', async () => {
  const old = NOW - 24 * 3600000
  const token = await jwt({ iat: SECONDS, amr: [{ method: 'password', timestamp: old / 1000 }, { method: 'token_refresh', timestamp: SECONDS }] })
  const proof = await reader(config(token)).currentSession()
  assert.equal(proof.authenticatedAt, old)
  assert.ok(NOW - proof.authenticatedAt > 5 * 60000)
  assert.equal(proof.checkedAt, NOW)
})
test('real connection domain holds stale authentication at start while permitting its current-session logout', async () => {
  let token = await jwt({ iat: SECONDS, amr: [{ method: 'password', timestamp: SECONDS - 86400 }, { method: 'token_refresh', timestamp: SECONDS }] })
  const currentSession = reader({ ...config(token), readAccessToken: async () => token }).currentSession
  const c = { shopId: STAGING_SHOP_ID, issuer: STAGING_ISSUER, discoveryUrl: STAGING_DISCOVERY,
    authorizationEndpoint: `${STAGING_ISSUER}/oauth/authorize`, tokenEndpoint: `${STAGING_ISSUER}/oauth/token`,
    jwksUri: `${STAGING_ISSUER}/.well-known/jwks.json`, logoutEndpoint: `${STAGING_ISSUER}/logout`, clientId: STAGING_CUSTOMER_CLIENT_ID,
    callbackUrl: 'https://synthetic-staging.vercel.app/auth/shopify/callback', supabaseIssuer: ISSUER }
  let attempts = 0, logouts = 0
  const foundation = createCustomerConnectionFoundation({ syntheticExecution: true,
    config: { ...c, verification: { evidenceId: 'synthetic-proof-integration', configHash: connectionConfigHash(c), verifiedAt: NOW - 1000, expiresAt: NOW + 3600000 } },
    ports: { currentSession, now: () => NOW, repository: {
      createAttempt: async () => { attempts++; return true },
      beginLogout: async () => { logouts++; return { status: 'local_revoked', upstreamLogout: 'not_required' } },
    } } })
  assert.equal((await foundation.start()).code, 'RECENT_SESSION_PROOF_REQUIRED'); assert.equal(attempts, 0)
  assert.equal((await foundation.logout()).status, 'logged_out'); assert.equal(logouts, 1)
  token = await jwt()
  assert.equal((await foundation.start()).status, 'authorization_ready'); assert.equal(attempts, 1)
})
for (const method of ['password', 'otp', 'magiclink', 'oauth']) {
  test(`supported timestamped ${method} authentication qualifies without requiring an email`, async () => {
    const token = await jwt({ amr: [{ method, timestamp: SECONDS - 45 }] })
    const publicUser = user(); delete publicUser.email
    assert.equal((await reader(config(token, async () => response(publicUser))).currentSession()).authenticatedAt, NOW - 45000)
  })
}
test('latest qualifying method is used; fresh MFA/recovery/refresh values cannot replace it', async () => {
  const token = await jwt({ iat: SECONDS, amr: [{ method: 'password', timestamp: SECONDS - 1200 }, { method: 'otp', timestamp: SECONDS - 45 },
    ...['totp', 'recovery', 'token_refresh', 'email_change'].map(method => ({ method, timestamp: SECONDS }))] })
  assert.equal((await reader(config(token)).currentSession()).authenticatedAt, NOW - 45000)
})
test('audience supports the documented single-entry array representation', async () => {
  assert.ok(await reader(config(await jwt({ aud: ['authenticated'] }))).currentSession())
})
const malformedClaims = [
  ['wrong project', { iss: 'https://wrongproject.supabase.co/auth/v1' }], ['issuer suffix', { iss: ISSUER + '/' }],
  ['missing session', { session_id: undefined }], ['nil session', { session_id: '00000000-0000-0000-0000-000000000000' }],
  ['invalid subject', { sub: 'arbitrary' }], ['anonymous', { is_anonymous: true }], ['missing anonymous flag', { is_anonymous: undefined }],
  ['service role', { role: 'service_role' }], ['anon audience', { aud: 'anon' }], ['multiple audiences', { aud: ['authenticated', 'other'] }],
  ['expired', { exp: SECONDS }], ['future issued', { iat: SECONDS + 1 }], ['fractional seconds', { exp: SECONDS + 0.5 }],
  ['unsafe timestamp', { exp: Number.MAX_SAFE_INTEGER }], ['future not before', { nbf: SECONDS + 1 }],
  ['missing AMR', { amr: undefined }], ['empty AMR', { amr: [] }], ['string AMR without timestamp', { amr: ['password'] }],
  ['missing AMR timestamp', { amr: [{ method: 'password' }] }], ['AMR after issue', { amr: [{ method: 'password', timestamp: SECONDS }] }],
  ['string AMR time', { amr: [{ method: 'password', timestamp: String(SECONDS - 60) }] }],
  ['duplicate AMR method', { amr: [{ method: 'password', timestamp: SECONDS - 60 }, { method: 'password', timestamp: SECONDS - 45 }] }],
  ...['token_refresh', 'totp', 'recovery', 'invite', 'sso/saml', 'email/signup', 'email_change', 'anonymous', 'unknown'].map(method => [`non-qualifying ${method}`, { amr: [{ method, timestamp: SECONDS - 60 }] }]),
]
for (const [label, changes] of malformedClaims) {
  test(`reject ${label} before token transmission`, async () => {
    let calls = 0
    assert.equal(await reader(config(await jwt(changes), async () => { calls++; return response() })).currentSession(), null)
    assert.equal(calls, 0)
  })
}
test('malformed compact tokens and unsafe JOSE headers are rejected before HTTP', async () => {
  let calls = 0
  for (const token of [null, '', 'Bearer private-token', 'a.b.c', await jwt() + '.', unsafeJwt().replace('.', '=.'),
    unsafeJwt(claims(), { alg: 'none' }), unsafeJwt(claims(), { alg: 'HS512' }), unsafeJwt(claims(), { alg: 'HS256', jku: 'https://wrong.invalid/key' }),
    unsafeJwt(claims(), { alg: 'HS256', crit: ['unknown'] }), unsafeJwt(claims(), { alg: 'HS256', typ: 'other' }),
    unsafeJwt(claims(), undefined, Buffer.alloc(31)), unsafeJwt({ ...claims(), private: 'x'.repeat(16384) }),
    [Buffer.from([0xff]).toString('base64url'), unsafeJwt().split('.')[1], unsafeJwt().split('.')[2]].join('.')]) {
    assert.equal(await reader(config(token, async () => { calls++; return response() })).currentSession(), null)
  }
  assert.equal(calls, 0)
})
test('real signature authority belongs to the server; forged, revoked and nonexistent sessions fail without fallback', async () => {
  let calls = 0; const sessions = new Set([SESSION_ID])
  const authority = async input => {
    calls++
    try {
      const { payload } = await jwtVerify(input.headers.authorization.slice(7), SIGNING_KEY, { issuer: ISSUER, audience: 'authenticated', algorithms: ['HS256'], currentDate: new Date(NOW) })
      if (!sessions.has(payload.session_id)) return response({ error_code: 'session_not_found', msg: 'private-error-details' }, { status: 403 })
      return response()
    } catch { return response({ error_code: 'bad_jwt', msg: 'private-error-details' }, { status: 403 }) }
  }
  const valid = await jwt(), r = reader(config(valid, authority))
  assert.ok(await r.currentSession())
  assert.equal(await reader(config(await jwt({}, new TextEncoder().encode('other-synthetic-signing-key-never-trusted')), authority)).currentSession(), null)
  assert.equal(await reader(config(await jwt({ session_id: OTHER_SESSION }), authority)).currentSession(), null)
  sessions.delete(SESSION_ID)
  assert.equal(await r.currentSession(), null)
  assert.equal(calls, 4)
})
for (const [label, changes] of [['user mismatch', { id: OTHER_USER }], ['role mismatch', { role: 'service_role' }], ['audience mismatch', { aud: 'other' }],
  ['anonymous user', { is_anonymous: true }], ['missing anonymous field', { is_anonymous: undefined }], ['error object with fields', { error: 'private-error-body' }]]) {
  test(`server ${label} cannot become a proof`, async () => {
    assert.equal(await reader(config(await jwt(), async () => response({ ...user(), ...changes }))).currentSession(), null)
  })
}
test('an SSR logout, session replacement or token rotation during verification holds; next call must reverify', async () => {
  const old = await jwt()
  for (const replacement of [null, await jwt({ session_id: OTHER_SESSION }), await jwt({ iat: SECONDS })]) {
    let reads = 0, calls = 0
    const r = reader({ ...config(old, async () => { calls++; return response() }), readAccessToken: async () => (++reads === 1 ? old : replacement) })
    assert.equal(await r.currentSession(), null); assert.equal(calls, 1)
  }
})
test('configuration is snapshotted and concurrent reads never reuse or cross user/session proofs', async () => {
  const original = await jwt(), replacement = await jwt({ sub: OTHER_USER, session_id: OTHER_SESSION })
  const options = config(original); const r = reader(options)
  options.publishableKey = 'sb_secret_wrong'; options.readAccessToken = async () => replacement
  assert.equal((await r.currentSession()).userId, USER_ID)
  const other = reader(config(replacement, async () => response({ ...user(), id: OTHER_USER })))
  const proofs = await Promise.all([r.currentSession(), other.currentSession()])
  assert.deepEqual(proofs.map(p => [p.userId, p.sessionId]), [[USER_ID, SESSION_ID], [OTHER_USER, OTHER_SESSION]])
})
test('transport, accessor and clock errors are redacted to null, with no logging', async () => {
  const token = await jwt(), logs = [], oldError = console.error, oldWarn = console.warn, oldLog = console.log
  console.error = console.warn = console.log = (...args) => logs.push(args)
  try {
    for (const options of [config(token, async () => { throw Error(`private-error-body ${token}`) }),
      { ...config(token), readAccessToken: async () => { throw Error(`private-cookie ${token}`) } },
      { ...config(token), now: () => { throw Error('private-clock') } }]) assert.equal(await reader(options).currentSession(), null)
  } finally { console.error = oldError; console.warn = oldWarn; console.log = oldLog }
  assert.deepEqual(logs, [])
})
test('clock regression, expiry during HTTP and excessive verification age cannot return a proof', async () => {
  const token = await jwt({ exp: SECONDS + 1 })
  for (const finish of [NOW - 1, NOW + 1000, NOW + 6000, NaN]) {
    let calls = 0
    assert.equal(await reader({ ...config(token), now: () => calls++ ? finish : NOW }).currentSession(), null)
  }
})
test('timeout covers HTTP and SSR accessors; delayed access cannot start HTTP after a hold', async () => {
  const token = await jwt(); let calls = 0, capturedSignal
  const stalled = reader({ ...config(token, async input => { calls++; capturedSignal = input.signal; return new Promise(() => {}) }), timeoutMs: 50 })
  assert.equal(await stalled.currentSession(), null); assert.equal(calls, 1); assert.equal(capturedSignal.aborted, true)
  let release
  const delayed = reader({ ...config(token, async () => { calls++; return response() }), timeoutMs: 50, readAccessToken: () => new Promise(resolve => { release = resolve }) })
  assert.equal(await delayed.currentSession(), null); release(token)
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 1)
})
const malformedResponses = [
  ['redirect', r => ({ ...r, status: 302, headers: [...r.headers, ['location', 'https://wrong.invalid/capture']] })],
  ['changed URL', r => ({ ...r, url: USER + '?other=1' })], ['unavailable server', r => ({ ...r, status: 503 })],
  ['non-JSON', r => ({ ...r, headers: [['content-type', 'text/html']] })], ['compression', r => ({ ...r, headers: [...r.headers, ['content-encoding', 'gzip']] })],
  ['truncated length', r => ({ ...r, headers: [...r.headers, ['content-length', String(r.body.length + 1)]] })],
  ['duplicate representation', r => ({ ...r, headers: [...r.headers, ['Content-Type', 'application/json']] })],
  ['empty body', r => ({ ...r, body: Buffer.alloc(0) })], ['oversized body', r => ({ ...r, body: Buffer.alloc(131073) })],
  ['invalid UTF8', r => ({ ...r, body: Buffer.from([0xff]) })], ['invalid JSON', r => ({ ...r, body: Buffer.from('{') })],
  ['unexpected envelope', r => ({ ...r, body: Buffer.from(JSON.stringify({ user: user() })) })],
  ['header injection', r => ({ ...r, headers: [...r.headers, ['x-private', 'private\r\nheader']] })],
  ['oversized header', r => ({ ...r, headers: [...r.headers, ['x-private', 'x'.repeat(16385)]] })],
]
for (const [label, mutate] of malformedResponses) {
  test(`invalid HTTP ${label} fails without retry or follow`, async () => {
    let calls = 0
    assert.equal(await reader(config(await jwt(), async () => { calls++; return mutate(response()) })).currentSession(), null)
    assert.equal(calls, 1)
  })
}
test('native HTTPS path pins TLS and GET, rejects redirects/truncation/oversize/aborts, opens no real sockets in test', async () => {
  const token = await jwt(), options = { ...config(token), transport: undefined }
  native.probe.calls.length = 0
  native.probe.scenario = { chunks: [response().body] }
  assert.ok(await native.createStagingSupabaseSessionReader(options).currentSession())
  const call = native.probe.calls[0]
  assert.equal(call.url, USER); assert.equal(call.options.method, 'GET'); assert.equal(call.body, undefined)
  assert.equal(call.options.rejectUnauthorized, true); assert.deepEqual(call.options.agent.options, { keepAlive: false, rejectUnauthorized: true })
  assert.equal(call.options.maxHeaderSize, 16384); assert.equal(call.options.headers.authorization, `Bearer ${token}`)
  assert.equal(call.options.headers['user-agent'], 'TheLiftingLab-Staging/1.0 (current authentication session verification)')
  for (const scenario of [{ status: 302 }, { complete: false, chunks: [response().body] }, { chunks: [Buffer.alloc(131073)] },
    { aborted: true }, { error: true }, { headers: { 'content-encoding': 'gzip' } }, { stall: true }]) {
    native.probe.scenario = scenario
    const before = native.probe.calls.length
    assert.equal(await native.createStagingSupabaseSessionReader({ ...options, timeoutMs: 50 }).currentSession(), null)
    assert.equal(native.probe.calls.length, before + 1)
  }
})
