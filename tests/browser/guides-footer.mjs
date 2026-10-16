import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { chromium } from 'playwright'

const root = process.cwd()
const bundle = await build({ entryPoints: ['tests/browser/guides-footer-fixture.tsx'], bundle: true, write: false,
  outdir: '/tmp/tll-guides-browser', platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_TLL_STORE_LINKS': '"enabled"', 'process.env.NEXT_PUBLIC_TLL_STORE_PRICES': '""' },
  plugins: [{ name: 'local-fixture', setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$|(?:^|\/)(?:LocalStackContext|StagingCartContext|ShopPanelsContext|StagingCartActions)$|^@\/lib\/supabase$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', resolveDir: root, contents:
      args.path === 'next/link' ? 'import React from "react";export default props => <a {...props}/>' :
      args.path === 'next/navigation' ? 'export const usePathname=()=>"/products";export const useSearchParams=()=>new URLSearchParams()' :
      args.path.endsWith('LocalStackContext') ? 'export const useLocalStack=()=>({stack:[]})' :
      args.path.endsWith('StagingCartContext') ? 'export const useStagingCart=()=>null' :
      args.path.endsWith('StagingCartActions') ? 'export const StagingCartAdd=()=>null' :
      args.path.endsWith('ShopPanelsContext') ? 'export const useShopPanels=()=>({basket:[],openBasket(){},openStack(){}})' :
      'export const createClient=()=>({auth:{getUser:async()=>({data:{user:null}})}})',
    }))
  } }],
})
const globals = (await postcss([tailwind()]).process(await readFile('app/globals.css', 'utf8'), { from: resolve(root, 'app/globals.css') })).css
const css = globals + '\n' + bundle.outputFiles.find(file => file.path.endsWith('.css')).text
const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text
const origin = 'http://tll-fixture.test'
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="fixture"></div><script src="/fixture.js"></script></body></html>'
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) })
try {
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 768, isMobile: width < 768 })
    const page = await context.newPage()
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
      const url = route.request().url()
      if (url === `${origin}/fixture.js`) return route.fulfill({ contentType: 'text/javascript', body: js })
      if (url === `${origin}/fixture.css`) return route.fulfill({ contentType: 'text/css', body: css })
      if (url === `${origin}/`) return route.fulfill({ contentType: 'text/html', body: html })
      return route.abort()
    })
    await page.goto(origin)
    const certification = page.getByRole('button', { name: 'Informed Sport certified', exact: true })
    await certification.waitFor()
    const certificationPanel = page.locator(`[id="${await certification.getAttribute('aria-controls')}"]`)
    const beforeCertification = await page.locator('main article').evaluateAll(els => els.map(el => el.getBoundingClientRect().height))
    assert.equal(beforeCertification[0], beforeCertification[1])
    if (width < 768) await certification.tap(); else await certification.hover()
    assert.equal(await certificationPanel.isVisible(), true)
    assert.equal(await certificationPanel.getByRole('link').getAttribute('href'), 'https://example.com/certification')
    assert.deepEqual(await page.locator('main article').evaluateAll(els => els.map(el => el.getBoundingClientRect().height)), beforeCertification)
    await certification.focus(); await page.keyboard.press('Escape')
    assert.equal(await certificationPanel.isVisible(), false)
    await page.keyboard.press('Enter'); assert.equal(await certificationPanel.isVisible(), true)
    await page.keyboard.press('Escape'); await page.keyboard.press('Space')
    assert.equal(await certificationPanel.isVisible(), true)
    await page.keyboard.press('Escape')
    const icon = page.getByRole('button', { name: 'Above EFSA single-dose guidance' }).first()
    await icon.waitFor()
    const panel = page.locator(`[id="${await icon.getAttribute('aria-controls')}"]`)
    assert.equal(await panel.isVisible(), false)
    if (width < 768) await icon.tap(); else await icon.hover()
    assert.equal(await icon.getAttribute('aria-expanded'), 'true')
    assert.equal(await panel.isVisible(), true)
    assert.match(await panel.textContent(), /Caffeine 250 mg per serving\. EFSA single-dose guidance for healthy adults is 200 mg from all sources\./)
    assert.equal(await panel.getByRole('link', { name: 'Source ↗' }).getAttribute('href'), 'https://www.efsa.europa.eu/en/topics/topic/caffeine')
    await panel.getByRole('link').hover()
    assert.equal(await panel.isVisible(), true)
    await icon.focus(); await page.keyboard.press('Escape')
    assert.equal(await panel.isVisible(), false)
    await page.keyboard.press('Enter'); assert.equal(await panel.isVisible(), true)
    assert.notEqual(await icon.evaluate(el => getComputedStyle(el).outlineStyle), 'none')
    await page.keyboard.press('Escape'); await page.keyboard.press('Space')
    assert.equal(await panel.isVisible(), true)
    await page.keyboard.press('Escape')
    const cards = page.locator('main article')
    const heights = await cards.evaluateAll(elements => elements.map(el => el.getBoundingClientRect().height))
    assert.equal(heights[0], heights[1], `equal cards at ${width}`)
    const coming = page.getByRole('button', { name: 'Coming soon', exact: true })
    assert.equal(await coming.isDisabled(), true)
    const buy = page.getByRole('link', { name: /Buy at TLL Store/ })
    assert.equal(await coming.getAttribute('class'), await buy.getAttribute('class'))
    const rect = el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })
    const comingRect = await coming.evaluate(rect), buyRect = await buy.evaluate(rect)
    assert.ok(Math.abs(comingRect.width - buyRect.width) < .1 && comingRect.height === buyRect.height)
    assert.equal(await page.locator('header nav[aria-label="Shop categories"] a[href="/guide"]').count(), 1)
    if (width < 1280) {
      await page.getByRole('button', { name: 'Open navigation' }).click()
      assert.equal(await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Guides', exact: true }).isVisible(), true)
    }
    assert.equal(await page.locator('footer a[href="/guide"]').isVisible(), true)
    assert.match(await page.locator('footer').textContent(), /THE LIFTING LAB LTD · Company no\. 17497631/)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`)
    assert.deepEqual(errors, [])
    console.log(`PASS ${width}px: guidance hover/tap/keyboard/Escape, equal card/button dimensions, Guides navigation/footer, no overflow`)
    await context.close()
  }
} finally { await browser.close() }
