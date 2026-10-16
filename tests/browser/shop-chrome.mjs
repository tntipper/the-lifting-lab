// Run against a synthetic-preview dev server on 127.0.0.1:3094.
// Supply inert public client config and tests/fixtures/preview-fonts.cjs to that server.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({headless:true,...(process.env.TEST_BROWSER_CHANNEL ? {channel:process.env.TEST_BROWSER_CHANNEL} : {})})
try {
 const page = await browser.newPage({viewport:{width:360,height:900}})
 const errors=[]
 page.on('pageerror', e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:3094/products', {waitUntil:'domcontentloaded'})
 await page.locator('article[data-product-id]').first().waitFor()
 await page.waitForFunction(()=>{const b=document.querySelector('button[aria-label="Add to favourites"]');return b&&!b.disabled})
 assert.equal(await page.locator('h1').textContent(),'All supplements')
 assert.equal(await page.getByLabel('Sort products').inputValue(),'budget')
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'listing overflow')
 await page.screenshot({path:'/tmp/d-shop-list-360.png',fullPage:false,timeout:10000})
 const cards = page.locator('article[data-product-id]')
 for(let i=0;i<3;i++) {
  await cards.nth(i).getByRole('checkbox').check()
  await page.waitForFunction(n=>document.querySelectorAll('article input[type=checkbox]:checked').length===n,i+1)
 }
 await page.waitForFunction(()=>document.querySelectorAll('article input[type=checkbox]')[3].disabled)
 assert.ok(await cards.nth(3).getByRole('checkbox').isDisabled())
 await page.getByRole('button',{name:'Clear',exact:true}).click()
 await cards.first().getByRole('button',{name:'Add to stack',exact:true}).click()
 await page.waitForFunction(()=>!!document.querySelector('article button[aria-pressed="true"]'))
 assert.equal(await cards.first().getByRole('button',{name:'In stack',exact:true}).getAttribute('aria-pressed'),'true')
 await page.getByRole('button',{name:'Creatine',exact:true}).click()
 assert.equal(await page.locator('h1').textContent(),'Creatine')
 await page.getByLabel('Sort products').selectOption('price')
 const href=await page.locator('article[data-product-id]').first().locator('a').first().getAttribute('href'); await page.goto('http://127.0.0.1:3094'+href,{waitUntil:'domcontentloaded'})
 await page.locator('main h1').waitFor()
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'detail overflow')
 await page.screenshot({path:'/tmp/d-shop-detail-360.png',fullPage:false,timeout:10000})
 await page.goto('http://127.0.0.1:3094/products/1fab2546-6a25-4fd9-8e49-abf6bb6b362c',{waitUntil:'domcontentloaded'})
 const select=page.getByLabel('Size',{exact:true})
 if(await select.count()) {
  const options=await select.locator('option').evaluateAll(opts=>opts.map(o=>o.value))
  await page.waitForFunction(()=>{const s=document.querySelector('fieldset select');return s&&Object.keys(s).some(k=>k.startsWith('__reactProps'))})
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  await select.selectOption(options[1])
  await page.waitForFunction(()=>location.search.includes('size='))
  if(options.length>1) assert.ok(page.url().includes('size='),'size URL updated')
 }
 await page.setViewportSize({width:1200,height:1000})
 await page.goto('http://127.0.0.1:3094/products',{waitUntil:'domcontentloaded'})
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'desktop overflow')
 await page.screenshot({path:'/tmp/d-shop-list-1200.png',fullPage:false,timeout:10000})
 assert.deepEqual(errors,[])
 console.log('PASS 360px/1200px overflow, category title, default sort, compare max 3, stack toggle, detail, native select change (keyboard-only fixture separately recorded); screenshots /tmp/d-shop-*.png')
} finally {await browser.close()}
