import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { once } from 'node:events'
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

// The networked browser fixture uses only a loopback server. The transformed
// scheme/port are test-only; the production URL checks are exercised above.
async function armedLoopback() {
  const source = await readFile(new URL('../scripts/staging-generation-23-checkout-observer.mjs', import.meta.url), 'utf8')
  const local = source.replace('STAGING_GENERATION_23_CHECKOUT_OBSERVER_ENABLED = false',
    'STAGING_GENERATION_23_CHECKOUT_OBSERVER_ENABLED = true')
    .replace(`const SHOP = '${SHOP}'`, "const SHOP = '127.0.0.1'")
    .replaceAll("'https:'", "'http:'")
    .replaceAll('|| url.port', '|| false')
    .replaceAll('&& !url.port', '&& true')
    .replaceAll('|| final.port', '|| false')
  return import(`data:text/javascript;base64,${Buffer.from(local).toString('base64')}`)
}

async function loopback(handler) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
}

function page() {
  let handler, current = CHECKOUT
  const events = []
  const context = { route: async (_pattern, callback) => { handler = callback },
    request: { get: async () => ({ status: () => 200, dispose: async () => {} }) } }
  const request = async (url, method = 'GET', navigation = false) => {
    const route = {
      request: () => ({ url: () => url, method: () => method, isNavigationRequest: () => navigation,
        headers: () => ({ referer: CHECKOUT, accept: 'text/html' }) }),
      abort: async () => { events.push(`blocked:${method}:${url}`) },
      fetch: async options => { assert.equal(options.maxRedirects, 0); return { status: () => 200 } },
      fulfill: async () => { events.push(`allowed:${method}:${url}`) },
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
    `${CHECKOUT}?key=one&key=two`,
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

test('real browser observes a loopback checkout redirect at its final address without sending a POST',
  { timeout: 30_000 }, async t => {
    const { observeStagingCheckout: observe } = await armedLoopback()
    const seen = []
    const fixture = await loopback((request, response) => {
      seen.push(`${request.method} ${request.url}`)
      if (request.url.startsWith('/cart/c/')) {
        response.writeHead(302, { location: '/checkouts/cn/syntheticCheckout123' }); response.end(); return
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><body>£12.00<button id="submit">Place order</button><button id="popup">New tab</button><script>document.getElementById("submit").onclick=()=>fetch(location.href,{method:"POST"}).catch(()=>{});document.getElementById("popup").onclick=()=>window.open(location.href)</script></body>')
    })
    t.after(() => fixture.close())
    const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) })
    try {
      const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage()
      const initial = `${fixture.url}/cart/c/syntheticCheckout123?key=syntheticSecret123`
      const final = `${fixture.url}/checkouts/cn/syntheticCheckout123`
      assert.deepEqual(await observe({ page, checkoutUrl: initial, signal, deadlineAt: deadlineAt() }),
        { status: 'STAGING_CHECKOUT_OBSERVED_NO_MUTATION', shop: '127.0.0.1' })
      assert.equal(page.url(), final)
      assert.match(await page.locator('body').textContent(), /£12\.00/)
      await page.locator('#submit').click()
      await page.waitForTimeout(100)
      const popupPromise = context.waitForEvent('page')
      await page.locator('#popup').click()
      const popup = await popupPromise
      await popup.locator('#submit').waitFor()
      assert.equal(seen.filter(item => item.startsWith('POST')).length, 0)
      await context.close()
    } finally { await browser.close() }
  })

test('a forbidden checkout redirect is rejected before its destination receives any request', async t => {
  const { observeStagingCheckout: observe } = await armedLoopback()
  let reached = 0
  const forbidden = await loopback((_request, response) => { reached++; response.end('forbidden') })
  const source = await loopback((_request, response) => {
    response.writeHead(302, { location: `http://localhost:${new URL(forbidden.url).port}/checkouts/cn/other` })
    response.end()
  })
  t.after(() => source.close()); t.after(() => forbidden.close())
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) })
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage()
    await assert.rejects(observe({ page, checkoutUrl: `${source.url}/cart/c/syntheticCheckout123`,
      signal, deadlineAt: deadlineAt() }), /unavailable/)
    assert.equal(reached, 0)
    await context.close()
  } finally { await browser.close() }
})

test('an HTTP error at the pinned checkout cannot count as an observed handoff', async () => {
  const { observeStagingCheckout: observe } = await armed()
  const browser = page()
  browser.goto = async url => { await browser.request(url, 'GET', true); return { status: () => 404 } }
  await assert.rejects(observe({ page: browser, checkoutUrl: CHECKOUT,
    signal, deadlineAt: deadlineAt() }), /unavailable/)
})
