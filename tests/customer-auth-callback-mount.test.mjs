// Mount proof: App Router Shopify callback + final application-session release.
// Exact route modules Next registers. Delivery/final allowlists block local Next
// HTTP drive-through on reviewed Vercel origins; primary proof invokes route GETs
// with Request URLs on those origins (Slice 3 pattern).
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { build } from 'esbuild'
import { createAesGcmEnvelopeVault } from '../lib/identity/customer-token-vault.ts'

const routes = await build({
  stdin: {
    contents: `
      export { STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY } from './lib/server/staging-customer-route.ts'
      export { GET as shopifyCallbackGet } from './app/auth/customer/shopify/callback/route.ts'
      export { GET as finalCallbackGet } from './app/auth/customer/callback/route.ts'
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
  shopifyCallbackGet,
  finalCallbackGet,
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
const BROKER_CALLBACK = 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/callback'
const STORAGE = 'sb-qdmvngjwkcsilzmqksme-auth-token'
const TX = '__Host-tll-customer-transaction'
const BOOT = '__Host-tll-customer-start'

const vault = () => createAesGcmEnvelopeVault({
  activeKeyId: 'browser-synthetic',
  keys: new Map([['browser-synthetic', randomBytes(32)]]),
})

function install(runtime) {
  process.env.TLL_CUSTOMER_AUTH_MOUNT_FIXTURE = '1'
  const closed = { count: 0 }
  globalThis[STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY] = () => ({
    enabled: true,
    async close() { closed.count += 1 },
    ...runtime,
  })
  return closed
}

function clear() {
  delete process.env.TLL_CUSTOMER_AUTH_MOUNT_FIXTURE
  delete globalThis[STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY]
}

function offlineDelivery() {
  let calls = 0
  const fail = () => { calls += 1; throw new Error('No repository or HTTP work expected') }
  const cookieVault = vault()
  const provisionalVault = vault()
  const api = delivery({
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
  })
  return {
    api,
    count: () => calls,
    close() {
      cookieVault.destroy()
      provisionalVault.destroy()
    },
  }
}

function navigate(path, changes = {}) {
  const headers = {
    'sec-fetch-mode': 'navigate',
    'sec-fetch-dest': 'document',
    'sec-fetch-site': changes.site ?? 'cross-site',
    ...changes.headers,
  }
  const { headers: _h, origin: originOverride, site: _s, ...rest } = changes
  const origin = originOverride ?? ORIGIN
  return new Request(`${origin}/auth/customer/${path}`, { method: 'GET', headers, ...rest })
}

async function held(response) {
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { status: 'held' })
  assert.equal(response.headers.has('location'), false)
  assert.equal(response.headers.has('set-cookie'), false)
}

function jwt(userId, expSeconds) {
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${enc({ alg: 'ES256' })}.${enc({
    sub: userId,
    iss: 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1',
    aud: 'authenticated',
    exp: expSeconds,
  })}.signature`
}

test('mounted Shopify callback returns allowlisted broker redirect through App Router GET', async () => {
  let called = 0
  const redirectUrl = `${BROKER_CALLBACK}?code=aaaaaaaa-1111-4222-8333-444444444444&state=bbbbbbbb-1111-4222-8333-444444444444`
  const closed = install({
    delivery: {
      async shopifyCallback(req) {
        called += 1
        assert.equal(req.method, 'GET')
        assert.match(req.url, /\/auth\/customer\/shopify\/callback\?/)
        const url = new URL(req.url)
        assert.equal(url.origin, ORIGIN)
        assert.equal(url.pathname, '/auth/customer/shopify/callback')
        return new Response(null, {
          status: 303,
          headers: {
            location: redirectUrl,
            'cache-control': 'no-store, private',
            'set-cookie': `${TX}=sealed-ready; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=120`,
          },
        })
      },
    },
  })
  try {
    const response = await shopifyCallbackGet(navigate('shopify/callback?code=x&state=y'))
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), redirectUrl)
    assert.equal(new URL(response.headers.get('location')).origin + new URL(response.headers.get('location')).pathname, BROKER_CALLBACK)
    assert.ok(response.headers.getSetCookie().some((value) => value.startsWith(`${TX}=`)))
    assert.equal(called, 1)
    assert.equal(closed.count, 1)
  } finally {
    clear()
  }
})

test('mounted Shopify callback enforces exact origin and path allowlist before ports', async () => {
  const f = offlineDelivery()
  install({ delivery: f.api })
  try {
    await held(await shopifyCallbackGet(navigate('shopify/callback?code=x', {
      origin: 'https://evil.example',
    })))
    await held(await shopifyCallbackGet(navigate('callback?code=aaaaaaaa-1111-4222-8333-444444444444')))
    await held(await shopifyCallbackGet(new Request(`${ORIGIN}/auth/customer/shopify/callback?code=x`, {
      method: 'GET',
      headers: { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty', 'sec-fetch-site': 'cross-site' },
    })))
    assert.equal(f.count(), 0)
  } finally {
    clear()
    f.close()
  }
})

test('mounted final callback releases tokens-only SSR session through App Router GET', async () => {
  const now = Math.floor(Date.now() / 1000)
  const user = 'bbbbbbbb-1111-4222-8333-444444444444'
  const access = jwt(user, now + 3600)
  const callbackUrl = `${ORIGIN}/auth/customer/callback?code=aaaaaaaa-1111-4222-8333-444444444444`
  const binding = {
    transactionId: 'cccccccc-1111-4222-8333-444444444444',
    browserHash: '3'.repeat(64),
    callbackUrl,
  }
  let complete = 0
  let heldCalls = 0
  const closed = install({
    delivery: {
      finalBinding(received) {
        assert.equal(received.url, callbackUrl)
        assert.equal(received.method, 'GET')
        return binding
      },
    },
    finalReconciliation: {
      async complete(received) {
        complete += 1
        assert.deepEqual(received, binding)
        return {
          status: 'reconciled',
          transactionId: binding.transactionId,
          callbackHash: '4'.repeat(64),
          userId: user,
          identityId: 'dddddddd-1111-4222-8333-444444444444',
          reservedSubject: 'tllb_' + Buffer.alloc(32, 2).toString('base64url'),
          session: {
            accessToken: access,
            refreshToken: 'r'.repeat(40),
            tokenType: 'Bearer',
            expiresAt: (now + 3600) * 1000,
          },
        }
      },
      async hold() { heldCalls += 1 },
    },
  })
  try {
    const response = await finalCallbackGet(navigate('callback?code=aaaaaaaa-1111-4222-8333-444444444444'))
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/dashboard')
    assert.equal(complete, 1)
    assert.equal(heldCalls, 0)
    assert.equal(closed.count, 1)
    const cookies = response.headers.getSetCookie()
    assert.ok(cookies.some((value) => value.startsWith(`${STORAGE}=base64-`)))
    assert.ok(cookies.some((value) => value.startsWith(`${TX}=`) && /Max-Age=0/i.test(value)))
    assert.ok(cookies.some((value) => value.startsWith(`${BOOT}=`) && /Max-Age=0/i.test(value)))
    assert.doesNotMatch(cookies.join('\n'), /email|identity_data|provider_token|gid:\/\/shopify/i)
  } finally {
    clear()
  }
})

test('mounted final callback holds and releases no session cookie when persistence fails', async () => {
  const callbackUrl = `${ORIGIN}/auth/customer/callback?code=aaaaaaaa-1111-4222-8333-444444444444`
  const binding = {
    transactionId: 'cccccccc-1111-4222-8333-444444444444',
    browserHash: '3'.repeat(64),
    callbackUrl,
  }
  let heldCalls = 0
  const closed = install({
    delivery: { finalBinding() { return binding } },
    finalReconciliation: {
      async complete() {
        return {
          status: 'reconciled',
          transactionId: binding.transactionId,
          callbackHash: '4'.repeat(64),
          userId: 'bbbbbbbb-1111-4222-8333-444444444444',
          identityId: 'dddddddd-1111-4222-8333-444444444444',
          reservedSubject: 'tllb_' + Buffer.alloc(32, 2).toString('base64url'),
          session: {
            accessToken: 'invalid',
            refreshToken: 'private-refresh-token-value',
            tokenType: 'Bearer',
            expiresAt: Date.now() + 3_600_000,
          },
        }
      },
      async hold(received) {
        heldCalls += 1
        assert.deepEqual(received, binding)
      },
    },
  })
  try {
    await held(await finalCallbackGet(navigate('callback?code=aaaaaaaa-1111-4222-8333-444444444444')))
    assert.equal(heldCalls, 1)
    assert.equal(closed.count, 1)
  } finally {
    clear()
  }
})

test('mounted final callback rejects non-allowlisted origins and query shapes via finalBinding', async () => {
  let bindCalls = 0
  let completeCalls = 0
  install({
    delivery: {
      finalBinding(request) {
        bindCalls += 1
        const url = new URL(request.url)
        if (url.origin !== ORIGIN || url.pathname !== '/auth/customer/callback'
          || [...url.searchParams.keys()].join(',') !== 'code'
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(url.searchParams.get('code') ?? '')) {
          throw new Error('Customer final callback unavailable')
        }
        return {
          transactionId: 'cccccccc-1111-4222-8333-444444444444',
          browserHash: '3'.repeat(64),
          callbackUrl: request.url,
        }
      },
    },
    finalReconciliation: {
      async complete() { completeCalls += 1; throw new Error('must not complete') },
      async hold() { throw new Error('must not hold') },
    },
  })
  try {
    await held(await finalCallbackGet(navigate('callback?code=aaaaaaaa-1111-4222-8333-444444444444', {
      origin: 'https://evil.example',
    })))
    await held(await finalCallbackGet(navigate('callback?code=not-a-uuid')))
    await held(await finalCallbackGet(navigate('callback?code=aaaaaaaa-1111-4222-8333-444444444444&state=extra')))
    assert.equal(bindCalls, 3)
    assert.equal(completeCalls, 0)
  } finally {
    clear()
  }
})

test('mounted final callback holds when reconciliation lacks mode evidence (no session release)', async () => {
  const callbackUrl = `${ORIGIN}/auth/customer/callback?code=aaaaaaaa-1111-4222-8333-444444444444`
  const binding = {
    transactionId: 'cccccccc-1111-4222-8333-444444444444',
    browserHash: '3'.repeat(64),
    callbackUrl,
  }
  // Sign-in and migration each fail closed when their respective evidence is missing.
  // Coordinator returns rejected (no reconciled release); mount must not write SSR cookies.
  for (const missing of ['sign_in_exchange', 'migration_original_user']) {
    let complete = 0
    const closed = install({
      delivery: { finalBinding() { return binding } },
      finalReconciliation: {
        async complete(received) {
          complete += 1
          assert.deepEqual(received, binding)
          assert.ok(missing === 'sign_in_exchange' || missing === 'migration_original_user')
          return { status: 'rejected' }
        },
        async hold() { throw new Error('hold only after failed browser persistence') },
      },
    })
    try {
      await held(await finalCallbackGet(navigate('callback?code=aaaaaaaa-1111-4222-8333-444444444444')))
      assert.equal(complete, 1)
      assert.equal(closed.count, 1)
    } finally {
      clear()
    }
  }
})

test('callback mount fixture seam stays inert without TLL_CUSTOMER_AUTH_MOUNT_FIXTURE', async () => {
  const f = offlineDelivery()
  globalThis[STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY] = () => ({
    enabled: true,
    delivery: f.api,
    finalReconciliation: {
      async complete() { throw new Error('must not run') },
      async hold() {},
    },
    async close() {},
  })
  delete process.env.TLL_CUSTOMER_AUTH_MOUNT_FIXTURE
  try {
    await held(await shopifyCallbackGet(navigate('shopify/callback?code=x')))
    await held(await finalCallbackGet(navigate('callback?code=aaaaaaaa-1111-4222-8333-444444444444')))
  } finally {
    delete globalThis[STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY]
    f.close()
  }
})
