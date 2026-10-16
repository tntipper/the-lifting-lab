import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const root = resolve(import.meta.dirname, '../..'), dir = resolve(root, 'test-results/live-cart')
await mkdir(dir, { recursive: true })
const bundles = {}
for (const mode of ['live', 'default']) {
  const options = { absWorkingDir: root, entryPoints: ['tests/browser/live-cart-fixture.tsx'], outdir: 'out', bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_TLL_LIVE_CART': JSON.stringify(mode === 'live' ? 'enabled' : ''),
      'process.env.NEXT_PUBLIC_TLL_ENVIRONMENT': '"production"', 'process.env.NEXT_PUBLIC_TLL_STORE_LINKS': '""', 'process.env.NEXT_PUBLIC_TLL_STORE_PRICES': '"enabled"', 'process.env.NEXT_PUBLIC_TLL_STACK_CART': '""',
      'process.env.NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART': '""', 'process.env.NEXT_PUBLIC_TLL_STAGING_CUSTOMER': '""', 'process.env.NEXT_PUBLIC_AMAZON_TAG': '""' },
    plugins: [{ name: 'local-boundaries', setup(builder) {
      builder.onResolve({ filter: /^next\/(link|navigation)$|^@\/lib\/supabase$/ }, args => ({ path: args.path, namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', resolveDir: root, contents: args.path === 'next/link'
        ? 'import React from "react";export default function Link(props){return <a {...props}/>}'
        : args.path === 'next/navigation' ? 'const params=new URLSearchParams();export const useRouter=()=>({push:href=>{window.location.href=href}});export const useSearchParams=()=>params;export const usePathname=()=>"/";'
          : 'export const createClient=()=>({auth:{getUser:async()=>({data:{user:null}})}});' }))
    } }],
  }
  const result = await build(options)
  const server = await build({ ...options, entryPoints: undefined, stdin: { contents: `import React from 'react'; import { renderToString } from 'react-dom/server'; import { Fixture } from './tests/browser/live-cart-fixture'; export const render = pathname => renderToString(React.createElement(React.StrictMode, null, React.createElement(Fixture, { pathname })));`, resolveDir: root, loader: 'tsx' }, platform: 'node', format: 'cjs', packages: 'external' })
  const mod = { exports: {} }
  vm.runInNewContext(server.outputFiles.find(file => file.path.endsWith('.js')).text, { module: mod, exports: mod.exports, require: createRequire(resolve(root, 'package.json')), process, console, URL, URLSearchParams })
  bundles[mode] = { render: mod.exports.render, js: result.outputFiles.find(file => file.path.endsWith('.js')).contents, css: result.outputFiles.find(file => file.path.endsWith('.css')).contents }
}
for (const mode of ['live', 'default']) {
  assert.match(bundles[mode].render('/'), /data-product-id="5"/)
  assert.match(bundles[mode].render('/cart'), /Your basket is empty|data-live-offer-shell|<main/)
}
console.log('Server-rendered live/default fixtures: PASS')
const css = (await postcss([tailwind()]).process(await readFile(resolve(root, 'app/globals.css'), 'utf8'), { from: resolve(root, 'app/globals.css') })).css
const origin = 'http://live-cart.test'
function fixtureResponse(raw) {
  const url = new URL(raw), mode = url.searchParams.get('mode') === 'default' ? 'default' : 'live'
  if (url.pathname === '/fixture.js') return { contentType: 'text/javascript', body: Buffer.from(bundles[mode].js) }
  if (url.pathname === '/fixture.css') return { contentType: 'text/css', body: css + '\n' + Buffer.from(bundles[mode].css) }
  if (url.pathname.startsWith('/api/')) return { contentType: 'application/json', body: '{}' }
  return { contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css?mode=${mode}"></head><body><div id="fixture">${bundles[mode].render(url.pathname)}</div><script src="/fixture.js?mode=${mode}"></script></body></html>` }
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
    // A JS-disabled context measures the actual server/pre-hydration markup.
    const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 1000 } })
    await staticContext.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) { external.push(url.href); return route.abort() }
      return route.fulfill(fixtureResponse(url.href))
    })
    const staticPage = await staticContext.newPage()
    const staticDimensions = () => staticPage.locator('article[data-product-id]').evaluateAll(cards => cards.map(card => ({ id: card.dataset.productId, width: card.getBoundingClientRect().width, height: card.getBoundingClientRect().height })))
    await staticPage.goto(origin)
    const serverLive = await staticDimensions()
    const equalCards = cards => cards.every(card => card.width === cards[0].width && card.height === cards[0].height)
    assert.equal(equalCards(serverLive), true, `all server live cards equal at ${width}`)
    await staticContext.close()
    await page.goto(origin); await page.locator('[data-offer-state=live_basket]').first().waitFor()
    const fallback = page.getByRole('region', { name: 'Store fallback' }).getByRole('link', { name: /Buy at/ })
    assert.equal(new URL(await fallback.getAttribute('href')).pathname, '/products/fixture')
    assert.equal(new URL(await fallback.getAttribute('href')).searchParams.get('ref'), 'theliftinglab')
    for (const id of ['4', '5']) {
      const linkCard = page.locator(`article[data-product-id="${id}"]`)
      assert.equal(await linkCard.getByRole('button', { name: 'Add to basket', exact: true }).count(), 0)
      await linkCard.getByRole('link', { name: /Buy at TLL Store for/ }).waitFor()
    }
    const after = await dimensions()
    assert.equal(equalCards(after), true, `all mounted live cards equal at ${width}`)
    assert.deepEqual(after, serverLive, `live dimensions equal before/after hydration at ${width}`)
    for (const action of await page.locator('article[data-product-id] [data-live-offer-shell] a, article[data-product-id] [data-live-offer-shell] button').all()) {
      assert.ok((await action.boundingBox()).height >= 44, `44px live action at ${width}`)
    }
    assert.equal(await page.locator('article[data-product-id] [data-offer-state]').count(), after.length)
    for (const row of await page.locator('[data-compact-placement]').all()) {
      assert.equal(await row.locator('select, button').count(), 0)
      const link = row.getByRole('link', { name: /Buy at TLL Store for/ })
      assert.match(await link.getAttribute('href'), /products\/fixture\?variant=4001&/)
      const bounds = await link.boundingBox()
      assert.ok(bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= width, `compact link fits at ${width}`)
    }
    await page.screenshot({ path: resolve(dir, `${width}-offers.png`), fullPage: true })
    assert.equal(await page.getByRole('region', { name: 'Unmapped', exact: true }).getByRole('button').count(), 0)
    assert.equal(await page.locator('article[data-product-id="3"]').getByRole('button', { name: 'Add to basket', exact: true }).count(), 0)
    const card = page.locator('article[data-product-id="1"]')
    await card.getByRole('button', { name: 'Add to basket', exact: true }).click()
    await card.getByRole('status').filter({ hasText: 'Added to basket' }).waitFor()
    assert.deepEqual(await dimensions(), after, `card notice preserves dimensions at ${width}`)
    const contrast = await card.locator('[data-offer-state=live_basket]').evaluate(el => {
      const button = el.querySelector('button').getBoundingClientRect()
      const lines = [el.lastElementChild].map(line => line.getBoundingClientRect())
      return lines.every(line => line.bottom <= button.top + 0.5 || line.top >= button.bottom - 0.5)
        && getComputedStyle(el.querySelector('[role=status]')).pointerEvents === 'none'
    })
    assert.equal(contrast, true, `stock/status remain outside dark button at ${width}`)
    const contained = await card.locator('[data-offer-state=live_basket]').evaluate(el => {
      const bounds = el.getBoundingClientRect(), button = el.querySelector('button').getBoundingClientRect()
      return button.top >= bounds.top && button.bottom <= bounds.bottom && button.right <= bounds.right
    })
    assert.equal(contained, true, `live action stays within original area at ${width}`)
    await page.evaluate(() => { localStorage.removeItem('tll.live-basket.v1'); window.dispatchEvent(new Event('tll-live-basket-changed')) })
    const selected = page.getByRole('region', { name: 'Selected product' })
    await selected.getByLabel('Flavour / size', { exact: true }).selectOption('1002')
    await selected.getByRole('combobox', { name: /Pack quantity/ }).selectOption('3')
    await selected.getByRole('button', { name: 'Add to basket', exact: true }).click()
    await page.getByRole('link', { name: 'Basket, 3 items', exact: true }).waitFor()
    assert.equal(await selected.getByRole('status', { name: 'Added to basket' }).evaluate(el => el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow !== 'ellipsis'), false)
    assert.deepEqual(await dimensions(), after, `status preserves tile dimensions at ${width}`)
    await selected.getByLabel('Flavour / size', { exact: true }).selectOption('1003')
    assert.equal(await selected.getByRole('button').count(), 0)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tll.live-basket.v1')))
    assert.equal(saved.campaign, 'compare')
    assert.deepEqual(Object.keys(saved.lines[0]).sort(), ['brand', 'id', 'name', 'quantity', 'shownPrice', 'variantId', 'variantLabel'])
    await page.reload(); await page.getByRole('link', { name: 'Basket, 3 items', exact: true }).waitFor()
    const stack = page.getByRole('link', { name: 'Buy my stack', exact: true })
    assert.match(await stack.getAttribute('href'), /\/cart\/2001:2\?utm_source=theliftinglab&utm_medium=referral&utm_campaign=stack&ref=theliftinglab$/)
    await page.getByRole('link', { name: 'Basket, 3 items', exact: true }).click()
    const checkout = page.getByRole('link', { name: 'Checkout', exact: true }); await checkout.waitFor()
    assert.match(await checkout.getAttribute('href'), /\/cart\/1002:3\?utm_source=theliftinglab&utm_medium=referral&utm_campaign=compare&ref=theliftinglab$/)
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
    results.push({ width, liveCardsEqual: true, minimumActionHeight: 44, preHydrationDimensionsUnchanged: true, compactLinksFit: true, flow: 'PASS', externalRequests: external.length, cartApiRequests: cartApi.length })
    await context.close()
  }
  await writeFile(resolve(dir, 'results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results))
} finally { await browser?.close() }
