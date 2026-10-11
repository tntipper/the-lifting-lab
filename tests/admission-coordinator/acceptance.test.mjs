// Actual 008 PostgreSQL repository + actual admission/session adapters, with
// signed synthetic provider HTTP only. Uses the approved, marked local fixture.
import test, { before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { build } from 'esbuild'
import { SignJWT, jwtVerify } from 'jose'
import { admin, assertFixture, localPool, closeClients } from '../provisional-admission-repository/local-pg.mjs'
import { createAesGcmEnvelopeVault } from '../../lib/identity/customer-token-vault.ts'

const bundle = await build({ entryPoints: ['lib/identity/customer-admission-coordinator.ts'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createCustomerAdmissionCoordinator: coordinator } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const ORIGIN = 'https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app', ISSUER = 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1'
const KEY = 'sb_publishable_synthetic00000000000', SIGNING = new TextEncoder().encode('synthetic-coordinator-signing-key-not-a-provider-secret')
const USER = 'eeeeeeee-dddd-4ccc-8bbb-aaaaaaaaaaaa', SESSION = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const opaque = () => randomBytes(32).toString('base64url'), hash = text => createHash('sha256').update(text).digest('hex')
const response = (url, data, status = 200) => ({ url, status, headers: [['content-type', 'application/json']], body: Buffer.from(JSON.stringify(data)) })
const rows = () => JSON.parse(admin("SELECT coalesce(json_agg(r),'[]') FROM tll_provisional_private.intents r"))
const operations = () => JSON.parse(admin("SELECT coalesce(json_agg(r),'[]') FROM tll_provisional_private.operations r"))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
function broker() {
  const query = new URLSearchParams({ response_type: 'code', client_id: 'tll-staging-subject-broker-v1', redirect_uri: ISSUER + '/callback',
    scope: 'subject', state: randomUUID(), code_challenge_method: 'S256', code_challenge: opaque() }).toString()
  return `${ORIGIN}/auth/customer/authorize?${query}`
}
async function jwt(changes = {}, key = SIGNING) {
  const seconds = Math.floor(Date.now() / 1000)
  return new SignJWT({ iss: ISSUER, sub: USER, session_id: SESSION, aud: 'authenticated', role: 'authenticated', is_anonymous: false,
    iat: seconds - 1, exp: seconds + 3600, amr: [{ method: 'password', timestamp: seconds - 1 }], ...changes })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key)
}
let vault, verified = false
before(() => { assertFixture(); verified = true; assert.equal(admin('SELECT enabled FROM tll_provisional_private.control'), 'f') })
beforeEach(() => {
  vault?.destroy(); vault = createAesGcmEnvelopeVault({ activeKeyId: 'synthetic-coordinator', keys: new Map([['synthetic-coordinator', randomBytes(32)]]) })
  admin('TRUNCATE tll_provisional_private.intents,tll_provisional_private.operations,tll_provisional_private.daily_quota; UPDATE tll_provisional_private.control SET enabled=true')
})
after(async () => {
  if (!verified) return
  admin('UPDATE tll_provisional_private.control SET enabled=false; TRUNCATE tll_provisional_private.intents,tll_provisional_private.operations,tll_provisional_private.daily_quota')
  vault?.destroy(); await closeClients(); assert.equal(admin('SELECT enabled FROM tll_provisional_private.control'), 'f')
})
async function fixture(changes = {}) {
  const originalToken = changes.token ?? await jwt(), state = { token: originalToken, validSession: true, reads: 0 }
  const http = [], db = [], secret = opaque(), expectedUrl = broker()
  const pool = localPool({ fault: event => {
    db.push({ sql: event.sql, op: event.op, before: event.before })
    return changes.fault?.(event, state)
  } })
  const sessionTransport = async request => {
    http.push(request); assert.equal(request.url, ISSUER + '/user')
    try {
      const { payload } = await jwtVerify(request.headers.authorization.slice(7), SIGNING, { issuer: ISSUER, audience: 'authenticated', algorithms: ['HS256'] })
      if (!state.validSession) return response(request.url, { error_code: 'session_not_found' }, 403)
      const user = { id: payload.sub, role: 'authenticated', aud: 'authenticated', is_anonymous: false }
      return changes.userResponse?.(request, user) ?? response(request.url, user)
    } catch { return response(request.url, { error_code: 'bad_jwt' }, 403) }
  }
  const admissionTransport = async request => {
    http.push(request)
    const stored = rows(); assert.equal(stored.length, 1); assert.equal(stored[0].state, 'admission_inflight')
    assert.ok(db.some(e => e.op === 'prepare' && e.sql === 'COMMIT' && !e.before))
    assert.ok(db.some(e => e.op === 'claim_admission' && e.sql === 'COMMIT' && !e.before))
    if (changes.admission) return changes.admission(request, expectedUrl)
    if (new URL(request.url).pathname.endsWith('/identities/authorize')) return response(request.url, { url: expectedUrl })
    return { url: request.url, status: 302, headers: [['location', expectedUrl]], body: new Uint8Array() }
  }
  const options = { syntheticExecution: true, pool, vault, applicationOrigin: ORIGIN, publishableKey: KEY, sessionTransport, admissionTransport,
    readAccessToken: async () => { state.reads++; return changes.read ? changes.read(state) : state.token }, ...changes.options }
  return { api: coordinator(options), options, state, http, db, secret, originalToken, expectedUrl,
    input: () => ({ browserSecret: secret }), allocations: () => http.filter(r => !r.url.endsWith('/user')) }
}
function held(result, acknowledged = true) {
  assert.equal(result.status, 'held'); assert.ok(result.binding)
  assert.equal(result.quarantine, acknowledged ? 'acknowledged' : 'unacknowledged')
  assert.equal(Object.keys(result.binding).sort().join(','), 'applicationPkceChallenge,browserHash,configHash,intentHash,transactionId')
  assert.doesNotMatch(JSON.stringify(result), /authorizationUrl|verifier|accessToken|email|sb_publishable|private-error/)
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.binding))
}

test('sign-in commits encrypted intent, claims once, admits once and returns only a private candidate after finish ACK', async () => {
  const f = await fixture(), result = await f.api.startSignIn(f.input())
  assert.equal(result.status, 'private_admission_candidate'); assert.equal(f.http.length, 1); assert.equal(f.state.reads, 0)
  const [stored] = rows(); assert.equal(stored.state, 'admitted'); assert.equal(stored.metadata.original, null)
  assert.equal(stored.browser_hash, hash(f.secret)); assert.equal(stored.metadata.applicationOrigin, ORIGIN)
  assert.equal(stored.metadata.configHash, result.binding.configHash); assert.equal(stored.id, result.binding.transactionId)
  const verifier = vault.open(stored.material, ['tll-provisional-admission/v1', 'qdmvngjwkcsilzmqksme', 'application-pkce', stored.id,
    stored.config_hash, stored.browser_hash, stored.intent_hash, '0']).verifier
  assert.equal(createHash('sha256').update(verifier).digest('base64url'), result.binding.applicationPkceChallenge)
  const url = new URL(f.http[0].url)
  assert.equal(url.origin + url.pathname, ISSUER + '/authorize'); assert.equal(url.searchParams.get('code_challenge'), result.binding.applicationPkceChallenge)
  assert.equal(f.http[0].headers.authorization, undefined); assert.equal(f.http[0].headers.cookie, undefined)
  assert.equal(result.admission.authorizationUrl, f.expectedUrl)
  const ops = operations(); assert.equal(ops.length, 2); assert.equal(ops.filter(o => o.id === result.claim.operationId).length, 1)
  assert.ok(f.db.some(e => e.op === 'finish_admission' && e.sql === 'COMMIT' && !e.before))
  assert.doesNotMatch(JSON.stringify(result), new RegExp(verifier)); assert.ok(Object.isFrozen(result.claim)); assert.ok(Object.isFrozen(result.admission))
  const calls = f.http.length, inspection = await f.api.inspect({ binding: result.binding, browserSecret: f.secret })
  assert.equal(inspection.status, 'metadata_only'); assert.equal(inspection.state, 'admitted')
  assert.doesNotMatch(JSON.stringify(inspection), /authorization|outer|verifier|token|fence|generation|userId/)
  assert.equal(await f.api.inspect({ binding: result.binding, browserSecret: opaque() }), null)
  assert.equal(f.http.length, calls)
})

test('migration uses two authoritative exact-token verifications and post-claim reread before the single link request', async () => {
  const f = await fixture(), result = await f.api.startMigration(f.input())
  assert.equal(result.status, 'private_admission_candidate'); assert.equal(f.state.reads, 5); assert.equal(f.http.length, 3)
  assert.deepEqual(f.http.map(r => new URL(r.url).pathname), ['/auth/v1/user', '/auth/v1/user', '/auth/v1/user/identities/authorize'])
  for (const request of f.http) assert.equal(request.headers.authorization, `Bearer ${f.originalToken}`)
  assert.equal(new URL(f.http[2].url).searchParams.get('skip_http_redirect'), 'true')
  assert.deepEqual(rows()[0].metadata.original, { userId: USER, sessionId: SESSION, accessTokenHash: hash(f.originalToken) })
  assert.doesNotMatch(JSON.stringify(rows()) + JSON.stringify(result), new RegExp(f.originalToken))
})

test('forged, stale, anonymous, missing and revoked original sessions never prepare or allocate', async t => {
  for (const [name, changes] of [
    ['forged', { token: await jwt({}, new TextEncoder().encode('synthetic-incorrect-signing-key')) }],
    ['stale authentication', { token: await jwt({ amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 301 }] }) }],
    ['anonymous', { token: await jwt({ is_anonymous: true }) }],
    ['missing', { read: () => null }], ['revoked', { userResponse: request => response(request.url, { error_code: 'revoked' }, 403) }],
  ]) await t.test(name, async () => {
    const f = await fixture(changes), result = await f.api.startMigration(f.input())
    assert.deepEqual(result, { status: 'held', binding: null, quarantine: 'not_required' })
    assert.equal(f.db.length, 0); assert.equal(f.allocations().length, 0)
  })
})

test('token switch at every session read is refused without migration fallback', async t => {
  const replacement = await jwt({ session_id: randomUUID() })
  for (const changedAt of [2, 3, 4, 5]) await t.test(`read ${changedAt}`, async () => {
    const f = await fixture({ read: state => state.reads >= changedAt ? replacement : state.token }), result = await f.api.startMigration(f.input())
    if (changedAt === 2) assert.equal(result.binding, null)
    else { held(result); assert.equal(rows().find(r => r.id === result.binding.transactionId).state, 'held') }
    assert.equal(f.allocations().length, 0)
  })
})

test('revocation after prepare is checked upstream again and quarantine retains original binding', async () => {
  const f = await fixture({ fault: (event, state) => { if (event.op === 'prepare' && event.sql === 'COMMIT' && !event.before) state.validSession = false } })
  const result = await f.api.startMigration(f.input()); held(result); assert.equal(f.allocations().length, 0)
  assert.equal(f.http.length, 2); assert.equal(rows()[0].metadata.original.accessTokenHash, hash(f.originalToken)); assert.equal(rows()[0].material, null)
})

test('proof aging during acknowledged claim and bounded post-claim accessor both prevent link dispatch', async t => {
  await t.test('proof age after claim', async () => {
    let offset = 0
    const f = await fixture({ options: { now: () => Date.now() + offset }, fault: e => { if (e.op === 'claim_admission' && e.sql === 'COMMIT' && !e.before) offset = 5001 } })
    held(await f.api.startMigration(f.input())); assert.equal(f.allocations().length, 0)
  })
  await t.test('accessor stalls after claim', async () => {
    const f = await fixture({ options: { timeoutMs: 100 }, read: state => state.reads === 5 ? new Promise(() => {}) : state.token })
    held(await f.api.startMigration(f.input())); assert.equal(f.allocations().length, 0)
  })
})

test('prepare, claim and finish transport faults at SQL and COMMIT boundaries preserve original quarantine and never retry', async t => {
  for (const method of ['prepare', 'claim_admission', 'finish_admission']) for (const point of ['before_sql', 'after_sql', 'after_commit']) await t.test(`${method} ${point}`, async () => {
    let injected = false
    const f = await fixture({ fault: e => {
      const hit = point === 'before_sql' ? e.sql.startsWith('SELECT ') && e.before : point === 'after_sql' ? e.sql.startsWith('SELECT ') && !e.before : e.sql === 'COMMIT' && !e.before
      if (!injected && e.op === method && hit) { injected = true; return true }
    } })
    const result = await f.api.startSignIn(f.input()); held(result); assert.ok(injected)
    const stored = rows().find(r => r.id === result.binding.transactionId)
    assert.equal(stored.state, 'held'); assert.equal(stored.browser_hash, hash(f.secret)); assert.equal(stored.intent_hash, result.binding.intentHash); assert.equal(stored.material, null)
    assert.equal(f.allocations().length, method === 'finish_admission' ? 1 : 0)
    const count = f.http.length; assert.equal((await f.api.inspect({ binding: result.binding, browserSecret: f.secret })).state, 'held')
    assert.equal((await f.api.startSignIn(f.input())).status, 'held'); assert.equal(f.http.length, count)
  })
})

test('uncertain allocation, malformed destination and timeout each hold the single claimed transaction', async t => {
  for (const [name, admission] of [
    ['lost response', async () => { throw Error('private-error-body') }],
    ['wrong destination', async request => ({ url: request.url, status: 302, headers: [['location', 'https://other.example/']], body: new Uint8Array() })],
    ['late response', async (request, url) => { await delay(150); return { url: request.url, status: 302, headers: [['location', url]], body: new Uint8Array() } }],
  ]) await t.test(name, async () => {
    const f = await fixture({ admission, options: { timeoutMs: 50 } }), result = await f.api.startSignIn(f.input())
    held(result); assert.equal(f.allocations().length, 1); assert.equal(rows().find(r => r.id === result.binding.transactionId).state, 'held')
    await delay(170); assert.equal(f.allocations().length, 1)
    assert.equal(f.db.filter(e => e.op === 'finish_admission' && e.sql.startsWith('SELECT ') && e.before).length, 0)
  })
})

test('lost finish and hold ACK keep private original binding; metadata admitted is never dispatch or URL authority', async () => {
  const f = await fixture({ fault: e => (e.op === 'finish_admission' && e.sql === 'COMMIT' && !e.before) || (e.op === 'hold' && e.sql.startsWith('SELECT ') && e.before) })
  const result = await f.api.startSignIn(f.input()); held(result, false); assert.equal(rows()[0].state, 'admitted')
  const inspection = await f.api.inspect({ binding: result.binding, browserSecret: f.secret })
  assert.equal(inspection.state, 'admitted'); assert.doesNotMatch(JSON.stringify(inspection), /authorization|outer|verifier|token|fence|generation/)
  assert.equal(f.allocations().length, 1); assert.equal((await f.api.startSignIn(f.input())).status, 'held'); assert.equal(f.allocations().length, 1)
})

test('database disabled prepare is acknowledged as held and does not dispatch', async () => {
  const f = await fixture(); admin('UPDATE tll_provisional_private.control SET enabled=false')
  const result = await f.api.startSignIn(f.input()); held(result); assert.equal(f.http.length, 0); assert.equal(rows()[0].state, 'held')
})

test('captured configuration/browser bindings resist request mutation and concurrent same-instance starts', async () => {
  let release
  const f = await fixture({ read: async state => { if (state.reads === 1) await new Promise(resolve => { release = resolve }); return state.token } })
  const input = f.input(), running = f.api.startMigration(input)
  while (!release) await delay(1)
  input.browserSecret = opaque(); f.options.applicationOrigin = 'https://other.example'; f.options.publishableKey = 'sb_secret_replacement'; f.options.readAccessToken = async () => null
  assert.equal((await f.api.startSignIn(f.input())).status, 'held'); release()
  const result = await running; assert.equal(result.status, 'private_admission_candidate')
  assert.equal(result.binding.browserHash, hash(f.secret)); assert.ok(result.admission.authorizationUrl.startsWith(ORIGIN))
  for (const request of f.http) assert.equal(request.headers.apikey, KEY)
  assert.equal(f.allocations().length, 1)
})
