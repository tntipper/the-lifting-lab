// Actual 008 coordinator, 010 transaction and 007 adapter; synthetic signed HTTP.
import test, { before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { build } from 'esbuild'
import { SignJWT, jwtVerify } from 'jose'
import { createAesGcmEnvelopeVault } from '../../lib/identity/customer-token-vault.ts'
import { admin, assertFixture, localPool, closeClients } from './local-pg.mjs'

const bundle = await build({ stdin: { contents: "export * from './lib/identity/customer-admission-bridge-continuation.ts'; export * from './lib/identity/customer-subject-broker-repository.ts'", resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createCustomerAdmissionBridgeContinuation: continuation, customerBridgeReleaseHash: releaseHash, createCustomerSubjectBrokerRepository: broker } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const ORIGIN = 'https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app', ISSUER = 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1'
const KEY = 'sb_publishable_synthetic00000000000', SIGNING = new TextEncoder().encode('synthetic-bridge-continuation-signature')
const USER = 'eeeeeeee-dddd-4ccc-8bbb-aaaaaaaaaaaa', SESSION = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CONFIG = '7c54b659cf0e2ecdf07ce2b34ea10d7fc0a7c6ef3c9f59f38ca8f5cd79e86780'
const opaque = () => randomBytes(32).toString('base64url'), hash = text => createHash('sha256').update(text).digest('hex')
const schemas = ['tll_bridge_private', 'tll_broker_private', 'tll_provisional_private']
const truncate = 'TRUNCATE tll_bridge_private.grants,tll_bridge_private.operations,tll_provisional_private.intents,tll_provisional_private.operations,tll_provisional_private.daily_quota,tll_broker_private.flows,tll_broker_private.operations,tll_broker_private.subjects,tll_broker_private.daily_quota'
const control = enabled => { for (const s of schemas) admin(`SET SESSION AUTHORIZATION tll_admission_bridge_migrator; SELECT ${s}.operator_set_enabled(${enabled},'continuation_test')`) }
const rows = t => JSON.parse(admin(`SELECT coalesce(json_agg(x),'[]') FROM ${t} x`))
const state = id => ({ p: rows('tll_provisional_private.intents').find(r => r.id === id), b: rows('tll_broker_private.flows').find(r => r.id === id), g: rows('tll_bridge_private.grants').find(r => r.id === id) })
let vault, verified = false
before(() => { assertFixture(); verified = true; for (const s of schemas) assert.equal(admin(`SELECT enabled FROM ${s}.control`), 'f') })
beforeEach(() => { vault?.destroy(); vault = createAesGcmEnvelopeVault({ activeKeyId: 'continuation-synthetic', keys: new Map([['continuation-synthetic', randomBytes(32)]]) }); admin(truncate); control(true) })
after(async () => { if (!verified) return; control(false); admin(truncate); vault?.destroy(); await closeClients() })
const claims = (changes = {}) => { const at = Math.floor(Date.now() / 1000); return { iss: ISSUER, aud: 'authenticated', role: 'authenticated', sub: USER, session_id: SESSION,
  is_anonymous: false, iat: at - 1, exp: at + 3600, amr: [{ method: 'password', timestamp: at - 1 }], ...changes } }
const sign = changes => new SignJWT(claims(changes)).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(SIGNING)
function pool(kind, events, hook) {
  const actual = localPool({ role: kind === 'bridge' ? 'tll_ab_bridge_executor' : 'tll_ab_provisional_executor' })
  return { async connect() {
    await hook?.({ kind, phase: 'connect' }); const client = await actual.connect(); let op
    return { async query(sql, values) {
      if (values) op = values[0]
      const event = { kind, phase: sql, op, payload: values && JSON.parse(values[1]) }; events.push(event)
      await hook?.({ ...event, before: true })
      const result = await client.query(sql, values)
      return await hook?.({ ...event, before: false, result }) ?? result
    }, release(destroy) { events.push({ kind, phase: 'release', destroy }); client.release(destroy); hook?.({ kind, phase: 'release', op, before: false }) } }
  } }
}
async function fixture({ mode = 'sign_in', hook, sessionHook, now, timeoutMs } = {}) {
  const events = [], http = [], secret = opaque(), holder = { token: await sign(), reads: 0 }
  const outer = { response_type: 'code', client_id: 'tll-staging-subject-broker-v1', redirect_uri: ISSUER + '/callback', scope: 'subject',
    state: randomUUID(), code_challenge_method: 'S256', code_challenge: opaque() }
  const query = new URLSearchParams(outer).toString(), url = ORIGIN + '/auth/customer/authorize?' + query
  const api = continuation({ provisionalPool: pool('provisional', events, hook), bridgePool: pool('bridge', events, hook), vault,
    applicationOrigin: ORIGIN, publishableKey: KEY, syntheticExecution: true, now, timeoutMs,
    readAccessToken: async () => { holder.reads++; return holder.token },
    sessionTransport: async request => {
      http.push(request); const { payload } = await jwtVerify(request.headers.authorization.slice(7), SIGNING, { issuer: ISSUER, audience: 'authenticated' })
      const reply = { url: request.url, status: 200, headers: [['content-type', 'application/json']], body: Buffer.from(JSON.stringify({ id: payload.sub, aud: 'authenticated', role: 'authenticated', is_anonymous: false })) }
      return await sessionHook?.({ request, reply, holder, http }) ?? reply
    }, admissionTransport: async request => {
      http.push(request)
      return mode === 'migration' ? { url: request.url, status: 200, headers: [['content-type', 'application/json']], body: Buffer.from(JSON.stringify({ url })) }
        : { url: request.url, status: 302, headers: [['location', url]], body: new Uint8Array() }
    } })
  return { api, events, http, secret, holder, url, start: () => mode === 'migration' ? api.startMigration({ browserSecret: secret }) : api.startSignIn({ browserSecret: secret }) }
}
function held(result) { assert.equal(result.status, 'held'); assert.equal(Object.hasOwn(result, 'releaseSecret'), false); assert.equal(Object.hasOwn(result, 'authorizationUrl'), false) }
function terminal(id, expected = 'held') { const s = state(id); assert.equal(s.p.state, expected); assert.equal(s.p.material, null); if (s.b) assert.equal(s.b.status, expected); assert.equal(s.g.state, expected); assert.equal(s.g.release_hash, null) }
const bridgeOps = f => f.events.filter(e => e.kind === 'bridge' && e.payload).map(e => e.op)

test('only actual coordinator finish ACK permits atomic registration; private result retains exact source expiry and hash', async t => {
  for (const mode of ['sign_in', 'migration']) await t.test(mode, async () => {
    const f = await fixture({ mode }), r = await f.start(); assert.equal(r.status, 'private_registered')
    const s = state(r.recovery.binding.transactionId), b = r.recovery.binding
    assert.equal(r.expiresAt, s.p.metadata.expiresAt); assert.equal(s.b.registration.createdAt, s.p.metadata.createdAt)
    assert.equal(s.b.registration.expiresAt, r.expiresAt); assert.equal(s.g.release_hash, releaseHash(r.releaseSecret, r.recovery))
    assert.equal(r.authorizationUrl, f.url); assert.equal(b.browserHash, hash(f.secret)); assert.equal(b.outerHash, s.p.outer_hash)
    assert.equal(b.admissionOperationId, s.g.admission_operation); assert.equal(b.admissionFence, String(s.g.admission_fence))
    assert.ok(Object.isFrozen(r) && Object.isFrozen(r.recovery) && Object.isFrozen(b))
    assert.deepEqual(bridgeOps(f), ['register'])
    const finishCommit = f.events.findIndex(e => e.kind === 'provisional' && e.op === 'finish_admission' && e.phase === 'COMMIT')
    const register = f.events.findIndex(e => e.kind === 'bridge' && e.op === 'register' && e.payload)
    assert.ok(finishCommit >= 0 && register > finishCommit)
    const payload = f.events[register].payload, text = JSON.stringify(payload)
    for (const privateValue of [r.releaseSecret, f.secret, f.holder.token]) assert.equal(text.includes(privateValue), false)
    assert.equal(payload.currentMigrationProof?.userId ?? null, mode === 'migration' ? USER : null)
    assert.equal(f.http.filter(e => e.url.endsWith('/user')).length, mode === 'migration' ? 3 : 0)
    assert.equal(f.http.filter(e => !e.url.endsWith('/user')).length, 1)
    held(await f.start()); assert.deepEqual(bridgeOps(f), ['register'])
  })
})
test('actual007adapter requires the010release capability and consumes it once', async () => {
  const f = await fixture(), r = await f.start(); assert.equal(r.status, 'private_registered')
  const b = r.recovery.binding, api = broker({ pool: localPool({ role: 'tll_ab_broker_executor' }), syntheticExecution: true })
  const p = () => ({ operationId: randomUUID(), configHash: CONFIG, transactionId: b.transactionId, browserHash: b.browserHash, outerHash: b.outerHash })
  assert.equal(await api.admit(p()), false); assert.equal(await api.admit({ ...p(), releaseHash: hash('wrong') }), false)
  assert.equal(await api.admit({ ...p(), releaseHash: releaseHash(r.releaseSecret, r.recovery) }), true)
  assert.equal(await api.admit({ ...p(), releaseHash: releaseHash(r.releaseSecret, r.recovery) }), false)
  assert.equal(state(b.transactionId).g.release_hash, null)
})
test('lost008 finish ACK never reaches bridge registration', async () => {
  let lost = false
  const f = await fixture({ hook(e) { if (!lost && e.kind === 'provisional' && e.op === 'finish_admission' && e.phase === 'COMMIT' && e.before === false) { lost = true; throw Error('private lost finish') } } })
  const r = await f.start(); held(r); assert.equal(r.recovery, null); assert.deepEqual(bridgeOps(f), [])
  assert.equal(rows('tll_bridge_private.grants').length, 0); assert.equal(state(r.binding.transactionId).p.state, 'held')
})
test('lost bridge statement/COMMIT or client release error returns no capability and attempts one exact hold', async t => {
  for (const phase of ['statement', 'COMMIT', 'release']) await t.test(phase, async () => {
    let lost = false
    const f = await fixture({ hook(e) { if (!lost && e.kind === 'bridge' && e.op === 'register' && e.before === false
      && (phase === 'statement' ? !!e.payload : e.phase === phase)) { lost = true; throw Error('private bridge uncertainty') } } })
    const r = await f.start(); held(r); assert.equal(r.quarantine, 'acknowledged'); terminal(r.binding.transactionId)
    assert.deepEqual(bridgeOps(f), ['register', 'hold'])
    const [registration, hold] = f.events.filter(e => e.kind === 'bridge' && e.payload).map(e => e.payload)
    for (const [key, value] of Object.entries(r.recovery.binding)) assert.equal(hold[key], value)
    assert.equal(hold.operationId, registration.operationId); assert.equal(Object.hasOwn(hold, 'releaseHash'), false)
    assert.equal(f.events.filter(e => e.kind === 'bridge' && e.phase === 'release' && e.destroy).length, phase === 'release' ? 0 : 1)
  })
})
test('lost registration and hold acknowledgements cannot inspect/reissue a private capability', async () => {
  const f = await fixture({ hook(e) { if (e.kind === 'bridge' && e.phase === 'COMMIT' && e.before === false && ['register','hold'].includes(e.op)) throw Error('private all ACKs lost') } })
  const r = await f.start(); held(r); assert.equal(r.quarantine, 'unacknowledged'); terminal(r.binding.transactionId)
  assert.deepEqual(bridgeOps(f), ['register','hold'])
  const inspection = await f.api.inspect({ browserSecret: f.secret, recovery: r.recovery })
  assert.equal(inspection.status, 'metadata_only'); assert.equal(inspection.state, 'held')
  assert.doesNotMatch(JSON.stringify(inspection), /release|authorization|secret|verifier|operationId|userId/)
  held(await f.start()); assert.deepEqual(bridgeOps(f), ['register','hold','inspect'])
})
test('unknown hold before dispatch leaves only unreleased pending authority and no automatic retry', async () => {
  const f = await fixture({ hook(e) { if (e.kind !== 'bridge') return
    if ((e.op === 'register' && e.phase === 'COMMIT' && e.before === false) || (e.op === 'hold' && e.payload && e.before)) throw Error('private uncertainty') } })
  const r = await f.start(); held(r); assert.equal(r.quarantine, 'unacknowledged'); assert.equal(state(r.binding.transactionId).g.state, 'pending_browser')
  const peek = await f.api.inspect({ browserSecret: f.secret, recovery: r.recovery }); assert.equal(peek.state, 'pending_browser')
  assert.deepEqual(bridgeOps(f), ['register','hold','inspect']); assert.doesNotMatch(JSON.stringify(r), /releaseSecret|authorizationUrl|releaseHash/)
})
test('invalid/missing/foreign admitted metadata cannot authorize registration', async t => {
  for (const mutation of [s => ({ ...s, generation: '1' }), s => ({ ...s, outerHash: hash('foreign') }), s => ({ ...s, metadata: { ...s.metadata, original: { userId: USER, sessionId: SESSION, accessTokenHash: hash('foreign') } } }),
    s => ({ ...s, metadata: { ...s.metadata, applicationOrigin: 'https://example.com' } }), () => null]) await t.test(mutation.toString(), async () => {
    const f = await fixture({ hook(e) { if (e.kind === 'provisional' && e.op === 'read_intent' && e.payload && e.before === false) {
      const r = structuredClone(e.result); r.rows[0].result.snapshot = mutation(r.rows[0].result.snapshot); return r
    } } })
    const r = await f.start(); held(r); assert.equal(r.quarantine, 'acknowledged'); assert.deepEqual(bridgeOps(f), ['hold']); terminal(r.binding.transactionId)
  })
})
test('third actual session verification rejects changed token/account/logout/provider response before register', async t => {
  for (const issue of ['changed_token','changed_user','changed_session','logout','bad_user','redirect']) await t.test(issue, async () => {
    let f, changed = false
    f = await fixture({ mode: 'migration', async hook(e) {
      if (!changed && e.kind === 'provisional' && e.op === 'read_intent' && e.phase === 'COMMIT' && e.before === false) {
        changed = true
        if (issue === 'changed_token') f.holder.token = await sign({ exp: Math.floor(Date.now() / 1000) + 7200 })
        if (issue === 'changed_user') f.holder.token = await sign({ sub: randomUUID() })
        if (issue === 'changed_session') f.holder.token = await sign({ session_id: randomUUID() })
        if (issue === 'logout') f.holder.token = null
      }
    }, sessionHook({ reply, http }) { if (http.filter(x => x.url.endsWith('/user')).length === 3) {
      if (issue === 'bad_user') return { ...reply, body: Buffer.from(JSON.stringify({ id: randomUUID(), role: 'authenticated', aud: 'authenticated', is_anonymous: false })) }
      if (issue === 'redirect') return { ...reply, status: 302 }
    } } })
    const r = await f.start(); held(r); assert.deepEqual(bridgeOps(f), ['hold']); terminal(r.binding.transactionId)
  })
})
test('token changes during bridge pool acquisition are detected before registration SQL', async () => {
  let f, first = true
  f = await fixture({ mode: 'migration', hook(e) { if (e.kind === 'bridge' && e.phase === 'connect' && first) { first = false; f.holder.token = null } } })
  const r = await f.start(); held(r); assert.deepEqual(bridgeOps(f), ['hold']); terminal(r.binding.transactionId)
})
test('post-verification proof staleness, original expiry and postcommit SSR changes release nothing', async t => {
  for (const issue of ['stale_proof','expired_source','late_commit','postcommit_logout']) await t.test(issue, async () => {
    let f, offset = 0, changed = false
    f = await fixture({ mode: 'migration', now: () => Date.now() + offset, hook(e) {
      if (changed || e.kind !== 'bridge') return
      if (['stale_proof','expired_source'].includes(issue) && e.phase === 'connect') { changed = true; offset = issue === 'stale_proof' ? 6000 : 300001 }
      if (['late_commit','postcommit_logout'].includes(issue) && e.op === 'register' && e.phase === 'COMMIT' && e.before === false) {
        changed = true; if (issue === 'late_commit') offset = 300001; else f.holder.token = null
      }
    } })
    const r = await f.start(); held(r); terminal(r.binding.transactionId)
    assert.deepEqual(bridgeOps(f), ['stale_proof','expired_source'].includes(issue) ? ['hold'] : ['register','hold'])
  })
})
test('bounded third-session transport timeout holds the original admitted tuple', async () => {
  const f = await fixture({ mode: 'migration', timeoutMs: 100, sessionHook({ http }) {
    if (http.filter(e => e.url.endsWith('/user')).length === 3) return new Promise(() => {})
  } })
  const r = await f.start(); held(r); assert.equal(r.quarantine, 'acknowledged'); terminal(r.binding.transactionId)
  assert.deepEqual(bridgeOps(f), ['hold'])
})
test('disable between admitted metadata and registration returns held without release', async () => {
  let disabled = false
  const f = await fixture({ hook(e) { if (!disabled && e.kind === 'provisional' && e.op === 'read_intent' && e.phase === 'COMMIT' && e.before === false) { disabled = true; control(false) } } })
  const r = await f.start(); held(r); assert.equal(r.quarantine, 'acknowledged'); terminal(r.binding.transactionId)
})
test('malformed registration receipt is never released despite a successful SQL transition', async t => {
  for (const mutate of [r => ({ ...r, expiresAt: r.expiresAt + 1 }), r => ({ ...r, transactionId: randomUUID() }), r => ({ ...r, releaseHash: hash('injected') }), () => ({ status: 'registered' })]) {
    await t.test(mutate.toString(), async () => {
      const f = await fixture({ hook(e) { if (e.kind === 'bridge' && e.op === 'register' && e.payload && e.before === false) return { rows: [{ result: mutate(e.result.rows[0].result) }] } } })
      const r = await f.start(); held(r); terminal(r.binding.transactionId); assert.deepEqual(bridgeOps(f), ['register','hold'])
    })
  }
})
test('metadata inspection never reconstructs registration and terminal calls bind exact original browser and tuple', async () => {
  const f = await fixture(), r = await f.start(); assert.equal(r.status, 'private_registered')
  const good = { browserSecret: f.secret, recovery: r.recovery }, before = bridgeOps(f).length
  for (const method of ['inspect','hold','cancel']) {
    const denied = await f.api[method]({ ...good, browserSecret: opaque() }); if (method === 'inspect') assert.equal(denied, null); else held(denied)
  }
  assert.equal(bridgeOps(f).length, before)
  for (const [key, value] of Object.entries({ transactionId: randomUUID(), intentHash: hash('foreign'), applicationPkceChallenge: opaque(), admissionOperationId: randomUUID(), admissionFence: '999999', generation: '1', outerHash: hash('foreign') })) {
    const bad = { ...good, recovery: { ...r.recovery, binding: { ...r.recovery.binding, [key]: value } } }
    held(await f.api.hold(bad)); assert.equal(state(r.recovery.binding.transactionId).g.state, 'pending_browser')
  }
  const inspection = await f.api.inspect(good); assert.equal(inspection.status, 'metadata_only'); assert.doesNotMatch(JSON.stringify(inspection), /release|authorization|secret|verifier/)
  const cancelled = await f.api.cancel(good); assert.equal(cancelled.status, 'cancelled'); terminal(r.recovery.binding.transactionId, 'cancelled')
  held(await f.api.cancel(good)); assert.equal(state(r.recovery.binding.transactionId).g.state, 'cancelled')
})
test('fresh explicit hold is atomic; cancelling held source cannot claim cancelled', async () => {
  const f = await fixture(), r = await f.start(), input = { browserSecret: f.secret, recovery: r.recovery }
  const result = await f.api.hold(input); held(result); assert.equal(result.quarantine, 'acknowledged'); terminal(r.recovery.binding.transactionId)
  held(await f.api.cancel(input)); terminal(r.recovery.binding.transactionId)
})
