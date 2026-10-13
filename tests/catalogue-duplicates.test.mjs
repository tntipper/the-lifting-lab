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

const source = file => readFileSync(resolve(root, file), 'utf8')
const load = modules({ NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled' })
const sizes = load('lib/commerce/size-selection.ts')
const options = sizes.PREVIEW_SIZE_OPTIONS['1fab2546-6a25-4fd9-8e49-abf6bb6b362c']
const review = { approved: true, version: '1', expectedVersion: '1', verifiedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 3600000 }
const mapping = { productId: 'fixture', shopifyVariantId: 'gid://shopify/ProductVariant/63535202468170', shopifyProductHandle: 'warrior-crunch-bar', active: true, approved: true, review }
const product = { id: 'fixture', name: 'Crunch Bar', brand: 'Warrior', category: 'protein-bar', nutrients: [], score: null,
  retail_price: 23.99, servings_per_container: 12, cost_per_serving: 23.99 / 12, buy_url: 'https://shop.theliftinglab.co.uk/products/warrior-crunch-bar',
  storeLinkMapping: mapping, sizeOptions: [{ ...options[0], shopify_variant_id: mapping.shopifyVariantId },
    { ...options[1], buy_url: 'https://shop.theliftinglab.co.uk/products/warrior-crunch-bar' }] }

test('exact three approved duplicate redirects are permanent HTTP 308 and sitemap omits their IDs', () => {
  const redirects = load('lib/product-size-redirects.ts')
  assert.deepEqual(Array.from(redirects.PRODUCT_SIZE_REDIRECTS, r => [r.source, r.destination]), [
    ['/products/8ddfc493-0872-4235-ba25-5091ef172b49', '/products/1fab2546-6a25-4fd9-8e49-abf6bb6b362c?size=single-bar'],
    ['/products/b9058eef-f71a-49f7-9672-a264d1a09614', '/products/e94b13c4-f7fa-42d2-94b2-8dfcda316311?size=16-servings'],
    ['/products/60cbe489-96a8-416e-a11b-243e3277caf3', '/products/2567a955-be92-4f70-b147-f908fa80650c'],
  ])
  const { getRedirectStatus } = require('next/dist/lib/redirect-status')
  for (const redirect of redirects.PRODUCT_SIZE_REDIRECTS) {
    assert.equal(getRedirectStatus(redirect), 308)
    assert.equal(redirects.isRedirectedProduct(redirect.source.split('/').at(-1)), true)
    assert.equal(redirects.isRedirectedProduct(redirect.destination.split('/').at(-1).split('?')[0]), false)
  }
  assert.match(source('next.config.ts'), /\.\.\.PRODUCT_SIZE_REDIRECTS/)
  assert.match(source('app/sitemap.ts'), /filter\(p => !isRedirectedProduct\(p.id\)\)/)
})
test('native Size select has associated label, selected slug and keyboard-compatible change handler', () => {
  const Picker = load('components/ProductSizePicker.tsx').default
  const html = renderToStaticMarkup(React.createElement(Picker, { options, selected: options[1], onChange() {} }))
  const id = html.match(/<select id="([^"]+)"/)[1]
  assert.ok(html.includes(`for="${id}"`)); assert.match(html, />Size<\/label>/)
  assert.match(html, /value="single-bar" selected=""/)
  assert.doesNotMatch(source('components/ProductSizePicker.tsx'), /onKeyDown|tabIndex|role="combobox"/)
  assert.equal(renderToStaticMarkup(React.createElement(Picker, { options: [options[0]], selected: options[0], onChange() {} })), '')
})
test('?size selection defaults safely and URL changes preserve attribution and hash', () => {
  assert.equal(sizes.selectProductSize(options, '?size=single-bar').slug, 'single-bar')
  assert.equal(sizes.selectProductSize(options, '?size=unknown').slug, '12-pack')
  const url = new URL(sizes.sizeSelectionUrl('https://test.test/products/fixture?ref=a&ref=b&variant=1#buy', 'single-bar'), 'https://test.test')
  assert.equal(url.searchParams.get('size'), 'single-bar'); assert.deepEqual(url.searchParams.getAll('ref'), ['a', 'b'])
  assert.equal(url.searchParams.has('variant'), false); assert.equal(url.hash, '#buy')
  assert.doesNotMatch(source('app/products/[id]/page.tsx'), /searchParams/)
  assert.match(source('app/products/[id]/page.tsx'), /revalidate = 86400/)
})
test('option price and servings follow selection, single-bar never inherits parent Buy', () => {
  const pack = sizes.productForSize(product, product.sizeOptions[0])
  assert.equal(pack.retail_price, 23.99); assert.equal(pack.servings_per_container, 12)
  assert.equal(pack.storeLinkMapping, mapping)
  const packHtml = renderToStaticMarkup(React.createElement(load('components/ProductOfferLink.tsx').default, { product: pack }))
  assert.match(packHtml, /Buy at TLL Store/)
  assert.match(packHtml, /63535202468170/)
  const single = sizes.productForSize(product, product.sizeOptions[1])
  assert.equal(single.retail_price, 2); assert.equal(single.servings_per_container, 1); assert.equal(single.cost_per_serving, 2)
  assert.equal(single.storeLinkMapping, null); assert.equal(single.storePrice, undefined); assert.equal(single.storeVariants, undefined)
  const html = renderToStaticMarkup(React.createElement(load('components/ProductOfferLink.tsx').default, { product: single }))
  assert.doesNotMatch(html, /Buy at|\/cart\//)
  assert.match(html, /Shop offer under review/)
  const mismatch = sizes.productForSize(product, { ...product.sizeOptions[0], shopify_variant_id: 'gid://shopify/ProductVariant/999' })
  assert.equal(mismatch.storeLinkMapping, null)
  assert.equal(sizes.productForSize(product, product.sizeOptions[0], false).storeLinkMapping, null)
})
test('matching variant price is used; a missing observation never borrows a different variant price', () => {
  const observed = { productId: 'fixture', price: 25, availableForSale: true, observedAtMs: Date.now() }
  const p = { ...product, storePrice: observed, storeVariants: [{ mapping, storePrice: { ...observed, price: 24 } }] }
  assert.equal(sizes.productForSize(p, p.sizeOptions[0]).retail_price, 24)
  p.storeVariants[0].storePrice = undefined
  assert.equal(sizes.productForSize(p, p.sizeOptions[0]).retail_price, 23.99)
})
function detailHarness(product) {
  let state = [], cursor = 0, effects = [], mounted = false
  const noop = { __esModule: true, default: () => null }
  const browser = { location: { href: 'https://example.test/products/fixture?ref=abc#buy', search: '?ref=abc' },
    history: { replaceState(data, title, url) { assert.equal(data, null); assert.equal(title, ''); browser.location.href = new URL(url, browser.location.href).href } } }
  const load = modules({ NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled' }, {
    react: { ...React, useId: () => 'fixture-picker', useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value }] },
      useEffect(fn) { if (!mounted) effects.push(fn) } },
    'next/navigation': { useRouter: () => ({ back() {}, replace() { throw Error('server navigation forbidden') } }) },
    '@/components/TopNav': noop, '@/components/ReviewSection': noop, '@/components/ShareModal': noop,
    window: browser,
  })
  const Detail = load('app/products/[id]/ProductDetailPage.tsx').default
  const Picker = load('components/ProductSizePicker.tsx').default
  const Offer = load('components/ProductOfferLink.tsx').default
  function find(node, type) {
    if (!node || typeof node !== 'object') return
    if (node.type === type) return node
    for (const child of React.Children.toArray(node.props?.children)) { const hit = find(child, type); if (hit) return hit }
  }
  return { browser, render() { cursor = 0; const tree = Detail({ product: { ...product, category: 'whey', nutrients: [], score: null }, related: [], defaultVariantId: undefined });
    const picker = find(tree, Picker)
    return { picker, select: find(Picker(picker.props), 'select'), offer: find(tree, Offer) } }, mount() { effects.forEach(fn => fn()); effects = []; mounted = true } }
}

test('actual detail mount preselects ?size and native change updates price, servings, Buy and URL', () => {
  const harness = detailHarness(product)
  harness.browser.location.search = '?size=single-bar'
  assert.equal(harness.render().picker.props.selected.slug, '12-pack')
  harness.mount()
  let view = harness.render()
  assert.equal(view.picker.props.selected.slug, 'single-bar')
  assert.equal(view.offer.props.product.retail_price, 2)
  assert.equal(view.offer.props.product.storeLinkMapping, null)
  view.select.props.onChange({ target: { value: '12-pack' } })
  view = harness.render()
  assert.equal(view.offer.props.product.servings_per_container, 12)
  assert.equal(view.offer.props.product.retail_price, 23.99)
  assert.equal(view.offer.props.product.storeLinkMapping, mapping)
  assert.equal(new URL(harness.browser.location.href).searchParams.get('size'), '12-pack')
})
test('loader fails soft on missing size table and uses synthetic fixture without database', async () => {
  const base = { ...product, storeLinkMapping: undefined, sizeOptions: undefined }
  for (const failure of ['error', 'throw', 'success']) {
    const sb = { from(table) {
      if (table === 'product_size_options' && failure === 'throw') throw Error('missing table')
      const result = table === 'products' ? { data: base } : table === 'product_size_options'
        ? failure === 'error' ? { error: { message: 'missing table' }, data: null } : { data: options } : { data: [] }
      const query = { select() { return this }, eq() { return this }, order() { return this }, maybeSingle() { return Promise.resolve(result) }, then(resolve) { resolve(result) } }
      return query
    } }
    const l = modules({}, { '@/lib/supabase-public': { createPublicClient: () => sb }, '@/lib/commerce/store-price-server': { withStorePrices: async p => p } })
    const result = await l('lib/product-data.ts').fetchProductDetail('fixture')
    assert.ok(result); assert.equal(result.sizeOptions.length, failure === 'success' ? 2 : 0)
  }
  const l = modules({}, { '@/lib/preview-mode': { isSyntheticPreview: () => true }, '@/lib/supabase-public': { createPublicClient() { throw Error('database forbidden') } } })
  const result = await l('lib/product-data.ts').fetchProductDetail('1fab2546-6a25-4fd9-8e49-abf6bb6b362c')
  assert.equal(result.sizeOptions.length, 2)
})
test('migration transaction, exact guards, private archive before deletion and reversible collisions', () => {
  const sql = source('supabase/migrations/202610130002_merge_duplicate_products.sql')
  assert.match(sql, /BEGIN;/); assert.match(sql, /COMMIT;/)
  for (const field of ['name', 'brand', 'servings_per_container', 'retail_price', 'serving_size', 'category']) assert.ok(sql.includes(`parent.${field} IS DISTINCT FROM`))
  assert.match(sql, /RAISE EXCEPTION 'Missing child/); assert.match(sql, /RAISE EXCEPTION 'Missing parent/)
  assert.match(sql, /CONTINUE;/); assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /p.status = 'active'/); assert.match(sql, /REVOKE ALL ON SCHEMA tll_merge_private FROM PUBLIC, anon, authenticated/)
  assert.ok(sql.indexOf('INSERT INTO tll_merge_private.merged_product_archive') < sql.indexOf('DELETE FROM public.products'))
  assert.ok(sql.indexOf('INSERT INTO tll_merge_private.merged_product_archive') < sql.indexOf('DELETE FROM public.stack_products'))
  assert.match(sql, /existing.servings_per_day \+ item.servings_per_day/)
  assert.match(sql, /serving_size = 15, name = 'EssentialMAX'/)
  const undo = source('supabase/rollback/202610130002_merge_duplicate_products.down.sql')
  assert.match(undo, /to_regclass/); assert.match(undo, /THEN RETURN/)
  assert.match(undo, /jsonb_populate_recordset\(NULL::public.product_nutrients/)
  assert.match(undo, /a.moved_reviews/); assert.match(undo, /a.moved_stack_products/); assert.match(undo, /a.moved_favourites/)
  assert.match(undo, /a.dropped_favourites/); assert.match(undo, /a.merged_stacks/)
  assert.match(undo, /serving_size = 13, name = 'EssentialMax'/)
  assert.match(undo, /DROP TABLE IF EXISTS public.product_size_options/)
  assert.match(undo, /DROP SCHEMA IF EXISTS tll_merge_private CASCADE/)
})
