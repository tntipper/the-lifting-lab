// Owned fresh-context regression harness; no auth/profile imports or raw HAR.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PRIVACY_APP_URL || 'http://localhost:3177'
const report = { startedAt: new Date().toISOString(), origin, collectorTransport: 'SYNTHETIC_LOCAL_204', cases: [] }
const browser = await chromium.launch({ headless: true })
const ga = url => /googletagmanager|google-analytics|doubleclick|G-R3YMG6TYXF/.test(url)
async function run(name, task, options = {}) {
  const context = await browser.newContext({viewport:{width:390,height:844},locale:'en-GB',timezoneId:'Europe/London',...options})
  await context.route(/https:\/\/[^/]*(?:google-analytics\.com|doubleclick\.net)\//, route => route.fulfill({ status: 204, body: '' }))
  const page = await context.newPage()
  const result = { name, initial: await context.storageState(), initialURL:page.url(),requests:[],responses:[], snapshots:[],errors:[] }
  report.cases.push(result)
  assert.deepEqual(result.initial,{cookies:[],origins:[]})
  context.on('request', request => {
    if (ga(request.url())) {
      const u = new URL(request.url())
      const body = new URLSearchParams(request.postData() || '')
      result.requests.push({at:Date.now(),origin:u.origin,path:u.pathname,keys:[...u.searchParams.keys()],bodyKeys:[...body.keys()],event:u.searchParams.get('en') || body.get('en'),measurement:u.searchParams.get('tid')})
    }
  })
  context.on('response',response=>{if(ga(response.url()))result.responses.push({path:new URL(response.url()).pathname,status:response.status()})})
  page.on('pageerror',e=>result.errors.push(e.message))
  const snapshot = async label => result.snapshots.push({label,cookies:(await context.cookies()).map(cookie=>Object.fromEntries(Object.entries(cookie).filter(([key])=>key!=='value'))),storage:(await context.storageState()).origins.map(o=>({origin:o.origin,keys:o.localStorage.map(x=>x.name)}))})
  const wait = () => page.waitForTimeout(10000)
  const open = () => page.getByRole('button',{name:'Analytics preferences',exact:true}).click()
  const accept = () => page.getByRole('button',{name:'Accept analytics',exact:true}).click()
  const reject = () => page.getByRole('button',{name:'Reject analytics',exact:true}).click()
  const withdraw = async () => {result.withdrawAt=Date.now();await page.getByRole('button',{name:'Withdraw analytics consent',exact:true}).click();await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(1000);result.withdrawComplete=Date.now()}
  const noCookies = async () => assert.equal((await context.cookies()).filter(x=>/^_ga/.test(x.name)).length,0)
  try { await task({context,page,result,snapshot,wait,open,accept,reject,withdraw,noCookies});result.verdict='PASS' }
  catch(e){result.verdict='ISSUES';result.failure=e.message;console.error(name,e.message)}
  finally {await context.close();await writeFile('evidence/privacy/runtime.json',JSON.stringify(report,null,2))}
}
try {
  await run('fresh reject persistence mobile keyboard',async({context,page,result,snapshot,wait,open,noCookies})=>{
    await page.goto(origin);await wait();assert.equal(result.requests.length,0);await noCookies();await snapshot('fresh')
    await page.getByRole('button',{name:'Reject analytics',exact:true}).focus();await page.keyboard.press('Enter');await wait()
    await page.goto(origin+'/privacy');await page.reload();await wait();await open()
    await page.getByText('Current choice: analytics off (rejected).',{exact:true}).waitFor()
    const second = await context.newPage();await second.goto(origin);await second.waitForTimeout(1000)
    assert.equal(result.requests.length,0);await noCookies();await snapshot('rejected')
    await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await page.screenshot({path:'evidence/privacy/mobile-reject.png'})
  })
  await run('accept unchanged withdraw reaccept cross-tab',async({context,page,result,snapshot,wait,open,accept,withdraw,noCookies})=>{
    await page.goto(origin);await wait();assert.equal(result.requests.length,0);result.acceptAt=Date.now();await accept();await wait();await snapshot('accepted')
    assert.ok(result.requests.some(x=>x.path.includes('/collect')),'real GA collection observed')
    assert.equal(result.requests.filter(x=>x.path.includes('gtag/js')).length,1)
    assert.equal(result.requests.filter(x=>x.event==='page_view').length,1)
    await open();await accept();await page.waitForTimeout(2000)
    assert.equal(result.requests.filter(x=>x.event==='page_view').length,1)
    await page.getByRole('link',{name:'Privacy',exact:true}).click();await page.waitForTimeout(10000)
    assert.equal(result.requests.filter(x=>x.event==='page_view').length,2,'one page view on visible same-origin navigation')
    const tab=await context.newPage();await tab.goto(origin+'/privacy');await tab.waitForTimeout(10000)
    await open();await withdraw();await wait();await page.goto(origin+'/privacy');await page.reload();await wait();await tab.waitForTimeout(1000)
    assert.equal(result.requests.filter(x=>x.at>result.withdrawComplete).length,0);await noCookies();await snapshot('withdrawn')
    await open();result.reacceptAt=Date.now();await accept();await wait()
    assert.equal(result.requests.filter(x=>x.at>result.reacceptAt&&x.path.includes('gtag/js')).length,1)
    await snapshot('reaccepted')
  },{viewport:{width:1440,height:1000}})
  await run('invalid and blocked storage fails closed',async({page,result,wait,snapshot})=>{
    await page.addInitScript(()=>{localStorage.setItem('tll.analytics-choice.v1',JSON.stringify({version:99,choice:'accepted',expiresAt:Date.now()+100000}))})
    await page.goto(origin);await wait();assert.equal(result.requests.length,0)
    await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new Error('synthetic blocked storage')};Storage.prototype.getItem=()=>{throw new Error('synthetic blocked storage')}})
    await page.reload();await wait();await page.getByRole('button',{name:'Accept analytics',exact:true}).click();await wait()
    await page.getByRole('alert').filter({hasText:'Your browser could not save'}).waitFor();assert.equal(result.requests.length,0);await snapshot('failed persistence')
  })
  await run('withdrawal with blocked storage writes overrides old acceptance',async({page,result,accept,open,withdraw,wait,noCookies,snapshot})=>{
    await page.goto(origin);await accept();await wait()
    await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('synthetic blocked write')}})
    await open();await withdraw();await wait();await page.reload();await wait()
    assert.equal(result.requests.filter(x=>x.at>result.withdrawComplete).length,0);await noCookies();await snapshot('fallback rejection persisted')
  })
  await run('synthetic pending script withdrawal race',async({context,page,result,wait,open,accept,withdraw,noCookies})=>{
    let release
    const gate=new Promise(resolve=>{release=resolve})
    let reached
    const loaded=new Promise(resolve=>{reached=resolve})
    await context.route('https://www.googletagmanager.com/gtag/js?*',async route=>{
      reached();await gate;await route.continue().catch(()=>{})
    })
    await page.goto(origin);await accept();await loaded;await open();await withdraw();release();await wait()
    assert.equal(result.requests.filter(x=>x.path.includes('/collect')).length,0)
    await noCookies()
  })
  await run('synthetic pending load with all preference writes blocked',async({context,page,result,wait,open,accept,noCookies})=>{
    let release;const gate=new Promise(resolve=>{release=resolve})
    let reached;const loaded=new Promise(resolve=>{reached=resolve})
    await context.route('https://www.googletagmanager.com/gtag/js?*',async route=>{reached();await gate;await route.continue().catch(()=>{})})
    await page.goto(origin);await accept();await loaded
    await page.evaluate(()=>{
      Storage.prototype.setItem=()=>{throw new Error('synthetic blocked writes')}
      const descriptor=Object.getOwnPropertyDescriptor(Document.prototype,'cookie')
      Object.defineProperty(document,'cookie',{get(){return descriptor.get.call(document)},set(){throw new Error('synthetic blocked cookies')}})
    })
    await open();await page.getByRole('button',{name:'Withdraw analytics consent',exact:true}).click()
    await page.getByRole('alert').filter({hasText:'Your browser could not save'}).waitFor();release();await wait()
    assert.equal(result.requests.filter(x=>x.path.includes('/collect')).length,0);await noCookies()
  })
  await run('synthetic legacy domains and secure host-only cookie boundary',async({context,page,result,wait,snapshot,accept,open,withdraw})=>{
    // Only local HTML/assets are mapped to the main hostname. Google requests
    // remain natural and unblocked; synthetic cookies contain fake values only.
    await context.route('https://www.theliftinglab.co.uk/**',async route=>{
      const u=new URL(route.request().url());const response=await route.fetch({url:origin+u.pathname+u.search});await route.fulfill({response})
    })
    await context.addCookies(['_ga','_ga_R3YMG6TYXF'].flatMap(name=>[
      {name,value:'synthetic',domain:'.theliftinglab.co.uk',path:'/'},
      {name,value:'synthetic',url:'https://www.theliftinglab.co.uk/'}
    ]).concat([{name:'synthetic_cart_essential',value:'fake',domain:'.theliftinglab.co.uk',path:'/'}]))
    await page.goto('https://www.theliftinglab.co.uk/');await wait();assert.equal(result.requests.length,0)
    assert.equal((await context.cookies()).filter(x=>/^_ga/.test(x.name)).length,0)
    await accept();await wait();await snapshot('secure host accepted')
    const cookies=(await context.cookies()).filter(x=>/^_ga/.test(x.name));assert.equal(cookies.length,2)
    assert.ok(cookies.every(x=>x.domain==='www.theliftinglab.co.uk'&&x.secure&&x.path==='/'))
    assert.equal((await context.cookies('https://shop.theliftinglab.co.uk/')).filter(x=>/^_ga/.test(x.name)).length,0)
    await open();await withdraw();await wait();assert.equal((await context.cookies()).filter(x=>/^_ga/.test(x.name)).length,0)
    assert.ok((await context.cookies()).some(x=>x.name==='synthetic_cart_essential'));await snapshot('legacy removed essential retained')
  })
} finally {await browser.close();report.finishedAt=new Date().toISOString();await writeFile('evidence/privacy/runtime.json',JSON.stringify(report,null,2))}
assert.ok(report.cases.every(x=>x.verdict==='PASS'),JSON.stringify(report.cases.map(x=>({name:x.name,verdict:x.verdict,failure:x.failure}))))
console.log('PASS: '+report.cases.length+' owned browser cases')
