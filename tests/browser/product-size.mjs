// Offline keyboard test: bundle real picker + selection projection, no HTTP server or DB.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'
const result = await build({ stdin: { contents: `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import Picker from './components/ProductSizePicker';
  import { PREVIEW_SIZE_OPTIONS, productForSize, selectProductSize } from './lib/commerce/size-selection';
  const options = PREVIEW_SIZE_OPTIONS['1fab2546-6a25-4fd9-8e49-abf6bb6b362c'];
  function Fixture() {
    const [slug, setSlug] = useState(selectProductSize(options, '?size=single-bar').slug);
    const selected = options.find(o => o.slug === slug);
    const product = productForSize({ brand: 'Warrior', name: 'Crunch', nutrients: [] }, selected);
    return <><Picker options={options} selected={selected} onChange={setSlug}/>
      <output aria-label="Price">{product.retail_price.toFixed(2)}</output>
      <output aria-label="Servings">{product.servings_per_container}</output></>;
  }
  createRoot(document.getElementById('root')).render(<Fixture/>);
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' } })
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) })
try {
  const page = await browser.newPage()
  await page.route('**/*', route => route.abort())
  await page.setContent('<div id="root"></div>')
  await page.addScriptTag({ content: result.outputFiles[0].text })
  const picker = page.getByLabel('Size', { exact: true })
  await picker.waitFor()
  assert.equal(await picker.inputValue(), 'single-bar')
  await picker.focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  assert.equal(await picker.inputValue(), '12-pack')
  assert.equal(await page.getByLabel('Price').textContent(), '23.99')
  assert.equal(await page.getByLabel('Servings').textContent(), '12')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  assert.equal(await picker.inputValue(), 'single-bar')
  assert.equal(await page.getByLabel('Price').textContent(), '2.00')
  console.log('Native Size keyboard selection: PASS')
} finally { await browser.close() }
