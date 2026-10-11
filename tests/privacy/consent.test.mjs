import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source = ts.transpileModule(readFileSync('lib/analytics-consent.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
function fixture(record, blocked = false) {
  const cookies=new Map();const writes=[];const values=new Map(record ? [['tll.analytics-choice.v1',record]]:[])
  const exports={}
  const context={exports,window:{location:{hostname:'www.theliftinglab.co.uk'}},document:{get cookie(){return [...cookies].map(([k,v])=>k+'='+v).join('; ')},set cookie(value){writes.push(value);const [pair]=value.split(';');const [k,v]=pair.split('=');if(value.includes('Max-Age=0'))cookies.delete(k);else cookies.set(k,v)}},Date,
    localStorage:{getItem(k){if(blocked)throw Error('blocked');return values.get(k)||null},setItem(k,v){if(blocked)throw Error('blocked');values.set(k,v)}}}
  vm.runInNewContext(source,context)
  return {...exports,writes,values,blockWrites(){context.localStorage.setItem=()=>{throw Error('blocked writes')}}}
}
for(const [name,record] of [
  ['missing',null],['malformed','{'],['unknown version',JSON.stringify({version:2,choice:'accepted',expiresAt:Date.now()+10000})],
  ['expired',JSON.stringify({version:1,choice:'accepted',expiresAt:Date.now()-1})],
  ['invalid choice',JSON.stringify({version:1,choice:'yes',expiresAt:Date.now()+10000})],
  ['unbounded lifetime',JSON.stringify({version:1,choice:'accepted',expiresAt:Date.now()+181*86400000})],
]) test(name+' defaults OFF',()=>assert.equal(fixture(record).analyticsAllowed(),false))
test('accept and reject persist exactly the versioned choice',()=>{
  const f=fixture();assert.ok(f.saveAnalyticsChoice('accepted'));assert.ok(f.analyticsAllowed());assert.ok(f.saveAnalyticsChoice('rejected'));assert.equal(f.analyticsAllowed(),false);assert.equal(f.values.size,1)
})
test('blocked storage defaults OFF and failed acceptance cannot enable',()=>{
  const f=fixture(null,true);assert.equal(f.readAnalyticsChoice(),null);assert.equal(f.saveAnalyticsChoice('accepted'),false);assert.equal(f.analyticsAllowed(),false)
})
test('cleanup deletes only app-owned GA names at root host/parent variants',()=>{
  const f=fixture();f.clearAnalyticsCookies();assert.equal(f.writes.length,8);assert.ok(f.writes.every(x=>/^_ga(?:_R3YMG6TYXF)?=; Max-Age=0; Path=\//.test(x)));assert.ok(f.writes.some(x=>x.endsWith('Domain=.theliftinglab.co.uk')))
})
test('accepted legacy cleanup preserves host-only cookies',()=>{
  const f=fixture();f.clearAnalyticsCookies(true);assert.equal(f.writes.length,4);assert.ok(f.writes.every(x=>x.includes('Domain=')&&!x.includes('Domain=www.')))
})

test('withdrawal overrides still-readable acceptance when storage writes fail',()=>{
  const f=fixture();assert.ok(f.saveAnalyticsChoice('accepted'));f.blockWrites();assert.ok(f.saveAnalyticsChoice('rejected'));assert.equal(f.readAnalyticsChoice(),'rejected');assert.equal(f.analyticsAllowed(),false)
})
