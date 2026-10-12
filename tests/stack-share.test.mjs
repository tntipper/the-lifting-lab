import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const root = fileURLToPath(new URL('../', import.meta.url)), require = createRequire(import.meta.url)
function modules(env = {}, overrides = {}) {
  const cache = new Map()
  function load(path) {
    if (cache.has(path)) return cache.get(path)
    const filename = resolve(root, path), mod = { exports: {} }
    const js = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText
    const local = name => {
      if (name in overrides) return overrides[name]
      if (name === 'next/server') return { connection: async () => {} }
      if (name === '@/lib/gtag') return { track() {} }
      if (name === '@/components/LocalStackContext') return { useLocalStack: () => ({ inStack: () => false, toggle() {} }) }
      if (name === './StagingCartContext') return { useStagingCart: () => null }
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(dirname(filename), name)
        const hit = [base + '.ts', base + '.tsx'].find(existsSync)
        assert.ok(hit, name)
        return load(relative(root, hit))
      }
      return require(name)
    }
    vm.runInNewContext(js, { require: local, module: mod, exports: mod.exports, process: { env },
      URL, URLSearchParams, Response, Request, Headers, AbortSignal, AbortController, Buffer, Uint8Array, TextDecoder, Date,
      fetch: overrides.fetch ?? (() => { throw new Error('Live network forbidden') }) }, { filename })
    cache.set(path, mod.exports); return mod.exports
  }
  return load
}

const load = modules(), share = load('lib/commerce/stack-share.ts')
const now = Date.now()
const product = (id, variant) => ({ id, name: 'Fixture '+id, quantity: 1, storeLinkMapping: {
 productId:id, shopifyProductHandle:'fixture', shopifyVariantId:variant, approved:true, active:true,
 review:{approved:true,version:'v1',expectedVersion:'v1',verifiedAtMs:now-1000,expiresAtMs:now+600000}
} })
const parse = value => JSON.parse(JSON.stringify(share.parseSharedStackItems(value)))
test('strict parser retains large variant IDs as strings and pack quantities', () => {
 assert.deepEqual(parse('90071992547409931234:99,2:1'), [{variantId:'90071992547409931234',quantity:99},{variantId:'2',quantity:1}])
})
for(const value of [null,undefined,[],{},'', '1', '1:0','0:1','01:1','1:01','1:100','1:-1','1:1.5','1:1e1','1:NaN','1:Infinity','1:1,',' 1:1','1:1 ','1:1,1:2','gid://shopify/ProductVariant/1:1','1:1:1','<script>:1','1%3A1','9'.repeat(33)+':1','x'.repeat(4097)]) {
 test(`rejects invalid shared input ${String(value).slice(0,45)}`, () => assert.equal(share.parseSharedStackItems(value),null))
}
test('item cap accepts 50 and rejects 51 without truncation', () => {
 const values=Array.from({length:51},(_,i)=>`${i+1}:1`)
 assert.equal(parse(values.slice(0,50).join(',')).length,50)
 assert.equal(parse(values.join(',')),null)
})
test('query rejects absent and repeated items parameters', () => {
 for(const query of ['', 'items=1:1&items=2:1','items=1:1&items=']) assert.equal(share.readSharedStackQuery(new URLSearchParams(query)),null)
 assert.equal(share.readSharedStackQuery(new URLSearchParams('items=1%3A2%2C3%3A4')).length,2)
})
test('URL round trip preserves order, IDs and quantities', () => {
 const lines=parse('90071992547409931234:3,2:99')
 const path=share.sharedStackPath(lines)
 assert.deepEqual(JSON.parse(JSON.stringify(share.readSharedStackQuery(new URL('https://fixture.invalid'+path).searchParams))),lines)
 for(const lines of [[],[{variantId:'1',quantity:0}],[{variantId:'1',quantity:1.5}]]) assert.equal(share.sharedStackPath(lines),null)
})
test('share builder combines duplicate packs and refuses incomplete selections', () => {
 const a=product('a','1'), b=product('b','1')
 assert.equal(share.shareStackPath([a,{...b,quantity:2}],now),'/stack?items=1%3A3')
 for(const items of [[],[a,{id:'c',quantity:1}],[{...a,quantity:100}], [{...a,cataloguePresentation:{productId:'a',availability:'out_of_stock',purchaseEnabled:false}}]]) assert.equal(share.shareStackPath(items,now),null)
})
test('fresh browser rebuild and Buy use exact variant quantities, independently of account doses', () => {
 const lines=parse('90071992547409931234:3,2:2'), products=[product('b','gid://shopify/ProductVariant/2'),product('a','90071992547409931234')]
 const rebuilt=share.rebuildSharedStack(lines,products,now)
 assert.deepEqual(Array.from(rebuilt,p=>[p.id,p.quantity]),[['a',3],['b',2]])
 assert.equal(load('lib/commerce/stack-cart.ts').buildStackCartUrl(rebuilt,now),'https://shop.theliftinglab.co.uk/cart/90071992547409931234:3,2:2')
 const Buy=modules({NEXT_PUBLIC_TLL_STACK_CART:'enabled'})('components/BuyMyStack.tsx').default
 assert.match(renderToStaticMarkup(React.createElement(Buy,{items:rebuilt,ready:true})),/90071992547409931234:3,2:2/)
 assert.equal(renderToStaticMarkup(React.createElement(load('components/BuyMyStack.tsx').default,{items:rebuilt,ready:true})), '')
})
test('unknown, ambiguous, unapproved and expired mappings cannot rebuild a stack', () => {
 const a=product('a','1'),lines=parse('1:1')
 for(const products of [[],[a,product('b','1')],[{...a,storeLinkMapping:{...a.storeLinkMapping,approved:false}}],[{...a,storeLinkMapping:{...a.storeLinkMapping,review:{...a.storeLinkMapping.review,expiresAtMs:now}}}]]) assert.equal(share.rebuildSharedStack(lines,products,now),null)
 assert.equal(share.rebuildSharedStack(parse('1:1,2:1'),[a],now),null)
})
test('shared lookup rejects bad input before calling injected read; real route remains unbound', async () => {
 let calls=0
 const handler=share.createSharedStackHandler(async ids=>{calls++; assert.deepEqual(Array.from(ids),['1']);return [product('a','1')]})
 assert.equal((await handler(new Request('https://fixture.invalid/api/stack/shared?items=1:0'))).status,400);assert.equal(calls,0)
 const result=await handler(new Request('https://fixture.invalid/api/stack/shared?items=1:3'))
 assert.equal(result.status,200);assert.equal((await result.json()).items[0].quantity,3);assert.equal(calls,1)
 assert.equal(result.headers.get('cache-control'),'no-store')
 const route=load('app/api/stack/shared/route.ts')
 assert.equal((await route.GET(new Request('https://fixture.invalid/api/stack/shared?items=1:1'))).status,503)
})
test('lookup failure is honest and never leaks provider detail or loads a partial stack', async () => {
 const req=new Request('https://fixture.invalid/api/stack/shared?items=1:1,2:2')
 assert.equal((await share.createSharedStackHandler(async()=>[product('a','1')])(req)).status,422)
 const result=await share.createSharedStackHandler(async()=>{throw Error('PRIVATE SECRET')})(req)
 assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/PRIVATE|SECRET/)
})
test('guest stack page renders without redirecting or changing account authentication', async () => {
 const page=modules({}, {
  '@/components/TopNav':()=>null, '@/components/AccountNavigation':()=>null,
  './StackBuilder':()=>React.createElement('p',null,'Stack builder'),
  'next/headers':{cookies:async()=>({getAll:()=>[]})},
  '@supabase/ssr':{createServerClient:()=>({auth:{getUser:async()=>({data:{user:null}})}})}
 })('app/stack/page.tsx').default
 assert.match(renderToStaticMarkup(await page()),/Stack builder/)
})
test('shared screen loads a fresh URL through a mock lookup and displays exact Buy quantities', async () => {
 const state=[],effects=[];let index=0,calls=0
 const query='?items=1%3A3%2C2%3A2'
 const handler=share.createSharedStackHandler(async()=>[product('a','1'),product('b','2')])
 const Shared=modules({NEXT_PUBLIC_TLL_STACK_CART:'enabled'}, {
  react:{useState(initial){const slot=index++;if(!(slot in state))state[slot]=initial;return[state[slot],value=>{state[slot]=typeof value==='function'?value(state[slot]):value}]},useEffect(effect){effects.push(effect)}},
  fetch:async url=>{calls++;assert.equal(url,'/api/stack/shared?items=1%3A3%2C2%3A2');return handler(new Request('https://fixture.invalid'+url))}
 })('components/SharedStack.tsx').default
 index=0;const before=renderToStaticMarkup(Shared({query}));assert.match(before,/Loading shared products/);assert.doesNotMatch(before,/Buy my stack/)
 const cleanup=effects[0]();await new Promise(setImmediate)
 index=0;const after=renderToStaticMarkup(Shared({query}));cleanup()
 assert.equal(calls,1);assert.match(after,/Fixture a/);assert.match(after,/3 pack/)
 assert.match(after,/href="https:\/\/shop.theliftinglab.co.uk\/cart\/1:3,2:2"/)
 assert.match(after,/Share this stack URL/)
})
test('invalid shared screen displays validation message and never looks up or buys variants', () => {
 let called=false
 const Shared=modules({NEXT_PUBLIC_TLL_STACK_CART:'enabled'}, {
  react:{useState:initial=>[initial,()=>{}],useEffect:effect=>effect()},
  fetch:()=>{called=true;throw Error('Forbidden')}
 })('components/SharedStack.tsx').default
 const result=renderToStaticMarkup(Shared({query:'?items=1:1&items=2:2'}))
 assert.match(result,/Invalid shared stack/);assert.doesNotMatch(result,/Buy my stack/);assert.equal(called,false)
})
