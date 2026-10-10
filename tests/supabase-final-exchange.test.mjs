import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

const entry = 'lib/identity/supabase-final-exchange.ts'
const bundle = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createSupabaseFinalExchange: adapter, SupabaseFinalExchangeHeld } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const nativeBundle = await build({ stdin: { contents: `export * from './${entry}'; export { probe } from './tests/fixtures/customer-https-probe.mjs'`, resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent', plugins: [{ name: 'offline-native-https', setup(build) {
    build.onResolve({ filter: /^node:https$/ }, () => ({ path: resolve('tests/fixtures/customer-https-probe.mjs') }))
  } }] })
const native = await import(`data:text/javascript;base64,${Buffer.from(nativeBundle.outputFiles[0].text).toString('base64')}`)
const ISSUER = 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1', TOKEN_URL = `${ISSUER}/token?grant_type=pkce`, USER_URL = `${ISSUER}/user`
const PROVIDER = 'custom:tll-staging-subject-broker-v1', NOW = Date.parse('2026-09-17T11:00:00Z'), SECONDS = NOW / 1000
const USER = 'eeeeeeee-dddd-4ccc-8bbb-aaaaaaaaaaaa', OTHER_USER = 'ffffffff-dddd-4ccc-8bbb-aaaaaaaaaaaa'
const SESSION = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', OTHER_SESSION = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const IDENTITY = 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee', OTHER_IDENTITY = 'dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const KEY = 'sb_publishable_synthetic00000000000', SIGNING_KEY = new TextEncoder().encode('synthetic-signing-key-only-not-a-provider-secret')
const SUBJECT = `tllb_${Buffer.alloc(32, 1).toString('base64url')}`, OTHER_SUBJECT = `tllb_${Buffer.alloc(32, 2).toString('base64url')}`
const VERIFIER = Buffer.alloc(32, 3).toString('base64url'), CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url')
const binding = () => ({ authCode: 'aaaaaaaa-1111-4222-8333-444444444444', applicationVerifier: VERIFIER, applicationPkceChallenge: CHALLENGE, reservedSubject: SUBJECT })
const claims = () => ({ iss: ISSUER, sub: USER, session_id: SESSION, aud: 'authenticated', role: 'authenticated', is_anonymous: false,
  iat: SECONDS - 1, exp: SECONDS + 3600, amr: [{ method: 'oauth', timestamp: SECONDS - 1 }] })
const jwt = (changes = {}, key = SIGNING_KEY) => new SignJWT({ ...claims(), ...changes }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key)
const identity = () => ({ identity_id: IDENTITY, id: SUBJECT, user_id: USER, provider: PROVIDER, identity_data: { sub: 'untrusted-metadata-subject', email: 'private@example.invalid' } })
const user = () => ({ id: USER, aud: 'authenticated', role: 'authenticated', is_anonymous: false, identities: [identity()],
  email: 'private@example.invalid', user_metadata: { private: 'private-profile' }, app_metadata: { provider: 'google' } })
const tokenData = access => ({ access_token: access, refresh_token: 'private-refresh-token', token_type: 'bearer', expires_at: SECONDS + 3600, expires_in: 3600,
  provider_token: 'private-spent-provider-token', provider_refresh_token: 'private-provider-refresh', user: { id: OTHER_USER, identities: [] }, future_extension: 'private-extension' })
const response = (url, data, changes = {}) => ({ url, status: 200, headers: [['content-type', 'application/json; charset=utf-8']], body: Buffer.from(JSON.stringify(data)), ...changes })
const options = transport => ({ enabled: true, publishableKey: KEY, transport, now: () => NOW })
const held = outcome => error => {
  assert.ok(error instanceof SupabaseFinalExchangeHeld)
  assert.equal(error.code, 'SUPABASE_FINAL_EXCHANGE_HELD')
  assert.equal(error.outcome, outcome)
  assert.equal(error.message, 'Customer final session exchange held')
  assert.equal(error.cause, undefined)
  assert.doesNotMatch(JSON.stringify(error), /private-|synthetic|code_verifier|auth_code|sb_publishable|supabase.co/)
  return true
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function fixture(input = {}) {
  const token = input.token ?? await jwt(), { result = tokenData(token), authoritative = user(), modify = r => r, key = SIGNING_KEY } = input
  const calls = [], sessions = new Set([SESSION, OTHER_SESSION])
  const transport = async request => {
    calls.push(request)
    if (request.url === TOKEN_URL) return modify(response(TOKEN_URL, result), request)
    assert.equal(request.url, USER_URL)
    try {
      const { payload } = await jwtVerify(request.headers.authorization.slice(7), key, { issuer: ISSUER, audience: 'authenticated', algorithms: ['HS256'], currentDate: new Date(NOW) })
      if (!sessions.has(payload.session_id)) return response(USER_URL, { error_code: 'session_not_found' }, { status: 403 })
      return modify(response(USER_URL, authoritative), request)
    } catch { return response(USER_URL, { error_code: 'bad_jwt' }, { status: 403 }) }
  }
  return { token, calls, sessions, transport, api: adapter(options(transport)) }
}

test('one final POST followed by one exact-token GET yields only sanitized private provisional material', async () => {
  const f = await fixture(), result = await f.api.exchangeSignIn(binding())
  assert.equal(f.calls.length, 2)
  const [post, get] = f.calls
  assert.equal(post.url, TOKEN_URL); assert.equal(post.method, 'POST')
  assert.deepEqual(JSON.parse(post.body), { auth_code: binding().authCode, code_verifier: VERIFIER })
  assert.equal(post.headers.authorization, undefined); assert.equal(post.headers.cookie, undefined)
  assert.equal(post.headers.apikey, KEY); assert.equal(post.headers['content-type'], 'application/json')
  assert.equal(get.url, USER_URL); assert.equal(get.method, 'GET'); assert.equal(get.body, null)
  assert.equal(get.headers.authorization, `Bearer ${f.token}`); assert.equal(get.headers.cookie, undefined)
  assert.equal(get.headers.apikey, KEY)
  assert.equal(result.kind, 'private_provisional')
  assert.deepEqual(result.session, { accessToken: f.token, refreshToken: 'private-refresh-token', tokenType: 'Bearer', expiresAt: NOW + 3600000 })
  assert.deepEqual(result.identity, { provider: PROVIDER, subject: SUBJECT, userId: USER, identityId: IDENTITY })
  assert.equal(result.proof.userId, USER); assert.equal(result.proof.sessionId, SESSION)
  assert.equal(result.proof.authenticatedAt, NOW - 1000); assert.equal(result.proof.checkedAt, NOW)
  assert.doesNotMatch(JSON.stringify(result), /provider_token|provider_refresh_token|private-spent|private-provider|private-profile|private-extension|email|metadata|identities/)
  for (const object of [result, result.session, result.identity, result.proof]) assert.ok(Object.isFrozen(object))
  for (const request of f.calls) { assert.ok(request.signal.aborted); assert.equal(request.headers['cache-control'], 'no-store'); assert.ok(Object.isFrozen(request.headers)) }
})

test('migration preserves original UUID while accepting a new final session and other linked identities', async () => {
  const authoritative = user(); authoritative.identities.push({ identity_id: OTHER_IDENTITY, id: 'legacy@example.invalid', user_id: USER, provider: 'email' })
  const f = await fixture({ token: await jwt({ session_id: OTHER_SESSION }), authoritative })
  const result = await f.api.exchangeMigration({ ...binding(), originalUserId: USER })
  assert.equal(result.proof.userId, USER); assert.equal(result.proof.sessionId, OTHER_SESSION)
  await assert.rejects(f.api.exchangeMigration({ ...binding(), originalUserId: OTHER_USER }), held('uncertain'))
  assert.equal(f.calls.length, 4)
})

test('session verification is authoritative, not token-response user or unsigned JWT contents', async t => {
  for (const [name, setup] of [
    ['forged signature', async () => fixture({ token: await jwt({}, new TextEncoder().encode('synthetic-wrong-signing-key')) })],
    ['revoked session', async () => { const f = await fixture(); f.sessions.clear(); return f }],
    ['user switch', async () => fixture({ authoritative: { ...user(), id: OTHER_USER } })],
    ['anonymous server user', async () => fixture({ authoritative: { ...user(), is_anonymous: true } })],
  ]) await t.test(name, async () => {
    const f = await setup(); await assert.rejects(f.api.exchangeSignIn(binding()), held('uncertain')); assert.equal(f.calls.length, 2)
  })
})

test('identity row semantics, unique broker subject and authoritative ownership are mandatory', async t => {
  const changes = [
    ['no identities', u => { delete u.identities }], ['empty identities', u => { u.identities = [] }],
    ['wrong provider', u => { u.identities[0].provider = 'google' }], ['metadata substitute', u => { u.identities[0].id = OTHER_SUBJECT; u.identities[0].identity_data.sub = SUBJECT }],
    ['identity UUID mistaken for subject', u => { u.identities[0].id = IDENTITY; u.identities[0].identity_id = SUBJECT }],
    ['foreign owner', u => { u.identities[0].user_id = OTHER_USER }], ['missing row UUID', u => { delete u.identities[0].identity_id }],
    ['duplicate broker', u => { u.identities.push({ ...identity(), identity_id: OTHER_IDENTITY }) }],
    ['conflicting broker', u => { u.identities.push({ ...identity(), identity_id: OTHER_IDENTITY, id: OTHER_SUBJECT }) }],
    ['duplicate row UUID', u => { u.identities.push({ ...identity(), provider: 'email', id: 'x@example.invalid' }) }],
    ['foreign secondary identity', u => { u.identities.push({ ...identity(), identity_id: OTHER_IDENTITY, provider: 'email', id: 'x@example.invalid', user_id: OTHER_USER }) }],
    ['oversized list', u => { u.identities = Array.from({ length: 65 }, identity) }],
  ]
  for (const [name, change] of changes) await t.test(name, async () => {
    const u = user(); change(u); const f = await fixture({ authoritative: u })
    await assert.rejects(f.api.exchangeSignIn(binding()), held('uncertain')); assert.equal(f.calls.length, 2)
  })
  const u = user(); delete u.email; delete u.identities[0].identity_data
  assert.equal((await (await fixture({ authoritative: u })).api.exchangeSignIn(binding())).identity.subject, SUBJECT)
})

test('OAuth AMR is required after verification, with valid timestamps and no duplicate method', async t => {
  const cases = [
    ['password only', [{ method: 'password', timestamp: SECONDS - 1 }], 2],
    ['newer password cannot substitute', [{ method: 'oauth', timestamp: SECONDS - 60 }, { method: 'password', timestamp: SECONDS - 1 }], 2],
    ['stale OAuth', [{ method: 'oauth', timestamp: SECONDS - 300 }], 2],
    ['duplicate OAuth', [{ method: 'oauth', timestamp: SECONDS - 2 }, { method: 'oauth', timestamp: SECONDS - 1 }], 1],
    ['future OAuth', [{ method: 'oauth', timestamp: SECONDS + 1 }], 1],
    ['missing timestamp', [{ method: 'oauth' }], 1], ['string timestamp', [{ method: 'oauth', timestamp: String(SECONDS - 1) }], 1],
    ['fraction timestamp', [{ method: 'oauth', timestamp: SECONDS - 1.5 }], 1], ['unqualified only', [{ method: 'token_refresh', timestamp: SECONDS - 1 }], 1],
  ]
  for (const [name, amr, count] of cases) await t.test(name, async () => {
    const f = await fixture({ token: await jwt({ amr }) }); await assert.rejects(f.api.exchangeSignIn(binding()), held('uncertain')); assert.equal(f.calls.length, count)
  })
  const f = await fixture({ token: await jwt({ amr: [{ method: 'oauth', timestamp: SECONDS - 2 }, { method: 'password', timestamp: SECONDS - 30 }, { method: 'totp', timestamp: SECONDS - 1 }, { method: 'token_refresh', timestamp: SECONDS - 1 }] }) })
  assert.equal((await f.api.exchangeSignIn(binding())).proof.authenticatedAt, NOW - 2000)
})

test('retained fields and configuration are validated before any POST', async t => {
  for (const [name, configure, request, migration = false] of [
    ['default disabled', { enabled: undefined }, binding()], ['wrong key', { publishableKey: 'sb_secret_private-never-allowed' }, binding()],
    ['short budget', { timeoutMs: 99 }, binding()], ['long budget', { timeoutMs: 10001 }, binding()], ['fraction budget', { timeoutMs: 100.1 }, binding()],
    ['invalid clock', { now: () => NaN }, binding()], ['throwing clock', { now: () => { throw Error('private-clock') } }, binding()],
    ['wrong code', {}, { ...binding(), authCode: 'code\r\nheader' }], ['noncanonical verifier', {}, { ...binding(), applicationVerifier: 'x'.repeat(43) }],
    ['challenge mismatch', {}, { ...binding(), applicationPkceChallenge: VERIFIER }], ['unpinned subject', {}, { ...binding(), reservedSubject: 'email@example.invalid' }],
    ['missing migration UUID', {}, binding(), true], ['invalid migration UUID', {}, { ...binding(), originalUserId: '' }, true],
    ['caller provider', {}, { ...binding(), provider: PROVIDER }], ['caller proof', {}, { ...binding(), verified: true }], ['caller owner', {}, { ...binding(), userId: USER }],
  ]) await t.test(name, async () => {
    let calls = 0
    const api = adapter({ ...options(async () => { calls++ }), ...configure })
    await assert.rejects(migration ? api.exchangeMigration(request) : api.exchangeSignIn(request), held('not_attempted')); assert.equal(calls, 0)
  })
  globalThis.window = {}
  try { await assert.rejects(adapter(options(async () => { throw Error('unexpected') })).exchangeSignIn(binding()), held('not_attempted')) }
  finally { delete globalThis.window }
})

test('token response fields are bounded and expiry must exactly match the verified JWT', async t => {
  const access = await jwt()
  for (const [name, fields, count] of [
    ['missing access', { access_token: undefined }, 1], ['missing refresh', { refresh_token: undefined }, 1], ['refresh control', { refresh_token: 'private\r\nrefresh' }, 1],
    ['wrong type', { token_type: 'MAC' }, 1], ['noninteger expires in', { expires_in: 1.5 }, 1], ['zero expires in', { expires_in: 0 }, 1],
    ['infinite expires in', { expires_in: Infinity }, 1], ['overlong lifetime', { expires_in: 86401 }, 1],
    ['unsafe expiry', { expires_at: Number.MAX_SAFE_INTEGER }, 1], ['past expiry', { expires_at: SECONDS }, 1],
    ['JWT expiry mismatch', { expires_at: SECONDS + 3599 }, 2], ['error with credentials', { error: 'private-provider-error' }, 1],
  ]) await t.test(name, async () => {
    const f = await fixture({ token: access, result: { ...tokenData(access), ...fields } })
    await assert.rejects(f.api.exchangeSignIn(binding()), held('uncertain')); assert.equal(f.calls.length, count)
  })
})

test('malformed HTTP responses on either step fail without redirect, fallback or retry', async t => {
  const changes = [
    ['redirect', r => ({ ...r, status: 302, headers: [['location', 'https://evil.invalid']] })], ['wrong URL', r => ({ ...r, url: `${r.url}&wrong=1` })],
    ['location on200', r => ({ ...r, headers: [...r.headers, ['location', USER_URL]] })], ['wrong media', r => ({ ...r, headers: [['content-type', 'text/html']] })],
    ['duplicate media', r => ({ ...r, headers: [...r.headers, ['Content-Type', 'application/json']] })], ['compressed', r => ({ ...r, headers: [...r.headers, ['content-encoding', 'gzip']] })],
    ['truncated', r => ({ ...r, headers: [...r.headers, ['content-length', String(r.body.byteLength + 1)]] })],
    ['ambiguous framing', r => ({ ...r, headers: [...r.headers, ['content-length', String(r.body.byteLength)], ['transfer-encoding', 'chunked']] })],
    ['oversized headers', r => ({ ...r, headers: [...r.headers, ['x-extra', 'x'.repeat(16384)]] })], ['invalid UTF8', r => ({ ...r, body: Buffer.from([255]) })],
    ['huge body', r => ({ ...r, body: Buffer.alloc(131073) })], ['nonbytes', r => ({ ...r, body: JSON.stringify(user()) })], ['empty', r => ({ ...r, body: Buffer.alloc(0) })],
  ]
  for (const endpoint of [TOKEN_URL, USER_URL]) for (const [name, change] of changes) await t.test(`${endpoint === TOKEN_URL ? 'token' : 'user'} ${name}`, async () => {
    const f = await fixture({ modify: (response, request) => request.url === endpoint ? change(response) : response })
    await assert.rejects(f.api.exchangeSignIn(binding()), held('uncertain')); assert.equal(f.calls.length, endpoint === TOKEN_URL ? 1 : 2)
  })
})

test('one total budget covers POST and GET; a late POST cannot start verification', async () => {
  const f = await fixture(); let firstSignal, calls = 0
  const api = adapter({ ...options(async request => {
    calls++; firstSignal ??= request.signal
    await delay(request.url === TOKEN_URL ? 300 : 900)
    return f.transport(request)
  }), timeoutMs: 600 })
  const started = performance.now()
  await assert.rejects(api.exchangeSignIn(binding()), held('uncertain'))
  // Separate 600ms budgets would take about 900ms (300ms POST + 600ms GET).
  assert.ok(performance.now() - started < 800, 'The GET must share the original deadline')
  assert.equal(calls, 2); assert.equal(firstSignal.aborted, true)
  let complete, lateCalls = 0
  const late = adapter({ ...options(() => { lateCalls++; return new Promise(resolve => { complete = () => resolve(response(TOKEN_URL, tokenData(f.token))) }) }), timeoutMs: 100 })
  await assert.rejects(late.exchangeSignIn(binding()), held('uncertain')); complete(); await delay(0); assert.equal(lateCalls, 1)
})

test('clock regression/expiry across exchange or verification cannot release provisional material', async () => {
  const f = await fixture()
  for (const finish of [NOW - 1, NOW + 3600000, NaN]) {
    let count = 0
    await assert.rejects(adapter({ ...options(f.transport), now: () => count++ ? finish : NOW }).exchangeSignIn(binding()), held('uncertain'))
  }
})

test('concurrent calls keep private token, identity and migration bindings separate; input/config changes cannot replace them', async () => {
  const first = await fixture(), secondToken = await jwt({ sub: OTHER_USER, session_id: OTHER_SESSION })
  const secondUser = { ...user(), id: OTHER_USER, identities: [{ ...identity(), user_id: OTHER_USER, identity_id: OTHER_IDENTITY, id: OTHER_SUBJECT }] }
  const second = await fixture({ token: secondToken, authoritative: secondUser })
  const config = options(first.transport), api = adapter(config), input = binding()
  const a = api.exchangeSignIn(input)
  input.reservedSubject = OTHER_SUBJECT; input.applicationVerifier = 'wrong'; config.publishableKey = 'wrong'; config.enabled = false
  const b = second.api.exchangeMigration({ ...binding(), originalUserId: OTHER_USER, reservedSubject: OTHER_SUBJECT })
  const [one, two] = await Promise.all([a, b])
  assert.equal(one.session.accessToken, first.token); assert.equal(one.identity.userId, USER)
  assert.equal(two.session.accessToken, secondToken); assert.equal(two.identity.userId, OTHER_USER)
})

test('native HTTP implementation sends only fixed requests, preserves TLS and ignores cookies', async () => {
  const token = await jwt()
  native.probe.calls.length = 0
  const scenarios = [
    { chunks: [Buffer.from(JSON.stringify(tokenData(token)))], rawHeaders: ['content-type', 'application/json', 'set-cookie', 'private=1'] },
    { chunks: [Buffer.from(JSON.stringify(user()))] },
  ]
  Object.defineProperty(native.probe, 'scenario', { configurable: true, get: () => scenarios.shift() ?? { error: true } })
  const result = await native.createSupabaseFinalExchange(options(undefined)).exchangeSignIn(binding())
  assert.equal(result.identity.subject, SUBJECT); assert.equal(native.probe.calls.length, 2)
  for (const call of native.probe.calls) {
    assert.equal(call.options.rejectUnauthorized, true); assert.equal(call.options.agent.options.rejectUnauthorized, true)
    assert.equal(call.options.agent.options.keepAlive, false); assert.equal(call.options.maxHeaderSize, 16384)
    assert.equal(call.options.headers.cookie, undefined); assert.equal(call.options.signal.aborted, true)
  }
  assert.equal(native.probe.calls[0].url, TOKEN_URL); assert.equal(native.probe.calls[0].options.headers.authorization, undefined)
  assert.equal(native.probe.calls[1].url, USER_URL); assert.equal(native.probe.calls[1].options.headers.authorization, `Bearer ${token}`)
  assert.equal(native.probe.calls[1].body, undefined)
  for (const scenario of [{ status: 302 }, { complete: false }, { aborted: true }, { chunks: [Buffer.alloc(131073)] }, { error: true }]) {
    native.probe.calls.length = 0
    Object.defineProperty(native.probe, 'scenario', { configurable: true, get: () => scenario })
    await assert.rejects(native.createSupabaseFinalExchange(options(undefined)).exchangeSignIn(binding()), e => e.outcome === 'uncertain' && !e.cause)
    assert.equal(native.probe.calls.length, 1)
  }
})
