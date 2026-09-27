import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { STAGING_GENERATION_23_OWNER_JOURNEY_ENABLED,
  runStagingGeneration23OwnerJourney } from '../scripts/staging-generation-23-owner-journey.mjs'
import { STAGING_ALIAS } from '../scripts/staging-surface-activation-transport.mjs'

const immutableUrl = 'https://the-lifting-abc123-my-lifting-lab-s-projects.vercel.app'
const bypass = Buffer.from('local-preview-bypass')
async function armed() {
  const source = await readFile(new URL('../scripts/staging-generation-23-owner-journey.mjs', import.meta.url), 'utf8')
  assert.match(source, /STAGING_GENERATION_23_OWNER_JOURNEY_ENABLED = false/)
  return import(`data:text/javascript;base64,${Buffer.from(source
    .replace('STAGING_GENERATION_23_OWNER_JOURNEY_ENABLED = false',
      'STAGING_GENERATION_23_OWNER_JOURNEY_ENABLED = true')
    .replace("from 'playwright'", `from '${import.meta.resolve('playwright')}'`)
    .replace("from './staging-generation-23-checkout-observer.mjs'",
      `from '${new URL('../scripts/staging-generation-23-checkout-observer.mjs', import.meta.url).href}'`)
    .replace("from './staging-surface-activation-transport.mjs'",
      `from '${new URL('../scripts/staging-surface-activation-transport.mjs', import.meta.url).href}'`)
    .replace("from './staging-provider-broker-rotation.mjs'",
      `from '${new URL('../scripts/staging-provider-broker-rotation.mjs', import.meta.url).href}'`))
    .toString('base64')}`)
}
function route(url, method = 'GET', headers = {}) {
  const actions = []
  return { actions, request: () => ({ url: () => url, method: () => method, headers: () => headers }),
    fallback: options => { actions.push({ type: 'fallback', options }) },
    abort: reason => { actions.push({ type: 'abort', reason }) } }
}

test('ordinary owner journey is OFF before browser launch', async () => {
  assert.equal(STAGING_GENERATION_23_OWNER_JOURNEY_ENABLED, false)
  let launched = false
  await assert.rejects(runStagingGeneration23OwnerJourney({ immutableUrl, applicationOrigin: STAGING_ALIAS,
    verifyAlias: async () => {}, bypass,
    expectedUnitPricePence: 1200, signal: new AbortController().signal,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(), launch() { launched = true } }), /unavailable/)
  assert.equal(launched, false)
})

test('protected Preview browser guard carries no bypass header and blocks purchase methods', async () => {
  const { installProtectedPreviewRoute } = await armed()
  let guard
  await installProtectedPreviewRoute({ route: async (_pattern, handler) => { guard = handler } }, STAGING_ALIAS)
  const same = route(`${STAGING_ALIAS}/dashboard`, 'POST')
  await guard(same)
  assert.equal(same.actions[0].options, undefined)
  const oldBuild = route(`${immutableUrl}/dashboard`)
  await guard(oldBuild)
  assert.equal(oldBuild.actions[0].options?.headers?.['x-vercel-protection-bypass'], undefined)
  const auth = route('https://shopify.com/authentication/107532616020/login', 'POST',
    {})
  await guard(auth)
  assert.equal(auth.actions[0].type, 'fallback')
  assert.equal(auth.actions[0].options, undefined)
  const stray = route(`${STAGING_ALIAS}/dashboard`, 'GET', { 'x-vercel-protection-bypass': 'stray' })
  await guard(stray)
  assert.deepEqual(stray.actions, [{ type: 'abort', reason: 'blockedbyclient' }])
  for (const [url, method] of [
    ['https://tll-integration-staging.myshopify.com/cart/c/example', 'POST'],
    ['https://payments.shopify.com/submit', 'POST'],
    ['https://theliftinglab.co.uk/', 'GET'],
  ]) {
    const blocked = route(url, method)
    await guard(blocked)
    assert.deepEqual(blocked.actions, [{ type: 'abort', reason: 'blockedbyclient' }])
  }
})

test('bypass cookie bootstrap makes one non-following request to the exact alias', async () => {
  const { bootstrapProtectedPreviewCookie: bootstrap } = await armed()
  const cookie = { domain: new URL(STAGING_ALIAS).hostname, secure: true,
    httpOnly: true, path: '/', name: 'test-bypass', value: 'synthetic-cookie' }
  const calls = [], context = { request: { get: async (url, options) => {
    calls.push({ url, options }); return { status: () => 307,
      headers: () => ({ location: `${STAGING_ALIAS}/api/staging/readiness` }), dispose: async () => {} }
  } }, cookies: async () => [cookie] }
  await bootstrap(context, STAGING_ALIAS, bypass)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `${STAGING_ALIAS}/api/staging/readiness`)
  assert.equal(calls[0].options.maxRedirects, 0)
  assert.equal(calls[0].options.headers['x-vercel-set-bypass-cookie'], 'true')
  await assert.rejects(bootstrap({ ...context, cookies: async () =>
    [{ ...cookie, domain: 'shopify.com' }] }, STAGING_ALIAS, bypass), /unavailable/)
})

test('logout proof rejects a retained session and a generic protection or runtime denial', async () => {
  const { verifyStagingSessionState, verifyOrdersDeniedByApplication } = await armed()
  const session = [{ name: 'sb-qdmvngjwkcsilzmqksme-auth-token.0', value: 'synthetic' }]
  assert.doesNotThrow(() => verifyStagingSessionState(session, true))
  assert.throws(() => verifyStagingSessionState(session, false), /unavailable/)
  assert.doesNotThrow(() => verifyStagingSessionState([], false))
  await assert.rejects(verifyOrdersDeniedByApplication({ status: () => 401,
    headers: () => ({}), json: async () => ({ status: 'held' }) }), /unavailable/)
  await assert.rejects(verifyOrdersDeniedByApplication({ status: () => 409,
    headers: () => ({ 'cache-control': 'no-store, private' }),
    json: async () => ({ status: 'service_error' }) }), /unavailable/)
})

test('owner journey checks identity, isolation, cart amount and guarded checkout before closing browser', async () => {
  const { runStagingGeneration23OwnerJourney: run } = await armed()
  const events = [], contexts = []
  let signedOut = false
  const locator = name => ({
    getByRole: (role, options) => locator(`${name} > ${role}:${options?.name}`),
    getByText: text => locator(`${name} > text:${text}`),
    or: other => locator(`${name} or ${other.name}`), first: () => locator(`${name}:first`),
    name, click: async () => { events.push(`click:${name}`)
      if (name === 'button:Sign out of TLL and shop') signedOut = true },
    waitFor: async () => { events.push(`wait:${name}`) },
    getAttribute: async key => key === 'href'
      ? 'https://tll-integration-staging.myshopify.com/cart/c/test123' : null,
  })
  const browser = {
    newContext: async options => {
      assert.equal(options.serviceWorkers, 'block')
      const index = contexts.length
      const context = { closed: false, route: async () => {},
        request: { get: async () => ({ status: () => 307,
          headers: () => ({ location: `${STAGING_ALIAS}/api/staging/readiness` }), dispose: async () => {} }) },
        cookies: async () => [{ domain: new URL(STAGING_ALIAS).hostname, secure: true, httpOnly: true,
          path: '/', name: 'test-bypass', value: 'synthetic-cookie' },
          ...index === 0 && !signedOut ? [{ name: 'sb-qdmvngjwkcsilzmqksme-auth-token', value: 'synthetic-session' }] : []],
        close: async () => { context.closed = true; events.push(`close-context:${index}`) },
        newPage: async () => ({
          goto: async url => { events.push(`goto:${url}`); return { status: () =>
            index === 1 || url === `${STAGING_ALIAS}/api/account/orders` ? 409 : 200,
          headers: () => ({ 'cache-control': 'no-store, private' }),
          json: async () => ({ status: 'held' }) } },
          waitForURL: async url => { events.push(`signed-in:${url}`) },
          getByText: (text) => locator(`text:${text}`),
          getByRole: (role, options) => locator(`${role}:${options?.name}`),
          locator: name => locator(name),
        }),
      }
      contexts.push(context)
      return context
    },
    close: async () => { events.push('close-browser') },
  }
  const result = await run({ immutableUrl, applicationOrigin: STAGING_ALIAS,
    verifyAlias: async () => { events.push('alias-verified') }, bypass, expectedUnitPricePence: 1200,
    signal: new AbortController().signal,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    launch: async options => { assert.deepEqual(options, { channel: 'chrome', headless: false }); return browser },
    checkoutObserver: async ({ checkoutUrl }) => {
      assert.equal(checkoutUrl, 'https://tll-integration-staging.myshopify.com/cart/c/test123')
      events.push('guarded-checkout-get')
      return { status: 'STAGING_CHECKOUT_OBSERVED_NO_MUTATION', shop: 'tll-integration-staging.myshopify.com' }
    },
  })
  assert.equal(result.status, 'OWNER_JOURNEY_VERIFIED_NO_PURCHASE')
  assert.equal(events.includes(`signed-in:${STAGING_ALIAS}/dashboard`), true)
  assert.equal(events.includes(`goto:${STAGING_ALIAS}/api/account/orders`), true)
  const guestAdd = events.indexOf('click:button:Add to test cart')
  const signIn = events.indexOf(`signed-in:${STAGING_ALIAS}/dashboard`)
  const transfer = events.indexOf('click:dialog:Test cart > button:Connect guest cart')
  const checkout = events.indexOf('click:dialog:Test cart > button:Prepare staging checkout')
  assert.ok(guestAdd >= 0 && guestAdd < signIn && signIn < transfer && transfer < checkout)
  assert.equal(events.includes('guarded-checkout-get'), true)
  assert.equal(events.includes('click:button:Sign out of TLL and shop'), true)
  assert.equal(events.includes(`signed-in:${STAGING_ALIAS}/auth`), true)
  assert.equal(events.filter(item => item === `goto:${STAGING_ALIAS}/account/orders`).length, 3)
  assert.equal(events.filter(item => item === 'alias-verified').length, 6)
  assert.equal(contexts.length, 3)
  assert.equal(contexts.every(context => context.closed), true)
  assert.equal(events.at(-1), 'close-browser')
})

test('a failed owner sign-in closes the browser and never opens checkout', async () => {
  const { runStagingGeneration23OwnerJourney: run } = await armed()
  let closes = 0, checkout = false
  const locator = { click: async () => {}, waitFor: async () => {},
    getByText: () => ({ waitFor: async () => {} }) }
  const browser = {
    newContext: async () => ({ route: async () => {}, close: async () => { closes++ },
      request: { get: async () => ({ status: () => 307,
        headers: () => ({ location: `${STAGING_ALIAS}/api/staging/readiness` }), dispose: async () => {} }) },
      cookies: async () => [{ domain: new URL(STAGING_ALIAS).hostname, secure: true, httpOnly: true,
        path: '/', name: 'test-bypass', value: 'synthetic-cookie' }],
      newPage: async () => ({ goto: async () => ({ status: () => 200 }),
        getByRole: () => locator,
        waitForURL: async () => { throw Error('owner did not finish sign-in') } }) }),
    close: async () => { closes++ },
  }
  const result = await run({ immutableUrl, applicationOrigin: STAGING_ALIAS,
    verifyAlias: async () => {}, bypass, expectedUnitPricePence: 1200,
    signal: new AbortController().signal,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    launch: async () => browser,
    checkoutObserver: async () => { checkout = true },
  })
  assert.equal(result.status, 'OWNER_JOURNEY_FAILED_VERIFIED')
  assert.equal(checkout, false)
  assert.equal(closes, 2)
})

test('an uncertain logout result cannot be reported as a known owner failure', async () => {
  const { runStagingGeneration23OwnerJourney: run } = await armed()
  let closed = 0
  const locator = name => ({
    getByRole: (role, options) => locator(`${name}:${role}:${options?.name}`),
    getByText: text => locator(`${name}:text:${text}`),
    or: () => locator(name), first: () => locator(name),
    click: async () => { if (name === 'button:Sign out of TLL and shop') throw Error('lost logout reply') },
    waitFor: async () => {},
    getAttribute: async () => 'https://tll-integration-staging.myshopify.com/cart/c/test123',
  })
  const browser = { newContext: async () => ({ route: async () => {}, close: async () => { closed++ },
    request: { get: async () => ({ status: () => 307,
      headers: () => ({ location: `${STAGING_ALIAS}/api/staging/readiness` }), dispose: async () => {} }) },
      cookies: async () => [{ domain: new URL(STAGING_ALIAS).hostname, secure: true, httpOnly: true,
        path: '/', name: 'test-bypass', value: 'synthetic-cookie' },
        { name: 'sb-qdmvngjwkcsilzmqksme-auth-token', value: 'synthetic-session' }],
    newPage: async () => ({ goto: async () => ({ status: () => 409,
      headers: () => ({ 'cache-control': 'no-store, private' }), json: async () => ({ status: 'held' }) }),
      waitForURL: async () => {},
      getByRole: (role, options) => locator(`${role}:${options?.name}`),
      getByText: text => locator(`text:${text}`), locator }) }),
  close: async () => { closed++ } }
  await assert.rejects(run({ immutableUrl, applicationOrigin: STAGING_ALIAS,
    verifyAlias: async () => {}, bypass, expectedUnitPricePence: 1200,
    signal: new AbortController().signal, deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    launch: async () => browser, checkoutObserver: async () =>
      ({ status: 'STAGING_CHECKOUT_OBSERVED_NO_MUTATION', shop: 'tll-integration-staging.myshopify.com' }),
  }), /logout outcome uncertain/)
  assert.equal(closed, 4)
})

test('uncertain browser closure does not claim a verified owner failure', async () => {
  const { runStagingGeneration23OwnerJourney: run } = await armed()
  const browser = { newContext: async () => ({ route: async () => {},
    request: { get: async () => ({ status: () => 307,
      headers: () => ({ location: `${STAGING_ALIAS}/api/staging/readiness` }), dispose: async () => {} }) },
    cookies: async () => [{ domain: new URL(STAGING_ALIAS).hostname, secure: true, httpOnly: true,
      path: '/', name: 'test-bypass', value: 'synthetic-cookie' }],
    close: async () => { throw Error('context close failed') },
    newPage: async () => ({ goto: async () => ({}),
      getByRole: () => ({ click: async () => { throw Error('sign-in failed') } }) }) }),
    close: async () => {} }
  await assert.rejects(run({ immutableUrl, applicationOrigin: STAGING_ALIAS,
    verifyAlias: async () => {}, bypass, expectedUnitPricePence: 1200,
    signal: new AbortController().signal,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(), launch: async () => browser,
    checkoutObserver: async () => { throw Error('should not reach checkout') },
  }), /unavailable/)
})
