import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundled = await build({ entryPoints: ['lib/identity/customer-admission-coordinator.ts'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createCustomerAdmissionCoordinator: coordinator } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const ORIGIN = 'https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app', KEY = 'sb_publishable_synthetic00000000000'
const SECRET = Buffer.alloc(32, 2).toString('base64url')
function untouched(changes = {}) {
  let calls = 0
  const fail = () => { calls++; throw Error('private-unexpected-port-call') }
  return { options: { pool: { connect: fail }, vault: { seal: fail }, applicationOrigin: ORIGIN, publishableKey: KEY,
    readAccessToken: fail, admissionTransport: fail, sessionTransport: fail, ...changes }, count: () => calls }
}
const early = { status: 'held', binding: null, quarantine: 'not_required' }

test('default disabled, explicit live gate and browser runtime touch no ports', async t => {
  for (const changes of [{}, { syntheticExecution: true, liveEnabled: true }]) await t.test(JSON.stringify(changes), async () => {
    const f = untouched(changes), api = coordinator(f.options)
    assert.equal(api.liveEnabled, false)
    assert.deepEqual(await api.startSignIn({ browserSecret: SECRET }), early)
    assert.deepEqual(await api.startMigration({ browserSecret: SECRET }), early)
    assert.equal(await api.inspect({ browserSecret: SECRET, binding: {} }), null)
    assert.equal(f.count(), 0)
  })
  globalThis.window = {}
  try {
    const f = untouched({ syntheticExecution: true })
    assert.deepEqual(await coordinator(f.options).startSignIn({ browserSecret: SECRET }), early)
    assert.equal(f.count(), 0)
  } finally { delete globalThis.window }
})

test('invalid configuration and browser authority fail before any persistence, verification or dispatch', async t => {
  for (const changes of [
    { applicationOrigin: 'https://example.com' }, { applicationOrigin: ORIGIN + '/' }, { applicationOrigin: ORIGIN + ':443' },
    { applicationOrigin: ORIGIN.toUpperCase() }, { applicationOrigin: 'http://' + ORIGIN.slice(8) },
    { publishableKey: undefined }, { publishableKey: 'sb_secret_private-key' }, { timeoutMs: 49 }, { timeoutMs: 10001 },
    { timeoutMs: NaN }, { timeoutMs: Infinity }, { timeoutMs: 50.5 }, { readAccessToken: null },
  ]) await t.test(JSON.stringify(changes), async () => {
    const f = untouched({ syntheticExecution: true, ...changes })
    assert.deepEqual(await coordinator(f.options).startMigration({ browserSecret: SECRET }), early)
    assert.equal(f.count(), 0)
  })
  for (const input of [null, {}, { browserSecret: '' }, { browserSecret: SECRET + '=' }, { browserSecret: 'a'.repeat(43) },
    { browserSecret: SECRET, currentSession: {} }, { browserSecret: SECRET, originalUserId: 'private-owner' },
    { browserSecret: SECRET, verified: true }, { browserSecret: SECRET, authorizationUrl: ORIGIN }, { browserSecret: SECRET, applicationPkceChallenge: SECRET },
  ]) await t.test(JSON.stringify(input), async () => {
    const f = untouched({ syntheticExecution: true })
    assert.deepEqual(await coordinator(f.options).startSignIn(input), early); assert.equal(f.count(), 0)
  })
})

test('missing migration session is generic and cannot be replaced with a second mode on the same request instance', async () => {
  const f = untouched({ syntheticExecution: true, readAccessToken: async () => null }), api = coordinator(f.options)
  assert.deepEqual(await api.startMigration({ browserSecret: SECRET }), early)
  assert.deepEqual(await api.startSignIn({ browserSecret: SECRET }), early)
  assert.equal(f.count(), 0)
})
