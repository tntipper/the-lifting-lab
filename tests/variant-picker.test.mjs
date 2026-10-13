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
      window: overrides.window, URL, URLSearchParams, Response, Request, Headers, AbortSignal, Buffer, Uint8Array, TextDecoder, Date, structuredClone,
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

const mappingLoader = () => modules(enabled)('lib/commerce/store-mapping-server.ts')
const second = { ...row, shopify_variant_id: 'gid://shopify/ProductVariant/3', handle: 'fixture-chocolate', flavour: 'Chocolate',
  shop_identity: { ...identity, flavourId: 'Chocolate' }, supplier_identity: { ...identity, flavourId: 'Chocolate' } }
async function choices(rows = [row, second]) {
  return (await mappingLoader().attachStoreMappings([product], { read: async () => rows, now }))[0]
}
async function priced() {
  const load = modules(enabled)
  const attached = await choices()
  let requested
  const result = (await load('lib/commerce/store-price-products.ts').attachStorePrices([attached], { enabled: true, now,
    read: async ids => { requested = ids; return new Map(ids.map((id, index) => [id,
      { variantId: id, price: 12 + index, availableForSale: index === 1, observedAtMs: now }])) } }))[0]
  assert.deepEqual(Array.from(requested), [row.shopify_variant_id, second.shopify_variant_id])
  return result
}
test('multi-variant mapping keeps all approved choices, public labels, and no arbitrary single mapping', async () => {
  const result = await choices()
  assert.equal(result.storeVariants.length, 2); assert.equal(result.storeLinkMapping, null)
  assert.equal(result.storeVariants[1].label, 'Chocolate · 500 g')
  assert.deepEqual(Object.keys(result.storeVariants[0]).sort(), ['flavour', 'handle', 'label', 'mapping', 'packLabel', 'variantId'])
  assert.doesNotMatch(JSON.stringify(result), /cost_ex_vat|supplier|private-/)
})
test('expired, inactive and invalid rows exclude themselves, preserving the approved variant', async () => {
  for (const bad of [{ ...row, review: { ...row.review, expiresAtMs: now } }, { ...row, active: false },
    { ...row, approval_reference: null }, { ...row, shopify_variant_id: 'bad' }]) {
    const result = await choices([bad, second])
    assert.equal(result.storeVariants.length, 1); assert.equal(result.storeLinkMapping.shopifyVariantId, second.shopify_variant_id)
  }
})
test('duplicate numeric/GID variant ids exclude only that variant, including across products', async () => {
  for (const comparison_product_id of ['fixture', 'other']) {
    const result = await choices([row, { ...row, comparison_product_id, shopify_variant_id: '90071992547409931234' }, second])
    assert.equal(result.storeVariants.length, 1); assert.equal(result.storeVariants[0].variantId, '3')
  }
})
test('pack labels format kilograms and multipack count from reviewed pack', async () => {
  const kgPack = { ...pack, amountPerInner: 2000, innerCount: 2, sellingUnit: 'multipack' }
  const kgIdentity = { ...identity, pack: kgPack }
  const result = await choices([{ ...row, pack: kgPack, shop_identity: kgIdentity, supplier_identity: kgIdentity }])
  assert.equal(result.storeVariants[0].label, 'vanilla · 2 × 2 kg')
})
test('prices attach per variant and suppress arbitrary family retail price', async () => {
  const result = await priced()
  assert.equal(result.retail_price, null)
  assert.equal(result.storeVariants[0].storePrice.availableForSale, false)
  assert.equal(result.storeVariants[1].storePrice.price, 13)
})
for (const age of [15 * 60 * 1000, -1]) test(`stale/future per-variant price is unavailable: ${age}`, async () => {
  const result = (await modules(enabled)('lib/commerce/store-price-products.ts').attachStorePrices([await choices()], { enabled: true, now,
    read: async ids => new Map(ids.map(variantId => [variantId, { variantId, price: 12, availableForSale: true, observedAtMs: now - age }])) }))[0]
  assert.equal(result.storeVariants[0].storePrice.price, null)
})
function selectedProduct(product, variant) {
  return { ...product, storeVariants: undefined, storeLinkMapping: variant.mapping, storePrice: variant.storePrice, buy_url: null }
}
test('stock-aware default and numeric query preselection; unknown id ignored; flavour slug supported', async () => {
  const product = await priced(), variants = product.storeVariants
  const select = modules(enabled)('lib/commerce/variant-selection.ts').selectStoreVariant
  assert.equal(select(product.id, variants, {}, now).variantId, '3')
  assert.equal(select(product.id, variants, { variant: row.shopify_variant_id.split('/').at(-1) }, now), variants[0])
  assert.equal(select(product.id, variants, { variant: 'unknown' }, now), variants[1])
  assert.equal(select(product.id, variants, { flavour: 'chocolate' }, now), variants[1])
  assert.equal(select(product.id, variants, { variant: variants[0].variantId, flavour: 'chocolate' }, now), variants[0])
  assert.equal(select(product.id, (await choices()).storeVariants, {}, now).variantId, variants[0].variantId)
})
test('selected fresh in-stock variant links THAT cart; selected OOS has status and no Buy', async () => {
  const product = await priced(), load = modules(enabled)
  const Offer = load('components/ProductOfferLink.tsx').default
  const inStock = selectedProduct(product, product.storeVariants[1])
  assert.match(load('lib/affiliate.ts').resolveProductOffer(inStock).url, /cart\/3:1/)
  const html = renderToStaticMarkup(React.createElement(Offer, { product: selectedProduct(product, product.storeVariants[0]) }))
  assert.match(html, /Out of stock at TLL Store/); assert.doesNotMatch(html, /href=|Buy at TLL Store/)
})
test('unavailable selected price never buys another variant or falls back to affiliate', async () => {
  const product = await priced(), load = modules(enabled)
  const selected = { ...product.storeVariants[1], storePrice: { productId: product.id, price: null, availableForSale: null, observedAtMs: null } }
  const html = renderToStaticMarkup(React.createElement(load('components/ProductOfferLink.tsx').default, { product: selectedProduct(product, selected) }))
  assert.match(html, /price and stock unavailable/); assert.doesNotMatch(html, /href=/)
})
test('prices OFF uses selected exact handle and numeric variant fallback', async () => {
  const product = await choices(), load = modules({ ...enabled, NEXT_PUBLIC_TLL_STORE_PRICES: 'disabled' })
  const offer = load('lib/affiliate.ts').resolveProductOffer(selectedProduct(product, product.storeVariants[1]))
  assert.match(offer.url, /products\/fixture-chocolate\?variant=3&/)
})
test('picker has visible associated native select, stock/price description and selected option', async () => {
  const product = await priced(), load = modules(enabled)
  const html = renderToStaticMarkup(React.createElement(load('components/ProductVariantPicker.tsx').default,
    { productId: product.id, variants: product.storeVariants, selected: product.storeVariants[1], onChange() {} }))
  const labelId = /<label for="([^"]+)"/.exec(html)[1]
  assert.ok(html.includes(`<select id="${labelId}"`)); assert.ok(html.includes(`aria-describedby="${labelId}-status"`))
  assert.match(html, /Flavour \/ size/); assert.match(html, /value="3" selected=""/)
  assert.match(html, /£13.00/); assert.match(html, /role="status"/)
})
test('selection URL preserves other parameters/hash and removes flavour alias', () => {
  const load = modules(enabled)
  assert.equal(load('lib/commerce/variant-selection.ts').variantSelectionUrl('https://example.test/products/fixture?flavour=vanilla&ref=abc#buy', '3'), '/products/fixture?ref=abc&variant=3#buy')

})
test('multi-variant grid/stack requires product-page selection even if a cached single mapping is supplied', async () => {
  const product = await priced(), load = modules(enabled)
  const html = renderToStaticMarkup(React.createElement(load('components/ProductOfferLink.tsx').default, { product }))
  assert.match(html, /Choose flavour on product page/); assert.match(html, /href="\/products\/fixture"/)
  const item = { ...product, storeLinkMapping: product.storeVariants[1].mapping, quantity: 1 }
  assert.equal(load('lib/commerce/stack-cart.ts').buildStackCartLines([item], now).length, 0)
  const stack = modules({ ...enabled, NEXT_PUBLIC_TLL_STACK_CART: 'enabled' })
  const stackHtml = renderToStaticMarkup(React.createElement(stack('components/BuyMyStack.tsx').default, { items: [item], ready: true }))
  assert.match(stackHtml, /Choose flavour on product page/); assert.doesNotMatch(stackHtml, /cart\/3/)
})
test('empty redirect authority does nothing; confirmed test entry permanently redirects before any product read', async () => {
  const load = modules(enabled), redirects = load('lib/product-variant-redirects.ts')
  assert.equal(Object.keys(redirects.PRODUCT_VARIANT_REDIRECTS).length, 0)
  assert.equal(redirects.productVariantRedirectUrl('child'), null)
  assert.equal(redirects.productVariantRedirectUrl('child', { child: { parentProductId: 'parent', variantId: '3' } }), '/products/parent?variant=3')
  let destination
  const pageLoad = modules({}, {
    '@/lib/product-variant-redirects': { productVariantRedirectUrl: id => redirects.productVariantRedirectUrl(id, { child: { parentProductId: 'parent', variantId: '3' } }) },
    'next/navigation': { permanentRedirect(url) { destination = url; throw Error('redirect') }, notFound() { throw Error('not found') } },
    '@/lib/product-data': { fetchProductDetail() { throw Error('must not read') } },
    './ProductDetailPage': { default() {} },
  })
  await assert.rejects(pageLoad('app/products/[id]/page.tsx').default({ params: Promise.resolve({ id: 'child' }) }), /redirect/)
  assert.equal(destination, '/products/parent?variant=3')
})
for (const query of [{ defaultVariantId: '3' }, { defaultVariantId: row.shopify_variant_id.split('/').at(-1) }]) {
  test(`real product detail preselects and routes its offer: ${JSON.stringify(query)}`, async () => {
    const product = await priced()
    const noop = { __esModule: true, default: () => null }
    const load = modules(enabled, {
      'next/navigation': { useRouter: () => ({ back() {}, replace() {} }) },
      '@/components/TopNav': noop, '@/components/ReviewSection': noop, '@/components/ShareModal': noop,
    })
    const input = { ...product, category: 'whey', nutrients: [], score: null, cost_per_serving: null,
      serving_size: 30, serving_unit: 'g', servings_per_container: 20, image_url: null }
    const html = renderToStaticMarkup(React.createElement(load('app/products/[id]/ProductDetailPage.tsx').default,
      { product: input, related: [], ...query }))
    assert.match(html, /Flavour \/ size/)
    if (query.defaultVariantId === row.shopify_variant_id.split('/').at(-1)) {
      assert.match(html, /Out of stock at TLL Store/); assert.doesNotMatch(html, /Buy at TLL Store|shop.theliftinglab.co.uk\/cart/)
    } else {
      // Server HTML preselects the default but links no cart until the client applies any ?variant= (review finding: shared links).
      assert.match(html, /value="3" selected=""/); assert.doesNotMatch(html, /shop.theliftinglab.co.uk\/cart/)
    }
  })
}
test('isolated selected variant is inert even with both flags enabled', async () => {
  const product = await priced(), load = modules({ ...enabled, NEXT_PUBLIC_TLL_ENVIRONMENT: 'synthetic-preview' })
  const html = renderToStaticMarkup(React.createElement(load('components/ProductOfferLink.tsx').default,
    { product: selectedProduct(product, product.storeVariants[1]) }))
  assert.doesNotMatch(html, /href=|Buy at TLL Store/)
})

function detailHarness(product) {
  let state = [], cursor = 0, effects = [], mounted = false
  const noop = { __esModule: true, default: () => null }
  const browser = { location: { href: 'https://example.test/products/fixture?ref=abc#buy', search: '?ref=abc' },
    history: { replaceState(data, title, url) { assert.equal(data, null); assert.equal(title, ''); browser.location.href = new URL(url, browser.location.href).href } } }
  const load = modules(enabled, {
    react: { ...React, useId: () => 'fixture-picker', useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value }] },
      useEffect(fn) { if (!mounted) effects.push(fn) } },
    'next/navigation': { useRouter: () => ({ back() {}, replace() { throw Error('server navigation forbidden') } }) },
    '@/components/TopNav': noop, '@/components/ReviewSection': noop, '@/components/ShareModal': noop,
    window: browser,
  })
  const Detail = load('app/products/[id]/ProductDetailPage.tsx').default
  const Picker = load('components/ProductVariantPicker.tsx').default
  const Offer = load('components/ProductOfferLink.tsx').default
  function find(node, type) {
    if (!node || typeof node !== 'object') return
    if (node.type === type) return node
    for (const child of React.Children.toArray(node.props?.children)) { const hit = find(child, type); if (hit) return hit }
  }
  return { browser, render() { cursor = 0; const tree = Detail({ product: { ...product, category: 'whey', nutrients: [], score: null }, related: [], defaultVariantId: product.storeVariants[0].variantId });
    const picker = find(tree, Picker)
    return { picker, select: find(Picker(picker.props), 'select'), offer: find(tree, Offer) } }, mount() { effects.forEach(fn => fn()); effects = []; mounted = true } }
}
test('change handler selects B, updates Buy to B and replaces URL without server navigation or prop reset', async () => {
  const product = await priced(), harness = detailHarness(product)
  let view = harness.render(); harness.mount()
  view.select.props.onChange({ target: { value: '3' } })
  view = harness.render()
  assert.equal(view.picker.props.selected.variantId, '3')
  assert.match(modules(enabled)('lib/affiliate.ts').resolveProductOffer(view.offer.props.product).url, /cart\/3:1/)
  const url = new URL(harness.browser.location.href)
  assert.equal(url.searchParams.get('variant'), '3'); assert.equal(url.searchParams.get('ref'), 'abc'); assert.equal(url.hash, '#buy')
  harness.mount(); assert.equal(harness.render().picker.props.selected.variantId, '3')
})
test('URL query overrides only after mount; server default is used for hydration', async () => {
  const harness = detailHarness(await priced())
  harness.browser.location.search = '?flavour=chocolate'
  assert.equal(harness.render().picker.props.selected.variantId, row.shopify_variant_id.split('/').at(-1))
  harness.mount(); assert.equal(harness.render().picker.props.selected.variantId, '3')
})
test('product page never reads searchParams and keeps daily ISR', () => {
  const source = readFileSync(resolve(root, 'app/products/[id]/page.tsx'), 'utf8')
  assert.doesNotMatch(source, /searchParams/); assert.match(source, /revalidate = 86400/)
  assert.match(source, /defaultVariantId=/)
})
test('picker honours catalogue holds; single variant renders a label without a select', async () => {
  const product = await priced(), load = modules(enabled), selected = product.storeVariants[1]
  const html = renderToStaticMarkup(React.createElement(load('components/ProductVariantPicker.tsx').default, {
    productId: product.id, variants: [selected], selected, onChange() {},
    cataloguePresentation: { productId: product.id, availability: 'out_of_stock', purchaseEnabled: false },
  }))
  assert.doesNotMatch(html, /<select|In stock at/); assert.match(html, /Chocolate · 500 g|Out of stock/)
})
test('product detail has one status and no affiliate fallback or review claim for OOS', async () => {
  const product = await priced(), view = detailHarness(product).render()
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, view.picker, view.offer))
  assert.equal((html.match(/role="status"/g) ?? []).length, 1)
  assert.doesNotMatch(html, /href=|Shop offer under review/); assert.match(html, /Out of stock: choose another flavour\/size/)
})
test('single-variant grid retains direct Buy behaviour', async () => {
  const product = await priced(), selected = product.storeVariants[1]
  const html = renderToStaticMarkup(React.createElement(modules(enabled)('components/ProductOfferLink.tsx').default,
    { product: { ...selectedProduct(product, selected), storeVariants: [selected] } }))
  assert.match(html, /cart\/3:1/); assert.doesNotMatch(html, /Choose flavour/)
})
test('redirect queries preserve attribution and merge the confirmed variant; authority has no chains or self redirects', () => {
  const { productVariantRedirectUrl, PRODUCT_VARIANT_REDIRECTS } = modules()('lib/product-variant-redirects.ts')
  assert.equal(productVariantRedirectUrl('child', { child: { parentProductId: 'parent', variantId: '3' } }, '?utm_source=abc&ref=x&variant=old&extra=1&extra=2'),
    '/products/parent?utm_source=abc&ref=x&variant=3&extra=1&extra=2')
  for (const [child, entry] of Object.entries(PRODUCT_VARIANT_REDIRECTS)) {
    assert.notEqual(child, entry.parentProductId); assert.equal(Object.hasOwn(PRODUCT_VARIANT_REDIRECTS, entry.parentProductId), false)
  }
})

for (const query of ['?variant=3', '?variant=unknown', '?variant=90071992547409931234&flavour=chocolate']) {
  test(`mount query selection honours exact ID precedence and preserves server default: ${query}`, async () => {
    const harness = detailHarness(await priced())
    harness.browser.location.search = query
    harness.render(); harness.mount()
    assert.equal(harness.render().picker.props.selected.variantId, query === '?variant=3' ? '3' : '90071992547409931234')
  })
}

test('prices OFF preserves legacy retail_price without inventing a Shopify price', async () => {
  const product = await choices()
  const result = await modules(enabled)('lib/commerce/store-price-products.ts').attachStorePrices([product], {
    enabled: false, read() { throw Error('prices OFF must not read') },
  })
  assert.equal(result[0], product); assert.equal(result[0].retail_price, 99)
})
test('unavailable detail selection relies on picker status alone and never shows Buy or affiliate links', async () => {
  const product = await priced()
  product.storeVariants[0].storePrice = { productId: product.id, price: null, availableForSale: null, observedAtMs: null }
  const view = detailHarness(product).render()
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, view.picker, view.offer))
  assert.equal((html.match(/role="status"/g) ?? []).length, 1)
  assert.match(html, /price and stock unavailable/); assert.doesNotMatch(html, /href=|Shop offer under review/)
})
const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
test('single-variant out-of-stock copy never asks to choose another flavour; middleware tolerates malformed product paths', () => {
  const offer = source('components/ProductOfferLink.tsx')
  assert.match(offer, /chooseAnother \? 'Out of stock: choose another flavour\/size' : 'Currently unavailable to buy'/)
  assert.match(source('app/products/[id]/ProductDetailPage.tsx'), /chooseAnother=\{variants\.length > 1\}/)
  assert.match(source('middleware.ts'), /try \{ productId = productPath \? decodeURIComponent/)
})
