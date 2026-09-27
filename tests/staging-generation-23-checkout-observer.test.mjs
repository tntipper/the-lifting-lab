import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { observeStagingCheckout } from '../scripts/staging-generation-23-checkout-observer.mjs'

const SHOP = 'tll-integration-staging.myshopify.com'
const CHECKOUT = `https://${SHOP}/cart/c/syntheticCheckout123`
const signal = new AbortController().signal
const deadlineAt = () => new Date(Date.now() + 60_000).toISOString()

async function armed() {
  const source = await readFile(new URL('../scripts/staging-generation-23-checkout-observer.mjs', import.meta.url), 'utf8')
  assert.match(source, /STAGING_GENERATION_23_CHECKOUT_OBSERVER_ENABLED = false/)
  return import(`data:text/javascript;base64,${Buffer.from(source.replace(
    'STAGING_GENERATION_23_CHECKOUT_OBSERVER_ENABLED = false',
    'STAGING_GENERATION_23_CHECKOUT_OBSERVER_ENABLED = true')).toString('base64')}`)
}

function page() {
  let handler, current = CHECKOUT
  const events = []
  const context = { route: async (_pattern, callback) => { handler = callback } }
  const request = async (url, method = 'GET', navigation = false) => {
    const route = {
      request: () => ({ url: () => url, method: () => method, isNavigationRequest: () => navigation,
        headers: () => ({ referer: CHECKOUT, accept: 'text/html' }) }),
      abort: async () => { events.push(`blocked:${method}:${url}`) },
      fallback: async options => {
        assert.equal(options.headers.referer, undefined)
        assert.equal(options.headers.accept, 'text/html')
        events.push(`allowed:${method}:${url}`)
      },
    }
    await handler(route)
  }
  return { events, request,
    context: () => context,
    goto: async url => { await request(url, 'GET', true); current = url; return { status: () => 200 } },
    url: () => current }
}

test('ordinary source cannot navigate or install a route', async () => {
  const browser = page()
  await assert.rejects(observeStagingCheckout({ page: browser, checkoutUrl: CHECKOUT,
    signal, deadlineAt: deadlineAt() }), /unavailable/)
  assert.deepEqual(browser.events, [])
})

test('pinned staging checkout opens with a lasting no-mutation route', async () => {
  const { observeStagingCheckout: observe } = await armed()
  const browser = page()
  const result = await observe({ page: browser, checkoutUrl: CHECKOUT, signal, deadlineAt: deadlineAt() })
  assert.deepEqual(result, { status: 'STAGING_CHECKOUT_OBSERVED_NO_MUTATION', shop: SHOP })
  await browser.request(CHECKOUT, 'POST', true)
  await browser.request(CHECKOUT, 'DELETE')
  await browser.request('https://cdn.shopify.com/asset.js', 'GET')
  await browser.request(`https://${SHOP}/checkout/submit`, 'GET', true)
  await browser.request('https://evil.example/pay', 'GET', true)
  await browser.request('https://tracker.example/collect', 'GET')
  assert.deepEqual(browser.events.slice(1).map(item => item.split(':')[0]),
    ['blocked', 'blocked', 'allowed', 'blocked', 'blocked', 'blocked'])
})

test('wrong shop, checkout syntax, URL extras and expired deadline stop before browser access', async () => {
  const { observeStagingCheckout: observe } = await armed()
  for (const checkoutUrl of [
    'https://evil.example/cart/c/syntheticCheckout123',
    `http://${SHOP}/cart/c/syntheticCheckout123`,
    `https://${SHOP}/checkout`,
    `${CHECKOUT}?token=secret`,
    `${CHECKOUT}#submit`,
    `https://user:pass@${SHOP}/cart/c/syntheticCheckout123`,
  ]) {
    const browser = page()
    await assert.rejects(observe({ page: browser, checkoutUrl, signal, deadlineAt: deadlineAt() }), /unavailable/)
    assert.deepEqual(browser.events, [])
  }
  const browser = page()
  await assert.rejects(observe({ page: browser, checkoutUrl: CHECKOUT, signal,
    deadlineAt: new Date(Date.now() - 1_000).toISOString() }), /unavailable/)
  assert.deepEqual(browser.events, [])
})

test('an HTTP error at the pinned checkout cannot count as an observed handoff', async () => {
  const { observeStagingCheckout: observe } = await armed()
  const browser = page()
  browser.goto = async url => { await browser.request(url, 'GET', true); return { status: () => 404 } }
  await assert.rejects(observe({ page: browser, checkoutUrl: CHECKOUT,
    signal, deadlineAt: deadlineAt() }), /unavailable/)
})

test('real browser intercepts a synthetic checkout submit before any network request',
  { timeout: 30_000 }, async () => {
    const { observeStagingCheckout: observe } = await armed()
    const browser = await chromium.launch({ headless: true, channel: 'chrome' })
    try {
      const context = await browser.newContext({ serviceWorkers: 'block' })
      const seen = []
      await context.route('**/*', async route => {
        seen.push(`${route.request().method()} ${route.request().url()}`)
        if (route.request().method() !== 'GET' || route.request().url() !== CHECKOUT)
          throw Error('Unsafe request reached the local fixture')
        await route.fulfill({ status: 200, contentType: 'text/html', body:
          '<!doctype html><html><body><button id="submit">Place order</button><button id="popup">New tab</button><script>document.getElementById("submit").onclick=()=>fetch(location.href,{method:"POST"}).catch(()=>{});document.getElementById("popup").onclick=()=>window.open(location.href);if(window.opener)fetch(location.href,{method:"POST"}).catch(()=>{});</script></body></html>' })
      })
      const page = await context.newPage()
      assert.deepEqual(await observe({ page, checkoutUrl: CHECKOUT, signal, deadlineAt: deadlineAt() }),
        { status: 'STAGING_CHECKOUT_OBSERVED_NO_MUTATION', shop: SHOP })
      await page.locator('#submit').click()
      await page.waitForTimeout(100)
      assert.deepEqual(seen, [`GET ${CHECKOUT}`])
      const popupPromise=context.waitForEvent('page')
      await page.locator('#popup').click()
      const popup=await popupPromise
      await popup.locator('#submit').waitFor()
      await page.waitForTimeout(100)
      assert.deepEqual(seen, [`GET ${CHECKOUT}`,`GET ${CHECKOUT}`], 'new-tab POST must be blocked before reaching fixture')
      await popup.close()
      await context.close()
    } finally { await browser.close() }
  })
