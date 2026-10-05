import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const alias = 'https://the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app'
const immutable = 'https://the-lifting-example-my-lifting-lab-s-projects.vercel.app'
const bundle = await build({ stdin: { contents:
  "export {createCartHandler} from './lib/commerce/staging-cart-http.ts'; export {emptyCart} from './lib/commerce/staging-cart-service.ts'",
  resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
const { createCartHandler, emptyCart } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

test('real browser requests reach the mounted cart handler only on the registered staging origin', async () => {
  let opens = 0, reads = 0
  const handler = createCartHandler({ enabled: true, origin: alias, hmacKeyHex: 'a'.repeat(64),
    service: { open: async () => { opens++; return emptyCart() },
      read: async () => { reads++; return emptyCart() } },
    transition: {}, currentActor: async () => null })
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) })
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url())
      if (![alias, immutable].includes(url.origin)) return route.abort('blockedbyclient')
      if (url.pathname === '/probe') return route.fulfill({ status: 200, contentType: 'text/html',
        body: '<!doctype html><html><title>Staging origin contract</title></html>' })
      if (url.pathname !== '/api/cart') return route.abort('blockedbyclient')
      const response = await handler(new Request(request.url(), { method: request.method(),
        headers: request.headers(), ...(request.method() === 'GET' ? {} : { body: request.postData() }) }))
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers),
        body: await response.text() })
    })
    const page = await context.newPage()
    const open = async () => page.evaluate(async () => {
      const response = await fetch('/api/cart', { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tll-cart-intent': 'staging-cart' },
        body: JSON.stringify({ action: 'open' }) })
      return { status: response.status, state: (await response.json()).state }
    })
    await page.goto(`${alias}/probe`)
    assert.deepEqual(await open(), { status: 200, state: 'empty' })
    assert.equal(opens, 1)
    const cookie = (await context.cookies(alias)).find(item => item.name === '__Host-tll-staging-cart')
    assert.ok(cookie?.httpOnly && cookie.secure)
    await page.goto(`${immutable}/probe`)
    assert.equal((await open()).status, 403)
    assert.equal(opens, 1)
    assert.equal(reads, 0)
    await context.close()
  } finally { await browser.close() }
})
