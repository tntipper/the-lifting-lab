import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { collectorUrl } from './collector-url.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const origin=process.env.PRIVACY_APP_URL||'http://localhost:3181'
const markers=['SYNTHETIC_QUERY_PRIVATE','SYNTHETIC_FRAGMENT_PRIVATE','SYNTHETIC_UTM_PRIVATE','SYNTHETIC_LINKER_PRIVATE','SYNTHETIC_REFERRER_PRIVATE','SYNTHETIC_SEARCH_PRIVATE']
const query='?q='+markers[0]+'&token='+markers[0]+'&email='+markers[0]+'%40example.invalid&utm_source='+markers[2]+'&utm_medium='+markers[2]+'&utm_campaign='+markers[2]+'&utm_id='+markers[2]+'&utm_content='+markers[2]+'&utm_term='+markers[2]+'&utm_extra='+markers[2]+'&_gl='+markers[3]+'&gclid='+markers[3]+'&dclid='+markers[3]+'&gbraid='+markers[3]+'&wbraid='+markers[3]+'#'+markers[1]
const report={origin,startedAt:new Date().toISOString(),collectorTransport:'SYNTHETIC_LOCAL_204',cases:[]};const browser=await chromium.launch({headless:true});report.browserVersion=browser.version()
function decode(value){for(let n=0;n<3;n++){try{value=decodeURIComponent(value)}catch{break}}return value}
try{for(const mode of ['initial','persisted-reload','same-origin-referrer','external-referrer']){
 const c=await browser.newContext({viewport:{width:1440,height:1000}});await c.route(/https:\/\/[^/]*(?:google-analytics\.com|doubleclick\.net)\//,route=>route.fulfill({status:204,body:''}));const p=await c.newPage();const r={mode,initial:await c.storageState(),requests:[],responses:[]};report.cases.push(r);const pending=[]
 c.on('request',q=>{if(/google-analytics|googletagmanager|doubleclick|G-R3YMG6TYXF/.test(q.url()))pending.push((async()=>{
  const headers=await q.allHeaders();const raw=decode(q.url()+' '+(q.postData()||'')+' '+JSON.stringify(headers));const u=new URL(q.url());const body=new URLSearchParams(q.postData()||'');const location=u.searchParams.get('dl')||body.get('dl');const referrer=u.searchParams.get('dr')||body.get('dr');
  const locationUrl=location&&collectorUrl(location,origin),referrerUrl=referrer&&collectorUrl(referrer,origin)
  r.requests.push({path:u.pathname,origin:u.origin,keys:[...u.searchParams.keys()],bodyKeys:[...body.keys()],event:u.searchParams.get('en')||body.get('en'),markerLeaks:markers.filter(x=>raw.includes(x)),location:locationUrl&&locationUrl.origin+locationUrl.pathname,locationHasQueryOrFragment:locationUrl?!!(locationUrl.search||locationUrl.hash):false,referrerHasQueryOrFragment:referrerUrl?!!(referrerUrl.search||referrerUrl.hash):false})
 })())})
 c.on('response',s=>{if(/google-analytics|googletagmanager/.test(s.url()))r.responses.push({path:new URL(s.url()).pathname,status:s.status()})})
 const referer=mode==='external-referrer'?'https://referrer.example.invalid/'+markers[4]+'?token='+markers[4]:origin+'/privacy?token='+markers[4]
 await p.goto(origin+'/products'+query,{referer});await p.waitForTimeout(10000);assert.equal(r.requests.length,0)
 await p.getByRole('button',{name:'Accept analytics',exact:true}).click();await p.waitForTimeout(10000)
 const search=p.getByPlaceholder('Search by product or brand…');assert.equal(await search.count(),1);{await search.fill(markers[5]+'@example.invalid');await p.waitForTimeout(2000)}
 await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(2000)
 if(mode==='persisted-reload'){await p.reload();await p.waitForTimeout(10000)}
 if(mode==='same-origin-referrer'){await p.goto(origin+'/privacy'+query,{referer:origin+'/products?token='+markers[4]});await p.waitForTimeout(10000)}
 await Promise.all(pending);assert.ok(r.responses.some(x=>x.path.includes('/collect')&&x.status===204),'client-generated request with synthetic collector response')
 assert.ok(r.requests.some(x=>x.location===origin+'/products'),'public page identity preserved')
 assert.ok(r.requests.every(x=>!x.markerLeaks.length&&!x.locationHasQueryOrFragment&&!x.referrerHasQueryOrFragment),'no synthetic value/query/fragment in any GA URL/body/header')
 r.verdict='PASS';await c.close();await writeFile('evidence/privacy/url-minimisation.json',JSON.stringify(report,null,2))
}}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('evidence/privacy/url-minimisation.json',JSON.stringify(report,null,2))}
console.log('PASS: 4 client-generated accepted GA URL/referrer/UTM/linker/search cases')
