import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
const script=readFileSync('public/analytics-frame.html','utf8').split('<script>')[1].split('</script>')[0]
function fixture(accepted=true,direct=false){
 const window={};const scripts=[]
 const document={cookie:'',createElement:()=>({}),head:{append:s=>scripts.push(s)}}
 vm.runInNewContext(script,{window,parent:direct?window:{},document,Date,localStorage:{getItem:()=>JSON.stringify({version:1,choice:accepted?'accepted':'rejected',expiresAt:Date.now()+10000})}})
 return {window,scripts}
}
test('frame is inert on direct navigation or without acceptance',()=>{
 for(const f of [fixture(true,true),fixture(false)]){f.window.tllAnalyticsStart({});assert.equal(f.scripts.length,0)}
})
test('pending load and accepted queued events cannot survive withdrawal',()=>{
 const f=fixture();f.window.tllAnalyticsStart({send_page_view:false});f.window.tllAnalyticsDispatch(['event','page_view',{}]);assert.equal(f.scripts.length,1);f.window.tllAnalyticsStop();f.scripts[0].onload();assert.equal(f.window.gtag,undefined);assert.equal(f.window['ga-disable-G-R3YMG6TYXF'],true);assert.equal(f.window.dataLayer.length,0)
})
test('successful frame initialises once and dispatches accepted queued view',()=>{
 const f=fixture();f.window.tllAnalyticsStart({send_page_view:false});f.window.tllAnalyticsStart({});f.window.tllAnalyticsDispatch(['event','page_view',{}]);f.scripts[0].onload();assert.equal(f.scripts.length,1);assert.equal(f.window.dataLayer.filter(x=>x[0]==='event'&&x[1]==='page_view').length,1)
})
