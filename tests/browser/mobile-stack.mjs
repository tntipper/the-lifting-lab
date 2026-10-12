// Run: node --test tests/browser/mobile-stack.mjs
// Uses the existing esbuild + Tailwind + local HTTP fixture approach. No .env
// loading, Next server, credentials, hosted API calls or flag changes needed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { chromium, webkit, devices } from 'playwright'

const root = fileURLToPath(new URL('../../', import.meta.url))
const bundle = await build({
  absWorkingDir: root, entryPoints: ['tests/browser/mobile-stack-fixture.tsx'],
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  // Constants in this in-memory test bundle only; never set process.env.
  define: {
    'process.env': '{}',
    'process.env.NODE_ENV': '"development"',
    'process.env.NEXT_PUBLIC_TLL_ENVIRONMENT': '"local-browser-fixture"',
    'process.env.NEXT_PUBLIC_TLL_STACK_CART': '"enabled"',
    'process.env.NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART': '""',
    'process.env.NEXT_PUBLIC_TLL_STORE_PRICES': '""',
  },
  plugins: [{ name: 'local-guest-adapters', setup(builder) {
    builder.onResolve({ filter: /^next\/link$|^@\/lib\/supabase$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
      loader: 'jsx', resolveDir: root,
      contents: args.path === 'next/link'
        ? 'import React from "react"; export default function Link(props){return <a {...props}/>;}'
        : 'export const createClient = () => ({auth:{getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}});',
    }))
  } }],
})
const css = (await postcss([tailwind()]).process(await readFile(resolve(root, 'app/globals.css'), 'utf8'), { from: resolve(root, 'app/globals.css') })).css
const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/fixture.css"></head><body><div id="fixture"></div><script src="/fixture.js"></script></body></html>'

for (const [profile, engine] of [['iPhone 13', webkit], ['Pixel 7', chromium]]) {
  test(`${profile}: build guest stack → sticky Buy → intercepted exact cart URL`, { timeout: 30000 }, async () => {
    const now = Date.now()
    const variants = ['90071992547409931234', '222', '333']
    const rows = variants.map((variant, index) => ({
      id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      name: `Synthetic creatine ${index + 1}`, brand: 'Fixture', category: 'creatine',
      serving_size: 5, serving_unit: 'g', buy_url: null, product_nutrients: [],
      storeLinkMapping: {
        productId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        shopifyProductHandle: `synthetic-${index + 1}`, shopifyVariantId: variant,
        active: true, approved: true,
        review: { approved: true, version: 'fixture-v1', expectedVersion: 'fixture-v1', verifiedAtMs: now - 1000, expiresAtMs: now + 600000 },
      },
    }))
    // Independent expectation; do not derive from the function under test.
    const expected = 'https://shop.theliftinglab.co.uk/cart/90071992547409931234:1,222:1,333:1?utm_source=theliftinglab&utm_medium=referral&utm_campaign=stack&ref=theliftinglab'
    const server = createServer((req, res) => {
      const contents = { '/stack': ['text/html', html], '/fixture.js': ['text/javascript', bundle.outputFiles[0].contents], '/fixture.css': ['text/css', css] }[req.url]
      if (!contents) { res.writeHead(404); res.end(); return }
      res.setHeader('Content-Type', contents[0]); res.end(contents[1])
    })
    let browser
    try {
      server.listen(0, '127.0.0.1'); await once(server, 'listening')
      const origin = `http://127.0.0.1:${server.address().port}`
      browser = await engine.launch({ headless: true })
      const context = await browser.newContext({ ...devices[profile], serviceWorkers: 'block' })
      const page = await context.newPage(), errors = [], unexpected = [], cartRequests = []
      page.on('pageerror', error => errors.push(error.message))
      // Context routing catches navigation/new tabs too. Every unknown request
      // is aborted, so no live Shopify/Supabase/supplier request can escape.
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url())
        if (url.origin === 'https://shop.theliftinglab.co.uk' && url.pathname.startsWith('/cart/')) {
          cartRequests.push(request.url())
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Intercepted cart — no store contacted</h1>' })
        }
        if (url.origin === origin && request.method() === 'GET') {
          if (url.pathname === '/api/products/search') return route.fulfill({ json: rows.filter(row => row.name.includes(url.searchParams.get('q'))) })
          if (url.pathname === '/api/products/batch') {
            const ids = url.searchParams.get('ids').split(',')
            return route.fulfill({ json: rows.filter(row => ids.includes(row.id)) })
          }
          if (['/stack', '/fixture.js', '/fixture.css'].includes(url.pathname)) return route.continue()
        }
        unexpected.push(`${request.method()} ${url.origin}${url.pathname}`)
        return route.abort()
      })
      await page.goto(origin + '/stack')
      await page.getByText('Start with one product', { exact: true }).waitFor()
      assert.equal(await page.getByRole('link', { name: 'Buy my stack', exact: true }).count(), 0)
      for (const row of rows) {
        await page.getByRole('searchbox', { name: 'Add a product' }).fill(row.name)
        await page.getByRole('button').filter({ hasText: row.name }).filter({ hasText: '+ Add' }).click()
      }
      const buy = page.getByRole('link', { name: 'Buy my stack', exact: true })
      await buy.waitFor()
      await page.waitForFunction(url => document.querySelector('a[href="' + url + '"]') !== null, expected)
      // Reload proves real guest persistence and returns to the stack page top.
      await page.reload()
      await buy.waitFor()
      await page.evaluate(() => window.scrollTo(0, 0))
      assert.equal(await page.evaluate(() => window.scrollY), 0)
      assert.equal(await buy.getAttribute('href'), expected)
      const assertVisible = async () => {
        assert.equal(await buy.isVisible(), true)
        assert.equal(await buy.locator('..').evaluate(el => getComputedStyle(el).position), 'fixed')
        assert.equal(await buy.evaluate(el => {
          const r = el.getBoundingClientRect()
          return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth
            && el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
        }), true, 'Buy must be fully inside the viewport and unobscured')
      }
      await assertVisible() // No locator.click() auto-scroll before this check.
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      assert.ok(await page.evaluate(() => window.scrollY > 0), 'Exercise a genuinely scrollable stack page')
      await assertVisible()
      await page.evaluate(() => window.scrollTo(0, 0))
      await buy.click()
      await page.getByRole('heading', { name: 'Intercepted cart — no store contacted' }).waitFor()
      assert.deepEqual(cartRequests, [expected])
      assert.deepEqual(unexpected, [])
      assert.deepEqual(errors, [])
      // TODO(Toby/Lifty): supervised real checkout/guest-wallet proof and
      // Sentinel inclusion need separate authorisation/the future Sentinel.
    } finally {
      await browser?.close()
      if (server.listening) await new Promise(resolveClose => server.close(resolveClose))
    }
  })
}
