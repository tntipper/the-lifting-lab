// Offline integration of the real panel provider, local stack, dialogs, and shop controls.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { chromium } from 'playwright'

const bundle = await build({ stdin: { contents: `
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import {LocalStackProvider,useLocalStack} from './components/LocalStackContext';
  import {ShopPanelsProvider,useShopPanels,BasketAddButton} from './components/ShopPanels';
  import TopNav from './components/TopNav';
  const products = ['Alpha','Beta','Gamma','Delta'].map((name,i)=>({
    id:'71000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),name,brand:'Fixture',category:'creatine',
    score:null,retail_price:12+i,cost_per_serving:(12+i)/30,servings_per_container:30,serving_size:5,serving_unit:'g',
    nutrients:[{nutrient_name:'Creatine',amount:i===0?5:500,unit:i===0?'g':'mg'}],buy_url:null,
    image_url:null,informed_sport:null,proprietary_blend:null,amino_spiked:null,protein_yield:null
  })); window.fixtureProducts=products;
  function Controls(){const p=useShopPanels(),s=useLocalStack(); return <><TopNav signedInInitial={false}/><main>{products.map(product=><section key={product.id}>
    <h2>{product.name}</h2><BasketAddButton product={product}/>
    <button aria-label={'Compare '+product.name} aria-pressed={p.compared.some(p=>p.id===product.id)} disabled={p.compared.length===3&&!p.compared.some(p=>p.id===product.id)} onClick={()=>p.toggleCompare(product)}>Compare</button>
    <button onClick={()=>s.add(product)}>Stack {product.name}</button>
    </section>)}</main></>}
  createRoot(document.getElementById('root')).render(<LocalStackProvider><ShopPanelsProvider><Controls/></ShopPanelsProvider></LocalStackProvider>);
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic',
  define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_TLL_ENVIRONMENT': '"synthetic-preview"', 'process.env.NEXT_PUBLIC_TLL_STORE_PRICES': '"disabled"', 'process.env.NEXT_PUBLIC_TLL_STORE_LINKS': '"disabled"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://example.invalid"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"fixture"' },
  plugins: [{ name: 'next-adapters', setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', resolveDir: process.cwd(), contents: args.path === 'next/link' ? 'import React from "react"; export default function Link(props){return <a {...props}/>}' : 'export const usePathname=()=>"/products";' }))
  } }],
})
const css = await postcss([tailwind()]).process(await readFile('app/globals.css', 'utf8'), { from: 'app/globals.css' })
const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) })
await mkdir('test-results/shop-panels', { recursive: true })
try {
  for (const width of [360, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message) })
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
      if (url.pathname.startsWith('/api/')) {
        const products = await page.evaluate(() => window.fixtureProducts)
        const ids = (url.searchParams.get('ids') ?? '').split(',')
        const selected = products.filter(p => ids.includes(p.id))
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.pathname === '/api/stack/assessments' ? { products: selected } : selected.map(p => ({ ...p, product_nutrients: p.nutrients }))) })
      }
      return route.abort()
    })
    await page.goto('https://panels-fixture.test/products')
    await page.addStyleTag({ content: css.css })
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const basketTrigger = page.getByRole('button', { name: 'Basket, 0 items' })
    await basketTrigger.click()
    const basket = page.getByRole('dialog', { name: 'Basket', exact: true })
    await basket.waitFor()
    assert.match(await basket.innerText(), /Your basket is empty/)
    assert.equal(await basket.evaluate(el => Math.round(el.getBoundingClientRect().right)), width)
    assert.equal(await basket.evaluate(el => Math.round(el.getBoundingClientRect().height)), 900)
    await page.keyboard.press('Escape')
    assert.equal(await basketTrigger.evaluate(el => el === document.activeElement), true)
    await page.getByRole('button', { name: 'Add to basket', exact: true }).first().click()
    await page.getByRole('status').filter({ hasText: 'Added Alpha to your basket' }).waitFor()
    await page.waitForTimeout(2600)
    assert.equal(await page.getByRole('status').filter({ hasText: 'Added Alpha' }).count(), 0)
    await page.getByRole('button', { name: 'Basket, 1 items' }).click()
    await basket.getByRole('button', { name: 'Add one Alpha' }).click()
    assert.match(await basket.innerText(), /£24.00/)
    const close = basket.getByRole('button', { name: 'Close Basket' })
    await close.focus()
    await page.keyboard.press('Shift+Tab')
    assert.equal(await basket.evaluate(el => el.contains(document.activeElement)), true)
    await page.keyboard.press('Tab')
    assert.equal(await close.evaluate(el => el === document.activeElement), true)
    await basket.getByRole('button', { name: 'Remove one Alpha' }).click()
    await basket.getByRole('button', { name: 'Remove one Alpha' }).click()
    assert.match(await basket.innerText(), /Your basket is empty/)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Stack Alpha', exact: true }).click()
    await page.getByRole('button', { name: 'Stack Beta', exact: true }).click()
    await page.getByRole('button', { name: 'My stack 2', exact: true }).first().click()
    const stack = page.getByRole('dialog', { name: 'My Stack', exact: true })
    await stack.getByText('5500 mg', { exact: true }).waitFor()
    assert.match(await stack.innerText(), /£0.83/)
    await page.screenshot({ path: `test-results/shop-panels/stack-${width}.png` })
    for (const button of await stack.getByRole('button').all()) assert.ok(await button.evaluate(el => el.getBoundingClientRect().height >= 44))
    await stack.getByRole('button', { name: 'Remove Alpha from My Stack' }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Compare Alpha', exact: true }).click()
    const compare = page.getByRole('button', { name: 'Compare 1 of 3' })
    assert.equal(await compare.isDisabled(), true)
    await page.getByRole('button', { name: 'Compare Beta', exact: true }).click()
    await page.getByRole('button', { name: 'Compare Gamma', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Compare Delta', exact: true }).isDisabled(), true)
    await page.getByRole('button', { name: 'Compare 3 of 3' }).click()
    const comparison = page.getByRole('dialog', { name: 'Compare products', exact: true })
    assert.equal(await comparison.getByRole('table').count(), 1)
    assert.match(await comparison.innerText(), /5 g/)
    assert.match(await comparison.innerText(), /Unavailable pending review/)
    await page.screenshot({ path: `test-results/shop-panels/compare-${width}.png` })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no page overflow')
    await comparison.getByRole('button', { name: 'Remove Gamma from comparison' }).click()
    await comparison.getByRole('button', { name: 'Remove Beta from comparison' }).click()
    assert.equal(await comparison.isVisible(), false)
    assert.equal(await page.getByRole('button', { name: 'Compare 1 of 3' }).isDisabled(), true)
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    assert.equal(await page.getByRole('region', { name: 'Comparison', exact: true }).count(), 0)
    assert.deepEqual(errors, [])
    console.log(`PASS ${width}px: drawers, focus, quantities, toast, shared stack, unit totals, compare cap/table/removal, overflow`)
    await page.close()
  }
} finally { await browser.close() }
