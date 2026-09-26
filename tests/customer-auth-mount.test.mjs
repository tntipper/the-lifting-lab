// Mount proof: App Router prepare/start/authorize/recover handlers with a secret-free fixture.
// These are the exact route modules Next registers. Delivery's origin allowlist prevents a
// local Next HTTP cookie drive-through; fail-closed Next presence stays covered by the
// existing staging-customer-route route-file assertions, and Next Set-Cookie preservation
// for Web Responses is covered by tests/integration/auth-routes.test.mjs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { build } from 'esbuild'
import { createAesGcmEnvelopeVault } from '../lib/identity/customer-token-vault.ts'

const routes = await build({
  stdin: {
    contents: `
      export { STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY } from './lib/server/staging-customer-route.ts'
      export { POST as preparePost } from './app/auth/customer/prepare/route.ts'
      export { POST as startPost } from './app/auth/customer/start/route.ts'
      export { GET as authorizeGet } from './app/auth/customer/authorize/route.ts'
      export { POST as recoverPost } from './app/auth/customer/recover/route.ts'
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
})
const {
  STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY,
  preparePost,
  startPost,
  authorizeGet,
  recoverPost,
} = await import('data:text/javascript;base64,' + Buffer.from(routes.outputFiles[0].text).toString('base64'))

const deliveryBundle = await build({
  stdin: {
    contents: "export * from './lib/identity/customer-admission-browser-delivery.ts'",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
})
const { createCustomerAdmissionBrowserDelivery: delivery } = await import(
  'data:text/javascript;base64,' + Buffer.from(deliveryBundle.outputFiles[0].text).toString('base64')
)

const ORIGIN = 'https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app'
const BOOT = '__Host-tll-customer-start'
const TX = '__Host-tll-customer-transaction'
const vault = () => createAesGcmEnvelopeVault({
  activeKeyId: 'browser-synthetic',
  keys: new Map([['browser-synthetic', randomBytes(32)]]),
})

function install(deliveryApi) {
  process.env.TLL_CUSTOMER_AUTH_MOUNT_FIXTURE = '1'
  const closed = { count: 0 }
  globalThis[STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY] = () => ({
    enabled: true,
    delivery: deliveryApi,
    async close() { closed.count += 1 },
  })
  return closed
}

function clear() {
  delete process.env.TLL_CUSTOMER_AUTH_MOUNT_FIXTURE
  delete globalThis[STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY]
}

function fixture(changes = {}) {
  let calls = 0
  let at = Date.now()
  const fail = () => { calls += 1; throw new Error('No repository or HTTP work expected') }
  const cookieVault = vault()
  const provisionalVault = vault()
  const options = {
    applicationOrigin: ORIGIN,
    syntheticExecution: true,
    publishableKey: 'sb_publishable_synthetic00000000000',
    provisionalPool: { connect: fail },
    bridgePool: { connect: fail },
    brokerPool: { connect: fail },
    vault: provisionalVault,
    cookieVault,
    readAccessToken: fail,
    sessionTransport: fail,
    admissionTransport: fail,
    shopifyProof: { start: fail, complete: fail },
    shopifyProofRepository: { verifiedSubject: fail },
    subjectBrokerClientSecret: 's'.repeat(64),
    now: () => at,
    ...changes,
  }
  return {
    api: delivery(options),
    cookieVault,
    count: () => calls,
    advance: (ms) => { at += ms },
    close() {
      cookieVault.destroy()
      provisionalVault.destroy()
    },
  }
}

function request(path, fields = { mode: 'sign_in' }, changes = {}) {
  const method = changes.method ?? (String(path).startsWith('authorize') ? 'GET' : 'POST')
  const headers = {
    origin: ORIGIN,
    'sec-fetch-site': 'same-origin',
    ...(method === 'POST'
      ? { 'content-type': 'application/x-www-form-urlencoded' }
      : { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }),
    ...changes.headers,
  }
  const { headers: _h, method: _m, body: bodyOverride, ...rest } = changes
  const init = { method, headers, ...rest }
  if (method === 'POST') init.body = bodyOverride ?? new URLSearchParams(fields ?? {})
  return new Request(`${ORIGIN}/auth/customer/${path}`, init)
}

const readCookie = (response) => response.headers.getSetCookie()[0].split(';')[0]

async function held(response) {
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { status: 'held' })
  assert.equal(response.headers.has('location'), false)
  assert.equal(response.headers.has('set-cookie'), false)
}

test('mounted prepare returns CSRF and __Host Set-Cookie through App Router POST', async () => {
  const f = fixture()
  const closed = install(f.api)
  try {
    const response = await preparePost(request('prepare'))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(Object.keys(body), ['csrf'])
    assert.match(body.csrf, /^[A-Za-z0-9_-]{43}$/)
    const setCookie = response.headers.getSetCookie()
    assert.equal(setCookie.length, 1)
    assert.match(setCookie[0], new RegExp(`^${BOOT}=`))
    assert.match(setCookie[0], /; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+/)
    assert.doesNotMatch(setCookie[0], /Domain=/i)
    assert.match(response.headers.get('cache-control') ?? '', /no-store/)
    assert.equal(closed.count, 1)
    assert.equal(f.count(), 0)
  } finally {
    clear()
    f.close()
  }
})

test('mounted start enforces CSRF and rejects duplicate transaction cookies before ports', async () => {
  const f = fixture()
  install(f.api)
  try {
    const prepared = await preparePost(request('prepare'))
    const boot = readCookie(prepared)
    const { csrf } = await prepared.json()
    await held(await startPost(request('start', { mode: 'sign_in', csrf: 'wrong-csrf-token-value-____________' }, {
      headers: { cookie: boot },
    })))
    await held(await startPost(request('start', { mode: 'sign_in', csrf }, {
      headers: { cookie: `${boot}; ${TX}=not-a-sealed-capsule` },
    })))
    assert.equal(f.count(), 0)
  } finally {
    clear()
    f.close()
  }
})

test('mounted prepare cancels a stalled body without Set-Cookie', async () => {
  const f = fixture()
  install(f.api)
  let cancelled = false
  try {
    const body = new ReadableStream({
      pull() { return new Promise(() => {}) },
      cancel() { cancelled = true },
    })
    const started = Date.now()
    await held(await preparePost(request('prepare', {}, {
      body,
      duplex: 'half',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })))
    assert.ok(Date.now() - started >= 900)
    assert.equal(cancelled, true)
    assert.equal(f.count(), 0)
  } finally {
    clear()
    f.close()
  }
})

test('mounted prepare/start honour expiry without refreshing the binding', async () => {
  const f = fixture()
  install(f.api)
  try {
    const prepared = await preparePost(request('prepare'))
    const boot = readCookie(prepared)
    const { csrf } = await prepared.json()
    f.advance(300_000)
    await held(await preparePost(request('prepare', { mode: 'sign_in' }, { headers: { cookie: boot } })))
    await held(await startPost(request('start', { mode: 'sign_in', csrf }, { headers: { cookie: boot } })))
    assert.equal(f.count(), 0)
  } finally {
    clear()
    f.close()
  }
})

test('mounted start lost-acknowledgement surface holds and expires transaction cookie', async () => {
  let quarantined = 0
  install({
    async prepare() { throw new Error('unused') },
    async start() {
      quarantined += 1
      return new Response(JSON.stringify({ status: 'held' }), {
        status: 409,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store, private',
          'set-cookie': `${TX}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
        },
      })
    },
    async admit() { throw new Error('unused') },
    async recover() { throw new Error('unused') },
  })
  try {
    const response = await startPost(request('start', { mode: 'sign_in', csrf: 'a'.repeat(43) }))
    assert.equal(response.status, 409)
    assert.deepEqual(await response.json(), { status: 'held' })
    assert.equal(quarantined, 1)
    assert.ok(response.headers.getSetCookie().some((value) => value.startsWith(`${TX}=`) && /Max-Age=0/i.test(value)))
  } finally {
    clear()
  }
})

test('mounted authorize and recover reject replay of a consumed capability', async () => {
  let admitCalls = 0
  let recoverCalls = 0
  install({
    async prepare() { throw new Error('unused') },
    async start() { throw new Error('unused') },
    async admit(req) {
      admitCalls += 1
      assert.equal(req.method, 'GET')
      return Response.json({ status: 'held' }, { status: 409, headers: { 'cache-control': 'no-store, private' } })
    },
    async recover(req) {
      recoverCalls += 1
      assert.equal(req.method, 'POST')
      return Response.json({ status: 'held' }, { status: 409, headers: { 'cache-control': 'no-store, private' } })
    },
  })
  try {
    const authorize = await authorizeGet(request('authorize?state=replayed&code=used', null, { method: 'GET' }))
    assert.equal(authorize.status, 409)
    assert.deepEqual(await authorize.json(), { status: 'held' })
    assert.equal(authorize.headers.has('set-cookie'), false)
    const recover = await recoverPost(request('recover', { action: 'inspect', csrf: 'b'.repeat(43) }, {
      headers: { cookie: `${BOOT}=stale; ${TX}=consumed` },
    }))
    assert.equal(recover.status, 409)
    assert.deepEqual(await recover.json(), { status: 'held' })
    assert.equal(admitCalls, 1)
    assert.equal(recoverCalls, 1)
  } finally {
    clear()
  }
})

test('mount fixture seam stays inert without TLL_CUSTOMER_AUTH_MOUNT_FIXTURE', async () => {
  const f = fixture()
  globalThis[STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY] = () => ({
    enabled: true,
    delivery: f.api,
    async close() {},
  })
  delete process.env.TLL_CUSTOMER_AUTH_MOUNT_FIXTURE
  try {
    await held(await preparePost(request('prepare')))
  } finally {
    delete globalThis[STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY]
    f.close()
  }
})
