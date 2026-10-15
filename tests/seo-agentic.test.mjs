import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

async function load(entry, stubs = {}) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'offline-fixtures', setup(b) {
      b.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
    } }] })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const seo = await load('lib/seo.ts')
const { serializeJsonForHtml } = await load('lib/json-for-html.ts')
const now = 1791972000000
const mapping = variant => ({ productId: 'fixture', shopifyProductHandle: 'test-product', shopifyVariantId: variant, active: true, approved: true,
  review: { approved: true, version: '1', expectedVersion: '1', verifiedAtMs: now - 1000, expiresAtMs: now + 60000 } })
const price = stock => ({ productId: 'fixture', price: 24.99, availableForSale: stock, observedAtMs: now, sku: 'PUBLIC-SKU', barcode: '4006381333931' })
const product = { id: 'fixture', name: 'Original <name>', brand: 'Brand', category: 'whey', image_url: 'https://example.com/image.jpg', retail_price: 99,
  serving_size: 30, serving_unit: 'g', nutrients: [{ nutrient_name: 'Protein', amount: 22.5, unit: 'g' }],
  storeVariants: ['1001', '1002'].map((variantId, i) => ({ variantId, label: i ? 'Chocolate · 500 g' : 'Vanilla · 500 g', flavour: i ? 'Chocolate' : 'Vanilla', packLabel: '500 g', mapping: mapping(variantId), storePrice: price(!i) })),
  cost_ex_vat: 'PRIVATE-COST', supplier_sku: 'PRIVATE-SKU', supplier: 'PRIVATE-SUPPLIER' }

test('ProductGroup has exact variants, GBP offers, stock, seller, shipping and returns', () => {
  const ld = seo.productJsonLd(product, now)
  assert.equal(ld['@type'], 'ProductGroup'); assert.equal(ld.productGroupID, 'fixture')
  assert.deepEqual(ld.variesBy, [{ '@type': 'PropertyValue', name: 'flavour', value: ['Vanilla', 'Chocolate'] }, 'https://schema.org/size'])
  assert.equal(ld.hasVariant.length, 2)
  for (const [i, v] of ld.hasVariant.entries()) {
    assert.equal(v.brand.name, 'Brand'); assert.equal(v.sku, 'PUBLIC-SKU'); assert.equal(v.gtin, '4006381333931')
    assert.equal(v.offers.price, 24.99); assert.equal(v.offers.priceCurrency, 'GBP')
    assert.equal(v.offers.availability, `https://schema.org/${i ? 'OutOfStock' : 'InStock'}`)
    assert.equal(v.offers.seller.name, 'The Lifting Lab')
    assert.equal(v.offers.shippingDetails.shippingRate.value, 4.99)
    assert.equal(v.offers.shippingDetails.shippingDestination.addressCountry, 'GB')
    assert.equal(v.offers.hasMerchantReturnPolicy.merchantReturnLink, `${seo.SITE_URL}/refunds`)
    assert.match(v.offers.url, /shop\.theliftinglab\.co\.uk\/products\/test-product\?variant=100[12]$/)
  }
  assert.ok(!JSON.stringify(ld).includes('PRIVATE'))
})
test('Single Product and missing/expired/unapproved observations never invent offers', () => {
  const single = { ...product, storeVariants: undefined }
  assert.equal(seo.productJsonLd(single, now)['@type'], 'Product')
  assert.ok(!seo.productJsonLd(single, now).offers)
  for (const patch of [
    { storePrice: { ...price(true), observedAtMs: now - 900000 } },
    { storePrice: { ...price(true), productId: 'other' } },
    { storePrice: { ...price(true), availableForSale: null } },
    { storePrice: { ...price(true), price: NaN } },
    { mapping: { ...mapping('1001'), approved: false } },
    { mapping: { ...mapping('1001'), review: { ...mapping('1001').review, expiresAtMs: now } } },
  ]) assert.ok(!seo.productJsonLd({ ...product, storeVariants: [{ ...product.storeVariants[0], ...patch }] }, now).offers)
  const held = seo.productJsonLd({ ...product, cataloguePresentation: { productId: 'fixture', availability: 'unavailable', purchaseEnabled: false } }, now)
  assert.ok(held.hasVariant.every(v => !v.offers))
})
test('Size-only records retain labels but their legacy retail prices are not offers', () => {
  const p = { ...product, storeVariants: undefined, sizeOptions: [{ slug: 'single', label: 'Single 64g bar', retail_price: 2 }, { slug: 'box', label: '12 × 64g', retail_price: 23.99 }] }
  const ld = seo.productJsonLd(p, now)
  assert.equal(ld['@type'], 'ProductGroup'); assert.ok(ld.hasVariant.every(v => !v.offers))
  assert.equal(ld.hasVariant[0].size, 'Single 64g bar'); assert.match(ld.hasVariant[0].url, /\?size=single$/)
})
test('GTIN validation accepts valid lengths/checksums only and JSON escapes script terminators', () => {
  for (const value of ['96385074', '036000291452', '4006381333931', '10012345000017']) assert.equal(seo.validGtin(value), value)
  for (const value of ['123', '4006381333932', '<script>', 4006381333931]) assert.equal(seo.validGtin(value), null)
  const value = { title: '</script><script>alert(1)</script>' }
  assert.ok(!serializeJsonForHtml(value).includes('<')); assert.deepEqual(JSON.parse(serializeJsonForHtml(value)), value)
})
test('Feed preserves stored nutrition and allowlists public fields only', () => {
  const before = structuredClone(product), feed = seo.productsFeed([product], now)[0]
  assert.equal(feed.title, product.name); assert.deepEqual(feed.nutrition_per_serving, product.nutrients)
  assert.equal(feed.variants[0].price, 24.99); assert.equal(feed.variants[1].availability, 'https://schema.org/OutOfStock')
  assert.ok(!JSON.stringify(feed).includes('PRIVATE')); assert.deepEqual(product, before)
  assert.equal(seo.productsFeed([{ ...product, storeVariants: undefined }], now)[0].variants[0].price, null)
})
test('llms files describe comparisons, categories, delivery, policy links and full variant observations', () => {
  const text = seo.llmsText([product], false, now), full = seo.llmsText([product], true, now)
  for (const path of ['feed/products.json', 'refunds', 'privacy', 'terms', 'affiliate-disclosure', 'compare', 'products/fixture']) assert.ok(text.includes(`${seo.SITE_URL}/${path}`))
  assert.ok(text.includes('£4.99')); assert.ok(text.includes('/best/creatine'))
  assert.ok(full.includes('GBP 24.99')); assert.ok(full.includes('OutOfStock')); assert.ok(!full.includes('PRIVATE'))
})
test('Robots repeats private disallows for every agent and keeps all preview/staging crawlers blocked', async () => {
  const robots = (await load('app/robots.ts')).default
  const previous = { VERCEL_ENV: process.env.VERCEL_ENV, NEXT_PUBLIC_TLL_ENVIRONMENT: process.env.NEXT_PUBLIC_TLL_ENVIRONMENT }
  try {
    delete process.env.NEXT_PUBLIC_TLL_ENVIRONMENT; process.env.VERCEL_ENV = 'production'
    const result = robots(); assert.equal(result.sitemap, `${seo.SITE_URL}/sitemap.xml`)
    assert.deepEqual(result.rules.map(r => r.userAgent), ['*', ...seo.AGENT_CRAWLERS])
    for (const rule of result.rules) { assert.equal(rule.allow, '/'); assert.deepEqual(rule.disallow, seo.PRIVATE_PATHS) }
    for (const env of ['preview', 'development']) { process.env.VERCEL_ENV = env; assert.equal(robots().rules.disallow, '/') }
    process.env.VERCEL_ENV = 'production'; process.env.NEXT_PUBLIC_TLL_ENVIRONMENT = 'staging'; assert.equal(robots().rules.disallow, '/')
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } }
})
const catalogueStub = `export async function fetchCatalogue() { return ${JSON.stringify([product])} }`
test('Actual llms and feed handlers return cached public responses without any live transport', async () => {
  for (const entry of ['app/llms.txt/route.ts', 'app/llms-full.txt/route.ts', 'app/feed/products.json/route.ts']) {
    const handler = await load(entry, { '@/lib/product-data': catalogueStub })
    assert.equal(handler.revalidate, 900)
    const response = await handler.GET(); assert.equal(response.status, 200)
    assert.match(response.headers.get('Cache-Control'), /s-maxage=900/)
    assert.match(response.headers.get('Content-Type'), entry.includes('feed/') ? /application\/json/ : /text\/plain/)
    assert.ok(!(await response.text()).includes('PRIVATE'))
  }
})
test('Sitemap includes products, brands, categories, comparison routes and dates, excludes private pages', async () => {
  const stub = `const q = { select(){return this}, eq(){ return this }, then(resolve){resolve({data: ${JSON.stringify([product])},error:null})} }; export function createPublicClient(){ return {from(){return q}} }`
  const sitemap = (await load('app/sitemap.ts', { '@/lib/supabase-public': stub, '@/lib/best-categories': "export async function researchCategorySlugs(){ return ['whey'] }" })).default
  const previous = process.env.VERCEL_ENV
  try {
    process.env.VERCEL_ENV = 'production'
    const entries = await sitemap(), urls = entries.map(e => e.url)
    for (const path of ['products/fixture', 'brand/brand', 'best/creatine', 'compare', 'vs', 'brands-vs', 'ingredients-vs', 'best', 'cheapest']) assert.ok(urls.includes(`${seo.SITE_URL}/${path}`), path)
    assert.ok(entries.every(e => e.lastModified instanceof Date)); assert.equal(new Set(urls).size, urls.length)
    assert.ok(urls.every(url => !/\/(admin|account|api|preview|cart|dashboard|delivery|refunds)(\/|$)/.test(url)))
    process.env.VERCEL_ENV = 'preview'; assert.deepEqual(await sitemap(), [])
  } finally { if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous }
})
test('All 38 exact draft handles are gated permanent redirects and match the Shopify CSV', async () => {
  const { draftProductRedirects } = await load('config/draft-product-redirects.ts')
  assert.deepEqual(draftProductRedirects({}), []); assert.deepEqual(draftProductRedirects({ TLL_DRAFT_REDIRECTS: 'true' }), [])
  const redirects = draftProductRedirects({ TLL_DRAFT_REDIRECTS: '1' })
  assert.equal(redirects.length, 38); assert.equal(new Set(redirects.map(r => r.source)).size, 38)
  const csv = readFileSync('config/shopify-draft-redirects.csv', 'utf8')
  for (const r of redirects) { assert.equal(r.permanent, true); assert.ok(csv.includes(`${r.source},${seo.SITE_URL}${r.destination}`)) }
})
test('Multi-size picker identity wins over a sole mapped flavour, with only exact approved offers', () => {
  const p = { ...product, storeVariants: [product.storeVariants[0]], sizeOptions: [
    { slug: 'single', label: 'Single', shopify_variant_id: '1001', retail_price: 2 },
    { slug: 'box', label: 'Box', shopify_variant_id: '9999', retail_price: 99 },
  ] }
  const ld = seo.productJsonLd(p, now)
  assert.equal(ld.hasVariant.length, 2); assert.equal(ld.hasVariant[0].offers.price, 24.99)
  assert.match(ld.hasVariant[0].url, /\?size=single$/); assert.ok(!ld.hasVariant[1].offers)
})
test('Metadata and site entities use the canonical host with product social images', () => {
  const metadata = seo.pageMetadata('/products/fixture', 'Title', 'Description', product.image_url)
  assert.equal(metadata.alternates.canonical, `${seo.SITE_URL}/products/fixture`)
  assert.deepEqual(metadata.openGraph.images, [product.image_url]); assert.deepEqual(metadata.twitter.images, [product.image_url])
  assert.equal(seo.siteJsonLd['@graph'][0].name, 'The Lifting Lab'); assert.equal(seo.siteJsonLd['@graph'][1]['@type'], 'WebSite')
  assert.equal(seo.breadcrumb([{ name: 'Home', item: seo.SITE_URL }]).itemListElement[0].position, 1)
})
test('Storefront public SKU/barcode reach the feed through the approved price projection', async () => {
  const { createStorefrontPriceReader } = await load('lib/commerce/storefront-prices.ts')
  const { attachStorePrices } = await load('lib/commerce/store-price-products.ts')
  const read = createStorefrontPriceReader({ enabled: true, shop: 'fixture.myshopify.com', privateToken: 'synthetic-token-for-test', now: () => now,
    transport: async (_url, init) => {
      const body = JSON.parse(init.body); assert.match(body.query, /id sku barcode/); assert.ok(!body.query.includes('mutation'))
      return new Response(JSON.stringify({ data: { nodes: body.variables.ids.map(id => ({ id, sku: 'PUBLIC-SKU', barcode: '4006381333931', price: { amount: '24.99', currencyCode: 'GBP' }, availableForSale: true })) } }), { headers: { 'x-shopify-api-version': '2026-07' } })
    } })
  const [priced] = await attachStorePrices([product], { enabled: true, read, now })
  assert.equal(seo.productsFeed([priced], now)[0].variants[0].sku, 'PUBLIC-SKU')
  assert.equal(seo.productsFeed([priced], now)[0].variants[0].gtin, '4006381333931')
})

test('image URLs in JSON-LD and the product feed are absolute', () => {
  assert.equal(seo.absoluteUrl('/catalogue/a.png'), 'https://theliftinglab.co.uk/catalogue/a.png')
  assert.equal(seo.absoluteUrl('catalogue/a.png'), 'https://theliftinglab.co.uk/catalogue/a.png')
  assert.equal(seo.absoluteUrl('https://cdn.shopify.com/x.png'), 'https://cdn.shopify.com/x.png')
  assert.equal(seo.absoluteUrl(null), null)
  const src = readFileSync('lib/seo.ts', 'utf8')
  assert.doesNotMatch(src, /image: product\.image_url\b/)
  assert.doesNotMatch(src, /image: p\.image_url\b/)
  assert.doesNotMatch(readFileSync('app/products/[id]/page.tsx', 'utf8'), /\{ image: product\.image_url \}/)
})
