import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../../', import.meta.url))
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  stdin: { resolveDir: root, loader: 'tsx', contents: `
    import { createRoot } from 'react-dom/client';
    import CompareView from './app/compare/CompareView';
    const products = [1,2,3].map(n => ({id:String(n),brand:'Synthetic',name:'Long readable comparison product '+n,
      category:'creatine',score:null,image_url:null,buy_url:null,cost_per_serving:1,retail_price:20,
      servings_per_container:20,serving_size:5,serving_unit:'g',informed_sport:false,proprietary_blend:false,
      amino_spiked:false,protein_yield:null,nutrients:[{nutrient_name:'creatine',amount:5000,unit:'mg'}]}));
    createRoot(document.getElementById('fixture')).render(<main className="p-4"><CompareView products={products}/></main>);
  ` },
  define: { 'process.env': '{}', 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_TLL_ENVIRONMENT': '"local-browser-fixture"' },
  plugins: [{ name: 'isolated-framework', setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$|^@\/lib\/supabase$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', resolveDir: root,
      contents: args.path === 'next/link' ? 'import React from "react"; export default function Link(props){return <a {...props}/>;}'
        : args.path === 'next/navigation' ? 'export const usePathname=()=>"/compare"; export const useRouter=()=>({});'
          : 'export const createClient=()=>{throw new Error("No provider access in comparison fixture")};',
    }))
  } }],
})
const css = (await postcss([tailwind()]).process(await readFile(resolve(root, 'app/globals.css'), 'utf8'), { from: resolve(root, 'app/globals.css') })).css
const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="fixture"></div><script src="/fixture.js"></script></body></html>'
const server = createServer((req, res) => {
  const body = req.url === '/' ? html : req.url === '/fixture.js' ? bundle.outputFiles[0].contents : req.url === '/fixture.css' ? css : null
  res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : req.url === '/fixture.css' ? 'text/css' : 'text/html')
  res.statusCode = body === null ? 404 : 200
  res.end(body)
})
let browser
try {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true })
  const resultDir = resolve(root, 'test-results/comparison-reconciliation')
  await mkdir(resultDir, { recursive: true })
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: 'reduce' })
    const errors = [], outbound = []
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue()
      outbound.push(route.request().url())
      return route.abort()
    })
    await page.goto(origin)
    const region = page.getByRole('region', { name: 'Product comparison' })
    await region.waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Page overflow at ${width}`)
    assert.equal(await region.getAttribute('aria-describedby'), 'comparison-scroll-hint')
    if (width < 768) {
      assert.ok(await page.locator('#comparison-scroll-hint').isVisible())
      await region.focus()
      assert.ok(await region.evaluate(element => element === document.activeElement))
      await page.keyboard.press('ArrowRight')
      await page.waitForFunction(() => document.querySelector('[aria-label="Product comparison"]').scrollLeft > 0)
    }
    const cells = await region.locator('thead th').evaluateAll(elements => elements.slice(1).map(element => element.getBoundingClientRect().width))
    assert.equal(cells.length, 3)
    assert.ok(cells.every(value => value >= 180), `Product columns below PR58 width at ${width}`)
    assert.equal(await region.getByText('Not assessed', { exact: false }).count(), 3)
    assert.equal(await region.getByText('No verified offer', { exact: true }).count(), 3)
    assert.equal(await region.getByRole('link', { name: 'Remove', exact: true }).count(), 3)
    assert.deepEqual(errors, [])
    assert.deepEqual(outbound, [])
    await page.screenshot({ path: resolve(resultDir, `${width}-comparison.png`) })
    await page.close()
    console.log(`PASS comparison ${width}px: widths, scroll focus, keyboard, guarded offers, no external requests`)
  }
} finally {
  await browser?.close()
  await new Promise(resolveClose => server.close(resolveClose))
}
