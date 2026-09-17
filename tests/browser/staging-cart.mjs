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

const root = fileURLToPath(new URL('../../', import.meta.url)), dir = resolve(root, 'test-results/staging-cart')
await mkdir(dir, { recursive: true })
const bundle = await build({ absWorkingDir: root, entryPoints: ['tests/browser/staging-cart-fixture.tsx'], bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_TLL_ENVIRONMENT': '"staging"', 'process.env.NEXT_PUBLIC_TLL_STAGING_CART': '"enabled"', 'process.env.NEXT_PUBLIC_AMAZON_TAG': '""', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://example.invalid"' },
  plugins: [{ name: 'isolated-adapters', setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$|^@\/lib\/supabase$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', resolveDir: root, contents: args.path === 'next/link'
      ? 'import React from "react"; export default function Link(props){return <a {...props}/>}'
      : args.path === 'next/navigation' ? 'export const usePathname=()=>window.location.pathname;'
        : `const listeners=new Set();let current=null;window.__cartUser=id=>{current=id?{id}:null;for(const fn of listeners)fn(id?'SIGNED_IN':'SIGNED_OUT',{user:current})};export const createClient=()=>({auth:{getUser:async()=>({data:{user:current}}),onAuthStateChange:fn=>{listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}}});` }))
  } }],
})
assert.equal(Buffer.from(bundle.outputFiles[0].contents).includes(Buffer.from('57160491139412')), false, 'Shopify mapping stays server-side')
assert.equal(Buffer.from(bundle.outputFiles[0].contents).includes(Buffer.from('TLL_STAGING_CART_VAULT')), false)
const css = (await postcss([tailwind()]).process(await readFile(resolve(root, 'app/globals.css'), 'utf8'), { from: resolve(root, 'app/globals.css') })).css
const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="fixture"></div><script src="/fixture.js"></script></body></html>'
const server = createServer((req, res) => {
  if (['/', '/cart'].includes(req.url)) { res.setHeader('Content-Type', 'text/html'); res.end(html) }
  else if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents) }
  else if (req.url === '/fixture.css') { res.setHeader('Content-Type', 'text/css'); res.end(css) }
  else { res.statusCode=404;res.end() }
})
server.listen(0,'127.0.0.1');await once(server,'listening')
const origin=`http://127.0.0.1:${server.address().port}`, browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_CHANNEL?{channel:process.env.TEST_BROWSER_CHANNEL}:{})})
const results=[]
try {
  for(const width of [320,390,768,1024,1280,1440]) {
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],calls=[]
    page.on('pageerror',e=>errors.push(e.message))
    let view={state:'empty',revision:0,productId:'40000000-0000-4000-8000-000000000001',quantity:0,unitPricePence:null,subtotalPence:0,currency:'GBP',csrfToken:null,message:'Your test cart is empty.'}
    let mode='normal',release,pending
    const reply=(route,status=200,value=view)=>route.fulfill({status,json:value})
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url())
      if(url.origin!==origin)return route.abort()
      if(url.pathname!=='/api/cart')return ['/', '/cart','/fixture.js','/fixture.css'].includes(url.pathname)?route.continue():route.abort()
      calls.push({method:request.method(),body:request.postDataJSON(),headers:request.headers()})
      if(request.method()==='GET')return reply(route)
      assert.equal(request.headers()['x-tll-cart-intent'],'staging-cart')
      const body=request.postDataJSON()
      if(body.action==='open'){view={...view,csrfToken:'a'.repeat(64)};return reply(route)}
      assert.equal(request.headers()['x-tll-cart-csrf'],'a'.repeat(64));assert.match(request.headers()['idempotency-key'],/^[a-f0-9-]{36}$/)
      if(mode==='delayed'||mode==='switch'){pending=true;await new Promise(resolvePromise=>{release=resolvePromise})}
      const quantity=request.method()==='DELETE'?0:body.quantity
      view={...view,revision:view.revision+1,state:quantity?'ready':'empty',quantity,unitPricePence:quantity?1200:null,subtotalPence:quantity*1200,message:'Synthetic cart response.'}
      if(mode==='lost'){mode='normal';return route.abort('failed')}
      if(mode==='switch'){const old=view;view={...view,state:'session_changed',productId:null,quantity:0,subtotalPence:0,unitPricePence:null,csrfToken:null,message:'Account changed. Previous cart withheld.'};mode='normal';return reply(route,200,old)}
      return reply(route)
    })
    await page.goto(origin)
    const add=page.getByRole('region',{name:'Product purchase actions'}).getByRole('button',{name:'Add to test cart'})
    await add.waitFor();assert.equal(await page.getByRole('region',{name:'Unmapped product'}).getByRole('button').count(),0)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`header overflow ${width}`)
    if(width<1280){await page.locator('header button[aria-controls]').click()}
    const navCart=page.getByRole('button',{name:'Test cart, 0 items'});await navCart.click()
    const dialog=page.getByRole('dialog',{name:'Test cart',exact:true});await dialog.waitFor()
    await page.keyboard.press('Escape');assert.equal(await navCart.evaluate(el=>el===document.activeElement),true)
    if(width<1280)await page.locator('header button[aria-controls]').click()
    mode='delayed';await add.click();await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('Checking'))
    await page.waitForTimeout(50);assert.equal(pending,true)
    assert.equal(await dialog.getByRole('button',{name:'Refresh cart'}).isDisabled(),true)
    assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.equal(calls.filter(c=>c.method==='PATCH').length,1)
    mode='normal';release();await dialog.getByRole('status').filter({hasText:'Test cart updated.'}).waitFor()
    assert.equal(await dialog.getByRole('status').evaluate(el=>el===document.activeElement),true)
    assert.equal(await dialog.getByText('£12.00',{exact:true}).count(),1)
    for(let i=0;i<24;i++){await page.keyboard.press(i<12?'Tab':'Shift+Tab');assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true)}
    await dialog.getByRole('button',{name:'Increase test product quantity'}).click()
    await dialog.getByText('Quantity: 2',{exact:true}).waitFor();await dialog.getByText('£24.00',{exact:true}).waitFor()
    assert.equal(await dialog.getByRole('link',{name:/checkout/i}).count(),0)
    for(const button of await dialog.getByRole('button').all()){const box=await button.boundingBox();assert.ok(box&&box.height>=44,`small action ${width}`)}
    await page.screenshot({path:resolve(dir,`${width}-cart.png`)})
    await dialog.getByRole('button',{name:'Remove item'}).click();await dialog.getByText('No items in this test cart.').waitFor()
    await page.keyboard.press('Escape');assert.equal(await add.evaluate(el=>el===document.activeElement),true)
    // Actual manual-stack action uses the same provider and projection.
    await page.getByRole('region',{name:'Manual stack purchase action'}).getByRole('button',{name:'Add to test cart'}).click()
    await dialog.getByText('Quantity: 1',{exact:true}).waitFor()
    mode='lost';const mutationCount=calls.filter(c=>['PATCH','DELETE'].includes(c.method)).length
    await dialog.getByRole('button',{name:'Increase test product quantity'}).click()
    await dialog.getByRole('status').filter({hasText:'response was interrupted'}).waitFor();assert.equal(calls.filter(c=>['PATCH','DELETE'].includes(c.method)).length,mutationCount+1)
    await dialog.getByRole('button',{name:'Refresh cart'}).click();await dialog.getByText('Quantity: 2',{exact:true}).waitFor()
    assert.equal(calls.filter(c=>['PATCH','DELETE'].includes(c.method)).length,mutationCount+1,'refresh must not replay a mutation')
    view={...view,state:'held',message:'Outcome uncertain. Editing held.'};await dialog.getByRole('button',{name:'Refresh cart'}).click()
    await dialog.getByRole('status').filter({hasText:'Editing held'}).waitFor();assert.equal(await dialog.getByRole('button',{name:'Increase test product quantity'}).isDisabled(),true)
    const saved=view;view={...view,state:'unavailable',productId:null,quantity:0,unitPricePence:null,subtotalPence:null,message:'Test cart unavailable.'}
    await dialog.getByRole('button',{name:'Refresh cart'}).click();await dialog.getByRole('status').filter({hasText:'Test cart unavailable.'}).waitFor()
    assert.equal(await dialog.getByText('No items in this test cart.').count(),0);assert.equal(await dialog.getByText('£0.00',{exact:true}).count(),0)
    await dialog.getByText('Unavailable',{exact:true}).waitFor()
    view={...saved,state:'ready'};await dialog.getByRole('button',{name:'Refresh cart'}).click();await dialog.getByRole('button',{name:'Increase test product quantity'}).waitFor()
    mode='switch';pending=false;await dialog.getByRole('button',{name:'Increase test product quantity'}).click();await page.waitForTimeout(50);assert.equal(pending,true)
    await page.evaluate(()=>window.__cartUser('70000000-0000-4000-8000-000000000002'));release()
    await dialog.getByRole('status').filter({hasText:'Previous cart withheld.'}).waitFor()
    assert.equal(await dialog.getByRole('region',{name:'Test cart item'}).count(),0)
    assert.equal(await dialog.getByText('£36.00',{exact:true}).count(),0,'old account response must be discarded')
    await page.keyboard.press('Escape')
    await page.goto(origin+'/cart');await page.getByRole('heading',{name:'Test cart page'}).waitFor()
    await page.getByRole('status').filter({hasText:'Previous cart withheld.'}).waitFor()
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
    // A completed mutation from an unmounted provider must not start a new GET.
    view={state:'ready',revision:4,productId:'40000000-0000-4000-8000-000000000001',quantity:1,unitPricePence:1200,subtotalPence:1200,currency:'GBP',csrfToken:'a'.repeat(64),message:'Synthetic saved cart.'}
    await page.goto(origin);await add.waitFor();mode='delayed';pending=false;await add.click()
    await page.waitForTimeout(50);assert.equal(pending,true)
    const reads=calls.filter(c=>c.method==='GET').length
    await page.evaluate(()=>window.__unmountCart());mode='normal';release()
    await page.waitForTimeout(100)
    assert.equal(calls.filter(c=>c.method==='GET').length,reads,'unmounted provider must not refresh after its old mutation')
    assert.deepEqual(errors,[])
    results.push({width,productAndManualStackActions:true,plainTotals:true,keyboardAndFocus:true,unknownMutation:'read only recovery; no replay',held:'edits disabled',accountSwitch:'old response ignored and prior cart withheld',cartPage:true,externalCalls:0})
    await context.close()
  }
} finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
await writeFile(resolve(dir,'results.json'),JSON.stringify({scope:'Actual React provider, product action, header, cart page contents and native dialog; fake local API only. Fresh headless profile; no customer, Shopify or checkout requests.',results},null,2)+'\n')
console.log(JSON.stringify(results,null,2))
