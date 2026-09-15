import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
function loadSource(path, overrides = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const loaded = { exports: {} }
  vm.runInNewContext(js, { require: name => overrides[name] ?? require(name), module: loaded, exports: loaded.exports, process: { env: {} }, URL })
  return loaded.exports
}
const affiliate = loadSource('../lib/affiliate.ts', { './preview-mode': { isSyntheticPreview: () => false } })
const resolve = affiliate.resolveProductListing
const ProductOfferLink = loadSource('../components/ProductOfferLink.tsx', { '@/lib/affiliate': affiliate, '@/lib/gtag': { track() { throw new Error('SSR must not track') } } }).default
const render = url => renderToStaticMarkup(React.createElement(ProductOfferLink, { product: { brand: 'Fixture', name: 'Exact identity unverified', buy_url: url }, className: 'fixture' }))

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
  const preview = loadSource('../lib/affiliate.ts', { './preview-mode': { isSyntheticPreview: () => true } })
  assert.equal(preview.resolveProductListing('https://www.amazon.co.uk/dp/B000000001').url, null)
  assert.equal(preview.myproteinLink(), '/preview'); assert.equal(preview.bulkDealsLink(), '/preview')
})

test('actual comparison API and OpenAPI agree that legacy links are not buy offers', async () => {
  const references = [null, 'https://shop.theliftinglab.co.uk/products/fixture?variant=1', 'https://www.amazon.co.uk/dp/B000000001', 'https://www.bulk.com/uk/search?q=fixture']
  const rows = references.map((buy_url, index) => ({ id: `fixture-${index}`, brand: 'Myprotein', name: 'Fixture', category: 'whey', score: null, retail_price: 20, servings_per_container: 10, cost_per_serving: 2, buy_url }))
  const filters = []
  const sb = { from(table) { assert.equal(table, 'products'); return this }, select() { return this }, eq(...args) { filters.push(args); return this }, then(done) { return Promise.resolve({ data: rows, error: null }).then(done) } }
  const shared = { '@/lib/categories': { CATEGORIES: [{ slug: 'whey' }] } }
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
