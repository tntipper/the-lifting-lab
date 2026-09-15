import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import { STAGING_SHOP_ID as SHOP, STAGING_ISSUER as ISSUER, STAGING_SUPABASE_ISSUER as SUPABASE } from '../lib/identity/customer-connection.ts'
import { syntheticBrokerStore } from './fixtures/customer-broker-store.mjs'

const bundled = await build({ entryPoints: ['lib/identity/customer-subject-broker.ts'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createCustomerSubjectBroker, SUBJECT_BROKER_CLIENT_ID: CLIENT, SUBJECT_BROKER_CALLBACK: CALLBACK, SUBJECT_BROKER_SCOPE: SCOPE } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)

const NOW = Date.parse('2026-09-15T23:00:00Z'), USER = 'd94849fa-eeba-456a-8051-9f578a835497', SESSION = '20967116-9900-4560-bdc8-29c4c372a8d7'
const OTHER_USER = '9bc324d8-690a-4933-8b9a-f993cc7963d9', OTHER_SESSION = 'cde3e272-68f2-4cdb-9dba-83ea6f47ae57'
const SECRET = 'synthetic broker secret: plus+ percent% unicode-é only'
const opaque = () => randomBytes(32).toString('base64url'), s256 = v => createHash('sha256').update(v).digest('base64url'), hash = v => createHash('sha256').update(v).digest('hex')
const formEscape = value => new URLSearchParams({ x: value }).toString().slice(2)
const basic = (id = CLIENT, secret = SECRET) => 'Basic ' + Buffer.from(`${formEscape(id)}:${formEscape(secret)}`).toString('base64')
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const noPrivate = value => assert.doesNotMatch(JSON.stringify(value), /gid:\/\/shopify|private-|refresh_token|id_token|email_verified|@|synthetic broker secret/)
function fixture(options = {}) {
  let now = NOW
  const b = { transactionId: randomUUID(), cookieSecret: opaque() }, verifier = opaque(), appChallenge = s256(opaque()), innerChallenge = s256(opaque())
  const query = new URLSearchParams({ response_type: 'code', client_id: CLIENT, redirect_uri: CALLBACK, scope: SCOPE, state: randomUUID(), code_challenge: s256(verifier), code_challenge_method: 'S256' }).toString()
  let browser = b, registration = { ...b, authorizationQuery: query, applicationPkceChallenge: appChallenge, mode: options.mode ?? 'migration', target: options.mode === 'sign_in' ? null : { userId: USER, sessionId: SESSION } }
  let proof = { userId: USER, sessionId: SESSION, issuer: SUPABASE, audience: 'authenticated', anonymous: false, authenticatedAt: NOW - 30000, checkedAt: NOW, expiresAt: NOW + 3600000 }
  let shopify = { transactionId: b.transactionId, receiptId: randomUUID(), shopId: SHOP, issuer: ISSUER, subject: 'gid://shopify/Customer/123', innerPkceChallenge: innerChallenge, verifiedAt: NOW, expiresAt: NOW + 3600000 }
  const repository = options.repository ?? syntheticBrokerStore(() => now), calls = []
  const ports = { repository, now: () => now,
    currentBrowser: async () => { calls.push('browser'); return browser }, serverRegistration: async () => { calls.push('registration'); return registration },
    currentSession: async () => { calls.push('session'); return proof }, verifiedShopifySubject: async () => { calls.push('shopifyProof'); return shopify } }
  const api = createCustomerSubjectBroker({ ports, clientSecret: SECRET, syntheticExecution: true, ...options })
  return { api, ports, repository, calls, browser: b, query, verifier,
    getRegistration: () => registration, setRegistration: v => { registration = v }, setBrowser: v => { browser = v },
    getProof: () => proof, setProof: v => { proof = v }, getShopify: () => shopify, setShopify: v => { shopify = v },
    advance: ms => { now += ms }, now: () => now,
    tokenRequest: code => ({ method: 'POST', headers: [['content-type', 'application/x-www-form-urlencoded'], ['authorization', basic()]],
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier }).toString() }),
  }
}
async function admitted(f) { assert.equal((await f.api.register()).status, 'registered'); assert.equal((await f.api.admit(f.query)).status, 'admitted') }
async function ready(f) {
  await admitted(f)
  const r = await f.api.ready(); assert.equal(r.status, 'authorization_ready'); noPrivate(r)
  const u = new URL(r.redirectUrl); assert.equal(u.origin + u.pathname, CALLBACK); assert.equal(u.searchParams.get('state'), new URLSearchParams(f.query).get('state'))
  assert.deepEqual([...u.searchParams.keys()], ['code', 'state']); return u.searchParams.get('code')
}
async function issued(f) { const code = await ready(f), result = await f.api.token(f.tokenRequest(code)); assert.equal(result.status, 200); noPrivate(result); return result.body.access_token }
const userinfo = (api, bearer) => api.userinfo({ method: 'GET', headers: [['authorization', `Bearer ${bearer}`]] })

test('default/live/browser execution is disabled before any trusted port or repository access', async () => {
  for (const options of [{ syntheticExecution: undefined }, { syntheticExecution: false }, { liveEnabled: true }, { clientSecret: undefined }, { clientSecret: 'short' }, { clientSecret: SECRET + '\n' }]) {
    const f = fixture(options)
    assert.equal((await f.api.register()).status, 'disabled'); assert.equal((await f.api.ready()).status, 'disabled')
    assert.equal((await f.api.token(f.tokenRequest(opaque()))).status, 503); assert.equal((await userinfo(f.api, opaque())).status, 503)
    assert.equal((await f.api.cancel()).status, 'disabled'); assert.deepEqual(f.calls, []); assert.equal(f.repository.records.size, 0)
  }
  const f = fixture(); globalThis.window = {}
  try { assert.equal((await f.api.register()).status, 'disabled') } finally { delete globalThis.window }
})
test('migration follows acknowledged one-use transitions and releases only an opaque broker subject', async () => {
  const f = fixture(), bearer = await issued(f), row = f.repository.records.get(f.browser.transactionId)
  assert.equal(row.status, 'token_issued'); assert.equal(row.migrationProof.userId, USER); assert.equal(row.migrationProof.sessionId, SESSION)
  assert.equal(row.hardDeadline, NOW + 5000); assert.equal(row.bearerExpiresAt, NOW + 60000)
  assert.equal(row.codeHash.length, 64); assert.equal(row.bearerHash, hash(bearer)); assert.equal('code' in row, false); assert.equal('bearer' in row, false)
  const result = await userinfo(f.api, bearer)
  assert.equal(row.status, 'consumed'); assert.equal(result.status, 200); assert.deepEqual(Object.keys(result.body), ['sub'])
  assert.match(result.body.sub, /^tllb_[A-Za-z0-9_-]{43}$/); noPrivate(result)
  assert.equal(result.headers['cache-control'], 'no-store'); assert.equal(result.headers.pragma, 'no-cache')
  assert.equal((await userinfo(f.api, bearer)).status, 401)
  const reservation = [...f.repository.subjects.values()][0]
  assert.equal(reservation.targetUserId, USER); assert.equal(reservation.boundUserId, null)
})
test('new sign-in reserves a stable provisional subject without creating or requiring an existing UUID session', async () => {
  const f = fixture({ mode: 'sign_in' }); f.setProof(null)
  const first = await userinfo(f.api, await issued(f)), reservation = [...f.repository.subjects.values()][0]
  assert.equal(reservation.provisional, true); assert.equal(reservation.boundUserId, null); assert.equal(reservation.targetUserId, null)
  assert.equal(f.repository.records.get(f.browser.transactionId).migrationProof, null); assert.equal(f.calls.includes('session'), false)
  const repeated = fixture({ mode: 'sign_in', repository: f.repository }); repeated.setProof(null)
  const second = await userinfo(repeated.api, await issued(repeated)); assert.equal(second.body.sub, first.body.sub)
})
test('pending migration reservations cannot silently attach the same provider subject to another UUID', async () => {
  const f = fixture(); await issued(f)
  const other = fixture({ repository: f.repository })
  other.setProof({ ...other.getProof(), userId: OTHER_USER }); other.setRegistration({ ...other.getRegistration(), target: { userId: OTHER_USER, sessionId: SESSION } })
  await admitted(other); assert.equal((await other.api.ready()).status, 'held')
  assert.equal([...f.repository.subjects.values()][0].targetUserId, USER)
})
test('an unresolved provisional sign-in is not sufficient authority for a legacy account merge', async () => {
  const f = fixture({ mode: 'sign_in' }); await issued(f)
  const migration = fixture({ repository: f.repository }); await admitted(migration)
  assert.equal((await migration.api.ready()).status, 'held')
  assert.equal([...f.repository.subjects.values()][0].boundUserId, null)
})
test('browser query alone cannot register a flow or choose mode/target', async () => {
  const f = fixture(); f.setRegistration(null)
  assert.equal((await f.api.register()).status, 'held'); assert.equal((await f.api.admit(f.query)).status, 'held')
  assert.equal((await f.api.ready()).status, 'held'); assert.equal(f.repository.records.size, 0)
  const valid = fixture(); await admitted(valid)
  assert.equal((await valid.api.admit(valid.query + '&mode=sign_in&user_id=' + OTHER_USER)).status, 'held')
  assert.equal(valid.repository.records.get(valid.browser.transactionId).target.userId, USER)
})
test('server registration and admission bind exact browser secret, transaction and outer state', async () => {
  for (const change of ['cookie', 'transaction', 'state', 'challenge']) {
    const f = fixture(); assert.equal((await f.api.register()).status, 'registered')
    let q = f.query
    if (change === 'cookie') f.setBrowser({ ...f.browser, cookieSecret: opaque() })
    if (change === 'transaction') f.setBrowser({ ...f.browser, transactionId: randomUUID() })
    if (change === 'state' || change === 'challenge') { const p = new URLSearchParams(q); p.set(change === 'state' ? 'state' : 'code_challenge', change === 'state' ? randomUUID() : s256(opaque())); q = p.toString() }
    assert.equal((await f.api.admit(q)).status, 'held'); assert.equal(f.repository.records.get(f.browser.transactionId).status, 'registered')
  }
})
test('migration registration requires exact recent original UUID/session proof', async () => {
  for (const change of [{ userId: OTHER_USER }, { sessionId: OTHER_SESSION }, { anonymous: true }, { issuer: ISSUER },
    { authenticatedAt: NOW - 300000 }, { checkedAt: NOW - 5000 }, { expiresAt: NOW }, { authenticatedAt: NOW + 1 }]) {
    const f = fixture(); f.setProof({ ...f.getProof(), ...change })
    assert.equal((await f.api.register()).status, 'held'); assert.equal(f.repository.records.size, 0)
  }
})
test('exact callback/client, response type, scope, state and independent S256 are required', async () => {
  for (const [key, value] of [['redirect_uri', 'https://wrong.invalid/callback'], ['client_id', 'shopify-client-id'], ['response_type', 'token'],
    ['scope', 'subject email'], ['state', 'caller-state'], ['code_challenge_method', 'plain'], ['code_challenge', 'weak']]) {
    const f = fixture(), q = new URLSearchParams(f.query); q.set(key, value); f.setRegistration({ ...f.getRegistration(), authorizationQuery: q.toString() })
    assert.equal((await f.api.register()).status, 'held'); assert.equal(f.repository.records.size, 0)
  }
  const same = fixture(); same.setRegistration({ ...same.getRegistration(), applicationPkceChallenge: s256(same.verifier) })
  assert.equal((await same.api.register()).status, 'held')
})
test('duplicates and malformed encodings fail; unknown OAuth fields are ignored without becoming authority', async () => {
  for (const suffix of ['&state=duplicate', '&client_id=' + CLIENT, '&ignored=%ZZ', '&x=a b']) {
    const f = fixture(); f.setRegistration({ ...f.getRegistration(), authorizationQuery: f.query + suffix })
    assert.equal((await f.api.register()).status, 'held')
  }
  const f = fixture(); f.setRegistration({ ...f.getRegistration(), authorizationQuery: f.query + '&caller_verified=true&mode=sign_in&email=private-contact' })
  assert.equal((await f.api.register()).status, 'registered'); assert.equal((await f.api.admit(f.query)).status, 'admitted')
  assert.equal(f.repository.records.get(f.browser.transactionId).mode, 'migration')
  assert.doesNotMatch(JSON.stringify(f.repository.records.get(f.browser.transactionId)), /caller_verified|private-contact/)
})
test('unknown fields from trusted proof ports are projected away before private persistence', async () => {
  const f = fixture()
  f.setShopify({ ...f.getShopify(), accessToken: 'private-provider-token', email: 'private-contact' })
  f.setProof({ ...f.getProof(), token: 'private-session-token' })
  f.setRegistration({ ...f.getRegistration(), target: { userId: USER, sessionId: SESSION, password: 'private-password' } })
  await ready(f); assert.doesNotMatch(JSON.stringify(f.repository.records.get(f.browser.transactionId)), /private-/)
})
for (const label of ['wrong transaction', 'wrong issuer', 'wrong shop', 'missing receipt', 'stale proof', 'expired proof', 'inner PKCE reuse', 'wrong current session', 'browser replacement']) {
  test(`readiness holds ${label} after claim without releasing a code`, async () => {
    const f = fixture(); await admitted(f)
    if (label === 'wrong transaction') f.setShopify({ ...f.getShopify(), transactionId: randomUUID() })
    if (label === 'wrong issuer') f.setShopify({ ...f.getShopify(), issuer: 'https://wrong.invalid' })
    if (label === 'wrong shop') f.setShopify({ ...f.getShopify(), shopId: '999' })
    if (label === 'missing receipt') f.setShopify({ ...f.getShopify(), receiptId: null })
    if (label === 'stale proof') f.setShopify({ ...f.getShopify(), verifiedAt: NOW - 5000 })
    if (label === 'expired proof') f.setShopify({ ...f.getShopify(), expiresAt: NOW })
    if (label === 'inner PKCE reuse') f.setShopify({ ...f.getShopify(), innerPkceChallenge: s256(f.verifier) })
    if (label === 'wrong current session') f.setProof({ ...f.getProof(), sessionId: OTHER_SESSION })
    if (label === 'browser replacement') f.ports.verifiedShopifySubject = async () => { f.setBrowser({ ...f.browser, cookieSecret: opaque() }); return f.getShopify() }
    const result = await f.api.ready(); assert.equal(result.status, 'held'); noPrivate(result)
    assert.equal(f.repository.records.get(f.browser.transactionId).status, 'held'); assert.equal(f.repository.codes.size, 0)
  })
}
test('readiness deadline is never extended by fresh token issue, token TTL or delayed commit', async () => {
  const f = fixture(); f.setProof({ ...f.getProof(), checkedAt: NOW - 4900 })
  const code = await ready(f); assert.equal(f.repository.records.get(f.browser.transactionId).hardDeadline, NOW + 100)
  f.advance(100); assert.equal((await f.api.token(f.tokenRequest(code))).status, 400)
  const second = fixture(), bearer = await issued(second); second.advance(5000)
  assert.equal((await userinfo(second.api, bearer)).status, 401)
  const third = fixture(); await admitted(third)
  const finish = third.repository.finishReadiness
  third.repository.finishReadiness = async i => { const r = await finish(i); third.advance(5000); return r }
  assert.equal((await third.api.ready()).status, 'held'); assert.equal(third.repository.records.get(third.browser.transactionId).status, 'held')
})
test('Basic form encoding supports Go OAuth client secrets; body credentials and duplicate auth are rejected', async () => {
  const f = fixture(), code = await ready(f), request = f.tokenRequest(code)
  const duplicate = { ...request, headers: [...request.headers, ['Authorization', basic()]] }
  assert.equal((await f.api.token(duplicate)).status, 400)
  assert.equal((await f.api.token({ ...request, body: request.body + '&client_secret=private-body-secret' })).status, 400)
  assert.equal((await f.api.token({ ...request, headers: request.headers.filter(([key]) => key !== 'authorization'), body: request.body + '&client_id=' + CLIENT + '&client_secret=private-body-secret' })).status, 401)
  assert.equal(f.repository.records.get(f.browser.transactionId).status, 'ready')
  assert.equal((await f.api.token(request)).status, 200)
})
for (const label of ['missing Basic', 'wrong secret', 'wrong client', 'invalid base64', 'malformed form secret', 'header injection']) {
  test(`Confidential authentication rejects ${label} before a code can be consumed`, async () => {
    const f = fixture(), code = await ready(f), r = f.tokenRequest(code)
    const authorization = label === 'missing Basic' ? '' : label === 'wrong secret' ? basic(CLIENT, 'wrong') : label === 'wrong client' ? basic('other')
      : label === 'invalid base64' ? 'Basic !!!' : label === 'malformed form secret' ? 'Basic ' + Buffer.from(CLIENT + ':%ZZ').toString('base64') : basic() + '\r\nx-private: yes'
    r.headers[1][1] = authorization
    const result = await f.api.token(r); assert.notEqual(result.status, 200); noPrivate(result)
    assert.equal(f.repository.records.get(f.browser.transactionId).status, 'ready')
  })
}
test('token grant rejects redirect/PKCE tampering and refresh without substituting or retrying', async () => {
  const f = fixture(), code = await ready(f)
  for (const [key, value] of [['redirect_uri', 'https://wrong.invalid/capture'], ['code_verifier', opaque()], ['grant_type', 'refresh_token'], ['code', opaque()]]) {
    const r = f.tokenRequest(code), body = new URLSearchParams(r.body); body.set(key, value); r.body = body.toString()
    assert.notEqual((await f.api.token(r)).status, 200)
  }
  assert.equal(f.repository.records.get(f.browser.transactionId).status, 'ready')
  assert.equal((await f.api.token(f.tokenRequest(code))).status, 200)
})
test('machine request method/representation/size boundaries cannot consume a valid code', async () => {
  const f = fixture(), code = await ready(f), request = f.tokenRequest(code)
  for (const altered of [{ ...request, method: 'GET' }, { ...request, headers: [['content-type', 'application/json'], ['authorization', basic()]] },
    { ...request, body: request.body + '&code=' + code }, { ...request, body: request.body + '&unused=' + 'x'.repeat(4096) },
    { ...request, headers: [...request.headers, ['x-extra', 'x'.repeat(8192)]] }]) assert.equal((await f.api.token(altered)).status, 400)
  assert.equal(f.repository.records.get(f.browser.transactionId).status, 'ready')
})
test('userinfo rejects body-token substitutes, wrong methods and duplicate bearer headers', async () => {
  const f = fixture(), bearer = await issued(f)
  for (const request of [{ method: 'POST', headers: [['authorization', `Bearer ${bearer}`]] }, { method: 'GET', headers: [] },
    { method: 'GET', headers: [['authorization', `Bearer ${bearer}`], ['Authorization', `Bearer ${bearer}`]] }]) {
    assert.equal((await f.api.userinfo(request)).status, 401)
  }
  assert.equal((await userinfo(f.api, bearer)).status, 200)
})
test('a replayed authorization code never creates another bearer and invalidates an outstanding one', async () => {
  const f = fixture(), code = await ready(f), first = await f.api.token(f.tokenRequest(code))
  assert.equal(first.status, 200); assert.equal((await f.api.token(f.tokenRequest(code))).status, 400)
  assert.equal(f.repository.bearers.size, 1); assert.equal((await userinfo(f.api, first.body.access_token)).status, 401)
})
test('two instances cannot claim readiness or consume the same bearer twice', async () => {
  const f = fixture(); await admitted(f)
  const other = createCustomerSubjectBroker({ ports: f.ports, clientSecret: SECRET, syntheticExecution: true })
  const results = await Promise.all([f.api.ready(), other.ready()])
  assert.equal(results.filter(r => r.status === 'authorization_ready').length, 1)
  const code = new URL(results.find(r => r.redirectUrl).redirectUrl).searchParams.get('code'), token = await f.api.token(f.tokenRequest(code))
  const profiles = await Promise.all([userinfo(f.api, token.body.access_token), userinfo(other, token.body.access_token)])
  assert.equal(profiles.filter(r => r.status === 200).length, 1)
})
test('cancellation and owner logout generation fence prepared codes and issued bearers', async () => {
  for (const phase of ['admitted', 'code', 'bearer']) {
    const f = fixture(); let credential
    if (phase === 'admitted') await admitted(f)
    if (phase === 'code') credential = await ready(f)
    if (phase === 'bearer') credential = await issued(f)
    assert.equal((await f.api.cancel()).status, 'cancelled')
    const result = phase === 'admitted' ? await f.api.ready() : phase === 'code' ? await f.api.token(f.tokenRequest(credential)) : await userinfo(f.api, credential)
    assert.notEqual(result.status, 'authorization_ready'); assert.notEqual(result.status, 200)
  }
  const f = fixture(), bearer = await issued(f); f.repository.cancelOwner(USER)
  assert.equal((await userinfo(f.api, bearer)).status, 401)
})
test('cancellation during a paused readiness claim cannot be overwritten by its late completion', async () => {
  const f = fixture(); await admitted(f); const entered = deferred(), resume = deferred()
  f.ports.verifiedShopifySubject = async () => { entered.resolve(); await resume.promise; return f.getShopify() }
  const pending = f.api.ready(); await entered.promise; assert.equal((await f.api.cancel()).status, 'cancelled'); resume.resolve()
  assert.equal((await pending).status, 'held'); assert.equal(f.repository.records.get(f.browser.transactionId).status, 'cancelled')
})
for (const method of ['register', 'admit', 'claimReadiness', 'finishReadiness', 'redeemCode', 'consumeUserinfo']) {
  test(`lost ${method} acknowledgement cannot release a credential/subject or restore the operation`, async () => {
    const f = fixture(); let code, bearer
    if (['admit', 'claimReadiness', 'finishReadiness'].includes(method)) assert.equal((await f.api.register()).status, 'registered')
    if (['claimReadiness', 'finishReadiness'].includes(method)) assert.equal((await f.api.admit(f.query)).status, 'admitted')
    if (method === 'redeemCode') code = await ready(f)
    if (method === 'consumeUserinfo') bearer = await issued(f)
    const original = f.repository[method]; let calls = 0
    f.repository[method] = async i => { calls++; await original(i); throw Error('private-database-response including provider-token') }
    const result = method === 'register' ? await f.api.register() : method === 'admit' ? await f.api.admit(f.query)
      : ['claimReadiness', 'finishReadiness'].includes(method) ? await f.api.ready() : method === 'redeemCode' ? await f.api.token(f.tokenRequest(code)) : await userinfo(f.api, bearer)
    assert.notEqual(result.status, 200); assert.notEqual(result.status, 'authorization_ready'); noPrivate(result); assert.equal(calls, 1)
    assert.equal(f.repository.records.get(f.browser.transactionId).status, 'held')
  })
}
test('hold tombstone prevents a delayed previously-unknown register commit from opening a flow', async () => {
  const f = fixture(), original = f.repository.register; let delayed
  f.repository.register = async i => { delayed = i; throw Error('private-lost-request') }
  assert.equal((await f.api.register()).status, 'held'); assert.equal(f.repository.records.size, 0)
  assert.equal(await original(delayed), false); assert.equal(f.repository.records.size, 0)
  assert.equal(await original({ ...delayed, operationId: randomUUID() }), false)
})
for (const method of ['admit', 'claimReadiness', 'redeemCode', 'consumeUserinfo']) {
  test(`uncertain ${method} before its operationId is recorded quarantines same-flow retries`, async () => {
    const f = fixture(); let credential
    if (method === 'admit') assert.equal((await f.api.register()).status, 'registered')
    if (method === 'claimReadiness') await admitted(f)
    if (method === 'redeemCode') credential = await ready(f)
    if (method === 'consumeUserinfo') credential = await issued(f)
    const original = f.repository[method]
    f.repository[method] = async () => { throw Error('private-unknown-request-outcome') }
    const call = () => method === 'admit' ? f.api.admit(f.query) : method === 'claimReadiness' ? f.api.ready()
      : method === 'redeemCode' ? f.api.token(f.tokenRequest(credential)) : userinfo(f.api, credential)
    assert.notEqual((await call()).status, 200)
    assert.equal(f.repository.records.get(f.browser.transactionId).status, 'held')
    f.repository[method] = original
    const retry = await call()
    assert.notEqual(retry.status, 200); assert.notEqual(retry.status, 'authorization_ready'); assert.notEqual(retry.status, 'admitted')
  })
}
test('unrelated operation holds cannot invalidate another record using only its locator', async () => {
  const f = fixture(), code = await ready(f), r = f.repository.records.get(f.browser.transactionId)
  await f.repository.holdOperation({ operationId: randomUUID(), configHash: r.configHash, locator: { kind: 'code', hash: hash(code) } })
  assert.equal(r.status, 'ready'); assert.equal((await f.api.token(f.tokenRequest(code))).status, 200)
})
test('quarantine requires exact admission/client bindings and cannot assume a changed generation', async () => {
  const f = fixture(); const code = await ready(f), r = f.repository.records.get(f.browser.transactionId)
  for (const locator of [
    { kind: 'transaction', id: r.id, browserHash: hash('wrong'), outerHash: r.outerHash },
    { kind: 'transaction', id: r.id, browserHash: r.browserHash, outerHash: r.outerHash, generation: '999', fence: r.fence },
    { kind: 'transaction', id: r.id, browserHash: r.browserHash, outerHash: r.outerHash, generation: r.generation, fence: 'unknown' },
    { kind: 'code', hash: hash(code), clientId: CLIENT, redirectUri: CALLBACK, challenge: s256('wrong') },
  ]) await f.repository.holdOperation({ operationId: randomUUID(), configHash: r.configHash, locator })
  assert.equal(r.status, 'ready'); assert.equal((await f.api.token(f.tokenRequest(code))).status, 200)
})
test('no response precedes acknowledged token/userinfo commits; spent bearer cannot be used after browser handoff', async () => {
  const f = fixture(), code = await ready(f), entered = deferred(), resume = deferred(), original = f.repository.redeemCode
  f.repository.redeemCode = async i => { const result = await original(i); entered.resolve(); await resume.promise; return result }
  let delivered = false; const pending = f.api.token(f.tokenRequest(code)).then(r => { delivered = true; return r })
  await entered.promise; assert.equal(delivered, false); assert.equal(f.repository.records.get(f.browser.transactionId).status, 'token_issued')
  resume.resolve(); const result = await pending
  const enteredInfo = deferred(), resumeInfo = deferred(), consume = f.repository.consumeUserinfo
  f.repository.consumeUserinfo = async i => { const result = await consume(i); enteredInfo.resolve(); await resumeInfo.promise; return result }
  delivered = false; const info = userinfo(f.api, result.body.access_token).then(r => { delivered = true; return r })
  await enteredInfo.promise; assert.equal(delivered, false); assert.equal(f.repository.records.get(f.browser.transactionId).status, 'consumed')
  resumeInfo.resolve(); assert.equal((await info).status, 200)
  assert.equal((await userinfo(f.api, result.body.access_token)).status, 401)
})
test('malformed trusted repository output cannot project a provider subject or token-shaped error', async () => {
  const f = fixture(), bearer = await issued(f), original = f.repository.consumeUserinfo
  f.repository.consumeUserinfo = async i => ({ ...await original(i), sub: 'gid://shopify/Customer/123', id_token: 'private-token' })
  const result = await userinfo(f.api, bearer); assert.equal(result.status, 503); noPrivate(result)
})
test('failed quarantine persistence cannot restore a claimed transaction or expose private errors', async () => {
  const f = fixture(); await admitted(f); let proofCalls = 0, holdCalls = 0
  f.ports.verifiedShopifySubject = async () => { proofCalls++; throw Error('private-provider-token-response') }
  f.repository.holdOperation = async () => { holdCalls++; throw Error('private-database-response') }
  const result = await f.api.ready(); assert.equal(result.status, 'held'); noPrivate(result)
  assert.equal(f.repository.records.get(f.browser.transactionId).status, 'verifying')
  assert.equal((await f.api.ready()).status, 'held'); assert.equal(proofCalls, 1); assert.equal(holdCalls, 1)
})
