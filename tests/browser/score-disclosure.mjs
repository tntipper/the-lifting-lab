import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const bundle = await build({
  stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
    import Badge from './components/ShopScoreBadge';
    createRoot(document.getElementById('root')).render(<><Badge product={{id:'738af0c5-bdfd-46be-890e-bd2d6e7cb21b'}}/><button>Next</button></>);`,
    resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, jsx: 'automatic', outdir: '/tmp/pr99-score-disclosure', format: 'iife',
  define: { 'process.env.NODE_ENV': '"development"' },
})
assert.doesNotMatch(bundle.outputFiles.find(file => file.path.endsWith('.js')).text, /\bprocess\.env\b/,
  'Browser fixture must inline every environment read')
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ hasTouch: true })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://score.test/', route => route.fulfill({ contentType: 'text/html',
    body: '<div id="root"></div>' }))
  await page.goto('https://score.test/')
  await page.addStyleTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.css')).text })
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text })
  const button = page.getByRole('button', { name: 'TLL Label Score: 79 out of 100 Dose & label check', exact: true })
  const region = page.getByRole('region', { name: 'TLL Label Score: 79 out of 100 Dose & label check', exact: true })
  await button.focus()
  assert.equal(await button.getAttribute('aria-expanded'), 'false')
  await page.keyboard.press('Enter')
  await region.waitFor()
  assert.equal(await button.getAttribute('aria-expanded'), 'true')
  assert.equal(await button.getAttribute('aria-controls'), await region.getAttribute('id'))
  assert.equal(await region.getAttribute('aria-labelledby'), await button.getAttribute('id'))
  await page.keyboard.press('Tab')
  assert.equal(await region.getByRole('link', { name: 'How we score' }).evaluate(el => el === document.activeElement), true)
  await page.mouse.move(900, 700)
  assert.equal(await region.isVisible(), true)
  await page.keyboard.press('Escape')
  assert.equal(await button.getAttribute('aria-expanded'), 'false')
  assert.equal(await button.evaluate(el => el === document.activeElement), true)
  await page.keyboard.press('Space')
  assert.equal(await region.isVisible(), true)
  await page.keyboard.press('Space')
  assert.equal(await button.getAttribute('aria-expanded'), 'false')
  await button.tap()
  assert.equal(await region.isVisible(), true)
  await button.tap()
  assert.equal(await button.getAttribute('aria-expanded'), 'false')
  await button.click()
  await page.getByRole('button', { name: 'Next', exact: true }).focus()
  assert.equal(await button.getAttribute('aria-expanded'), 'false')
  assert.deepEqual(errors, [])
  console.log('PASS: score disclosure Enter/Space, tap/click, focused links, Escape focus restoration and accessible name')
} finally {
  await browser.close()
}
