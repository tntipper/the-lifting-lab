import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const attribution = loadSource('../lib/commerce/store-attribution.ts')
const catalogueAvailability = loadSource('../lib/commerce/catalogue-presentation.ts')
function loadSource(path, overrides = {}, env = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const loaded = { exports: {} }
  vm.runInNewContext(js, { require: name => overrides[name] ?? (name === './commerce/catalogue-presentation' ? catalogueAvailability : name === './commerce/store-attribution' ? attribution : require(name)), module: loaded, exports: loaded.exports, process: { env }, URL })
  return loaded.exports
}
const affiliate = loadSource('../lib/affiliate.ts', { './preview-mode': { isIsolatedEnvironment: () => false } })
const resolve = affiliate.resolveProductListing
const cartContext = loadSource('../components/StagingCartContext.tsx')
const cartActions = loadSource('../components/StagingCartActions.tsx', { './StagingCartContext': cartContext })
const presentation = loadSource('../lib/commerce/catalogue-presentation.ts')
const ProductOfferLink = loadSource('../components/ProductOfferLink.tsx', { './StagingCartContext': cartContext, './StagingCartActions': cartActions, '@/lib/commerce/catalogue-presentation': presentation, '@/lib/affiliate': affiliate, '@/lib/gtag': { track() { throw new Error('SSR must not track') } } }).default
const render = url => renderToStaticMarkup(React.createElement(ProductOfferLink, { product: { brand: 'Fixture', name: 'Exact identity unverified', buy_url: url }, className: 'fixture' }))

for(const [availability,label] of [['out_of_stock','Out of stock'],['available','In stock'],['unavailable','Availability under review']]) test(`reviewed ${availability} stock view never enables buying or retailer navigation`,()=>{
  const html=renderToStaticMarkup(React.createElement(ProductOfferLink,{product:{id:'fixture',brand:'Fixture',name:'One exact variant',buy_url:'https://www.amazon.co.uk/dp/B000000001',cataloguePresentation:{productId:'fixture',availability,purchaseEnabled:false}}}))
  assert.ok(html.includes(label))
  assert.doesNotMatch(html,/<a\b|href=|<button\b/)
})

for (const input of [null, undefined, '', '   ']) test(`missing reference stays unavailable: ${String(input)}`, () => {
  const result = resolve(input)
  assert.equal(result.state, 'unavailable'); assert.equal(result.url, null)
  assert.equal(result.reason, 'missing_url')
  assert.doesNotMatch(render(input), /<a\b|href=|Buy|amazon|Search retailer/)
})
for (const input of [
  'javascript:alert(1)', 'data:text/html,bad', '//www.amazon.co.uk/dp/B000000001',
  'http://www.amazon.co.uk/dp/B000000001', 'https://person:secret@www.amazon.co.uk/dp/B000000001',
  'https://www.amazon.co.uk:444/dp/B000000001', 'https://www.amazon.co.uk\\@example.invalid/item',
  'https://www.amazon.co.uk/\nitem', 'https://www.amazon.co.uk/%0a', 'https://www.amazon.co.uk/%ZZ',
  'https://www.amazon.co.uk.evil.invalid/dp/B000000001', 'https://amzn.to/unresolved',
  'https://other-store.myshopify.com/products/fixture', { href: 'https://www.amazon.co.uk/' },
]) test(`invalid or unreviewed reference is inert: ${String(input)}`, () => {
  const result = resolve(input); assert.equal(result.state, 'unavailable'); assert.equal(result.url, null)
})
for (const host of ['theliftinglab.co.uk', 'www.theliftinglab.co.uk', 'shop.theliftinglab.co.uk', 'bcuy6z-kp.myshopify.com']) test(`legacy own-shop cannot bypass eligibility: ${host}`, () => {
  const input = `https://${host}/products/fixture?variant=12345&applyCode=UNRELATED`
  const result = resolve(input)
  assert.equal(result.state, 'unavailable'); assert.equal(result.url, null)
  assert.equal(result.reason, 'own_shop_approval_required'); assert.equal(result.relationship, 'own_shop')
  assert.match(render(input), /Shop offer under review/)
  assert.doesNotMatch(render(input), /href=|affiliate|applyCode|Buy/)
})
test('referral tagging follows the actual Myprotein host and keeps fragment/path', () => {
  const result = resolve('https://www.myprotein.com/p/sports-nutrition/fixture/12345678.html?flavour=vanilla#details')
  const url = new URL(result.url)
  assert.equal(url.pathname, '/p/sports-nutrition/fixture/12345678.html')
  assert.equal(url.searchParams.get('flavour'), 'vanilla'); assert.equal(url.hash, '#details')
  assert.equal(url.searchParams.get('applyCode'), affiliate.MYPROTEIN_REF_CODE)
  assert.equal(result.state, 'listing')
})
test('Amazon listing has Amazon tracking and never Myprotein referral tracking', () => {
  const result = resolve('https://www.amazon.co.uk/dp/B000000001?th=1')
  const url = new URL(result.url)
  assert.equal(url.searchParams.get('tag'), 'theliftinglab-21')
  assert.equal(url.searchParams.get('applyCode'), null)
  assert.equal(url.searchParams.get('th'), '1')
})
test('Bulk wrapper binds a reviewed target and preserves its product query', () => {
  const result = resolve('https://www.bulk.com/uk/products/fixture/test-0000?flavour=vanilla')
  const url = new URL(result.url), target = new URL(url.searchParams.get('ued'))
  assert.equal(url.hostname, 'www.awin1.com'); assert.equal(url.searchParams.get('awinmid'), '4822')
  assert.equal(url.searchParams.get('awinaffid'), '2919631')
  assert.equal(target.hostname, 'www.bulk.com'); assert.equal(target.searchParams.get('flavour'), 'vanilla')
  assert.equal(target.searchParams.get('applyCode'), null)
})
test('only a single reviewed Bulk target can pass an Awin redirector', () => {
  const url = new URL('https://www.awin1.com/cread.php')
  url.searchParams.set('ued', 'https://shop.theliftinglab.co.uk/products/fixture?variant=1')
  assert.equal(resolve(url.href).url, null)
  url.searchParams.set('ued', 'https://www.bulk.com/uk/products/fixture/test-0000')
  assert.equal(resolve(url.href).state, 'listing')
  url.searchParams.append('ued', 'https://evil.invalid/')
  assert.equal(resolve(url.href).url, null)
})
for (const input of ['https://www.amazon.co.uk/s?k=fixture', 'https://www.bulk.com/uk/search?q=fixture', 'https://www.myprotein.com/referrals.list', 'https://www.myprotein.com/']) test(`explicit search is not an offer: ${input}`, () => {
  const result = resolve(input); assert.equal(result.state, 'search_only')
  const markup = render(input)
  assert.match(markup, /Search retailer/); assert.match(markup, /Search results/)
  assert.doesNotMatch(markup, /Buy|InStock|Add to cart/)
})
test('listing rendering never promises exact stock, price or a purchase', () => {
  const markup = render('https://www.amazon.co.uk/dp/B000000001')
  assert.match(markup, /View retailer/); assert.match(markup, /check pack and price/)
  assert.match(markup, /affiliate link/); assert.match(markup, /sponsored/)
  assert.match(markup, /opens in a new tab/)
  assert.doesNotMatch(markup, /Buy|InStock|Add to cart|price=/)
})
test('synthetic preview remains entirely inert', () => {
  const preview = loadSource('../lib/affiliate.ts', { './preview-mode': { isIsolatedEnvironment: () => true } })
  assert.equal(preview.resolveProductListing('https://www.amazon.co.uk/dp/B000000001').url, null)
  assert.equal(preview.myproteinLink(), '/preview'); assert.equal(preview.bulkDealsLink(), '/preview')
})

test('actual comparison API and OpenAPI agree that legacy links are not buy offers', async () => {
  const references = [null, 'https://shop.theliftinglab.co.uk/products/fixture?variant=1', 'https://www.amazon.co.uk/dp/B000000001', 'https://www.bulk.com/uk/search?q=fixture']
  const rows = references.map((buy_url, index) => ({ id: `fixture-${index}`, brand: 'Myprotein', name: 'Fixture', category: 'whey', score: null, retail_price: 20, servings_per_container: 10, cost_per_serving: 2, buy_url }))
  const filters = []
  const sb = { from(table) { assert.equal(table, 'products'); return this }, select() { return this }, eq(...args) { filters.push(args); return this }, then(done) { return Promise.resolve({ data: rows, error: null }).then(done) } }
  const assessment = loadSource('../lib/assessment-display.ts', { './claims-review': loadSource('../lib/claims-review.ts') })
  const shared = { '@/lib/assessment-display': assessment, '@/lib/categories': { CATEGORIES: [{ slug: 'whey' }] } }
  const api = loadSource('../app/api/ard/compare/route.ts', { ...shared, '@/lib/affiliate': affiliate, '@/lib/supabase-public': { createPublicClient: () => sb }, '@/lib/products': { PRODUCT_COLUMNS: '*', withScore: p => p, sortScored: products => products } })
  const response = await api.GET(new Request('https://fixture.invalid/api/ard/compare?category=whey'))
  assert.equal(response.status, 200)
  const json = await response.json()
  assert.deepEqual(filters, [['status', 'active'], ['category', 'whey']])
  assert.deepEqual(json.results.map(p => p.buy_url), [null, null, null, null])
  assert.deepEqual(json.results.map(p => p.listing_state), ['unavailable', 'unavailable', 'listing', 'search_only'])
  assert.equal(json.results[0].retailer_url, null); assert.equal(json.results[1].retailer_url, null)
  assert.equal(new URL(json.results[2].retailer_url).searchParams.get('applyCode'), null, 'Brand must not choose destination tracking')
  assert.match(json.results[2].listing_disclosure, /Unverified/)
  const spec = await (await loadSource('../app/api/ard/openapi.json/route.ts', shared).GET()).json()
  const properties = spec.components.schemas.RankedProduct.properties
  assert.equal(properties.buy_url.type, 'null'); assert.equal(properties.buy_url.deprecated, true)
  assert.deepEqual(properties.listing_state.enum, ['listing', 'search_only', 'unavailable'])
  assert.ok(properties.retailer_url.type.includes('null'))
})

for (const path of ['/b?node=123', '/s?k=fixture', '/gp/bestsellers']) test(`Amazon category/search is explicit: ${path}`, () => {
  assert.equal(resolve('https://www.amazon.co.uk' + path).state, 'search_only')
})
for (const url of [
  'https://www.myprotein.com/sport-nutrition/search.list?query=fixture',
  'https://www.myprotein.com/c/nutrition/protein/protein-isolate/',
  'https://www.bulk.com/uk/protein/whey-protein?pid=3128',
]) test(`retailer category is not a product listing: ${url}`, () => assert.equal(resolve(url).state, 'search_only'))
for (const url of [
  'https://www.amazon.co.uk/gp/aws/cart/add.html?ASIN.1=B000000001&Quantity.1=1',
  'https://www.amazon.co.uk/gp/redirect.html?location=https%3A%2F%2Fshop.theliftinglab.co.uk',
  'https://www.myprotein.com/basket', 'https://www.bulk.com/uk/cart',
  'https://www.amazon.co.uk/dp/B000000001?redirect_url=https%3A%2F%2Fevil.invalid',
  'https://www.myprotein.com/unknown-route', 'https://www.bulk.com/uk/products/fixture',
]) test(`cart, redirect or unknown path remains held: ${url}`, () => assert.equal(resolve(url).url, null))

test('historically misplaced tracking is removed from other retailers', () => {
  const amazon = new URL(resolve('https://www.amazon.co.uk/dp/B000000001?applyCode=WRONG').url)
  assert.equal(amazon.searchParams.get('applyCode'), null)
  const myprotein = new URL(resolve('https://www.myprotein.com/p/sports-nutrition/fixture/12345678/?tag=wrong-21').url)
  assert.equal(myprotein.searchParams.get('tag'), null)
})

const storeNow = Date.now()
const approvedMapping = { productId: 'store-fixture', shopifyProductHandle: 'fixture-vanilla-500g',
  shopifyVariantId: 'gid://shopify/ProductVariant/90071992547409931234', active: true, approved: true,
  review: { approved: true, version: 'v1', expectedVersion: 'v1', verifiedAtMs: storeNow - 1000, expiresAtMs: storeNow + 60000 } }
const storeProduct = { id: 'store-fixture', brand: 'Fixture', name: 'Vanilla 500g', buy_url: 'https://www.amazon.co.uk/dp/B000000001', storeLinkMapping: approvedMapping }
const storeUrl = 'https://shop.theliftinglab.co.uk/products/fixture-vanilla-500g?variant=90071992547409931234&utm_source=theliftinglab&utm_medium=referral&utm_campaign=product&ref=theliftinglab'
const enabledAffiliate = loadSource('../lib/affiliate.ts', { './preview-mode': { isIsolatedEnvironment: () => false } }, { NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled' })
const storeComponent = lib => loadSource('../components/ProductOfferLink.tsx', { './StagingCartContext': cartContext, './StagingCartActions': cartActions, '@/lib/commerce/catalogue-presentation': presentation, '@/lib/affiliate': lib, '@/lib/gtag': { track() { throw new Error('SSR must not track') } } }).default
const storeRender = (product, lib = enabledAffiliate) => renderToStaticMarkup(React.createElement(storeComponent(lib), { product }))

test('store URL preserves large numeric IDs and accepts numeric or canonical variant strings', () => {
  for (const shopifyVariantId of ['90071992547409931234', approvedMapping.shopifyVariantId])
    assert.equal(affiliate.buildStoreProductLink(storeProduct.id, { ...approvedMapping, shopifyVariantId }, storeNow), storeUrl)
})
for (const [name, patch] of [
  ['inactive', { active: false }], ['unapproved', { approved: false }], ['wrong product', { productId: 'other' }],
  ['blank handle', { shopifyProductHandle: '' }], ['path escape', { shopifyProductHandle: '../cart' }],
  ['query injection', { shopifyProductHandle: 'fixture?redirect=evil' }], ['encoded slash', { shopifyProductHandle: 'fixture%2fcart' }],
  ['numeric value', { shopifyVariantId: 123 }], ['zero ID', { shopifyVariantId: '0' }],
  ['wrong GID kind', { shopifyVariantId: 'gid://shopify/Product/123' }], ['variant injection', { shopifyVariantId: '123&other=456' }],
  ['review unapproved', { review: { ...approvedMapping.review, approved: false } }],
  ['expired', { review: { ...approvedMapping.review, expiresAtMs: storeNow } }],
  ['future review', { review: { ...approvedMapping.review, verifiedAtMs: storeNow + 10000 } }],
  ['stale version', { review: { ...approvedMapping.review, expectedVersion: 'v2' } }],
  ['missing review', { review: null }],
  ['malformed review version', { review: { ...approvedMapping.review, version: 123 } }],
]) test(`store ${name} falls back to the same affiliate URL and label`, () => {
  const product = { ...storeProduct, storeLinkMapping: { ...approvedMapping, ...patch } }
  assert.equal(affiliate.buildStoreProductLink(product.id, product.storeLinkMapping, storeNow), null)
  assert.equal(affiliate.buildStoreProductLink(product.id, product.storeLinkMapping, storeNow, { mode: 'cart', inStock: true }), null)
  assert.equal(JSON.stringify(enabledAffiliate.resolveProductOffer(product)), JSON.stringify(affiliate.resolveProductListing(product.buy_url)))
  assert.equal(storeRender(product), storeRender(product, affiliate))
})
test('default OFF, explicit OFF and unknown flag values preserve affiliate rendering', () => {
  for (const value of [undefined, 'disabled', 'true', '']) {
    const lib = loadSource('../lib/affiliate.ts', { './preview-mode': { isIsolatedEnvironment: () => false } }, { NEXT_PUBLIC_TLL_STORE_LINKS: value })
    assert.deepEqual(lib.resolveProductOffer(storeProduct), lib.resolveProductListing(storeProduct.buy_url))
    assert.match(storeRender(storeProduct, lib), /View retailer/)
    assert.doesNotMatch(storeRender(storeProduct, lib), /Buy at TLL Store/)
  }
})
test('approved store wins over an affiliate reference or missing reference and renders its own label', () => {
  for (const buy_url of [storeProduct.buy_url, null]) {
    const html = storeRender({ ...storeProduct, buy_url })
    assert.match(html, /Buy at TLL Store/); assert.ok(html.includes(`href="${storeUrl.replaceAll('&', '&amp;')}"`))
    assert.match(html, /opens in a new tab/); assert.doesNotMatch(html, /affiliate link|sponsored|awin|amazon/)
  }
})
test('enabled but unmapped product and legacy own-shop URL retain the old fallback', () => {
  for (const buy_url of [storeProduct.buy_url, 'https://shop.theliftinglab.co.uk/products/fixture?variant=1', null]) {
    const product = { ...storeProduct, buy_url, storeLinkMapping: null }
    assert.equal(JSON.stringify(enabledAffiliate.resolveProductOffer(product)), JSON.stringify(affiliate.resolveProductListing(buy_url)))
    assert.equal(storeRender(product), storeRender(product, affiliate))
  }
})
test('isolated preview and existing stock holds take precedence over approved store links', () => {
  const preview = loadSource('../lib/affiliate.ts', { './preview-mode': { isIsolatedEnvironment: () => true } }, { NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled' })
  assert.equal(preview.resolveProductOffer(storeProduct).url, null)
  for (const availability of ['out_of_stock', 'unavailable', 'available']) {
    const html = storeRender({ ...storeProduct, cataloguePresentation: { productId: storeProduct.id, availability, purchaseEnabled: false } })
    assert.doesNotMatch(html, /href=|Buy at TLL Store/)
  }
})

const cartUrl = 'https://shop.theliftinglab.co.uk/cart/90071992547409931234:1?utm_source=theliftinglab&utm_medium=referral&utm_campaign=product&ref=theliftinglab'
const inStockProduct = { ...storeProduct, storePrice: { productId: storeProduct.id, price: 19.99, availableForSale: true, observedAtMs: storeNow } }
const renderMode = (product, mode, lib = enabledAffiliate) => renderToStaticMarkup(React.createElement(storeComponent(lib), { product, storeBuyLinkMode: mode }))

test('Job B: enabled single Buy defaults to the exact in-stock variant cart permalink', () => {
  assert.equal(affiliate.DEFAULT_STORE_BUY_LINK_MODE, 'cart')
  assert.equal(enabledAffiliate.resolveProductOffer(inStockProduct).url, cartUrl)
  assert.ok(storeRender(inStockProduct).includes(`href="${cartUrl.replaceAll('&', '&amp;')}"`))
  assert.doesNotMatch(storeRender(inStockProduct), /\/products\//)
})
test('Job B: single Buy switch OFF preserves rendering even with approved mapping and fresh stock', () => {
  for (const value of [undefined, 'disabled', 'true', '']) {
    const lib = loadSource('../lib/affiliate.ts', { './preview-mode': { isIsolatedEnvironment: () => false } }, { NEXT_PUBLIC_TLL_STORE_LINKS: value })
    for (const buy_url of [storeProduct.buy_url, null, storeUrl]) {
      const product = { ...inStockProduct, buy_url }
      assert.deepEqual(lib.resolveProductOffer(product), lib.resolveProductListing(buy_url))
      assert.equal(storeRender(product, lib), storeRender(product, affiliate))
      assert.doesNotMatch(storeRender(product, lib), /\/cart\/|Buy at TLL Store/)
    }
  }
})
test('Job B: default cart mode retains missing-stock fallback and explicit product-page override', () => {
  assert.equal(enabledAffiliate.resolveProductOffer(storeProduct).url, storeUrl)
  assert.equal(enabledAffiliate.resolveProductOffer(inStockProduct, 'product_page').url, storeUrl)
  assert.ok(renderMode(inStockProduct, 'product_page').includes(`href="${storeUrl.replaceAll('&', '&amp;')}"`))
})
for (const mode of ['product_page', 'cart']) test(`S03 ${mode} mode builds and renders the exact selected variant`, () => {
  const expected = mode === 'cart' ? cartUrl : storeUrl
  for (const shopifyVariantId of ['90071992547409931234', approvedMapping.shopifyVariantId]) {
    assert.equal(affiliate.buildStoreProductLink(storeProduct.id, { ...approvedMapping, shopifyVariantId }, storeNow, { mode, inStock: true }), expected)
  }
  assert.equal(enabledAffiliate.resolveProductOffer(inStockProduct, mode).url, expected)
  const html = renderMode(inStockProduct, mode)
  assert.ok(html.includes(`href="${expected.replaceAll('&', '&amp;')}"`))
  assert.match(html, /Buy at TLL Store/)
  assert.doesNotMatch(html, /sponsored|affiliate link/)
})
for (const inStock of [false, undefined]) test(`S03 cart builder falls back to product page with stock ${inStock}`, () => {
  assert.equal(affiliate.buildStoreProductLink(storeProduct.id, approvedMapping, storeNow, { mode: 'cart', inStock }), storeUrl)
})
for (const [name, storePrice] of [
  ['missing', undefined],
  ['out of stock', { ...inStockProduct.storePrice, availableForSale: false }],
  ['unknown', { ...inStockProduct.storePrice, availableForSale: null }],
  ['stale', { ...inStockProduct.storePrice, observedAtMs: storeNow - 15 * 60 * 1000 }],
  ['future', { ...inStockProduct.storePrice, observedAtMs: storeNow + 60000 }],
  ['wrong product', { ...inStockProduct.storePrice, productId: 'other' }],
  ['invalid price', { ...inStockProduct.storePrice, price: 0 }],
]) test(`S03 cart mode falls back to product page for ${name} stock when store prices are OFF`, () => {
  const product = { ...storeProduct, storePrice }
  assert.equal(enabledAffiliate.resolveProductOffer(product, 'cart').url, storeUrl)
  assert.ok(renderMode(product, 'cart').includes(`href="${storeUrl.replaceAll('&', '&amp;')}"`))
})
test('S03 both modes preserve T07 affiliate fallback for out-of-stock or missing stock with prices ON', () => {
  const lib = loadSource('../lib/affiliate.ts', { './preview-mode': { isIsolatedEnvironment: () => false } }, { NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled', NEXT_PUBLIC_TLL_STORE_PRICES: 'enabled' })
  for (const mode of ['product_page', 'cart']) {
    assert.equal(lib.resolveProductOffer(inStockProduct, mode).url, mode === 'cart' ? cartUrl : storeUrl)
    for (const storePrice of [undefined, { ...inStockProduct.storePrice, availableForSale: false }]) {
      const product = { ...storeProduct, storePrice }
      assert.equal(lib.resolveProductOffer(product, mode).url, lib.resolveProductListing(product.buy_url).url)
      assert.doesNotMatch(renderMode(product, mode, lib), /\/cart\/|Buy at TLL Store/)
    }
  }
})
test('S03 cart option preserves disabled links, unmapped fallback, preview and catalogue holds', () => {
  assert.equal(affiliate.resolveProductOffer(inStockProduct, 'cart').relationship, 'affiliate')
  assert.equal(enabledAffiliate.resolveProductOffer({ ...inStockProduct, storeLinkMapping: null }, 'cart').relationship, 'affiliate')
  const preview = loadSource('../lib/affiliate.ts', { './preview-mode': { isIsolatedEnvironment: () => true } }, { NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled' })
  assert.equal(preview.resolveProductOffer(inStockProduct, 'cart').url, null)
  assert.doesNotMatch(renderMode(inStockProduct, 'cart', preview), /href=/)
  for (const availability of ['available', 'out_of_stock', 'unavailable']) {
    const product = { ...inStockProduct, cataloguePresentation: { productId: storeProduct.id, availability, purchaseEnabled: false } }
    assert.notEqual(enabledAffiliate.resolveProductOffer(product, 'cart').url, cartUrl)
    assert.doesNotMatch(renderMode(product, 'cart'), /href=|Buy at TLL Store/)
  }
})

function assertAttribution(link, campaign) {
  const url = new URL(link)
  for (const [key, value] of Object.entries({ utm_source: 'theliftinglab', utm_medium: 'referral', utm_campaign: campaign, ref: 'theliftinglab' })) {
    assert.deepEqual(url.searchParams.getAll(key), [value], `${key} must appear exactly once`)
  }
  return url
}
for (const campaign of ['product', 'compare', 'stack']) {
  for (const mode of ['product_page', 'cart']) test(`S05 ${campaign} ${mode} attribution reaches builder, resolver and rendered link`, () => {
    const built = affiliate.buildStoreProductLink(storeProduct.id, approvedMapping, storeNow, { mode, inStock: true, campaign })
    const url = assertAttribution(built, campaign)
    assert.equal(url.pathname, mode === 'cart' ? '/cart/90071992547409931234:1' : '/products/fixture-vanilla-500g')
    assert.deepEqual(url.searchParams.getAll('variant'), mode === 'cart' ? [] : ['90071992547409931234'])
    assert.equal(enabledAffiliate.resolveProductOffer(inStockProduct, mode, campaign).url, built)
    const html = renderToStaticMarkup(React.createElement(storeComponent(enabledAffiliate), {
      product: inStockProduct, storeBuyLinkMode: mode, storeCampaign: campaign,
    }))
    assert.ok(html.includes(`href="${built.replaceAll('&', '&amp;')}"`))
    const fallback = affiliate.buildStoreProductLink(storeProduct.id, approvedMapping, storeNow, { mode: 'cart', inStock: false, campaign })
    assert.equal(assertAttribution(fallback, campaign).searchParams.get('variant'), '90071992547409931234')
  })
  test(`S05 ${campaign} repeated attribution removes duplicates and preserves unrelated URL data`, () => {
    const input = 'https://shop.theliftinglab.co.uk/products/fixture?variant=90071992547409931234&discount=SAVE#details'
    const first = attribution.withStoreAttribution(input, campaign)
    assert.equal(attribution.withStoreAttribution(first, campaign), first)
    const dirty = `${first.replace('#details', '')}&utm_source=other&utm_medium=other&utm_campaign=other&ref=other#details`
    const cleaned = attribution.withStoreAttribution(dirty, campaign)
    const url = assertAttribution(cleaned, campaign)
    assert.equal(cleaned, first)
    assert.equal(url.searchParams.get('variant'), '90071992547409931234')
    assert.equal(url.searchParams.get('discount'), 'SAVE')
    assert.equal(url.hash, '#details')
  })
}
test('S05 attribution never alters affiliate fallback links', () => {
  for (const campaign of ['stack', 'product', 'compare']) {
    const listing = enabledAffiliate.resolveProductOffer({ ...inStockProduct, storeLinkMapping: null }, 'cart', campaign)
    assert.equal(listing.url, resolve(inStockProduct.buy_url).url)
    assert.equal(new URL(listing.url).searchParams.get('utm_source'), null)
  }
})
test('S05 comparison and stack pages pass their context to every store offer', () => {
  for (const [file, campaign] of [
    ['app/compare/CompareView.tsx', 'compare'], ['app/vs/[matchup]/page.tsx', 'compare'],
    ['app/brands-vs/[matchup]/page.tsx', 'compare'], ['app/stacks/[goal]/page.tsx', 'stack'],
    ['app/stack/StackBuilder.tsx', 'stack'],
  ]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    const buttons = source.match(/<ProductOfferLink\b[^>]*>/g)
    assert.ok(buttons?.length, file)
    for (const button of buttons) assert.ok(button.includes(`storeCampaign="${campaign}"`), file)
  }
  const stackSource = readFileSync(new URL('../app/stack/StackBuilder.tsx', import.meta.url), 'utf8')
  const calls = stackSource.match(/resolveProductOffer\([^\n]+/g)
  assert.equal(calls.length, 2)
  for (const call of calls) assert.ok(call.includes("DEFAULT_STORE_BUY_LINK_MODE, 'stack'"))
})


test('card/detail Coming soon is inert and uses the exact normal action classes and style', () => {
  const Component = storeComponent(enabledAffiliate)
  const props = { comingSoonWhenNotSold: true, className: 'fixture-buy w-full py-3', style: { borderRadius: 8 } }
  const html = product => renderToStaticMarkup(React.createElement(Component, { ...props, product }))
  const sellable = html(storeProduct)
  for (const buy_url of [null, storeProduct.buy_url, 'https://shop.theliftinglab.co.uk/products/legacy']) {
    const unavailable = html({ ...storeProduct, buy_url, storeLinkMapping: null })
    assert.match(unavailable, /<button[^>]*disabled=""[^>]*aria-disabled="true"/)
    assert.match(unavailable, />Coming soon<\/button>/)
    assert.doesNotMatch(unavailable, /<a\b|href=/)
    assert.equal(unavailable.match(/<button[^>]*class="([^"]+)"/)[1], sellable.match(/<a[^>]*class="([^"]+)"/)[1])
    assert.equal(unavailable.match(/style="([^"]+)"/)[1], sellable.match(/style="([^"]+)"/)[1])
  }
  assert.equal(sellable, renderToStaticMarkup(React.createElement(Component, { ...props, comingSoonWhenNotSold: false, product: storeProduct })))
})
