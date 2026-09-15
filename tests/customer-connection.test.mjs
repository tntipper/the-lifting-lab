import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { SignJWT, generateKeyPair, exportJWK } from 'jose'
import { syntheticConnectionStore } from './fixtures/customer-connection-store.mjs'
import { createCustomerConnectionFoundation, connectionConfigHash, STAGING_SHOP_ID, STAGING_ISSUER, STAGING_DISCOVERY, STAGING_SUPABASE_ISSUER, CUSTOMER_SCOPES } from '../lib/identity/customer-connection.ts'

const compiled = await build({ entryPoints: ['lib/identity/customer-id-token.ts'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createLocalCustomerIdVerifier } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const NOW = Date.parse('2026-09-15T17:30:00Z')
const USER = '00000000-0000-4000-8000-000000000001', SESSION = '00000000-0000-4000-8000-000000000002'
const USER_B = '00000000-0000-4000-8000-000000000003', SESSION_B = '00000000-0000-4000-8000-000000000004'
const key = await generateKeyPair('RS256', { extractable: true }), otherKey = await generateKeyPair('RS256')
const publicJwk = { ...await exportJWK(key.publicKey), kid: 'synthetic-rsa', use: 'sig', alg: 'RS256' }
function config() {
  const c = { shopId: STAGING_SHOP_ID, issuer: STAGING_ISSUER, discoveryUrl: STAGING_DISCOVERY,
    authorizationEndpoint: `${STAGING_ISSUER}/oauth/authorize`, tokenEndpoint: `${STAGING_ISSUER}/oauth/token`,
    jwksUri: `${STAGING_ISSUER}/.well-known/jwks.json`, logoutEndpoint: `${STAGING_ISSUER}/logout`, clientId: 'synthetic-confidential-client',
    callbackUrl: 'https://synthetic-staging.vercel.app/auth/shopify/callback', supabaseIssuer: STAGING_SUPABASE_ISSUER }
  return { ...c, verification: { evidenceId: 'synthetic-operator-review', configHash: connectionConfigHash(c), verifiedAt: NOW - 1000, expiresAt: NOW + 3600_000 } }
}
async function jwt(overrides = {}, privateKey = key.privateKey, header = {}) {
  return new SignJWT({ iss: STAGING_ISSUER, sub: 'gid://shopify/Customer/123', aud: config().clientId, iat: NOW / 1000, exp: NOW / 1000 + 3600, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'synthetic-rsa', ...header }).sign(privateKey)
}
function fixture(options = {}) {
  let now = NOW, proof = { userId: USER, sessionId: SESSION, issuer: STAGING_SUPABASE_ISSUER, audience: 'authenticated', authenticatedAt: NOW, expiresAt: NOW + 3600_000, checkedAt: NOW, anonymous: false }
  const repository = options.repository ?? syntheticConnectionStore(), calls = [], c = options.config ?? config()
  const verifier = createLocalCustomerIdVerifier({ sourceUrl: c.jwksUri, verifiedAt: NOW - 1000, expiresAt: NOW + 3600_000, jwks: { keys: [publicJwk] } })
  const ports = { repository, now: () => now, currentSession: async () => proof ? { ...proof, checkedAt: now } : null,
    verifyIdToken: verifier,
    exchangeCode: async input => {
      calls.push(['exchange', input]); const a = [...repository.attempts.values()].find(a => a.verifier === input.verifier)
      return { accessToken: 'private-access-token', refreshToken: 'private-refresh-token', idToken: await jwt({ nonce: a.nonce }), tokenType: 'Bearer', expiresIn: 3600, scope: CUSTOMER_SCOPES.join(' ') }
    },
    refreshToken: async input => { calls.push(['refresh', input]); return { accessToken: 'private-access-rotated', refreshToken: 'private-refresh-rotated', tokenType: 'Bearer', expiresIn: 3600, scope: CUSTOMER_SCOPES.join(' ') } },
  }
  const api = createCustomerConnectionFoundation({ config: c, ports, syntheticExecution: true, ...options })
  return { api, ports, repository, calls, config: c, setProof: p => { proof = p }, proof: () => ({ ...proof }), advance: ms => { now += ms }, now: () => now }
}
function callback(start, code = 'synthetic-code') { const u = new URL(start.authorizationUrl); return `${u.searchParams.get('redirect_uri')}?state=${u.searchParams.get('state')}&code=${code}` }
async function connect(f) { const start = await f.api.start(); assert.equal(start.status, 'authorization_ready'); const connected = await f.api.complete(callback(start)); assert.equal(connected.status, 'connected'); return connected.connectionId }
function noSecrets(result) { assert.doesNotMatch(JSON.stringify(result), /private-access|private-refresh|idToken|accessToken|refreshToken|code_verifier|synthetic-rsa|eyJ/); assert.equal(result.liveEnabled, false) }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

test('no live/default execution; configuration is required and activation is not a flag', async () => {
  for (const options of [{ syntheticExecution: false }, { liveEnabled: true }, { syntheticExecution: undefined }]) {
    const f = fixture(options); assert.equal((await f.api.start()).status, 'disabled'); assert.equal((await f.api.logout()).status, 'disabled'); assert.equal(f.calls.length, 0)
  }
  const f = fixture({ config: { ...config(), verification: null } }); assert.equal((await f.api.start()).code, 'VERIFIED_CONFIGURATION_REQUIRED')
})
for (const [field, value] of [['shopId', '999'], ['issuer', 'https://attacker.invalid'], ['discoveryUrl', 'https://127.0.0.1/.well-known/openid-configuration'], ['tokenEndpoint', 'https://attacker.invalid/token'], ['jwksUri', 'https://attacker.invalid/keys'], ['callbackUrl', 'https://attacker.invalid/auth/shopify/callback'], ['callbackUrl', 'https://synthetic-staging.vercel.app/auth/shopify/callback?next=bad'], ['supabaseIssuer', 'https://production.supabase.co/auth/v1']]) {
  test(`configuration fails closed for ${field}: ${value}`, async () => {
    const c = { ...config(), [field]: value }; c.verification.configHash = connectionConfigHash(c)
    const f = fixture({ config: c }); assert.equal((await f.api.start()).status, 'held'); assert.equal(f.repository.attempts.size, 0)
  })
}
test('configuration mutation cannot alter a prepared foundation and expired/mismatched approvals hold', async () => {
  const f = fixture(); f.config.tokenEndpoint = 'https://attacker.invalid'; assert.equal((await f.api.start()).status, 'authorization_ready')
  for (const verification of [{ ...config().verification, expiresAt: NOW }, { ...config().verification, configHash: 'wrong' }]) assert.equal((await fixture({ config: { ...config(), verification } }).api.start()).status, 'held')
})
for (const change of [{ authenticatedAt: NOW - 300_001 }, { authenticatedAt: NOW + 1 }, { anonymous: true }, { audience: 'service_role' }, { issuer: 'forged' }, { userId: 'email@example.invalid' }, { sessionId: '' }, { expiresAt: NOW }]) {
  test(`recent authenticated session required: ${JSON.stringify(change)}`, async () => { const f = fixture(); f.setProof({ ...f.proof(), ...change }); assert.equal((await f.api.start()).code, 'RECENT_SESSION_PROOF_REQUIRED'); assert.equal(f.calls.length, 0) })
}
test('state and nonce are independent random values; PKCE S256 matches private verifier', async () => {
  const f = fixture(), start = await f.api.start(), u = new URL(start.authorizationUrl), a = [...f.repository.attempts.values()][0]
  assert.match(u.searchParams.get('state'), /^[\w-]{43}$/); assert.notEqual(u.searchParams.get('state'), a.nonce)
  assert.equal(a.stateHash, createHash('sha256').update(u.searchParams.get('state')).digest('hex'))
  assert.equal(u.searchParams.get('code_challenge'), createHash('sha256').update(a.verifier).digest('base64url'))
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256'); assert.equal(start.authorizationUrl.includes(a.verifier), false)
  noSecrets(start); assert.equal((await f.api.start()).status, 'held')
})
test('both proofs bind stable subject and unchanged UUID; no secret reaches returned DTO', async () => {
  const f = fixture(), id = await connect(f), c = f.repository.connections.get(id)
  assert.deepEqual(c.binding, { userId: USER, shopId: STAGING_SHOP_ID, issuer: STAGING_ISSUER, subject: 'gid://shopify/Customer/123' })
  assert.equal('email' in c.binding, false); assert.equal(c.tokens.idToken.split('.').length, 3)
  noSecrets(await f.api.refresh(id)); noSecrets(await f.api.logout())
})
test('wrong session/account, callback target and duplicated state never exchange', async () => {
  const f = fixture(), start = await f.api.start()
  for (const bad of [callback(start).replace('synthetic-staging', 'different-staging'), callback(start) + '&state=duplicate', callback(start) + '#fragment']) assert.equal((await f.api.complete(bad)).status, 'held')
  const original = f.proof(); f.setProof({ ...original, sessionId: SESSION_B }); assert.equal((await f.api.complete(callback(start))).status, 'held')
  f.setProof({ ...original, userId: USER_B }); assert.equal((await f.api.complete(callback(start))).status, 'held')
  assert.equal(f.calls.length, 0); f.setProof(original); assert.equal((await f.api.complete(callback(start))).status, 'connected')
})
test('two concurrent callbacks and restart share one committed exchanging marker', async () => {
  const f = fixture(), start = await f.api.start(), pause = deferred(), original = f.ports.exchangeCode
  f.ports.exchangeCode = async input => { await pause.promise; return original(input) }
  const a = f.api.complete(callback(start)); await new Promise(r => setImmediate(r))
  const restart = createCustomerConnectionFoundation({ config: config(), ports: f.ports, syntheticExecution: true })
  assert.equal((await restart.complete(callback(start))).status, 'held'); pause.resolve(); assert.equal((await a).status, 'connected')
  assert.equal((await f.api.complete(callback(start))).status, 'held'); assert.equal(f.calls.length, 1)
})
test('expired or cancelled state cannot connect; cancellation consumes it', async () => {
  const f = fixture(), start = await f.api.start(), cancelled = callback(start).replace('code=synthetic-code', 'error=access_denied&error_description=private-access-token')
  assert.equal((await f.api.complete(cancelled)).status, 'held'); assert.equal((await f.api.complete(callback(start))).status, 'held'); assert.equal(f.calls.length, 0)
  const g = fixture(), begun = await g.api.start(); g.advance(300_001); assert.equal((await g.api.complete(callback(begun))).status, 'held')
})
for (const change of [{ refreshToken: '' }, { accessToken: '' }, { idToken: undefined }, { expiresIn: 0 }, { expiresIn: NaN }, { expiresIn: '3600' }, { tokenType: 'Basic' }, { scope: 'openid email customer-account-api:full customer-account-mcp-api:full' }]) {
  test(`malformed or over-scoped token exchange is held: ${JSON.stringify(change)}`, async () => {
    const f = fixture(), start = await f.api.start(), original = f.ports.exchangeCode
    f.ports.exchangeCode = async input => ({ ...await original(input), ...change })
    const result = await f.api.complete(callback(start)); assert.equal(result.status, 'held'); noSecrets(result); assert.equal(f.repository.connections.size, 0)
  })
}
test('ID or access expiry during validation cannot commit a connection', async () => {
  for (const which of ['id', 'access']) {
    const f = fixture(), start = await f.api.start(), originalExchange = f.ports.exchangeCode, originalVerify = f.ports.verifyIdToken
    f.ports.exchangeCode = async input => { const r = await originalExchange(input), a = [...f.repository.attempts.values()].find(a => a.verifier === input.verifier); return { ...r, expiresIn: which === 'access' ? 1 : 3600, idToken: await jwt({ nonce: a.nonce, exp: NOW / 1000 + (which === 'id' ? 1 : 3600) }) } }
    f.ports.verifyIdToken = async (...args) => { const result = await originalVerify(...args); f.advance(2000); return result }
    assert.equal((await f.api.complete(callback(start))).status, 'held'); assert.equal(f.repository.connections.size, 0)
  }
})
test('proof revoked or changed during exchange prevents binding', async () => {
  const f = fixture(), start = await f.api.start(), original = f.ports.exchangeCode
  f.ports.exchangeCode = async input => { const result = await original(input); f.setProof(null); return result }
  assert.equal((await f.api.complete(callback(start))).status, 'held'); assert.equal(f.repository.connections.size, 0)
})
test('same email cannot attach another user; same user cannot silently switch subject', async () => {
  const f = fixture(); await connect(f)
  const old = f.ports.exchangeCode
  f.ports.exchangeCode = async input => { const response = await old(input), a = [...f.repository.attempts.values()].find(a => a.verifier === input.verifier); return { ...response, idToken: await jwt({ nonce: a.nonce, email: 'same@example.invalid', email_verified: true }) } }
  f.setProof({ ...f.proof(), userId: USER_B, sessionId: SESSION_B }); const a = await f.api.start(); assert.equal((await f.api.complete(callback(a))).status, 'held')
  f.setProof({ ...f.proof(), userId: USER, sessionId: SESSION }); await f.api.logout()
  const original = f.ports.exchangeCode; f.ports.exchangeCode = async input => { const r = await original(input), a = [...f.repository.attempts.values()].find(a => a.verifier === input.verifier); return { ...r, idToken: await jwt({ nonce: a.nonce, sub: 'new-subject', email: 'same@example.invalid' }) } }
  const b = await f.api.start(); assert.equal((await f.api.complete(callback(b))).status, 'held'); assert.equal(f.repository.connections.size, 1)
})
test('repeat exact subject with changed email retains connection and grants no extra identity', async () => {
  const f = fixture(), id = await connect(f); await f.api.logout()
  const original = f.ports.exchangeCode; f.ports.exchangeCode = async input => { const r = await original(input), a = [...f.repository.attempts.values()].find(a => a.verifier === input.verifier); return { ...r, idToken: await jwt({ nonce: a.nonce, email: 'changed@example.invalid' }) } }
  assert.equal(await connect(f), id); assert.equal(f.repository.connections.size, 1)
})
for (const phase of ['exchange', 'binding-commit']) test(`lost ${phase} result never retries the code or leaks errors`, async () => {
  const f = fixture(), start = await f.api.start()
  if (phase === 'exchange') f.ports.exchangeCode = async () => { f.calls.push(['exchange']); throw new Error('private-refresh-token') }
  else { const original = f.repository.finishAttempt; f.repository.finishAttempt = async (...args) => { await original(...args); throw new Error('private-refresh-token') } }
  const result = await f.api.complete(callback(start)); assert.equal(result.status, 'held'); noSecrets(result)
  assert.equal((await f.api.complete(callback(start))).status, 'held'); assert.equal(f.calls.length, 1)
  assert.ok([...f.repository.connections.values()].every(c => c.status === 'held'))
})
test('refresh is serialized across instances; rotated tokens replace atomically', async () => {
  const f = fixture(), id = await connect(f), pause = deferred(), original = f.ports.refreshToken
  f.ports.refreshToken = async input => { await pause.promise; return original(input) }
  const a = f.api.refresh(id); await new Promise(r => setImmediate(r))
  const other = createCustomerConnectionFoundation({ config: config(), ports: f.ports, syntheticExecution: true })
  assert.equal((await other.refresh(id)).status, 'held'); pause.resolve(); assert.equal((await a).status, 'refreshed')
  assert.equal(f.calls.filter(c => c[0] === 'refresh').length, 1); assert.equal(f.repository.connections.get(id).tokens.refreshToken, 'private-refresh-rotated')
})
for (const phase of ['network', 'commit', 'crash-expired-lease']) test(`refresh ${phase} uncertainty holds rather than blindly retrying`, async () => {
  const f = fixture(), id = await connect(f)
  if (phase === 'network') f.ports.refreshToken = async () => { throw Error('private-access-token') }
  if (phase === 'commit') { const original = f.repository.finishRefresh; f.repository.finishRefresh = async (...args) => { await original(...args); throw Error('private-access-token') } }
  if (phase === 'crash-expired-lease') { await f.repository.claimRefresh(id, f.proof(), connectionConfigHash(config()), f.now(), 60_000); f.advance(60_001) }
  const result = await f.api.refresh(id); assert.equal(result.status, 'held'); noSecrets(result)
  const count = f.calls.length; assert.equal((await f.api.refresh(id)).status, 'held'); assert.equal(f.calls.length, count)
  assert.equal(f.repository.connections.get(id).status, 'held')
})
test('logout fences an in-flight refresh and cannot claim completed Shopify logout', async () => {
  const f = fixture(), id = await connect(f), pause = deferred(), original = f.ports.refreshToken
  f.ports.refreshToken = async input => { await pause.promise; return original(input) }
  const pending = f.api.refresh(id); await new Promise(r => setImmediate(r))
  const result = await f.api.logout(); assert.equal(result.status, 'logged_out'); assert.equal(result.upstreamLogout, 'pending'); noSecrets(result)
  pause.resolve(); assert.equal((await pending).status, 'held'); assert.equal(f.repository.connections.get(id).status, 'logged_out')
  assert.equal((await f.api.refresh(id)).status, 'held')
  assert.equal((await f.api.logout()).status, 'logged_out'); assert.equal(f.repository.connections.get(id).tokens, undefined)
})
test('logout cancels in-flight and pending connect attempts; expired config still allows local revocation', async () => {
  const f = fixture(), start = await f.api.start(), pause = deferred(), original = f.ports.exchangeCode
  f.ports.exchangeCode = async input => { await pause.promise; return original(input) }
  const pending = f.api.complete(callback(start)); await new Promise(r => setImmediate(r)); await f.api.logout(); pause.resolve()
  assert.equal((await pending).status, 'held'); assert.equal(f.repository.connections.size, 0)
  const g = fixture(), id = await connect(g); g.advance(3600_001); g.setProof({ ...g.proof(), authenticatedAt: g.now(), expiresAt: g.now() + 3600_000 })
  assert.equal((await g.api.logout()).status, 'logged_out'); assert.equal(g.repository.connections.get(id).status, 'logged_out')
})
test('cross-account refresh and logout do not change another connection', async () => {
  const f = fixture(), id = await connect(f); f.setProof({ ...f.proof(), userId: USER_B, sessionId: SESSION_B })
  assert.equal((await f.api.refresh(id)).status, 'held'); assert.equal((await f.api.logout()).upstreamLogout, 'not_required'); assert.equal(f.repository.connections.get(id).status, 'active')
})
test('refresh cannot change customer identity through a replacement ID token', async () => {
  const f = fixture(), id = await connect(f), original = f.ports.refreshToken
  f.ports.refreshToken = async input => ({ ...await original(input), idToken: await jwt({ sub: 'another-subject' }) })
  assert.equal((await f.api.refresh(id)).status, 'held'); assert.equal(f.repository.connections.get(id).status, 'held')
})
test('refreshed ID nonce may be absent or original, but never changed; original survives rotation', async () => {
  for (const form of ['absent', 'original', 'changed']) {
    const f = fixture(), id = await connect(f), original = f.ports.refreshToken
    const nonce = f.repository.connections.get(id).tokens.originalNonce
    f.ports.refreshToken = async input => ({ ...await original(input), idToken: await jwt(form === 'absent' ? {} : { nonce: form === 'original' ? nonce : 'wrong-nonce' }) })
    assert.equal((await f.api.refresh(id)).status, form === 'changed' ? 'held' : 'refreshed')
    if (form !== 'changed') assert.equal(f.repository.connections.get(id).tokens.originalNonce, nonce)
  }
})
test('refreshed ID expiry during validation cannot commit a token replacement', async () => {
  const f = fixture(), id = await connect(f), original = f.ports.refreshToken, verify = f.ports.verifyIdToken
  f.ports.refreshToken = async input => ({ ...await original(input), idToken: await jwt({ exp: NOW / 1000 + 1 }) })
  f.ports.verifyIdToken = async (...args) => { const result = await verify(...args); f.advance(2000); return result }
  assert.equal((await f.api.refresh(id)).status, 'held'); assert.equal(f.repository.connections.get(id).status, 'held')
})
test('local JWT verifier checks real signature, exact issuer/audience/nonce/time, and never reads email as identity', async () => {
  const verify = fixture().ports.verifyIdToken, expected = { issuer: STAGING_ISSUER, audience: config().clientId, jwksUri: config().jwksUri, nonce: 'test-nonce', now: NOW }
  assert.equal((await verify(await jwt({ nonce: 'test-nonce', email_verified: false }), expected)).subject, 'gid://shopify/Customer/123')
  for (const overrides of [{ iss: 'https://wrong.invalid' }, { aud: 'wrong-client' }, { aud: [config().clientId, 'extra'] }, { nonce: 'wrong' }, { nonce: undefined }, { iat: NOW / 1000 + 1 }, { exp: NOW / 1000 }, { sub: '' }]) assert.equal(await verify(await jwt({ nonce: 'test-nonce', ...overrides }), expected), null)
  assert.equal(await verify(await jwt({ nonce: 'test-nonce' }, otherKey.privateKey), expected), null)
  assert.equal(await verify(await jwt({ nonce: 'test-nonce' }, key.privateKey, { kid: 'unknown' }), expected), null)
  assert.equal(await verify(await jwt({ nonce: 'test-nonce' }, key.privateKey, { jku: 'https://attacker.invalid' }), expected), null)
  assert.equal(await verify('not-a-jwt', expected), null)
})
test('unknown, stale, wrong-source, private or duplicate JWK snapshots fail closed without fetch', async () => {
  const expected = { issuer: STAGING_ISSUER, audience: config().clientId, jwksUri: config().jwksUri, nonce: null, now: NOW }, token = await jwt()
  for (const changes of [{ sourceUrl: 'https://attacker.invalid' }, { expiresAt: NOW }, { verifiedAt: NOW + 1 }, { jwks: { keys: [] } }, { jwks: { keys: [{ ...publicJwk, d: 'private-key' }] } }, { jwks: { keys: [publicJwk, publicJwk] } }]) {
    const verify = createLocalCustomerIdVerifier({ sourceUrl: config().jwksUri, verifiedAt: NOW - 1000, expiresAt: NOW + 3600_000, jwks: { keys: [publicJwk] }, ...changes })
    assert.equal(await verify(token, expected), null)
  }
})
