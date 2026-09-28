import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { build } from 'esbuild'

const bundle = await build({ stdin: { contents: "export * from './lib/identity/customer-admission-bridge-continuation.ts'; export * from './lib/identity/customer-subject-broker-repository.ts'", resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createCustomerAdmissionBridgeContinuation: continuation, customerBridgeReleaseHash: releaseHash, createCustomerSubjectBrokerRepository: broker } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const ORIGIN = 'https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app', KEY = 'sb_publishable_synthetic00000000000'
const opaque = () => randomBytes(32).toString('base64url'), digest = v => createHash('sha256').update(v).digest('hex'), SECRET = opaque()
const CONFIG = '7c54b659cf0e2ecdf07ce2b34ea10d7fc0a7c6ef3c9f59f38ca8f5cd79e86780'
const recovery = () => ({ binding: { transactionId: randomUUID(), browserHash: digest(SECRET), configHash: digest('config'), intentHash: digest('intent'),
  applicationPkceChallenge: opaque(), admissionOperationId: randomUUID(), admissionFence: '42', generation: '0', outerHash: digest('outer') }, registrationOperationId: randomUUID() })
const early = { status: 'held', binding: null, recovery: null, quarantine: 'not_required' }
function ports(changes = {}) {
  let calls = 0; const fail = () => { calls++; throw Error('private-unexpected-port') }
  return { options: { provisionalPool: { connect: fail }, bridgePool: { connect: fail }, vault: { seal: fail }, applicationOrigin: ORIGIN,
    publishableKey: KEY, readAccessToken: fail, admissionTransport: fail, sessionTransport: fail, ...changes }, count: () => calls }
}
test('disabled/live/browser gates touch no ports and expose no candidate continuation API', async t => {
  for (const changes of [{}, { syntheticExecution: true, liveEnabled: true }]) await t.test(JSON.stringify(changes), async () => {
    const f = ports(changes), api = continuation(f.options)
    assert.equal(api.liveEnabled, false); assert.equal(api.continue, undefined); assert.equal(api.register, undefined)
    assert.deepEqual(await api.startSignIn({ browserSecret: SECRET }), early)
    assert.deepEqual(await api.startMigration({ browserSecret: SECRET }), early)
    assert.deepEqual(await api.hold({ browserSecret: SECRET, recovery: recovery() }), early)
    assert.deepEqual(await api.cancel({ browserSecret: SECRET, recovery: recovery() }), early)
    assert.equal(await api.inspect({ browserSecret: SECRET, recovery: recovery() }), null); assert.equal(f.count(), 0)
  })
  globalThis.window = {}
  try { const f = ports({ syntheticExecution: true }); assert.deepEqual(await continuation(f.options).startSignIn({ browserSecret: SECRET }), early); assert.equal(f.count(), 0) }
  finally { delete globalThis.window }
})
test('configuration, caller-proof extras and terminal browser mismatch fail before ports', async t => {
  for (const changes of [{ applicationOrigin: 'https://example.com' }, { applicationOrigin: ORIGIN + '/' }, { publishableKey: undefined },
    { publishableKey: 'sb_secret_private' }, { timeoutMs: 49 }, { timeoutMs: 10001 }, { timeoutMs: Infinity }, { timeoutMs: 50.5 }, { readAccessToken: null }]) {
    await t.test(JSON.stringify(changes), async () => { const f = ports({ syntheticExecution: true, ...changes }); assert.deepEqual(await continuation(f.options).startMigration({ browserSecret: SECRET }), early); assert.equal(f.count(), 0) })
  }
  for (const input of [null, {}, { browserSecret: SECRET + '=' }, { browserSecret: SECRET, candidate: {} }, { browserSecret: SECRET, currentSession: {} },
    { browserSecret: SECRET, verified: true }, { browserSecret: SECRET, originalUserId: randomUUID() }]) {
    const f = ports({ syntheticExecution: true }); assert.deepEqual(await continuation(f.options).startSignIn(input), early); assert.equal(f.count(), 0)
  }
  for (const change of [r => ({ ...r, extra: true }), r => ({ ...r, registrationOperationId: r.binding.admissionOperationId }),
    r => ({ ...r, binding: { ...r.binding, browserHash: digest('foreign') } }), r => ({ ...r, binding: { ...r.binding, generation: '00' } }),
    r => ({ ...r, binding: { ...r.binding, admissionFence: '9223372036854775808' } }), r => ({ ...r, binding: { ...r.binding, configHash: digest('foreign') } })]) {
    const f = ports({ syntheticExecution: true }), api = continuation(f.options), input = { browserSecret: SECRET, recovery: change(recovery()) }
    assert.deepEqual(await api.hold(input), early); assert.deepEqual(await api.cancel(input), early); assert.equal(await api.inspect(input), null); assert.equal(f.count(), 0)
  }
})
test('release digest uses explicit version/order and every original authority field', () => {
  const r = recovery(), b = r.binding, secret = opaque()
  const expected = digest(JSON.stringify(['tll-bridge-release/v1', secret, b.transactionId, b.browserHash, b.configHash, b.intentHash,
    b.applicationPkceChallenge, b.admissionOperationId, b.admissionFence, b.generation, b.outerHash, r.registrationOperationId]))
  assert.equal(releaseHash(secret, r), expected)
  for (const [key, value] of Object.entries({ transactionId: randomUUID(), browserHash: digest('other'), configHash: digest('other'), intentHash: digest('other'),
    applicationPkceChallenge: opaque(), admissionOperationId: randomUUID(), admissionFence: '43', generation: '1', outerHash: digest('other') })) {
    assert.notEqual(releaseHash(secret, { ...r, binding: { ...b, [key]: value } }), expected, key)
  }
  assert.notEqual(releaseHash(opaque(), r), expected); assert.notEqual(releaseHash(secret, { ...r, registrationOperationId: randomUUID() }), expected)
  assert.throws(() => releaseHash(secret + '=', r)); assert.throws(() => releaseHash(secret, { ...r, releaseHash: expected }))
})
test('durable broker admit preserves standalone007 payload and projects only a valid trusted releaseHash', async () => {
  const calls = [], pool = { async connect() { return { async query(sql, values) { if (values) calls.push(JSON.parse(values[1])); return { rows: values ? [{ result: { status: 'admitted' } }] : [] } }, release() {} } } }
  const api = broker({ pool, syntheticExecution: true }), p = { operationId: randomUUID(), configHash: CONFIG, transactionId: randomUUID(), browserHash: digest(SECRET), outerHash: digest('outer') }
  assert.equal(await api.admit(p), true); assert.deepEqual(calls[0], p)
  const hash = digest('release'); assert.equal(await api.admit({ ...p, releaseHash: hash, releaseSecret: 'must-not-enter-sql' }), true)
  assert.deepEqual(calls[1], { ...p, releaseHash: hash })
  for (const invalid of [undefined, null, '', hash.toUpperCase(), 'g'.repeat(64), 'x'.repeat(65)]) await assert.rejects(api.admit({ ...p, releaseHash: invalid }))
  assert.equal(calls.length, 2)
})
