// SQL-only bridge slice: actual repositories/coordinator, synthetic signed HTTP.
// No browser cookie delivery and no production bridge adapter are claimed here.
import test, { before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { build } from 'esbuild'
import { SignJWT, jwtVerify } from 'jose'
import { createAesGcmEnvelopeVault } from '../../lib/identity/customer-token-vault.ts'
import { admin, assertFixture, localPool, closeClients } from './local-pg.mjs'

const bundle = await build({ stdin: { contents: "export * from './lib/identity/customer-admission-coordinator.ts'; export * from './lib/identity/customer-provisional-admission-repository.ts'", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
const { createCustomerAdmissionCoordinator: coordinator, createCustomerProvisionalAdmissionRepository: repository, createProvisionalAdmissionMetadata: metadata } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const ORIGIN = 'https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app', ISSUER = 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1'
const CONFIG = '7c54b659cf0e2ecdf07ce2b34ea10d7fc0a7c6ef3c9f59f38ca8f5cd79e86780'
const KEY = 'sb_publishable_synthetic00000000000', SIGNING = new TextEncoder().encode('synthetic-bridge-session-signature-only')
const USER = 'eeeeeeee-dddd-4ccc-8bbb-aaaaaaaaaaaa', SESSION = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const opaque = () => randomBytes(32).toString('base64url'), hash = text => createHash('sha256').update(text).digest('hex')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const roleFor = { bridge: 'tll_ab_bridge_executor', broker: 'tll_ab_broker_executor', provisional: 'tll_ab_provisional_executor' }
const schemaFor = { bridge: 'tll_bridge_private', broker: 'tll_broker_private', provisional: 'tll_provisional_private' }
const rows = table => JSON.parse(admin(`SELECT coalesce(json_agg(r),'[]') FROM ${table} r`))
const state = id => ({ p: rows('tll_provisional_private.intents').find(r => r.id === id), b: rows('tll_broker_private.flows').find(r => r.id === id), g: rows('tll_bridge_private.grants').find(r => r.id === id) })
const claims = (at = Date.now()) => ({ iss: ISSUER, sub: USER, session_id: SESSION, aud: 'authenticated', role: 'authenticated', is_anonymous: false,
  iat: Math.floor(at / 1000) - 1, exp: Math.floor(at / 1000) + 3600, amr: [{ method: 'password', timestamp: Math.floor(at / 1000) - 1 }] })
async function rpc(kind, op, payload, fault) {
  const client = await localPool({ role: roleFor[kind], fault }).connect()
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout='5s'"); await client.query("SET LOCAL statement_timeout='10s'")
    const r = await client.query(`SELECT ${schemaFor[kind]}.repository($1::text,$2::jsonb) AS result`, [op, JSON.stringify(payload)])
    await client.query('COMMIT'); return r.rows[0].result
  } catch { try { await client.query('ROLLBACK') } catch { /* discard */ } throw Error('Synthetic bridge outcome unknown') }
  finally { client.release() }
}
const operator = (kind, enabled) => JSON.parse(admin(`SET SESSION AUTHORIZATION tll_admission_bridge_migrator; SELECT ${schemaFor[kind]}.operator_set_enabled(${enabled},'synthetic_test')`))
let vault, verified = false
before(() => { assertFixture(); verified = true; for (const schema of Object.values(schemaFor)) assert.equal(admin(`SELECT enabled FROM ${schema}.control`), 'f') })
beforeEach(() => {
  vault?.destroy(); vault = createAesGcmEnvelopeVault({ activeKeyId: 'bridge-synthetic', keys: new Map([['bridge-synthetic', randomBytes(32)]]) })
  admin('TRUNCATE tll_bridge_private.grants,tll_bridge_private.operations,tll_provisional_private.intents,tll_provisional_private.operations,tll_provisional_private.daily_quota,tll_broker_private.flows,tll_broker_private.operations,tll_broker_private.subjects,tll_broker_private.daily_quota')
  for (const kind of Object.keys(schemaFor)) operator(kind, true)
})
after(async () => {
  if (!verified) return
  for (const kind of Object.keys(schemaFor)) operator(kind, false)
  admin('TRUNCATE tll_bridge_private.grants,tll_bridge_private.operations,tll_provisional_private.intents,tll_provisional_private.operations,tll_provisional_private.daily_quota,tll_broker_private.flows,tll_broker_private.operations,tll_broker_private.subjects,tll_broker_private.daily_quota')
  vault?.destroy(); await closeClients()
})
async function admitted(mode = 'sign_in') {
  const at = Date.now(), token = await new SignJWT(claims(at)).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(SIGNING), secret = opaque()
  const outer = { response_type: 'code', client_id: 'tll-staging-subject-broker-v1', redirect_uri: ISSUER + '/callback', scope: 'subject', state: randomUUID(), code_challenge_method: 'S256', code_challenge: opaque() }
  const url = ORIGIN + '/auth/customer/authorize?' + new URLSearchParams(outer).toString(), http = []
  const response = (url, value) => ({ url, status: 200, headers: [['content-type', 'application/json']], body: Buffer.from(JSON.stringify(value)) })
  const api = coordinator({ syntheticExecution: true, pool: localPool({ role: roleFor.provisional }), vault, applicationOrigin: ORIGIN, publishableKey: KEY,
    readAccessToken: async () => token, sessionTransport: async request => {
      http.push(request); await jwtVerify(request.headers.authorization.slice(7), SIGNING, { issuer: ISSUER, audience: 'authenticated' })
      return response(request.url, { id: USER, role: 'authenticated', aud: 'authenticated', is_anonymous: false })
    }, admissionTransport: async request => { http.push(request); return mode === 'migration' ? response(request.url, { url }) : { url: request.url, status: 302, headers: [['location', url]], body: new Uint8Array() } } })
  const candidate = await (mode === 'migration' ? api.startMigration({ browserSecret: secret }) : api.startSignIn({ browserSecret: secret }))
  assert.equal(candidate.status, 'private_admission_candidate')
  const operationId = randomUUID(), source = state(candidate.binding.transactionId).p, release = opaque()
  const binding = { ...candidate.binding, admissionOperationId: candidate.claim.operationId, admissionFence: candidate.claim.fence, generation: candidate.claim.generation }
  const releaseHash = hash(JSON.stringify(['tll-bridge-release/v1', release, binding, source.outer_hash, operationId]))
  const proof = () => mode === 'sign_in' ? null : { userId: USER, sessionId: SESSION, accessTokenHash: hash(token), issuer: ISSUER, audience: 'authenticated', anonymous: false,
    authenticatedAt: (Math.floor(at / 1000) - 1) * 1000, checkedAt: Date.now(), expiresAt: claims(at).exp * 1000 }
  const payload = () => ({ ...binding, outerHash: source.outer_hash, operationId, releaseHash, currentMigrationProof: proof() })
  const browser = () => ({ transactionId: source.id, browserHash: source.browser_hash, outerHash: source.outer_hash, configHash: CONFIG, operationId: randomUUID(), releaseHash })
  return { candidate, binding, source, payload, browser, release, releaseHash, token, secret, http, proof }
}
async function registered(mode) { const f = await admitted(mode); assert.equal((await rpc('bridge', 'register', f.payload())).status, 'registered'); return f }
async function shortAdmission(ttl) {
  const at = Date.now(), verifier = opaque(), p = metadata({ transactionId: randomUUID(), browserHash: hash(opaque()), applicationOrigin: ORIGIN,
    mode: 'sign_in', original: null, applicationPkceChallenge: createHash('sha256').update(verifier).digest('base64url'), createdAt: at, expiresAt: at + ttl })
  const repo = repository({ pool: localPool({ role: roleFor.provisional }), vault, applicationOrigin: ORIGIN, syntheticExecution: true })
  assert.equal(await repo.prepare({ operationId: randomUUID(), metadata: p, applicationPkceVerifier: verifier }), true)
  const claimOperation = randomUUID(), claim = await repo.claimAdmission({ ...p, operationId: claimOperation, currentMigrationProof: null }); assert.equal(claim.status, 'claimed')
  const query = new URLSearchParams({ response_type: 'code', client_id: 'tll-staging-subject-broker-v1', redirect_uri: ISSUER + '/callback', scope: 'subject', state: randomUUID(), code_challenge_method: 'S256', code_challenge: opaque() }).toString()
  assert.equal(await repo.finishAdmission({ ...p, operationId: claimOperation, fence: claim.snapshot.fence, generation: claim.snapshot.generation,
    admission: { authorizationQuery: query, authorizationUrl: ORIGIN + '/auth/customer/authorize?' + query } }), true)
  const stored = state(p.transactionId).p
  return { transactionId: p.transactionId, browserHash: p.browserHash, configHash: p.configHash, intentHash: p.intentHash, applicationPkceChallenge: p.applicationPkceChallenge,
    admissionOperationId: claimOperation, admissionFence: claim.snapshot.fence, generation: claim.snapshot.generation, outerHash: stored.outer_hash,
    operationId: randomUUID(), releaseHash: hash(opaque()), currentMigrationProof: null }
}
async function browserAdmitted(mode) { const f = await registered(mode); assert.equal((await rpc('broker', 'admit', f.browser())).status, 'admitted'); return f }
async function ready() {
  const f = await browserAdmitted(), operationId = randomUUID(), p = { ...f.browser(), operationId }
  const claim = await rpc('broker', 'claim_readiness', p); assert.equal(claim.status, 'claimed')
  const codeHash = hash(opaque()), at = Date.now()
  const r = await rpc('broker', 'finish_readiness', { ...p, fence: claim.fence, generation: claim.generation, codeHash, candidateSubject: 'tllb_' + opaque(), hardDeadline: at + 4500,
    shopifyProof: { transactionId: f.source.id, receiptId: randomUUID(), shopId: '107532616020', issuer: 'https://shopify.com/authentication/107532616020', subject: randomUUID(),
      innerPkceChallenge: opaque(), verifiedAt: at, expiresAt: at + 60000 }, migrationProof: null })
  assert.equal(r.status, 'ready'); return { ...f, codeHash }
}
function terminal(f, expected = 'held') {
  const r = state(f.source.id); assert.equal(r.p.state, expected); if (r.b) assert.equal(r.b.status, expected)
  assert.equal(r.g.state, expected); assert.equal(r.p.material, null); assert.equal(r.g.release_hash, null)
}

test('canonical SQL derives registration, original expiry and target; release capability is required and one-use', async t => {
  for (const mode of ['sign_in', 'migration']) await t.test(mode, async () => {
    const f = await registered(mode), r = state(f.source.id)
    assert.equal(r.b.registration.createdAt, f.source.metadata.createdAt); assert.equal(r.b.registration.expiresAt, f.source.metadata.expiresAt)
    assert.deepEqual(r.b.registration.outer, f.source.outer_request); assert.equal(r.b.registration.applicationPkceChallenge, f.binding.applicationPkceChallenge)
    assert.deepEqual(r.b.registration.target, mode === 'migration' ? { userId: USER, sessionId: SESSION } : null)
    const missing = f.browser(); delete missing.releaseHash
    assert.equal((await rpc('broker', 'admit', missing)).status, 'rejected')
    assert.equal((await rpc('broker', 'admit', { ...f.browser(), releaseHash: hash(opaque()) })).status, 'rejected')
    assert.equal((await rpc('broker', 'admit', f.browser())).status, 'admitted')
    assert.equal((await rpc('broker', 'admit', f.browser())).status, 'rejected')
    assert.equal(state(f.source.id).g.release_hash, null)
    const inspection = await rpc('bridge', 'inspect', f.payload())
    assert.equal(inspection.status, 'metadata_only'); assert.doesNotMatch(JSON.stringify(inspection), /release|outer|url|token|verifier|userId|operation|fence/i)
  })
})
test('direct register and owner-only legacy/helper paths cannot bypass the bridge', async () => {
  const f = await admitted()
  assert.equal((await rpc('broker', 'register', { operationId: randomUUID(), configHash: CONFIG, record: {} })).status, 'rejected')
  for (const [role, schema] of [[roleFor.broker, 'tll_broker_private'], [roleFor.provisional, 'tll_provisional_private']]) {
    for (const call of ["repository_v1('register','{}'::jsonb)", "operator_set_enabled_v1(true,'synthetic')", 'bridge_lock()']) assert.throws(() => admin(`SET ROLE ${role}; SELECT ${schema}.${call}`))
  }
  assert.equal(state(f.source.id).b, undefined)
})
test('every immutable source binding and migration proof is checked before cross-store writes', async t => {
  const f = await admitted('migration')
  const changes = [ { transactionId: randomUUID() }, { browserHash: hash(opaque()) }, { configHash: hash(opaque()) }, { intentHash: hash(opaque()) },
    { applicationPkceChallenge: opaque() }, { admissionOperationId: randomUUID() }, { admissionFence: '9223372036854775807' }, { generation: '1' },
    { outerHash: hash(opaque()) }, { currentMigrationProof: null }, { releaseHash: null }, { verified: true }, { mode: 'sign_in' },
    ...[{ userId: randomUUID() }, { sessionId: randomUUID() }, { accessTokenHash: hash(opaque()) }, { checkedAt: Date.now() - 5001 },
      { authenticatedAt: Date.now() - 300001 }, { expiresAt: Date.now() - 1 }, { anonymous: true }, { issuer: 'https://other.invalid' }].map(c => ({ currentMigrationProof: { ...f.proof(), ...c } })) ]
  for (const change of changes) await t.test(Object.keys(change).join(','), async () => {
    try { assert.equal((await rpc('bridge', 'register', { ...f.payload(), ...change })).status, 'rejected') } catch (e) { assert.match(e.message, /Synthetic bridge outcome unknown/) }
    assert.equal(state(f.source.id).b, undefined); assert.equal(state(f.source.id).g, undefined)
  })
})
test('delayed registration preserves original creation and never extends expiry', async () => {
  const f = await admitted(); await pause(5100)
  assert.equal((await rpc('bridge', 'register', f.payload())).status, 'registered')
  assert.equal(state(f.source.id).b.registration.createdAt, f.source.metadata.createdAt)
  assert.equal(state(f.source.id).b.registration.expiresAt, f.source.metadata.expiresAt)
})
test('prepare before disable cannot gain bridge authority after re-enable; old grant also remains fenced', async () => {
  for (const kind of Object.keys(schemaFor)) {
    const f = await admitted(), g = await registered()
    operator(kind, false); operator(kind, true)
    assert.equal((await rpc('bridge', 'register', f.payload())).status, 'rejected')
    assert.equal((await rpc('broker', 'admit', g.browser())).status, 'rejected')
    assert.equal((await rpc('bridge', 'inspect', g.payload())).epochCurrent, false)
  }
})
test('008 and 007 hold/cancel propagate atomically without preserving usable descendants', async t => {
  for (const kind of ['provisional', 'broker']) for (const op of ['hold', 'cancel']) await t.test(`${kind} ${op}`, async () => {
    const f = await registered(), operationId = randomUUID()
    const p = kind === 'provisional' ? { ...f.binding, operationId } : op === 'cancel' ? { ...f.browser(), operationId }
      : { operationId, configHash: CONFIG, locator: { kind: 'transaction', id: f.source.id, browserHash: f.binding.browserHash, outerHash: f.source.outer_hash } }
    assert.equal((await rpc(kind, op, p)).status, op === 'hold' ? 'held' : 'cancelled')
    terminal(f, op === 'hold' ? 'held' : 'cancelled'); assert.equal((await rpc('broker', 'admit', f.browser())).status, 'rejected')
  })
})
test('bridge terminal tombstone fences an unregistered source; late registration cannot reopen it', async () => {
  const f = await admitted(), p = f.payload()
  assert.equal((await rpc('bridge', 'hold', p)).status, 'held'); terminal(f)
  assert.equal((await rpc('bridge', 'register', { ...p, operationId: randomUUID() })).status, 'rejected')
})
test('cancel cannot reuse a registration or held operation or falsely report a first-held flow as cancelled', async () => {
  const f = await registered(), p = f.payload()
  assert.equal((await rpc('bridge', 'cancel', p)).status, 'rejected')
  assert.equal(state(f.source.id).g.state, 'pending_browser')
  const hold = { ...p, operationId: randomUUID() }
  assert.equal((await rpc('bridge', 'hold', hold)).status, 'held'); terminal(f)
  assert.equal((await rpc('bridge', 'cancel', hold)).status, 'rejected'); terminal(f)
  assert.equal((await rpc('bridge', 'cancel', { ...hold, operationId: randomUUID() })).status, 'rejected'); terminal(f)
  const fresh = await registered()
  assert.equal((await rpc('bridge', 'cancel', { ...fresh.payload(), operationId: randomUUID() })).status, 'cancelled'); terminal(fresh, 'cancelled')
  const status = JSON.parse(admin('SET SESSION AUTHORIZATION tll_admission_bridge_migrator; SELECT tll_bridge_private.operator_status()'))
  assert.equal(status.operations, Number(admin('SELECT count(*) FROM tll_bridge_private.operations')))
  assert.doesNotMatch(JSON.stringify(status), /release|outer|userId|verifier|token/i)
})
test('SQL, COMMIT and terminal ACK loss never release capability; metadata cannot retrieve it', async t => {
  for (const point of ['before_sql', 'after_sql', 'after_commit']) await t.test(point, async () => {
    const f = await admitted(); let fired = false, browserRelease = null
    const fault = e => {
      const hit = point === 'before_sql' ? e.before && e.sql.startsWith('SELECT ') : point === 'after_sql' ? !e.before && e.sql.startsWith('SELECT ') : !e.before && e.sql === 'COMMIT'
      if (!fired && hit) { fired = true; return true }
    }
    await assert.rejects(async () => { await rpc('bridge', 'register', f.payload(), fault); browserRelease = f.release })
    assert.equal(browserRelease, null); assert.ok(fired)
    const b = f.browser(); delete b.releaseHash
    assert.equal((await rpc('broker', 'admit', b)).status, 'rejected')
    const inspection = await rpc('bridge', 'inspect', f.payload()); assert.doesNotMatch(JSON.stringify(inspection), /release|url|outer|token|verifier/i)
    assert.equal((await rpc('bridge', 'hold', f.payload())).status, 'held'); terminal(f)
  })
})
test('normal broker token/userinfo remains gated and code reuse atomically holds provisional state', async () => {
  const f = await ready(), bearerHash = hash(opaque()), redeem = () => ({ operationId: randomUUID(), configHash: CONFIG, codeHash: f.codeHash,
    clientId: 'tll-staging-subject-broker-v1', redirectUri: ISSUER + '/callback', challenge: f.source.outer_request.challenge, bearerHash, bearerExpiresAt: Date.now() + 50000 })
  assert.equal((await rpc('broker', 'redeem_code', redeem())).status, 'issued')
  assert.equal((await rpc('broker', 'redeem_code', redeem())).status, 'rejected'); terminal(f)
  assert.equal((await rpc('broker', 'consume_userinfo', { operationId: randomUUID(), configHash: CONFIG, bearerHash })).status, 'rejected')
})
test('normal consumed userinfo retains private provisional material, uncertain consumed hold destroys it', async () => {
  const f = await ready(), bearerHash = hash(opaque())
  assert.equal((await rpc('broker', 'redeem_code', { operationId: randomUUID(), configHash: CONFIG, codeHash: f.codeHash, clientId: 'tll-staging-subject-broker-v1',
    redirectUri: ISSUER + '/callback', challenge: f.source.outer_request.challenge, bearerHash, bearerExpiresAt: Date.now() + 50000 })).status, 'issued')
  const operationId = randomUUID(), result = await rpc('broker', 'consume_userinfo', { operationId, configHash: CONFIG, bearerHash })
  assert.equal(result.status, 'consumed'); assert.ok(state(f.source.id).p.material)
  assert.equal((await rpc('broker', 'hold', { operationId, configHash: CONFIG, locator: { kind: 'bearer', hash: bearerHash } })).status, 'held'); terminal(f)
})
test('global lock serializes registration and disable, with no partial registration or re-enable resurrection', async () => {
  const f = await admitted(), c = await localPool({ role: roleFor.bridge }).connect()
  await c.query('BEGIN'); await c.query('SELECT tll_bridge_private.repository($1::text,$2::jsonb) AS result', ['register', JSON.stringify(f.payload())])
  const operatorClient = await localPool({ role: 'postgres' }).connect(); await operatorClient.query('SET SESSION AUTHORIZATION tll_admission_bridge_migrator')
  let done = false; const disabling = operatorClient.query("SELECT tll_provisional_private.operator_set_enabled(false,'synthetic_wait') AS result").then(() => { done = true })
  await pause(75); assert.equal(done, false); await c.query('COMMIT'); c.release(); await disabling; operatorClient.release()
  assert.equal(state(f.source.id).g.state, 'pending_browser'); assert.equal((await rpc('broker', 'admit', f.browser())).status, 'rejected')
  operator('provisional', true); assert.equal((await rpc('broker', 'admit', f.browser())).status, 'rejected')
})
test('registration samples expiry and migration verification time after waiting for the last P lock', async t => {
  for (const mode of ['expiry', 'proof_expiry', 'proof_age']) await t.test(mode, async () => {
    const p = mode === 'expiry' ? await shortAdmission(1500) : (await admitted('migration')).payload()
    if (mode === 'proof_expiry') p.currentMigrationProof.expiresAt = Date.now() + 200
    if (mode === 'proof_age') p.currentMigrationProof.checkedAt = Date.now() - 4800
    const c = await localPool({ role: 'postgres' }).connect(); await c.query('BEGIN'); await c.query('SELECT singleton FROM tll_provisional_private.control FOR UPDATE')
    let done = false; const pending = rpc('bridge', 'register', p).then(r => { done = true; return r })
    await pause(mode === 'expiry' ? 1500 : 300); assert.equal(done, false); await c.query('COMMIT'); c.release()
    assert.equal((await pending).status, 'rejected'); assert.equal(state(p.transactionId).b, undefined)
  })
})
test('global gate waits on B before acquiring P', async () => {
  const f = await registered(), lock = await localPool({ role: 'postgres' }).connect()
  await lock.query('BEGIN'); await lock.query('SELECT singleton FROM tll_broker_private.control FOR UPDATE')
  let done = false; const pending = rpc('bridge', 'inspect', f.payload()).then(() => { done = true })
  await pause(70); assert.equal(done, false)
  await lock.query('SELECT singleton FROM tll_provisional_private.control FOR UPDATE NOWAIT')
  await lock.query('COMMIT'); lock.release(); await pending
})
test('epoch invalidation also fences ready codes and already issued bearer credentials after re-enable', async t => {
  for (const phase of ['ready', 'issued']) await t.test(phase, async () => {
    const f = await ready(), bearerHash = hash(opaque()), p = { operationId: randomUUID(), configHash: CONFIG, codeHash: f.codeHash,
      clientId: 'tll-staging-subject-broker-v1', redirectUri: ISSUER + '/callback', challenge: f.source.outer_request.challenge, bearerHash, bearerExpiresAt: Date.now() + 50000 }
    if (phase === 'issued') assert.equal((await rpc('broker', 'redeem_code', p)).status, 'issued')
    operator('provisional', false); operator('provisional', true)
    assert.equal((await rpc('broker', phase === 'ready' ? 'redeem_code' : 'consume_userinfo', phase === 'ready' ? p : { operationId: randomUUID(), configHash: CONFIG, bearerHash })).status, 'rejected')
  })
})
test('every wrapper and operator acquires G before B/P; all block before a store mutation', async t => {
  const f = await registered()
  for (const [kind, operation] of [['broker', 'admit'], ['provisional', 'read_intent'], ['bridge', 'inspect'], ['broker', 'operator'], ['provisional', 'operator'], ['bridge', 'operator']]) await t.test(`${kind} ${operation}`, async () => {
    const lock = await localPool({ role: 'postgres' }).connect(); await lock.query('BEGIN'); await lock.query('SELECT singleton FROM tll_bridge_private.control FOR UPDATE')
    let done = false, client
    const pending = operation === 'operator' ? (async () => {
      client = await localPool({ role: 'postgres' }).connect(); await client.query('SET SESSION AUTHORIZATION tll_admission_bridge_migrator')
      await client.query(`SELECT ${schemaFor[kind]}.operator_set_enabled(true,'synthetic_lock_probe')`); done = true
    })() : rpc(kind, operation, kind === 'broker' ? { ...f.browser(), releaseHash: hash(opaque()) } : kind === 'bridge' ? f.payload() : f.binding).then(() => { done = true })
    await pause(70); assert.equal(done, false)
    // If a contender grabbed B/P first, this short NOWAIT acquisition would fail.
    await lock.query('SELECT singleton FROM tll_broker_private.control FOR UPDATE NOWAIT')
    await lock.query('SELECT singleton FROM tll_provisional_private.control FOR UPDATE NOWAIT')
    await lock.query('COMMIT'); lock.release(); await pending; client?.release()
  })
})
test('concurrent source cancellation waits for registration then atomically invalidates the new grant', async () => {
  const f = await admitted(), c = await localPool({ role: roleFor.bridge }).connect()
  await c.query('BEGIN'); await c.query('SELECT tll_bridge_private.repository($1::text,$2::jsonb) AS result', ['register', JSON.stringify(f.payload())])
  let done = false; const cancel = rpc('provisional', 'cancel', { ...f.binding, operationId: randomUUID() }).then(r => { done = true; return r })
  await pause(70); assert.equal(done, false); await c.query('COMMIT'); c.release()
  assert.equal((await cancel).status, 'cancelled'); terminal(f, 'cancelled')
  assert.equal((await rpc('broker', 'admit', f.browser())).status, 'rejected')
})
test('lost registration and hold acknowledgements leave no release secret; no metadata or repeat register can recover it', async () => {
  const f = await admitted()
  await assert.rejects(rpc('bridge', 'register', f.payload(), e => e.sql === 'COMMIT' && !e.before))
  await assert.rejects(rpc('bridge', 'hold', f.payload(), e => e.sql.startsWith('SELECT ') && e.before))
  assert.equal(state(f.source.id).g.state, 'pending_browser')
  const inspection = await rpc('bridge', 'inspect', f.payload()); assert.equal(inspection.status, 'metadata_only')
  assert.doesNotMatch(JSON.stringify(inspection), /release|url|outer|token|verifier/i)
  const missing = f.browser(); delete missing.releaseHash; assert.equal((await rpc('broker', 'admit', missing)).status, 'rejected')
  assert.equal((await rpc('bridge', 'register', { ...f.payload(), operationId: randomUUID(), releaseHash: hash(opaque()) })).status, 'rejected')
})
test('terminal known-flow headroom is bounded and survives normal bridge operation capacity', async () => {
  const f = await registered()
  admin(`INSERT INTO tll_bridge_private.operations SELECT gen_random_uuid(),'${f.source.id}','register' FROM generate_series(1,99999)`)
  const p = { ...f.payload(), operationId: randomUUID() }; assert.equal((await rpc('bridge', 'hold', p)).status, 'held'); terminal(f)
  const count = admin('SELECT count(*) FROM tll_bridge_private.operations'); assert.equal(count, '100001')
  assert.equal((await rpc('bridge', 'hold', { ...p, operationId: randomUUID() })).status, 'rejected')
  assert.equal(admin('SELECT count(*) FROM tll_bridge_private.operations'), count)
})
test('all private helpers and raw tables remain inaccessible to executors and installer after retirement', () => {
  for (const role of [...Object.values(roleFor), 'anon', 'authenticated', 'service_role', 'tll_admission_bridge_migrator']) {
    for (const schema of Object.values(schemaFor)) {
      assert.equal(admin(`SELECT has_schema_privilege('${role}','${schema}','CREATE')`), 'f')
      const tables = JSON.parse(admin(`SELECT json_agg(c.relname) FROM pg_class c WHERE c.relnamespace='${schema}'::regnamespace AND c.relkind='r'`))
      for (const table of tables) assert.equal(admin(`SELECT has_table_privilege('${role}','${schema}.${table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege('${role}','${schema}.${table}','SELECT,INSERT,UPDATE,REFERENCES')`), 'f')
      const fns = JSON.parse(admin(`SELECT json_agg(json_build_object('signature',oid::regprocedure::text,'name',proname)) FROM pg_proc WHERE pronamespace='${schema}'::regnamespace`))
      for (const fn of fns) {
        const expected = (role === 'tll_admission_bridge_migrator' && ['operator_status', 'operator_set_enabled'].includes(fn.name))
          || (role === roleFor[Object.keys(schemaFor).find(k => schemaFor[k] === schema)] && fn.name === 'repository')
        assert.equal(admin(`SELECT has_function_privilege('${role}','${fn.signature}','EXECUTE')`), expected ? 't' : 'f', `${role} ${fn.signature}`)
      }
    }
  }
  assert.equal(admin("SELECT count(*) FROM pg_roles WHERE rolname LIKE 'tll_ab_%' AND rolcanlogin"), '0')
})
