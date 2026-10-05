import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const exports={}
vm.runInNewContext(ts.transpileModule(readFileSync('lib/analytics-data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,URL,window:{location:{origin:'https://www.theliftinglab.co.uk'}}})
test('public static page preserved without arbitrary query or fragment',()=>assert.equal(exports.analyticsLocation('https://www.theliftinglab.co.uk/privacy?email=synthetic@example.invalid&utm_source=secret#fragment'),'https://www.theliftinglab.co.uk/privacy'))
test('dynamic and unknown path values are not exported',()=>{
 assert.equal(exports.analyticsLocation('https://www.theliftinglab.co.uk/products/synthetic-secret'),'https://www.theliftinglab.co.uk/products/:item')
 assert.equal(exports.analyticsLocation('https://www.theliftinglab.co.uk/unknown/synthetic-secret'),'https://www.theliftinglab.co.uk/other')
})
test('same-origin referrer minimized and external referrer suppressed',()=>{
 assert.equal(exports.analyticsReferrer('https://www.theliftinglab.co.uk/compare?ids=secret#secret','https://www.theliftinglab.co.uk'),'https://www.theliftinglab.co.uk/compare')
 assert.equal(exports.analyticsReferrer('https://secret.example.invalid/private?token=secret','https://www.theliftinglab.co.uk'),'')
})
test('free search, event URLs and campaign overrides minimized centrally',()=>{
 const result=exports.minimiseEventParams({search_term:'synthetic@example.invalid',href:'/products?email=secret#secret',campaign_source:'secret',utm_medium:'secret',page_location:'secret',count:3})
 assert.equal(JSON.stringify(result),JSON.stringify({search_length:25,link_destination:'/products',count:3}))
})
