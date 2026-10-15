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
import { chromium } from 'playwright'

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


test('stack builder: 360px and desktop, add/swap/remove, goal, save/restore, share and dose bars', { timeout: 60000 }, async () => {
  const rows = [
    { id: '20000000-0000-4000-8000-000000000001', name: 'Recorded creatine', category: 'creatine', retail_price: 20, servings_per_container: 100, nutrients: [{ nutrient_name: 'Creatine', amount: 3, unit: 'g' }] },
    { id: '20000000-0000-4000-8000-000000000002', name: 'Alternative creatine', category: 'creatine', retail_price: 10, servings_per_container: 100, nutrients: [{ nutrient_name: 'Creatine', amount: 3000, unit: 'mg' }] },
    { id: '20000000-0000-4000-8000-000000000003', name: 'Recorded pre-workout', category: 'pre-workout', retail_price: 30, servings_per_container: 30, nutrients: [{ nutrient_name: 'Creatine', amount: 2, unit: 'g' }, { nutrient_name: 'Caffeine', amount: 450, unit: 'mg' }] },
  ].map((row, index) => ({ ...row, brand: 'Fixture', serving_size: 5, serving_unit: 'g', buy_url: null, product_nutrients: row.nutrients,
    storeLinkMapping: { productId: row.id, shopifyProductHandle: `synthetic-${index}`, shopifyVariantId: String(1000 + index), active: true, approved: true,
      review: { approved: true, version: 'fixture', expectedVersion: 'fixture', verifiedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 600000 } } }))
  const server = createServer((req, res) => {
    const contents = { '/stack': ['text/html', html.replace('<body>', '<body data-theme="lab" style="--font-anton:Impact;--font-geist-sans:Arial;--font-geist-mono:monospace">')], '/fixture.js': ['text/javascript', bundle.outputFiles[0].contents], '/fixture.css': ['text/css', css] }[req.url]
    if (!contents) { res.writeHead(404); res.end(); return }
    res.setHeader('Content-Type', contents[0]); res.end(contents[1])
  })
  let browser
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const origin = `http://127.0.0.1:${server.address().port}`
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } })
    const errors = [], unexpected = []
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === origin) {
        if (url.pathname === '/api/products') return route.fulfill({ json: rows })
        if (url.pathname === '/api/products/batch') return route.fulfill({ json: rows.filter(row => url.searchParams.get('ids').split(',').includes(row.id)) })
        if (url.pathname === '/api/products/search') return route.fulfill({ json: rows.filter(row => row.name.toLowerCase().includes(url.searchParams.get('q').toLowerCase())) })
        if (['/stack', '/fixture.js', '/fixture.css'].includes(url.pathname)) return route.continue()
      }
      unexpected.push(url.href); return route.abort()
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin + '/stack')
    await page.getByText('Your stack is empty.', { exact: false }).waitFor()
    const add = async name => {
      await page.getByRole('button', { name: '+ Add an ingredient', exact: true }).click()
      await page.locator('#stack-add-list').getByRole('button').filter({ hasText: name }).click()
      await page.locator('.stack-slots h3').filter({ hasText: name }).waitFor()
    }
    await add('Recorded creatine')
    await page.getByRole('button', { name: 'Save stack', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Saved', exact: true }).count(), 1)
    const bookmark = await page.evaluate(() => JSON.parse(localStorage.getItem('tll-stack-v1')))
    assert.equal(bookmark.stack[0].id, rows[0].id)
    await page.getByRole('button', { name: 'Recovery', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Save stack', exact: true }).count(), 1)
    assert.equal(await page.locator('.stack-slots h3').count(), 1, 'goal fallback preserves current membership')
    await page.getByRole('button', { name: /Swap ·/ }).click()
    await page.locator('.stack-drawer').getByRole('button').filter({ hasText: 'Alternative creatine' }).click()
    await page.locator('.stack-slots h3').filter({ hasText: 'Alternative creatine' }).waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.stack-slot-head h3').length === 1)
    await add('Recorded pre-workout')
    await page.getByText('2 products contain creatine', { exact: true }).waitFor()
    await page.getByRole('img', { name: /Creatine: 5000 mg a day/ }).waitFor()
    assert.match(await page.locator('.stack-cost-figures').innerText(), /£1\.10/)
    await page.getByRole('img', { name: /Caffeine.*Above EFSA safe level/ }).waitFor()
    await page.getByRole('button', { name: 'Share my stack', exact: true }).click()
    const modal = page.getByRole('dialog')
    await modal.waitFor()
    assert.equal(await modal.getByRole('button', { name: 'Copy share link', exact: true }).isEnabled(), true)
    await page.keyboard.press('Escape')
    assert.equal(await modal.isVisible(), false)
    const layout = async width => {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${width}px has no overflow`)
      const short = await page.locator('.stack-builder button:visible,.stack-builder a:visible').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height < 43.9).map(node => node.textContent))
      assert.deepEqual(short, [], '44px interactive targets')
      await page.screenshot({ path: `/tmp/d-stack-${width}.png`, fullPage: true })
    }
    await layout(360)
    await layout(1280)
    // Save then remove provider keys to exercise bookmark-only guest recovery.
    await page.getByRole('button', { name: 'Save stack', exact: true }).click()
    await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key !== 'tll-stack-v1') localStorage.removeItem(key) })
    await page.reload()
    await page.locator('.stack-slots h3').filter({ hasText: 'Recorded pre-workout' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Recovery', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor()
    await page.locator('.stack-slots article').filter({ has: page.getByRole('heading', { name: 'Recorded pre-workout', exact: true }) }).getByRole('button', { name: 'Remove', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.stack-slot-head h3').length === 1)
    assert.deepEqual(errors, [])
    assert.deepEqual(unexpected, [])
  } finally { await browser?.close(); if (server.listening) await new Promise(done => server.close(done)) }
})
