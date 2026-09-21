import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'

const bundle = await build({ entryPoints: ['lib/identity/customer-http.ts'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createShopifyCustomerTokenAdapter: tokenAdapter, createShopifyCustomerJwksLoader: keyLoader, CustomerHttpHeld } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const nativeBundle = await build({ stdin: { contents: "export * from './lib/identity/customer-http.ts'; export { probe } from './tests/fixtures/customer-https-probe.mjs'", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent', plugins: [{ name: 'offline-native-https', setup(build) {
    build.onResolve({ filter: /^node:https$/ }, () => ({ path: resolve('tests/fixtures/customer-https-probe.mjs') }))
  } }] })
const native = await import(`data:text/javascript;base64,${Buffer.from(nativeBundle.outputFiles[0].text).toString('base64')}`)
const ISSUER = 'https://shopify.com/authentication/107532616020', TOKEN = `${ISSUER}/oauth/token`, JWKS = `${ISSUER}/.well-known/jwks.json`
const CLIENT = '63f474eda69ec32778ce2a99e8c1114f', CALLBACK = 'https://synthetic-staging.vercel.app/auth/shopify/callback'
const SCOPE = 'openid email customer-account-api:full', NOW = Date.parse('2026-09-15T21:00:00Z'), SECRET = 'synthetic:secret+%/only'
const exchange = { endpoint: TOKEN, clientId: CLIENT, code: 'synthetic-code', verifier: 'x'.repeat(43), redirectUri: CALLBACK }
const refresh = { endpoint: TOKEN, clientId: CLIENT, refreshToken: 'synthetic-old-refresh' }
const response = (data, headers = [], url = TOKEN) => ({ url, status: 200, headers: [['content-type', 'application/json; charset=utf-8'], ...headers], body: Buffer.from(JSON.stringify(data)) })
const tokens = () => ({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', id_token: 'synthetic-id-token', token_type: 'Bearer', expires_in: 3600, scope: SCOPE })
const options = transport => ({ enabled: true, clientSecret: SECRET, callbackUrl: CALLBACK, authorizationScope: SCOPE, transport })
const held = e => { assert.ok(e instanceof CustomerHttpHeld); assert.doesNotMatch(JSON.stringify(e) + e.message + e.stack, /synthetic-access|synthetic-refresh|synthetic:secret|private-error-body/); return true }
const keyA = await generateKeyPair('RS256', { extractable: true }), keyB = await generateKeyPair('RS256', { extractable: true })
const pubA = { ...await exportJWK(keyA.publicKey), kid: 'A', use: 'sig', alg: 'RS256' }, pubB = { ...await exportJWK(keyB.publicKey), kid: 'B', use: 'sig', alg: 'RS256' }
const jwksResponse = (keys = [pubA], headers = []) => response({ keys }, headers, JWKS)
const expected = (now = NOW) => ({ issuer: ISSUER, audience: CLIENT, jwksUri: JWKS, nonce: 'synthetic-nonce', now })
async function jwt(kid = 'A', key = keyA.privateKey, changes = {}, header = {}) {
  return new SignJWT({ iss: ISSUER, aud: CLIENT, sub: 'synthetic-customer', iat: NOW / 1000, exp: NOW / 1000 + 3600, nonce: 'synthetic-nonce', ...changes })
    .setProtectedHeader({ alg: 'RS256', kid, ...header }).sign(key)
}
function clockedLoader(transport, changes = {}) {
  let now = NOW
  return { loader: keyLoader({ enabled: true, transport, now: () => now, ...changes }), advance: ms => { now += ms }, now: () => now }
}

test('factories are disabled by default and never call even an injected transport', async () => {
  let calls = 0; const transport = async () => { calls++; throw Error('unexpected') }
  await assert.rejects(tokenAdapter({ ...options(transport), enabled: undefined }).exchangeCode(exchange), held)
  assert.deepEqual(await keyLoader({ transport }).refreshPublicKeys(), { status: 'held' })
  assert.equal(await keyLoader({ transport }).verifyIdToken(await jwt(), expected()), null)
  assert.equal(calls, 0)
})
test('public keys and token exchange identify the application without impersonating a browser', async () => {
  const requests = []
  const transport = async input => {
    requests.push(input)
    return input.url === JWKS ? jwksResponse() : response(tokens())
  }
  assert.equal((await clockedLoader(transport).loader.refreshPublicKeys()).status, 'ready')
  await tokenAdapter(options(transport)).exchangeCode(exchange)
  assert.deepEqual(requests.map(r => r.headers['user-agent']), [
    'TheLiftingLab-Staging/1.0 (customer account integration)',
    'TheLiftingLab-Staging/1.0 (customer account integration)',
  ])
})
test('mixed public key families retain only approved RSA keys and still verify RS256 signatures', async () => {
  const other = { kty: 'OKP', crv: 'Ed25519', x: 'public-unselected-key', kid: 'other', use: 'sig', alg: 'ED25519' }
  const loader = clockedLoader(async () => response({ keys: [other, pubA], vendor_metadata: 'ignored' }, [], JWKS)).loader
  assert.deepEqual(await loader.refreshPublicKeys(), { status: 'ready', expiresAt: NOW + 300_000, keyCount: 1 })
  assert.equal((await loader.verifyIdToken(await jwt(), expected())).subject, 'synthetic-customer')
  assert.equal(await loader.verifyIdToken(await jwt('other'), expected()), null)
  for (const rejected of [{ ...other, d: 'private-material' }, { ...other, kid: 'A' }]) {
    assert.deepEqual(await clockedLoader(async () => jwksResponse([rejected, pubA])).loader.refreshPublicKeys(), { status: 'held' })
  }
})
test('Confidential exchange pins endpoint/client/callback and uses form-encoded Basic credentials only in header', async () => {
  let request
  const adapter = tokenAdapter(options(async input => { request = input; return response(tokens()) }))
  const result = await adapter.exchangeCode(exchange)
  assert.equal(request.url, TOKEN); assert.equal(request.method, 'POST'); assert.equal(request.maxBytes, 131072)
  assert.equal(request.headers['accept-encoding'], 'identity'); assert.equal(request.headers['cache-control'], 'no-store')
  const basic = Buffer.from(request.headers.authorization.slice(6), 'base64').toString()
  assert.equal(basic, `${CLIENT}:synthetic%3Asecret%2B%25%2Fonly`)
  assert.equal(new URLSearchParams(request.body).get('code_verifier'), exchange.verifier)
  assert.equal(new URLSearchParams(request.body).get('redirect_uri'), CALLBACK)
  assert.equal(new URLSearchParams(request.body).has('client_secret'), false)
  assert.deepEqual(result.scopeProvenance, { source: 'token_response', requestedScope: SCOPE, grantType: 'authorization_code' })
  assert.equal(JSON.stringify(adapter), '{}'); assert.doesNotMatch(JSON.stringify(result), /synthetic:secret|Basic|authorizationUrl/)
})
test('customer admission callback uses the same confidential Basic exchange without exposing its secret', async () => {
  const callback='https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app/auth/customer/shopify/callback'
  let request
  const adapter=tokenAdapter({...options(async input=>{request=input;return response(tokens())}),callbackUrl:callback})
  await adapter.exchangeCode({...exchange,redirectUri:callback})
  assert.equal(new URLSearchParams(request.body).get('redirect_uri'),callback)
  assert.equal(new URLSearchParams(request.body).has('client_secret'),false)
  assert.equal(Buffer.from(request.headers.authorization.slice(6),'base64').toString(),`${CLIENT}:synthetic%3Asecret%2B%25%2Fonly`)
})
for (const change of [{ endpoint: 'https://127.0.0.1/token' }, { endpoint: TOKEN + '?next=https://wrong.invalid' }, { clientId: 'wrong' }, { redirectUri: CALLBACK + '?next=wrong' }, { verifier: 'short' }, { code: '' }]) {
  test(`invalid exchange input cannot send credentials: ${Object.keys(change)[0]}`, async () => {
    let calls = 0; const adapter = tokenAdapter(options(async () => { calls++; return response(tokens()) }))
    await assert.rejects(adapter.exchangeCode({ ...exchange, ...change }), e => held(e) && e.outcome === 'not_attempted'); assert.equal(calls, 0)
  })
}
for (const change of [{ clientSecret: undefined }, { clientSecret: 'bad\nsecret' }, { callbackUrl: 'https://attacker.invalid/auth/shopify/callback' }, { authorizationScope: 'openid' }, { timeoutMs: 0 }, { timeoutMs: 10001 }]) {
  test(`invalid trusted configuration is held before HTTP: ${Object.keys(change)[0]}`, async () => {
    let calls = 0; const adapter = tokenAdapter({ ...options(async () => { calls++; return response(tokens()) }), ...change })
    await assert.rejects(adapter.exchangeCode(exchange), held); assert.equal(calls, 0)
  })
}
test('RFC6749 omitted scope uses exact request provenance for exchange and refresh; request mutation cannot widen it', async () => {
  const inputs = [], config = options(async input => { inputs.push(input); const r = tokens(); delete r.scope; if (inputs.length > 1) delete r.id_token; return response(r) })
  const adapter = tokenAdapter(config); config.authorizationScope = 'admin'
  for (const [result, grantType] of [[await adapter.exchangeCode(exchange), 'authorization_code'], [await adapter.refreshToken(refresh), 'refresh_token']]) {
    assert.equal(result.scope, SCOPE); assert.deepEqual(result.scopeProvenance, { source: 'unchanged_request', requestedScope: SCOPE, grantType })
  }
  const body = new URLSearchParams(inputs[1].body)
  assert.equal(body.get('scope'), SCOPE); assert.equal(body.get('refresh_token'), refresh.refreshToken); assert.equal(body.get('grant_type'), 'refresh_token')
})
test('explicit scope order and token-type case normalize without inventing omitted token type', async () => {
  const adapter = tokenAdapter(options(async () => response({ ...tokens(), scope: 'email customer-account-api:full openid', token_type: 'bearer' })))
  assert.equal((await adapter.exchangeCode(exchange)).tokenType, 'Bearer')
  assert.equal((await adapter.exchangeCode(exchange)).scopeProvenance.source, 'token_response')
})
test('successful refresh may retain only its exact claimed token when replacement is omitted', async () => {
  const r = tokens(); delete r.refresh_token; delete r.id_token
  const adapter = tokenAdapter(options(async () => response(r))), result = await adapter.refreshToken(refresh)
  assert.equal(result.refreshToken, refresh.refreshToken)
  assert.deepEqual(result.refreshTokenProvenance, { source: 'retained_original', grantType: 'refresh_token', previousTokenHash: createHash('sha256').update(refresh.refreshToken).digest('hex') })
  for (const value of ['', null]) await assert.rejects(tokenAdapter(options(async () => response({ ...r, refresh_token: value }))).refreshToken(refresh), held)
  await assert.rejects(tokenAdapter(options(async () => ({ ...response(r), status: 500 }))).refreshToken(refresh), held)
})
for (const change of [{ access_token: '' }, { refresh_token: undefined }, { id_token: undefined }, { token_type: undefined }, { token_type: 'MAC' }, { expires_in: '3600' }, { expires_in: 0 }, { expires_in: 86401 }, { scope: '' }, { scope: null }, { scope: 'openid email' }, { scope: SCOPE + ' customer-account-mcp-api:full' }, { error: 'private-error-body' }]) {
  test(`invalid token response holds without retry: ${JSON.stringify(change)}`, async () => {
    let calls = 0; const adapter = tokenAdapter(options(async () => { calls++; return response({ ...tokens(), ...change }) }))
    await assert.rejects(adapter.exchangeCode(exchange), e => held(e) && e.outcome === 'uncertain'); assert.equal(calls, 1)
  })
}
test('unrecognized OAuth response parameters are ignored and never projected into domain/vault data', async () => {
  const adapter = tokenAdapter(options(async () => response({ ...tokens(), vendor_extension: { internal: 'private-extension-value' }, provider_metadata: 'private-extension-value' })))
  const r = await adapter.exchangeCode(exchange)
  assert.equal(r.tokenType, 'Bearer'); assert.equal('vendor_extension' in r, false)
  assert.doesNotMatch(JSON.stringify(r), /private-extension-value|provider_metadata/)
})
for (const kind of ['redirect', 'wrong-response-url', 'http-error', 'oversized', 'truncated', 'invalid-utf8', 'partial-json', 'array', 'content-type', 'duplicate-header', 'compressed']) {
  test(`HTTP ${kind} is rejected and never retried`, async () => {
    const r = response(tokens())
    if (kind === 'redirect') { r.status = 302; r.headers.push(['location', 'https://attacker.invalid']) }
    if (kind === 'wrong-response-url') r.url = 'https://attacker.invalid'
    if (kind === 'http-error') { r.status = 400; r.body = Buffer.from('private-error-body') }
    if (kind === 'oversized') r.body = new Uint8Array(131073)
    if (kind === 'truncated') r.headers.push(['content-length', String(r.body.length + 1)])
    if (kind === 'invalid-utf8') r.body = new Uint8Array([0xff])
    if (kind === 'partial-json') r.body = Buffer.from('{"access_token":')
    if (kind === 'array') r.body = Buffer.from('[]')
    if (kind === 'content-type') r.headers = [['content-type', 'text/html']]
    if (kind === 'duplicate-header') r.headers.push(['Content-Type', 'application/json'])
    if (kind === 'compressed') r.headers.push(['content-encoding', 'gzip'])
    let calls = 0; await assert.rejects(tokenAdapter(options(async () => { calls++; return r })).exchangeCode(exchange), held); assert.equal(calls, 1)
  })
}
test('timeout bounds a stuck injected transport, aborts and never retries; provider exceptions are redacted', async () => {
  let request, calls = 0
  await assert.rejects(tokenAdapter({ ...options(async input => { calls++; request = input; return new Promise(() => {}) }), timeoutMs: 50 }).exchangeCode(exchange), held)
  assert.equal(calls, 1); assert.equal(request.signal.aborted, true)
  await assert.rejects(tokenAdapter(options(async () => { throw Error('private-error-body synthetic:secret') })).refreshToken(refresh), held)
})
test('actual Node request path uses private TLS-verifying agent and no configurable redirect/proxy options', async () => {
  native.probe.calls.length = 0; native.probe.scenario = { chunks: [Buffer.from(JSON.stringify(tokens()))] }
  const result = await native.createShopifyCustomerTokenAdapter(options(undefined)).exchangeCode(exchange)
  assert.equal(result.tokenType, 'Bearer'); assert.equal(native.probe.calls.length, 1)
  const call = native.probe.calls[0]
  assert.equal(call.url, TOKEN); assert.equal(call.options.rejectUnauthorized, true)
  assert.equal(call.options.agent.options.rejectUnauthorized, true); assert.equal(call.options.agent.options.keepAlive, false)
  assert.equal(call.options.maxHeaderSize, 16384); assert.equal(call.options.checkServerIdentity, undefined)
  assert.equal(call.options.ca, undefined); assert.equal(call.options.proxy, undefined)
})
for (const [name, scenario] of [
  ['redirect', { status: 302 }], ['compressed', { headers: { 'content-encoding': 'gzip' } }],
  ['oversized chunks', { chunks: [Buffer.alloc(70000), Buffer.alloc(70000)] }],
  ['incomplete stream', { complete: false, chunks: [Buffer.from('{}')] }], ['aborted stream', { aborted: true }],
  ['TLS/socket error', { error: true }], ['body timeout', { stall: true }],
]) test(`native ${name} destroys/aborts and holds without another request`, async () => {
  native.probe.calls.length = 0; native.probe.scenario = scenario
  await assert.rejects(native.createShopifyCustomerTokenAdapter({ ...options(undefined), timeoutMs: 50 }).exchangeCode(exchange), e => {
    assert.equal(e.code, 'CUSTOMER_HTTP_HELD'); assert.doesNotMatch(e.message, /private-error-body/); return true
  })
  assert.equal(native.probe.calls.length, 1); assert.equal(native.probe.calls[0].options.signal.aborted, true)
})
test('public JWKS request has no credentials; matching token validates with real signature and cached keys', async () => {
  const calls = [], f = clockedLoader(async input => { calls.push(input); return jwksResponse() }), token = await jwt()
  assert.equal((await f.loader.verifyIdToken(token, expected())).subject, 'synthetic-customer')
  assert.equal((await f.loader.verifyIdToken(token, expected())).subject, 'synthetic-customer'); assert.equal(calls.length, 1)
  assert.equal(calls[0].url, JWKS); assert.equal(calls[0].method, 'GET'); assert.equal(calls[0].body, null)
  assert.equal(calls[0].headers.authorization, undefined); assert.equal(calls[0].headers.cookie, undefined)
  assert.equal(calls[0].headers['cache-control'], 'no-cache')
  assert.deepEqual(await f.loader.refreshPublicKeys(), { status: 'ready', expiresAt: NOW + 300000, keyCount: 1 })
})
test('registered JWK Set media type is accepted only by the public key endpoint', async () => {
  const r = jwksResponse(); r.headers = [['content-type', 'application/jwk-set+json']]
  assert.equal((await clockedLoader(async () => r).loader.refreshPublicKeys()).status, 'ready')
  await assert.rejects(tokenAdapter(options(async () => ({ ...response(tokens()), headers: r.headers }))).exchangeCode(exchange), held)
})
test('concurrent verification coalesces public reads; invalid signatures do not cause refresh storms', async () => {
  let calls = 0; const f = clockedLoader(async () => { calls++; return jwksResponse() }), token = await jwt()
  assert.ok((await Promise.all([f.loader.verifyIdToken(token, expected()), f.loader.verifyIdToken(token, expected())])).every(Boolean)); assert.equal(calls, 1)
  assert.equal(await f.loader.verifyIdToken(await jwt('A', keyB.privateKey), expected()), null); assert.equal(calls, 1)
})
test('unknown key refresh uses pinned URL, replaces keys and holds within cooldown', async () => {
  let calls = 0; const f = clockedLoader(async () => { calls++; return jwksResponse(calls === 1 ? [pubA] : [pubB]) })
  assert.ok(await f.loader.verifyIdToken(await jwt(), expected()))
  assert.equal(await f.loader.verifyIdToken(await jwt('B', keyB.privateKey), expected()), null); assert.equal(calls, 1)
  f.advance(30001)
  assert.ok(await f.loader.verifyIdToken(await jwt('B', keyB.privateKey), expected(f.now()))); assert.equal(calls, 2)
  assert.equal(await f.loader.verifyIdToken(await jwt(), expected(f.now())), null); assert.equal(calls, 2)
})
test('freshness honours max-age, Age and Date; expired keys are not used on failed refresh', async () => {
  let calls = 0; const f = clockedLoader(async () => { calls++; if (calls > 1) throw Error('failure'); return jwksResponse([pubA], [['cache-control', 'max-age=60'], ['age', '10'], ['date', new Date(NOW - 15000).toUTCString()]]) })
  assert.deepEqual(await f.loader.refreshPublicKeys(), { status: 'ready', expiresAt: NOW + 45000, keyCount: 1 })
  f.advance(45000); assert.equal(await f.loader.verifyIdToken(await jwt(), expected(f.now())), null)
  assert.equal(await f.loader.verifyIdToken(await jwt(), expected(f.now())), null); assert.equal(calls, 2)
})
for (const policy of ['no-store', 'no-cache', 'max-age=0']) test(`${policy} allows a fresh verification but never reuses keys`, async () => {
  let calls = 0; const f = clockedLoader(async () => { calls++; return jwksResponse([pubA], [['cache-control', policy]]) }), token = await jwt()
  assert.ok(await f.loader.verifyIdToken(token, expected())); assert.ok(await f.loader.verifyIdToken(token, expected())); assert.equal(calls, 2)
})
for (const change of [{ keys: [] }, { keys: [pubA, pubA] }, { keys: [{ ...pubA, d: 'private' }] }, { keys: [{ ...pubA, alg: 'HS256' }] }, { keys: [{ ...pubA, n: 'AAAA' }] }, { keys: [{ ...pubA, e: 'Ag' }] }, { keys: [{ ...pubA, key_ops: ['sign'] }] }]) {
  test(`invalid public key set is never ready: ${Object.keys(change.keys[0] ?? {}).join(',')}`, async () => {
    const f = clockedLoader(async () => response(change, [], JWKS)); assert.deepEqual(await f.loader.refreshPublicKeys(), { status: 'held' })
  })
}
test('stale/ambiguous freshness and unexpected key URLs fail closed without token-directed fetches', async () => {
  for (const headers of [[['cache-control', 'max-age=10'], ['age', '11']], [['cache-control', 'max-age=1,max-age=20']], [['age', '-1']], [['date', 'not-a-date']]]) {
    const f = clockedLoader(async () => jwksResponse([pubA], headers)); assert.equal((await f.loader.refreshPublicKeys()).status, 'held')
  }
  let calls = 0; const f = clockedLoader(async () => { calls++; return jwksResponse() })
  for (const header of [{ jku: 'https://attacker.invalid' }, { x5u: 'https://attacker.invalid' }, { jwk: pubA }, { x5c: ['certificate'] }]) assert.equal(await f.loader.verifyIdToken(await jwt('A', keyA.privateKey, {}, header), expected()), null)
  assert.equal(await f.loader.verifyIdToken(await jwt(), { ...expected(), audience: 'wrong' }), null)
  assert.equal(calls, 0)
})
