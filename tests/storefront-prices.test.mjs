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
      if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }
      if (name in overrides) return overrides[name]
      if (name === 'next/server') return { connection: async () => {} }
      if (name === '@/lib/gtag') return { track() {} }
      if (name === '@/components/LocalStackContext') return { useLocalStack: () => ({ state: { error: null }, inStack: () => false, toggle() {} }) }
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
const load = modules(), sf = load('lib/commerce/storefront-prices.ts')
const id = n => `gid://shopify/ProductVariant/${n}`
const node = (n, patch = {}) => ({ id: id(n), availableForSale: true, price: { amount: '12.50', currencyCode: 'GBP' }, ...patch })
const response = (nodes, options = {}) => new Response(JSON.stringify({ data: { nodes }, ...options.body }), {
  status: options.status ?? 200, headers: { 'x-shopify-api-version': options.version ?? '2026-07' },
})
const options = transport => ({ enabled: true, shop: 'synthetic.myshopify.com', privateToken: 'synthetic-private-token', transport })

test('batched read-only query deduplicates IDs, preserves large string IDs and returns GBP price/stock', async () => {
  let calls = 0
  const read = sf.createStorefrontPriceReader(options(async (url, init) => {
    calls++
    assert.equal(url, 'https://synthetic.myshopify.com/api/2026-07/graphql.json')
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'manual'); assert.equal(init.cache, 'no-store')
    assert.equal(init.credentials, 'omit')
    assert.equal(init.headers['Shopify-Storefront-Private-Token'], 'synthetic-private-token')
    const body = JSON.parse(init.body)
    assert.match(body.query, /^query TllVariantPrices/); assert.doesNotMatch(body.query, /mutation|cart|checkout|inventoryQuantity|cost/i)
    assert.deepEqual(body.variables.ids, [id(1), id('90071992547409931234')])
    return response([node(1), node('90071992547409931234', { availableForSale: false })])
  }))
  const rows = await read(['1', id(1), id('90071992547409931234'), 'not-a-variant'])
  assert.equal(calls, 1); assert.equal(rows.size, 2)
  assert.equal(rows.get(id(1)).price, 12.5); assert.equal(rows.get(id('90071992547409931234')).availableForSale, false)
})
test('cache expires exactly at 15 minutes, caches per variant and returns copies', async () => {
  let clock = 1000, calls = 0, amount = '12.50'
  const read = sf.createStorefrontPriceReader({ ...options(async (_url, init) => {
    calls++; return response(JSON.parse(init.body).variables.ids.map(gid => node(gid.split('/').at(-1), { price: { amount, currencyCode: 'GBP' } })))
  }), now: () => clock })
  const first = await read(['1']); first.get(id(1)).price = 99
  clock += sf.STOREFRONT_PRICE_CACHE_MS - 1
  assert.equal((await read(['1'])).get(id(1)).price, 12.5); assert.equal(calls, 1)
  await read(['1', '2']); assert.equal(calls, 2)
  clock++; amount = '14.00'
  assert.equal((await read(['1'])).get(id(1)).price, 14); assert.equal(calls, 3)
})
test('expired cache never survives a failed refresh and cache is isolated by reader configuration', async () => {
  let clock = 0, fail = false
  const read = sf.createStorefrontPriceReader({ ...options(async () => { if (fail) throw Error('private error'); return response([node(1)]) }), now: () => clock })
  await read(['1']); clock = sf.STOREFRONT_PRICE_CACHE_MS; fail = true
  assert.equal((await read(['1'])).size, 0)
  const other = sf.createStorefrontPriceReader(options(async () => response([node(1, { price: { amount: '99', currencyCode: 'GBP' } })])))
  assert.equal((await other(['1'])).get(id(1)).price, 99)
})
test('large catalogues split into bounded batches and empty/invalid inputs make no requests', async () => {
  const counts = []
  const read = sf.createStorefrontPriceReader(options(async (_url, init) => {
    const ids = JSON.parse(init.body).variables.ids; counts.push(ids.length)
    return response(ids.map(gid => node(gid.split('/').at(-1))))
  }))
  assert.equal((await read([])).size, 0); assert.equal((await read(['0', 'gid://shopify/Product/1'])).size, 0)
  assert.equal((await read(Array.from({ length: 205 }, (_, n) => String(n + 1)))).size, 205)
  assert.deepEqual(counts, [100, 100, 5])
})
for (const patch of [{ enabled: undefined }, { enabled: false }, { shop: 'https://synthetic.myshopify.com' }, { shop: 'evil.invalid' }, { privateToken: '' }]) {
  test(`disabled/invalid configuration makes no request: ${JSON.stringify(patch)}`, async () => {
    const read = sf.createStorefrontPriceReader({ ...options(() => { throw Error('Must not fetch') }), ...patch })
    assert.equal((await read(['1'])).size, 0)
  })
}
for (const [name, transport] of [
  ['http failure', async () => response([node(1)], { status: 500 })],
  ['wrong API version', async () => response([node(1)], { version: '2026-04' })],
  ['GraphQL errors', async () => response([node(1)], { body: { errors: [{ message: 'private' }] } })],
  ['missing variant', async () => response([null])],
  ['wrong ID', async () => response([node(2)])],
  ['non-GBP', async () => response([node(1, { price: { amount: '12.50', currencyCode: 'USD' } })])],
  ['zero price', async () => response([node(1, { price: { amount: '0', currencyCode: 'GBP' } })])],
  ['negative price', async () => response([node(1, { price: { amount: '-1', currencyCode: 'GBP' } })])],
  ['malformed price', async () => response([node(1, { price: { amount: 'NaN', currencyCode: 'GBP' } })])],
  ['missing stock', async () => response([node(1, { availableForSale: undefined })])],
  ['invalid JSON', async () => new Response('{')],
  ['oversized body', async () => new Response(' '.repeat(65537))],
  ['network exception', async () => { throw Error('private token'); }],
]) test(`${name} returns unavailable without caching the failure`, async () => {
  let calls = 0
  const read = sf.createStorefrontPriceReader(options(async (...args) => { calls++; return transport(...args) }))
  assert.equal((await read(['1'])).size, 0); assert.equal((await read(['1'])).size, 0); assert.equal(calls, 2)
})

const now = Date.now()
const mapping = { productId: 'fixture', shopifyProductHandle: 'fixture', shopifyVariantId: id(1), active: true, approved: true,
  review: { approved: true, version: 'v1', expectedVersion: 'v1', verifiedAtMs: now - 1000, expiresAtMs: now + 3600000 } }
const product = { id: 'fixture', brand: 'Fixture', name: 'Test pack', category: 'creatine', servings_per_container: 25,
  retail_price: 99, buy_url: 'https://www.amazon.co.uk/dp/B000000001', storeLinkMapping: mapping, nutrients: [] }
const enabled = { NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled', NEXT_PUBLIC_TLL_STORE_PRICES: 'enabled' }
const mappingIdentity = { formulaId: 'formula', formulaVersion: 'v1', flavourId: 'vanilla', labelVersion: 'v1',
  pack: { version: 'v1', sellingUnit: 'single', innerCount: 1, amountPerInner: 500, unit: 'g' } }
const readMappings = async () => [{ comparison_product_id: product.id, status: 'store', active: true,
  shopify_product_id: 'gid://shopify/Product/2', shopify_variant_id: mapping.shopifyVariantId, handle: mapping.shopifyProductHandle,
  supplier: 'synthetic', supplier_sku: 'synthetic', pack: null, flavour: null, approval_reference: 'synthetic',
  review: mapping.review, mapping_status: 'exact', mapping_source: 'verified_labels',
  shop_identity: mappingIdentity, supplier_identity: mappingIdentity }]

const attach = load('lib/commerce/store-price-products.ts').attachStorePrices
const observed = stock => new Map([[id(1), { variantId: id(1), price: 12.5, availableForSale: stock, observedAtMs: now }]])

test('Shopify price feeds serving cost without changing original record or unmapped affiliate products', async () => {
  const unmapped = { ...product, id: 'unmapped', storeLinkMapping: null }
  const prices = await attach([product, unmapped], { enabled: true, now, read: async ids => {
    assert.deepEqual(Array.from(ids), [id(1)]); return observed(true)
  } })
  assert.equal(product.retail_price, 99); assert.equal(prices[0].retail_price, 12.5); assert.equal(prices[1], unmapped)
  assert.equal(load('lib/products.ts').withScore(prices[0]).cost_per_serving, 0.5)
  assert.equal(JSON.stringify(prices[0]).includes('private-token'), false)
})
test('off, expired/unapproved mappings and legacy catalogue holds make no Storefront requests', async () => {
  const noRead = () => { throw Error('Must not fetch') }
  assert.equal(await attach([product], { enabled: false, read: noRead }).then(rows => rows[0]), product)
  for (const p of [{ ...product, storeLinkMapping: { ...mapping, active: false } },
    { ...product, storeLinkMapping: { ...mapping, review: { ...mapping.review, expiresAtMs: now } } },
    { ...product, cataloguePresentation: { productId: 'fixture', availability: 'unavailable', purchaseEnabled: false } }]) {
    assert.equal((await attach([p], { enabled: true, now, read: noRead }))[0], p)
  }
})
for (const stock of [true, false, null]) test(`stock ${stock} chooses store/affiliate and renders correct label`, async () => {
  const [priced] = await attach([product], { enabled: true, now, read: async () => stock === null ? new Map() : observed(stock) })
  const on = modules(enabled), policy = on('lib/affiliate.ts'), availability = on('lib/commerce/catalogue-presentation.ts')
  assert.equal(availability.catalogueAvailabilityFor(priced, now), stock === true ? 'available' : stock === false ? 'out_of_stock' : 'unavailable')
  const offer = policy.resolveProductOffer(priced)
  assert.equal(offer.relationship, stock === true ? 'own_shop' : 'affiliate')
  const html = renderToStaticMarkup(React.createElement(on('components/ProductOfferLink.tsx').default, { product: priced }))
  assert.match(html, stock === true ? /In stock at TLL Store/ : stock === false ? /Out of stock at TLL Store/ : /price and stock unavailable/)
  assert.match(html, stock === true ? /Buy at TLL Store/ : /View retailer/)
  if (stock === null) {
    assert.equal(priced.retail_price, null); assert.equal(on('lib/products.ts').withScore(priced).cost_per_serving, null)
  }
})
test('stale observation falls back; legacy approval holds still block all purchase links', async () => {
  const [priced] = await attach([product], { enabled: true, now, read: async () => observed(true) })
  priced.storePrice.observedAtMs = now - sf.STOREFRONT_PRICE_CACHE_MS
  const on = modules(enabled)
  assert.equal(on('lib/affiliate.ts').resolveProductOffer(priced).relationship, 'affiliate')
  const html = renderToStaticMarkup(React.createElement(on('components/ProductOfferLink.tsx').default, { product: {
    ...priced, cataloguePresentation: { productId: 'fixture', availability: 'out_of_stock', purchaseEnabled: false },
  } }))
  assert.doesNotMatch(html, /href=/)
})
test('server wrapper defaults OFF and is inert in isolated environments even with flags on', async () => {
  for (const env of [{},
    { ...enabled, NEXT_PUBLIC_TLL_ENVIRONMENT: 'synthetic-preview' }, { ...enabled, NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging' }]) {
    const local = modules(env, { 'next/server': { connection: () => { throw Error('Must stay static') } } })
    const rows = [product]
    assert.equal(await local('lib/commerce/store-price-server.ts').withStorePrices(rows), rows)
  }
})
test('server wrapper avoids full-page caching on cache hits and sanitises missing credentials', async () => {
  let dynamic = 0
  const local = modules(enabled, { 'next/server': { connection: async () => { dynamic++ } } })
  const enrich = local('lib/commerce/store-price-server.ts').withStorePrices
  for (let i = 0; i < 2; i++) {
    const [priced] = await enrich([product], { readMappings }); assert.equal(priced.retail_price, null)
  }
  assert.equal(dynamic, 2)
})
test('catalogue/detail/compare/category server loaders pass approved projections into price/score attachment', async () => {
  let requests = 0, dynamic = 0
  const sb = { from(table) {
    const data = table === 'products' ? [product] : []
    return { select() { return this }, eq() { return this }, in() { return this }, order() { return this },
      maybeSingle: async () => ({ data: data[0] ?? null, error: null }), then: done => Promise.resolve({ data, error: null }).then(done) }
  } }
  const local = modules({ ...enabled, TLL_STOREFRONT_SHOP: 'synthetic.myshopify.com', TLL_STOREFRONT_PRIVATE_TOKEN: 'synthetic-private-token' }, {
    './store-mapping-server': { ...modules()('lib/commerce/store-mapping-server.ts'), createStoreMappingReader: () => readMappings },
    '@/lib/supabase-public': { createPublicClient: () => sb }, 'next/server': { connection: async () => { dynamic++ } },
    fetch: async () => { requests++; return response([node(1)]) },
  })
  const loaders = local('lib/product-data.ts')
  for (const rows of [await loaders.fetchCatalogue(), [await loaders.fetchProductDetail('fixture')],
    await loaders.fetchCompareProducts(['fixture']), await loaders.fetchCategory('creatine')]) {
    assert.equal(rows[0].retail_price, 12.5); assert.equal(rows[0].cost_per_serving, 0.5)
  }
  assert.equal(requests, 1); assert.equal(dynamic, 4)
})

for (const stock of [true, false, null]) test(`rendered grid and detail use store price/True Cost and stock fallback: ${stock}`, async () => {
  const [priced] = await attach([product], { enabled: true, now, read: async () => stock === null ? new Map() : observed(stock) })
  const noop = { __esModule: true, default: () => null }
  const local = modules(enabled, {
    '@/components/TopNav': noop, '@/components/FavouriteButton': noop, '@/components/ReviewSection': noop,
    '@/components/ShareModal': noop,
    'next/navigation': { ...require('next/navigation'), useRouter: () => ({ push() {}, refresh() {} }), useSearchParams: () => new URLSearchParams() },
  })
  const scored = local('lib/products.ts').withScore(priced)
  const grid = renderToStaticMarkup(React.createElement(local('app/products/ProductGrid.tsx').default, { initialProducts: [scored] }))
  const detail = renderToStaticMarkup(React.createElement(local('app/products/[id]/ProductDetailPage.tsx').default, { product: scored, related: [] }))
  for (const html of [grid, detail]) {
    assert.doesNotMatch(html, /£99\.00/)
    if (stock === null) assert.match(html, />Price<\/span><b>Not listed<\/b>/)
    else { assert.match(html, /£12\.50/); assert.match(html, /£0\.50/) }
    assert.match(html, stock === true ? /Buy at TLL Store/ : /View retailer/)
    if (stock === false) assert.match(html, /Out of stock at TLL Store/)
  }
})

test('out-of-stock remains visible when there is no reviewed affiliate fallback URL', async () => {
  const [priced] = await attach([{ ...product, buy_url: null }], { enabled: true, now, read: async () => observed(false) })
  const local = modules(enabled)
  const html = renderToStaticMarkup(React.createElement(local('components/ProductOfferLink.tsx').default, { product: priced }))
  assert.match(html, /Out of stock at TLL Store/); assert.doesNotMatch(html, /href=/)
})
