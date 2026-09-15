import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { chromium } from 'playwright'
import { verifyShareResults, verifyWizard } from './journeys.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const resultDir = resolve(root, 'test-results/accessibility')
await mkdir(resultDir, { recursive: true })
const bundle = await build({
  absWorkingDir: root, entryPoints: ['tests/browser/accessibility-fixture.tsx'],
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'isolated-provider-adapters', setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$|^@\/lib\/supabase$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
      loader: 'jsx', resolveDir: root,
      contents: args.path === 'next/link'
        ? 'import React from "react"; export default function Link(props){ return <a {...props}/> }'
        : args.path === 'next/navigation'
          ? 'export const usePathname = () => "/products";'
          : 'export const createClient = () => ({auth:{getUser:async()=>({data:{user:null}})}});',
    }))
  } }],
})
const css = (await postcss([tailwind()]).process(await readFile(resolve(root, 'app/globals.css'), 'utf8'), { from: resolve(root, 'app/globals.css') })).css
const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="fixture"></div><script src="/fixture.js"></script></body></html>'
const server = createServer((req, res) => {
  if (req.url === '/' || req.url === '/wizard') { res.setHeader('Content-Type', 'text/html'); res.end(html) }
  else if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents) }
  else if (req.url === '/fixture.css') { res.setHeader('Content-Type', 'text/css'); res.end(css) }
  else { res.statusCode = 404; res.end() }
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) })
const results = []
try {
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      return url.origin === origin && ['/', '/wizard', '/fixture.js', '/fixture.css'].includes(url.pathname)
        ? route.continue() : route.abort()
    })
    await page.goto(origin)
    await page.getByRole('link', { name: 'Sign In', exact: true }).waitFor()
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
    assert.ok(dimensions.scrollWidth <= width + 1, `Header overflows ${width}px: ${dimensions.scrollWidth}`)
    for (const name of ['Sign In', 'THE LIFTINGLAB']) {
      const box = await page.getByRole('link', { name, exact: true }).boundingBox()
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, `Header ${name} clipped at ${width}`)
    }
    if (width < 1280) {
      const trigger = page.locator('header button[aria-controls]')
      await trigger.focus(); await page.keyboard.press('Enter')
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
      await page.getByRole('link', { name: 'Browse', exact: true }).focus()
      await page.keyboard.press('Escape')
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true)
    }
    // The original bug exposed the hidden drawer's Close button after the footer.
    await page.getByRole('link', { name: 'Footer end' }).focus()
    await page.keyboard.press('Tab')
    assert.equal(await page.getByRole('button', { name: 'My Stack', exact: true }).evaluate(element => element === document.activeElement), true)
    assert.equal(await page.getByRole('dialog').count(), 0)

    await page.getByRole('button', { name: 'Add synthetic product' }).click()
    for (const [triggerName, dialogName, closeName] of [
      ['My Stack', 'My Stack', 'Close My Stack'],
      ['ⓘ How we score', 'How We Score', 'Close scoring explanation'],
      ['Open share fixture', 'Share & earn 25 pts', 'Close share dialog'],
    ]) {
      const trigger = page.getByRole('button', { name: triggerName, exact: true })
      await trigger.focus(); await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: dialogName, exact: true })
      await dialog.waitFor()
      const closer = page.getByRole('button', { name: closeName })
      assert.equal(await closer.evaluate(element => element === document.activeElement), true)
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
      for (let index = 0; index < 24; index++) {
        await page.keyboard.press(index < 12 ? 'Tab' : 'Shift+Tab')
        assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, `${dialogName} focus escaped`)
      }
      const box = await dialog.boundingBox()
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.height <= 951)
      await page.screenshot({ path: resolve(resultDir, `${width}-${closeName.replaceAll(' ', '-').toLowerCase()}.png`) })
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true)
      assert.equal(await page.evaluate(() => document.body.style.overflow), '')
      // Repeat opening under StrictMode: a queued prior close must not dismiss it.
      await page.keyboard.press('Enter'); await dialog.waitFor()
      await closer.click(); await dialog.waitFor({ state: 'hidden' })
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true)
    }
    await page.getByRole('button', { name: 'My Stack', exact: true }).click()
    await page.getByRole('button', { name: /Remove Synthetic product/ }).click()
    assert.equal(await page.getByRole('button', { name: 'Close My Stack' }).evaluate(element => element === document.activeElement), true)
    assert.equal(await page.getByRole('dialog').getByText('No supplements in your stack yet.').count(), 1)
    await page.keyboard.press('Escape')
    await verifyShareResults(page)
    await verifyWizard(page, origin, width, resultDir)
    assert.deepEqual(errors, [], 'Fixture browser raised an uncaught error')
    results.push({ width, overflow: false, closedDrawerUnfocusable: true, dialogs: 3, keyboard: 'pass', shareResults: 'busy/success/zero/http-error/network-error', wizard: 'focus/budget/eligibility/long-names' })
    await page.close()
  }
} finally {
  await browser.close()
  server.closeAllConnections(); await new Promise(resolvePromise => server.close(resolvePromise))
}
await writeFile(resolve(resultDir, 'results.json'), JSON.stringify({
  scope: 'Actual React components and Tailwind CSS in Chromium. Router/provider adapters and synthetic local stack only. No provider calls, shares, purchases or customer emails. Viewport reflow is not native browser zoom or a screen-reader certification.',
  results,
}, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
