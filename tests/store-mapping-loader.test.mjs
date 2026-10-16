import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
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
      URL, URLSearchParams, Response, Request, Headers, AbortSignal, Buffer, Uint8Array, TextDecoder, Date, structuredClone,
      fetch: overrides.fetch ?? (() => { throw new Error('Live network forbidden') }) }, { filename })
    cache.set(path, mod.exports); return mod.exports
  }
  return load
}
const now = Date.now()
const pack = { version: 'v1', sellingUnit: 'single', innerCount: 1, amountPerInner: 500, unit: 'g' }
const identity = { formulaId: 'formula', formulaVersion: 'v1', flavourId: 'vanilla', labelVersion: 'v1', pack }
const row = { comparison_product_id: 'fixture', status: 'store', shopify_product_id: 'gid://shopify/Product/2',
  shopify_variant_id: 'gid://shopify/ProductVariant/90071992547409931234', handle: 'fixture-vanilla',
  supplier: 'private-supplier', supplier_sku: 'private-sku', pack, flavour: 'vanilla', active: true,
  approval_reference: 'private-approval', mapping_status: 'exact', mapping_source: 'verified_labels',
  shop_identity: identity, supplier_identity: identity,
  review: { approved: true, version: 'v1', expectedVersion: 'v1', verifiedAtMs: now - 1000, expiresAtMs: now + 3600000 } }
const product = { id: 'fixture', brand: 'Fixture', name: 'Test', retail_price: 99, buy_url: 'https://www.amazon.co.uk/dp/B000000001' }
const enabled = { NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled', NEXT_PUBLIC_TLL_STORE_PRICES: 'enabled',
  TLL_STOREFRONT_SHOP: 'synthetic.myshopify.com', TLL_STOREFRONT_PRIVATE_TOKEN: 'synthetic-private-token' }
async function run(rows, env = enabled, input = product) {
  let reads = 0, prices = 0, connections = 0
  const load = modules(env, { 'next/server': { connection: async () => { connections++ } }, fetch: async () => {
    prices++
    return new Response(JSON.stringify({ data: { nodes: [{ id: row.shopify_variant_id, availableForSale: true,
      price: { amount: '12.50', currencyCode: 'GBP' } }] } }), { headers: { 'x-shopify-api-version': '2026-07' } })
  } })
  const [result] = await load('lib/commerce/store-price-server.ts').withStorePrices([input], {
    now, readMappings: async ids => { reads++; assert.deepEqual(Array.from(ids), ['fixture']); if (rows instanceof Error) throw rows; return rows },
  })
  const html = renderToStaticMarkup(React.createElement(load('components/ProductOfferLink.tsx').default, { product: result }))
  return { result, offer: load('lib/affiliate.ts').resolveProductOffer(result), html, reads, prices, connections }
}
for (const [name, rows] of [
  ['missing', []], ['inactive', [{ ...row, active: false }]],
  ['expired review', [{ ...row, review: { ...row.review, expiresAtMs: now } }]],
  ['reader error', new Error('private error')], ['duplicate variant id', [row, { ...row }]],
  ['one unapproved duplicate', [row, { ...row, approval_reference: null }]],
]) test(`${name} mapping fails closed through loader and offer resolver`, async () => {
  const { result, offer, prices } = await run(rows)
  assert.equal(result.storeLinkMapping, null); assert.equal(offer.relationship, 'affiliate')
  assert.notEqual(offer.relationship, 'own_shop'); assert.equal(prices, 0)
  assert.equal((await run(rows, enabled, { ...product, buy_url: null })).offer.url, null)
})
test('approved mapping with both flags links the fresh in-stock exact variant cart with attribution', async () => {
  const { result, offer, html, prices, connections } = await run([row])
  assert.equal(offer.relationship, 'own_shop'); assert.match(html, /Buy at TLL Store/)
  assert.equal(offer.url, 'https://shop.theliftinglab.co.uk/cart/90071992547409931234:1?utm_source=theliftinglab&utm_medium=referral&utm_campaign=product&ref=theliftinglab')
  assert.equal(result.retail_price, 12.5); assert.equal(prices, 1); assert.equal(connections, 1)
  assert.equal(product.storeLinkMapping, undefined)
})
test('prices OFF still loads mappings and falls back to the product page without reading prices', async () => {
  const { result, offer, html, prices, connections } = await run([row], { ...enabled, NEXT_PUBLIC_TLL_STORE_PRICES: 'disabled' })
  assert.equal(offer.relationship, 'own_shop'); assert.match(html, /Buy at TLL Store/)
  assert.equal(offer.url, 'https://shop.theliftinglab.co.uk/products/fixture-vanilla?variant=90071992547409931234&utm_source=theliftinglab&utm_medium=referral&utm_campaign=product&ref=theliftinglab')
  assert.equal(result.storePrice, undefined); assert.equal(prices, 0); assert.equal(connections, 1)
})
test('only whitelisted link fields enter browser data, including review JSON', async () => {
  const { result } = await run([{ ...row, cost_ex_vat: 123, supplier_cost: 456,
    review: { ...row.review, cost_ex_vat: 789, supplier: 'PRIVATE' } }])
  assert.deepEqual(Object.keys(result.storeLinkMapping).sort(), ['active', 'approved', 'productId', 'review', 'shopifyProductHandle', 'shopifyVariantId'])
  assert.doesNotMatch(JSON.stringify(result), /cost_ex_vat|supplier_cost|private-supplier|private-sku|private-approval|PRIVATE/)
})
for (const env of [{}, { ...enabled, NEXT_PUBLIC_TLL_STORE_LINKS: 'disabled' },
  { ...enabled, NEXT_PUBLIC_TLL_ENVIRONMENT: 'synthetic-preview' }, { ...enabled, NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging' }]) {
  test(`disabled or isolated loader is inert: ${JSON.stringify(env)}`, async () => {
    const { result, reads, prices, connections } = await run([row], env)
    assert.equal(result, product); assert.equal(result.storeLinkMapping, undefined)
    assert.equal(reads + prices + connections, 0)
  })
}
test('reader uses service-role RPC, exact ID filter and no-store transport; missing env and errors return no rows', async () => {
  const load = modules(), { createStoreMappingReader } = load('lib/commerce/store-mapping-server.ts')
  let calls = 0
  const options = { url: 'https://synthetic.supabase.co', serviceRoleKey: 'synthetic-service-role', transport: async (url, init) => {
    calls++; assert.equal(String(url), 'https://synthetic.supabase.co/rest/v1/rpc/tll_store_link_mapping_rows')
    assert.equal(init.cache, 'no-store'); assert.deepEqual(JSON.parse(init.body), { product_ids: ['fixture'] })
    assert.equal(new Headers(init.headers).get('apikey'), 'synthetic-service-role')
    return new Response(JSON.stringify([row]), { headers: { 'Content-Type': 'application/json' } })
  } }
  assert.equal((await createStoreMappingReader(options)(['fixture', 'fixture'])).length, 1)
  for (const patch of [{ url: undefined }, { serviceRoleKey: undefined }])
    assert.equal((await createStoreMappingReader({ ...options, ...patch })(['fixture'])).length, 0)
  assert.equal((await createStoreMappingReader(options)([])).length, 0); assert.equal(calls, 1)
  for (const transport of [async () => { throw Error('private') }, async () => new Response('{}', { status: 500 })])
    assert.equal((await createStoreMappingReader({ ...options, transport })(['fixture'])).length, 0)
})
test('RPC migration is read-only, filters active store IDs, omits costs, and restricts execution', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202610130001_store_link_mapping_reader.sql', import.meta.url), 'utf8')
  assert.match(sql, /security definer set search_path = pg_catalog/)
  assert.match(sql, /from tll_mapping_private.product_mapping/)
  assert.match(sql, /m.active = true and m.status = 'store' and m.comparison_product_id = any\(product_ids\)/)
  assert.match(sql, /revoke all on function .* from public, anon, authenticated/)
  assert.match(sql, /grant execute on function .* to service_role/)
  assert.doesNotMatch(sql, /cost_ex_vat|select \*|insert into|update |delete from/)
})
test('an incoming cached mapping is replaced with null when the reader returns nothing or throws', async () => {
  const cached = { productId: 'fixture', shopifyProductHandle: 'stale-handle', shopifyVariantId: 'gid://shopify/ProductVariant/9',
    review: row.review, active: true, approved: true }
  for (const rows of [[], new Error('reader down'), [{ ...row, comparison_product_id: 'other-product' }]]) {
    const { result, offer } = await run(rows, enabled, { ...product, storeLinkMapping: cached })
    assert.equal(result.storeLinkMapping, null)
    assert.notEqual(offer.relationship, 'own_shop')
  }
})

for (const pricesOn of [false, true]) test(`live loader attaches mappings without STORE_LINKS; prices flag ${pricesOn}`, async () => {
  const { result, offer, html, reads, prices, connections } = await run([row], {
    ...enabled, NEXT_PUBLIC_TLL_STORE_LINKS: undefined, NEXT_PUBLIC_TLL_LIVE_CART: 'enabled',
    NEXT_PUBLIC_TLL_STORE_PRICES: pricesOn ? 'enabled' : undefined,
  })
  assert.ok(result.storeLinkMapping)
  assert.equal(reads, 1); assert.equal(connections, 1); assert.equal(prices, pricesOn ? 1 : 0)
  assert.equal(result.storePrice?.price, pricesOn ? 12.5 : undefined)
  assert.match(offer.url, /products\/fixture-vanilla\?variant=90071992547409931234&/)
  assert.match(html, /Buy at TLL Store/)
  assert.doesNotMatch(html, />Add to basket<\/a>/)
})
for (const isolated of ['staging', 'synthetic-preview']) test(`live loader remains inert in ${isolated}`, async () => {
  const { result, reads, prices, connections } = await run([row], {
    ...enabled, NEXT_PUBLIC_TLL_LIVE_CART: 'enabled', NEXT_PUBLIC_TLL_ENVIRONMENT: isolated,
  })
  assert.equal(result, product); assert.equal(reads + prices + connections, 0)
})
