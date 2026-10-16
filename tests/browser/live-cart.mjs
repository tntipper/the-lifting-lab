import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '../..'), dir = resolve(root, 'test-results/live-cart')
await mkdir(dir, { recursive: true })
const bundles = {}
for (const mode of ['live', 'default']) {
  const result = await build({ absWorkingDir: root, entryPoints: ['tests/browser/live-cart-fixture.tsx'], outdir: 'out', bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_TLL_LIVE_CART': JSON.stringify(mode === 'live' ? 'enabled' : ''),
      'process.env.NEXT_PUBLIC_TLL_ENVIRONMENT': '"production"', 'process.env.NEXT_PUBLIC_TLL_STORE_LINKS': '"enabled"', 'process.env.NEXT_PUBLIC_TLL_STORE_PRICES': '"enabled"', 'process.env.NEXT_PUBLIC_TLL_STACK_CART': '""',
      'process.env.NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART': '""', 'process.env.NEXT_PUBLIC_TLL_STAGING_CUSTOMER': '""', 'process.env.NEXT_PUBLIC_AMAZON_TAG': '""' },
    plugins: [{ name: 'local-boundaries', setup(builder) {
      builder.onResolve({ filter: /^next\/(link|navigation)$|^@\/lib\/supabase$/ }, args => ({ path: args.path, namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', resolveDir: root, contents: args.path === 'next/link'
        ? 'import React from "react";export default function Link(props){return <a {...props}/>}'
        : args.path === 'next/navigation' ? 'const params=new URLSearchParams();export const useRouter=()=>({push:href=>{window.location.href=href}});export const useSearchParams=()=>params;export const usePathname=()=>window.location.pathname;'
          : 'export const createClient=()=>({auth:{getUser:async()=>({data:{user:null}})}});' }))
    } }],
  })
  bundles[mode] = { js: result.outputFiles.find(file => file.path.endsWith('.js')).contents, css: result.outputFiles.find(file => file.path.endsWith('.css')).contents }
}
const css = (await postcss([tailwind()]).process(await readFile(resolve(root, 'app/globals.css'), 'utf8'), { from: resolve(root, 'app/globals.css') })).css
const origin = 'http://live-cart.test'
function fixtureResponse(raw) {
  const url = new URL(raw), mode = url.searchParams.get('mode') === 'default' ? 'default' : 'live'
  if (url.pathname === '/fixture.js') return { contentType: 'text/javascript', body: Buffer.from(bundles[mode].js) }
  if (url.pathname === '/fixture.css') return { contentType: 'text/css', body: css + '\n' + Buffer.from(bundles[mode].css) }
  if (url.pathname.startsWith('/api/')) return { contentType: 'application/json', body: '{}' }
  return { contentType: 'text/html', body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css?mode=${mode}"></head><body><div id="fixture"></div><script src="/fixture.js?mode=${mode}"></script></body></html>` }
}
let browser
const results = []
try {
  browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) })
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } }), page = await context.newPage(), errors = [], external = [], cartApi = []
    page.on('pageerror', error => errors.push(error.message))
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) { external.push(url.href); return route.abort() }
      if (url.pathname === '/api/cart') { cartApi.push(url.href); return route.abort() }
      return route.fulfill(fixtureResponse(url.href))
    })
    const dimensions = () => page.locator('article[data-product-id]').evaluateAll(cards => cards.map(card => ({ id: card.dataset.productId, width: card.getBoundingClientRect().width, height: card.getBoundingClientRect().height })))
    await page.goto(origin + '/?mode=default'); await page.locator('article').first().waitFor()
    const before = await dimensions()
    await page.goto(origin); await page.locator('[data-offer-state=live_basket]').first().waitFor()
    const after = await dimensions()
    assert.deepEqual(after, before, `grid dimensions unchanged at ${width}`)
    assert.equal(await page.getByRole('region', { name: 'Unmapped', exact: true }).getByRole('button').count(), 0)
    assert.equal(await page.locator('article[data-product-id="3"]').getByRole('button', { name: 'Add to basket', exact: true }).count(), 0)
    const selected = page.getByRole('region', { name: 'Selected product' })
    await selected.getByLabel('Flavour / size', { exact: true }).selectOption('1002')
    await selected.getByRole('combobox', { name: /Pack quantity/ }).selectOption('3')
    await selected.getByRole('button', { name: 'Add to basket', exact: true }).click()
    await page.getByRole('link', { name: 'Basket, 3 items', exact: true }).waitFor()
    await selected.getByLabel('Flavour / size', { exact: true }).selectOption('1003')
    assert.equal(await selected.getByRole('button').count(), 0)
    await page.reload(); await page.getByRole('link', { name: 'Basket, 3 items', exact: true }).waitFor()
    const stack = page.getByRole('link', { name: 'Buy my stack', exact: true })
    assert.match(await stack.getAttribute('href'), /\/cart\/2001:2\?utm_source=theliftinglab&utm_medium=referral&utm_campaign=stack&ref=theliftinglab$/)
    await page.getByRole('link', { name: 'Basket, 3 items', exact: true }).click()
    const checkout = page.getByRole('link', { name: 'Checkout', exact: true }); await checkout.waitFor()
    assert.match(await checkout.getAttribute('href'), /\/cart\/1002:3\?utm_source=theliftinglab&utm_medium=referral&utm_campaign=product&ref=theliftinglab$/)
    assert.equal(await page.getByText('£12.00 per pack · £36.00', { exact: true }).count(), 1)
    await page.getByRole('combobox', { name: 'Quantity for Fixture item family', exact: true }).selectOption('2')
    await page.getByText('£12.00 per pack · £24.00', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `no overflow at ${width}`)
    await page.screenshot({ path: resolve(dir, `${width}-basket.png`) })
    await page.getByRole('button', { name: 'Remove Fixture item family', exact: true }).click()
    await page.getByText('Your basket is empty.', { exact: true }).waitFor(); assert.equal(await checkout.count(), 0)
    await page.evaluate(() => localStorage.setItem('tll.live-basket.v1', '{broken'))
    await page.reload(); await page.getByText('Your basket is empty.', { exact: true }).waitFor()
    assert.deepEqual(cartApi, []); assert.deepEqual(external, []); assert.deepEqual(errors, [])
    results.push({ width, gridDimensionsUnchanged: true, flow: 'PASS', externalRequests: external.length, cartApiRequests: cartApi.length })
    await context.close()
  }
  await writeFile(resolve(dir, 'results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results))
} finally { await browser?.close() }
