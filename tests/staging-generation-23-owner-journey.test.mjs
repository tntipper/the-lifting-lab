import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { STAGING_GENERATION_23_OWNER_JOURNEY_ENABLED,
  runStagingGeneration23OwnerJourney } from '../scripts/staging-generation-23-owner-journey.mjs'

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
      `from '${new URL('../scripts/staging-generation-23-checkout-observer.mjs', import.meta.url).href}'`))
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
  await assert.rejects(runStagingGeneration23OwnerJourney({ immutableUrl, bypass,
    expectedUnitPricePence: 1200, signal: new AbortController().signal,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(), launch() { launched = true } }), /unavailable/)
  assert.equal(launched, false)
})

test('protected Preview bypass is origin-bound and purchase methods are blocked', async () => {
  const { installProtectedPreviewRoute } = await armed()
  let guard
  await installProtectedPreviewRoute({ route: async (_pattern, handler) => { guard = handler } }, immutableUrl, bypass)
  const same = route(`${immutableUrl}/dashboard`, 'POST')
  await guard(same)
  assert.equal(same.actions[0].options.headers['x-vercel-protection-bypass'], bypass.toString())
  const auth = route('https://shopify.com/authentication/107532616020/login', 'POST',
    { 'x-vercel-protection-bypass': 'should-be-removed' })
  await guard(auth)
  assert.equal(auth.actions[0].type, 'fallback')
  assert.equal(auth.actions[0].options.headers['x-vercel-protection-bypass'], undefined)
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

test('owner journey checks identity, isolation, cart amount and guarded checkout before closing browser', async () => {
  const { runStagingGeneration23OwnerJourney: run } = await armed()
  const events = [], contexts = []
  const locator = name => ({
    getByRole: (role, options) => locator(`${name} > ${role}:${options?.name}`),
    getByText: text => locator(`${name} > text:${text}`),
    or: other => locator(`${name} or ${other.name}`), first: () => locator(`${name}:first`),
    name, click: async () => { events.push(`click:${name}`) },
    waitFor: async () => { events.push(`wait:${name}`) },
    getAttribute: async key => key === 'href'
      ? 'https://tll-integration-staging.myshopify.com/cart/c/test123' : null,
  })
  const browser = {
    newContext: async options => {
      assert.equal(options.serviceWorkers, 'block')
      const index = contexts.length
      const context = { closed: false, route: async () => {},
        close: async () => { context.closed = true; events.push(`close-context:${index}`) },
        newPage: async () => ({
          goto: async url => { events.push(`goto:${url}`); return { status: () => index === 1 ? 409 : 200 } },
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
  const result = await run({ immutableUrl, bypass, expectedUnitPricePence: 1200,
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
  assert.equal(events.includes(`signed-in:${immutableUrl}/dashboard`), true)
  assert.equal(events.includes(`goto:${immutableUrl}/api/account/orders`), true)
  const guestAdd = events.indexOf('click:button:Add to test cart')
  const signIn = events.indexOf(`signed-in:${immutableUrl}/dashboard`)
  const transfer = events.indexOf('click:dialog:Test cart > button:Connect guest cart')
  const checkout = events.indexOf('click:dialog:Test cart > button:Prepare staging checkout')
  assert.ok(guestAdd >= 0 && guestAdd < signIn && signIn < transfer && transfer < checkout)
  assert.equal(events.includes('guarded-checkout-get'), true)
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
      newPage: async () => ({ goto: async () => ({ status: () => 200 }),
        getByRole: () => locator,
        waitForURL: async () => { throw Error('owner did not finish sign-in') } }) }),
    close: async () => { closes++ },
  }
  const result = await run({ immutableUrl, bypass, expectedUnitPricePence: 1200,
    signal: new AbortController().signal,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    launch: async () => browser,
    checkoutObserver: async () => { checkout = true },
  })
  assert.equal(result.status, 'OWNER_JOURNEY_FAILED_VERIFIED')
  assert.equal(checkout, false)
  assert.equal(closes, 2)
})

test('uncertain browser closure does not claim a verified owner failure', async () => {
  const { runStagingGeneration23OwnerJourney: run } = await armed()
  const browser = { newContext: async () => ({ route: async () => {},
    close: async () => { throw Error('context close failed') },
    newPage: async () => ({ goto: async () => ({}),
      getByRole: () => ({ click: async () => { throw Error('sign-in failed') } }) }) }),
    close: async () => {} }
  await assert.rejects(run({ immutableUrl, bypass, expectedUnitPricePence: 1200,
    signal: new AbortController().signal,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(), launch: async () => browser,
    checkoutObserver: async () => { throw Error('should not reach checkout') },
  }), /unavailable/)
})
