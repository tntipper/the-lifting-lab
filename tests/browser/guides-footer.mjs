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
  define: { 'process.env.NODE_ENV': '"development"',
    'process.env.NEXT_PUBLIC_TLL_ENVIRONMENT': '"local-browser-fixture"',
    'process.env.NEXT_PUBLIC_TLL_STAGING_CUSTOMER': '""',
    'process.env.NEXT_PUBLIC_AMAZON_TAG': '"theliftinglab-21"', 'process.env.NEXT_PUBLIC_TLL_STORE_LINKS': '"enabled"', 'process.env.NEXT_PUBLIC_TLL_STORE_PRICES': '""' },
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
assert.doesNotMatch(js, /\bprocess\.env\b/, 'Browser fixture must inline every environment read')
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
    const analytics = page.locator('footer nav[aria-label="Legal"]').getByRole('button', { name: 'Analytics preferences', exact: true })
    await analytics.waitFor()
    assert.equal(await page.locator('header').getByRole('button', { name: 'Analytics preferences' }).count(), 0)
    assert.equal(await page.locator('footer #analytics-preferences').count(), 0)
    assert.equal(await analytics.getAttribute('aria-expanded'), 'false')
    assert.equal(await page.locator('#analytics-preferences').evaluate(el => getComputedStyle(el).position), 'fixed')
    await page.getByRole('button', { name: 'Reject analytics', exact: true }).click()
    await analytics.click()
    assert.equal(await page.getByRole('heading', { name: 'Optional analytics' }).evaluate(el => document.activeElement === el), true)
    await page.getByRole('button', { name: 'Close preferences' }).click()
    assert.equal(await analytics.evaluate(el => document.activeElement === el), true)
    assert.equal(await page.getByRole('link', { name: 'View 2 more label rows for Fixture Unchanged name', exact: true }).getAttribute('href'), '/products/fixture')
    assert.equal(await page.locator('main > div:first-child article').last().locator('dl > div').count(), 3)
    const certification = page.getByRole('button', { name: 'Informed Sport certified', exact: true }).first()
    await certification.waitFor()
    const certificationPanel = page.locator(`[id="${await certification.getAttribute('aria-controls')}"]`)
    const beforeCertification = await page.locator('main > div:first-child article').evaluateAll(els => els.map(el => el.getBoundingClientRect().height))
    assert.equal(beforeCertification[0], beforeCertification[1])
    if (width < 768) await certification.tap(); else await certification.hover()
    assert.equal(await certificationPanel.isVisible(), true)
    assert.equal(await certificationPanel.getByRole('link').getAttribute('href'), 'https://example.com/certification')
    assert.deepEqual(await page.locator('main > div:first-child article').evaluateAll(els => els.map(el => el.getBoundingClientRect().height)), beforeCertification)
    await page.keyboard.press('Escape')
    assert.equal(await certificationPanel.isVisible(), false)
    if (width < 768) await certification.tap(); else { await certification.hover(); await certification.click() }
    assert.equal(await certificationPanel.isVisible(), true)
    if (width < 768) await page.locator('main h1').first().tap(); else await page.locator('main h1').first().click()
    assert.equal(await certificationPanel.isVisible(), false)
    await certification.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape')
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
    await page.keyboard.press('Escape')
    assert.equal(await panel.isVisible(), false)
    if (width < 768) await icon.tap(); else { await icon.hover(); await icon.click() }
    assert.equal(await panel.isVisible(), true)
    if (width < 768) await page.locator('main h1').first().tap(); else await page.locator('main h1').first().click()
    assert.equal(await panel.isVisible(), false)
    await icon.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape')
    assert.equal(await panel.isVisible(), false)
    await page.keyboard.press('Enter'); assert.equal(await panel.isVisible(), true)
    assert.notEqual(await icon.evaluate(el => getComputedStyle(el).outlineStyle), 'none')
    await page.keyboard.press('Escape'); await page.keyboard.press('Space')
    assert.equal(await panel.isVisible(), true)
    await page.keyboard.press('Escape')
    const cards = page.locator('main > div:first-child article')
    const heights = await cards.evaluateAll(elements => elements.map(el => el.getBoundingClientRect().height))
    assert.equal(heights[0], heights[1], `equal cards at ${width}`)
    const coming = page.getByRole('button', { name: 'Coming soon', exact: true })
    assert.equal(await coming.isDisabled(), true)
    assert.equal(await coming.evaluate(el => getComputedStyle(el).opacity), '0.55')
    assert.equal(await coming.evaluate(el => getComputedStyle(el).cursor), 'not-allowed')
    assert.ok(await certification.evaluate(el => el.getBoundingClientRect().height >= 32 && el.getBoundingClientRect().width >= 32))
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
    const tableIcon = page.locator('[data-table-fixture]').getByRole('button', { name: 'Informed Sport certified', exact: true })
    await tableIcon.click()
    const tablePanel = page.locator(`[id="${await tableIcon.getAttribute('aria-controls')}"]`)
    assert.equal(await tablePanel.isVisible(), true)
    assert.equal(await tablePanel.evaluate(el => {
      const rect = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 2))
    }), true, 'last table row popup is not clipped')
    await page.keyboard.press('Escape')
    if (width < 768) {
      const list = page.getByRole('navigation', { name: 'Research links' }).locator('ul')
      assert.equal(await list.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2)
      assert.equal(await list.locator('a').evaluateAll(els => els.every(el => el.getBoundingClientRect().height >= 32)), true)
      const compactHeight = await page.locator('footer').evaluate(el => el.getBoundingClientRect().height)
      const oldLayout = await page.addStyleTag({ content: '.tll-footer-columns{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.tll-footer-columns ul{grid-template-columns:1fr}.tll-footer nav a{min-height:44px}.tll-footer-inner{padding:24px 24px 16px;gap:16px}' })
      const oldHeight = await page.locator('footer').evaluate(el => el.getBoundingClientRect().height)
      assert.ok(oldHeight - compactHeight >= 100, `footer should save at least 100px: ${oldHeight} -> ${compactHeight}`)
      await oldLayout.evaluate(el => el.remove())
    }
    assert.equal(await page.locator('footer a[href="/guide"]').isVisible(), true)
    assert.match(await page.locator('footer').textContent(), /THE LIFTING LAB LTD · Company no\. 17497631/)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`)
    assert.deepEqual(errors, [])
    console.log(`PASS ${width}px: guidance hover/tap/keyboard/Escape, equal card/button dimensions, Guides navigation/footer, no overflow`)
    await context.close()
  }
} finally { await browser.close() }
