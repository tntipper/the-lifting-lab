// Mount proof: App Router logout + orders handlers with a secret-free fixture.
// These are the exact route modules Next registers. Hosted stop-before-purchase
// remains a separate GAP when Toby/preview secrets are unavailable.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const routes = await build({
  stdin: {
    contents: `
      export { STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY } from './lib/server/staging-customer-route.ts'
      export { POST as logoutPost } from './app/auth/customer/logout/route.ts'
      export { GET as ordersGet } from './app/api/account/orders/route.ts'
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
  logoutPost,
  ordersGet,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(routes.outputFiles[0].text).toString('base64')
)

const ORIGIN = 'https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app'
const STORAGE = 'sb-qdmvngjwkcsilzmqksme-auth-token'
const SHOPIFY_LOGOUT =
  'https://shopify.com/authentication/107532616020/logout?id_token_hint=header.payload.signature'
  + `&post_logout_redirect_uri=${encodeURIComponent(ORIGIN + '/auth')}`

const projection = Object.freeze({
  orders: Object.freeze([
    Object.freeze({
      reference: '#1001',
      createdAt: '2026-09-18T10:00:00Z',
      financialStatus: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
      totalPence: 1500,
      currency: 'GBP',
      items: Object.freeze([Object.freeze({ name: 'Synthetic whey', quantity: 2 })]),
      hasMoreItems: false,
    }),
  ]),
  hasMoreOrders: false,
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

function logoutRequest(changes = {}) {
  return new Request(`${ORIGIN}/auth/customer/logout`, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/x-www-form-urlencoded',
      ...changes.headers,
    },
    ...changes,
  })
}

function assertExpiredSessionCookies(response) {
  const cookies = response.headers.getSetCookie()
  assert.equal(cookies.length, 13)
  assert.ok(cookies.every(value =>
    value.startsWith(`${STORAGE}`)
    && value.includes('Max-Age=0')
    && value.includes('HttpOnly')
    && value.includes('Secure')
    && value.includes('SameSite=Lax')
    && !/access_token|Bearer|id_token/i.test(value)))
}

test('customer logout route exports POST only (GET 405 at App Router)', async () => {
  const source = readFileSync('app/auth/customer/logout/route.ts', 'utf8')
  assert.match(source, /export async function POST/)
  assert.doesNotMatch(source, /export async function GET/)
  assert.equal(typeof logoutPost, 'function')
  const built = await build({
    entryPoints: ['app/auth/customer/logout/route.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  })
  const route = await import(
    'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64') + '#logout-exports'
  )
  assert.equal(typeof route.POST, 'function')
  assert.equal(typeof route.GET, 'undefined')
  assert.equal(route.dynamic, 'force-dynamic')
})

test('mounted logout with Shopify end-session redirect expires every staging session cookie', async () => {
  const closed = install({
    accountLogout: {
      async logout() {
        return { status: 'logged_out', providerRedirect: SHOPIFY_LOGOUT }
      },
    },
  })
  try {
    const response = await logoutPost(logoutRequest())
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), SHOPIFY_LOGOUT)
    assert.match(response.headers.get('cache-control') ?? '', /no-store/)
    assertExpiredSessionCookies(response)
    assert.equal(closed.count, 1)
    assert.doesNotMatch(response.headers.get('location') ?? '', /access_token|refresh_token|Bearer/i)
  } finally {
    clear()
  }
})

test('mounted repeat logout without upstream hint returns locally and still clears cookies', async () => {
  const closed = install({
    accountLogout: {
      async logout() {
        return { status: 'logged_out', providerRedirect: null }
      },
    },
  })
  try {
    const response = await logoutPost(logoutRequest())
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/auth')
    assertExpiredSessionCookies(response)
    assert.equal(closed.count, 1)
  } finally {
    clear()
  }
})

test('mounted held logout clears cookies and never releases a provider redirect', async () => {
  process.env.TLL_CUSTOMER_AUTH_MOUNT_FIXTURE = '1'
  const closed = { count: 0 }
  globalThis[STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY] = () => ({
    enabled: true,
    accountLogout: {
      async logout() {
        return { status: 'held', code: 'LOGOUT_UNCERTAIN' }
      },
    },
    async close() {
      closed.count += 1
      throw new Error('cleanup-private')
    },
  })
  try {
    const response = await logoutPost(logoutRequest())
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/auth?error=signout_failed')
    assertExpiredSessionCookies(response)
    assert.equal(closed.count, 1)
  } finally {
    clear()
  }
})

test('mounted SESSION_INVALIDATION_FAILED clears cookies without Shopify redirect', async () => {
  const closed = install({
    accountLogout: {
      async logout() {
        return { status: 'local_revoked', code: 'SESSION_INVALIDATION_FAILED' }
      },
    },
  })
  try {
    const response = await logoutPost(logoutRequest())
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/auth?error=signout_failed')
    assertExpiredSessionCookies(response)
    assert.equal(closed.count, 1)
  } finally {
    clear()
  }
})

test('mounted orders route returns only the bounded projection and closes custody', async () => {
  let reads = 0
  const closed = install({
    accountOperations: {
      async readOrders() {
        reads += 1
        return projection
      },
    },
  })
  try {
    const response = await ordersGet(new Request(`${ORIGIN}/api/account/orders`, {
      headers: { accept: 'application/json', origin: ORIGIN, 'sec-fetch-site': 'same-origin' },
    }))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body, projection)
    assert.equal(reads, 1)
    assert.equal(closed.count, 1)
    assert.equal(response.headers.get('cache-control'), 'no-store, private')
    assert.equal(response.headers.get('vary'), 'Cookie')
    const serialized = JSON.stringify(body)
    assert.doesNotMatch(serialized, /access_token|refresh_token|id_token|Bearer|email@|gid:\/\/shopify/i)
  } finally {
    clear()
  }
})

test('mounted orders without staging composition remains held', async () => {
  clear()
  const response = await ordersGet(new Request('https://fixture.invalid/api/account/orders'))
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { status: 'held' })
  assert.equal(response.headers.has('set-cookie'), false)
})

test('account orders page wires unified customer logout and same-origin credentials fetch', () => {
  const page = readFileSync('app/account/orders/page.tsx', 'utf8')
  const ui = readFileSync('app/account/orders/AccountOrders.tsx', 'utf8')
  assert.match(page, /\/auth\/customer\/logout/)
  assert.match(page, /method="post"/)
  assert.match(ui, /credentials: 'same-origin'/)
  assert.match(ui, /parseCustomerOrdersProjection/)
  assert.doesNotMatch(ui, /access_token|refresh_token|id_token/)
})

test('mount fixture seam stays inert without TLL_CUSTOMER_AUTH_MOUNT_FIXTURE', async () => {
  delete process.env.TLL_CUSTOMER_AUTH_MOUNT_FIXTURE
  globalThis[STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY] = () => {
    throw new Error('fixture must not run')
  }
  try {
    const response = await ordersGet(new Request(`${ORIGIN}/api/account/orders`))
    assert.equal(response.status, 409)
  } finally {
    delete globalThis[STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY]
  }
})
