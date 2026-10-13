// Offline keyboard test: bundle real picker + selection projection, no HTTP server or DB.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'
const result = await build({ stdin: { contents: `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import Picker from './components/ProductSizePicker';
  import { PREVIEW_SIZE_OPTIONS, productForSize, selectProductSize, sizeSelectionUrl } from './lib/commerce/size-selection';
  const options = PREVIEW_SIZE_OPTIONS['1fab2546-6a25-4fd9-8e49-abf6bb6b362c'];
  function Fixture() {
    const [slug, setSlug] = useState(selectProductSize(options, window.location.search).slug);
    const selected = options.find(o => o.slug === slug);
    const product = productForSize({ brand: 'Warrior', name: 'Crunch', nutrients: [] }, selected);
    function changeSize(slug) {
      setSlug(slug);
      window.history.replaceState(null, '', sizeSelectionUrl(window.location.href, slug));
    }
    return <><Picker options={options} selected={selected} price={product.retail_price} onChange={changeSize}/>
      <output aria-label="Price">{product.retail_price.toFixed(2)}</output>
      <output aria-label="Servings">{product.servings_per_container}</output></>;
  }
  createRoot(document.getElementById('root')).render(<Fixture/>);
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' } })
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  // Fulfil a synthetic URL locally so real location/history behaviour is tested.
  await page.route('**/*', route => route.request().isNavigationRequest() && new URL(route.request().url()).hostname === 'size-fixture.test'
    ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort())
  await page.goto('https://size-fixture.test/products/fixture?size=single-bar&ref=test#buy')
  await page.addScriptTag({ content: result.outputFiles[0].text })
  const picker = page.getByLabel('Size', { exact: true })
  await picker.waitFor()
  assert.equal(await picker.inputValue(), 'single-bar')
  const statusId = await picker.getAttribute('aria-describedby')
  const status = page.locator(`[id="${statusId}"]`)
  assert.equal(await status.getAttribute('aria-live'), 'polite')
  assert.match(await status.textContent(), /£2.00/)
  await picker.focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelector('select').value === '12-pack')
  assert.equal(await picker.inputValue(), '12-pack')
  await page.waitForFunction(() => document.querySelector('output[aria-label="Price"]').textContent === '23.99')
  assert.equal(await page.getByLabel('Price').textContent(), '23.99')
  assert.match(await status.textContent(), /£23.99/)
  assert.equal(new URL(page.url()).searchParams.get('size'), '12-pack')
  assert.equal(new URL(page.url()).searchParams.get('ref'), 'test')
  assert.equal(new URL(page.url()).hash, '#buy')
  assert.equal(await page.getByLabel('Servings').textContent(), '12')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  assert.equal(await picker.inputValue(), 'single-bar')
  await page.waitForFunction(() => document.querySelector('output[aria-label="Price"]').textContent === '2.00')
  assert.equal(await page.getByLabel('Price').textContent(), '2.00')
  assert.match(await status.textContent(), /£2.00/)
  assert.equal(new URL(page.url()).searchParams.get('size'), 'single-bar')
  assert.deepEqual(errors, [])
  console.log('Native Size keyboard selection: PASS')
} finally { await browser.close() }
