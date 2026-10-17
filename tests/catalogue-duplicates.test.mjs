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
      if (name.endsWith('.json')) return JSON.parse(readFileSync(name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(dirname(filename), name), 'utf8'))
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
  assert.match(html, new RegExp(`aria-describedby="${id}-status"`))
  assert.match(html, /role="status" aria-live="polite"/)
  assert.match(html, /£2.00/)
  const single = renderToStaticMarkup(React.createElement(Picker, { options: [options[0]], selected: options[0], price: 25, onChange() {} }))
  assert.doesNotMatch(single, /<select/); assert.match(single, /Size: 12 × 64g/); assert.match(single, /£25.00/)
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
  assert.equal(pack.retail_price, null); assert.equal(pack.cost_per_serving, null); assert.equal(pack.servings_per_container, 12)
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
  assert.equal(sizes.productForSize(p, p.sizeOptions[0]).retail_price, null)
  assert.equal(sizes.productForSize(p, p.sizeOptions[0]).cost_per_serving, null)
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
  const VariantPicker = load('components/ProductVariantPicker.tsx').default
  const Offer = load('components/ProductOfferLink.tsx').default
  function find(node, type) {
    if (!node || typeof node !== 'object') return
    if (node.type === type) return node
    for (const child of React.Children.toArray(node.props?.children)) { const hit = find(child, type); if (hit) return hit }
  }
  return { browser, render() { cursor = 0; const tree = Detail({ product: { ...product, category: 'whey', nutrients: [], score: null }, related: [], defaultVariantId: undefined });
    const picker = find(tree, Picker)
    return { tree, picker, select: picker ? find(Picker(picker.props), 'select') : undefined, variantPicker: find(tree, VariantPicker), offer: find(tree, Offer) } }, mount() { effects.forEach(fn => fn()); effects = []; mounted = true } }
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
  assert.equal(view.offer.props.product.retail_price, null)
  assert.equal(view.offer.props.product.cost_per_serving, null)
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
test('schema-only migration is safe on empty catalogues and grants only public SELECT', () => {
  const ddl = source('supabase/migrations/202610130002_product_size_options.sql')
  assert.match(ddl, /BEGIN;/); assert.match(ddl, /COMMIT;/)
  assert.doesNotMatch(ddl, /DO \$merge\$|Missing parent|UPDATE public.products|DELETE FROM public.products|LOCK TABLE/)
  assert.match(ddl, /nutrients jsonb/)
  assert.match(ddl, /ALTER TABLE public.product_size_options ENABLE ROW LEVEL SECURITY/)
  assert.match(ddl, /ALTER TABLE tll_merge_private.merged_product_archive ENABLE ROW LEVEL SECURITY/)
  assert.match(ddl, /p.status = 'active'/)
  assert.match(ddl, /REVOKE ALL ON public.product_size_options FROM PUBLIC, anon, authenticated/)
  assert.match(ddl, /GRANT SELECT ON public.product_size_options TO anon, authenticated/)
  assert.match(ddl, /REVOKE ALL ON SCHEMA tll_merge_private FROM PUBLIC, anon, authenticated/)
  assert.match(ddl, /REVOKE ALL ON ALL TABLES IN SCHEMA tll_merge_private FROM PUBLIC, anon, authenticated/)
  assert.equal(existsSync(resolve(root, 'supabase/migrations/202610130002_merge_duplicate_products.sql')), false)
})
test('operator transaction, empty no-op, exact guards, archive before delete and bounded stacks', () => {
  const sql = source('supabase/operator/2026-10-13-merge-duplicate-products.sql')
  assert.equal(sql.match(/BEGIN;/g).length, 1); assert.equal(sql.match(/COMMIT;/g).length, 1)
  for (const field of ['name', 'brand', 'servings_per_container', 'retail_price', 'serving_size', 'category']) assert.ok(sql.includes(`parent.${field} IS DISTINCT FROM`))
  assert.match(sql, /RAISE EXCEPTION 'Missing child/); assert.match(sql, /RAISE EXCEPTION 'Missing parent/)
  assert.match(sql, /AND NOT EXISTS \(SELECT 1 FROM tll_merge_private.merged_product_archive\) THEN\s+RAISE NOTICE/)
  assert.match(sql, /CONTINUE;/)
  assert.match(sql, /Archived merge size options missing/)
  for (const side of ['parent', 'child']) assert.match(sql, new RegExp(`slug = m.${side}_slug AND legacy_product_id = m.${side}_id`))
  assert.ok(sql.indexOf('INSERT INTO tll_merge_private.merged_product_archive') < sql.indexOf('DELETE FROM public.products'))
  assert.ok(sql.indexOf('INSERT INTO tll_merge_private.merged_product_archive') < sql.indexOf('DELETE FROM public.stack_products'))
  assert.match(sql, /IF existing.servings_per_day \+ item.servings_per_day > 10 THEN\s+RAISE EXCEPTION/)
  assert.match(sql, /serving_size = 15, name = 'EssentialMAX'/)
  assert.match(sql, /m.variant_id, parent.id, 0, NULL/)
  assert.match(sql, /jsonb_build_object\('nutrient_name', n.nutrient_name,[\s\S]*'amount', n.amount, 'unit', n.unit\)/)
  assert.match(sql, /FROM public.product_nutrients n WHERE n.product_id = child.id/)
  assert.match(sql, /parent.serving_size, 'g'/); assert.match(sql, /child.serving_size, 'g'/)
})
test('data rollback checks moved counts and EssentialMAX current values while retaining DDL', () => {
  const undo = source('supabase/operator/2026-10-13-merge-duplicate-products.rollback.sql')
  assert.match(undo, /to_regclass/); assert.match(undo, /THEN RETURN/)
  assert.match(undo, /jsonb_populate_recordset\(NULL::public.product_nutrients/)
  for (const field of ['moved_reviews', 'moved_stack_products', 'moved_favourites']) {
    assert.match(undo, new RegExp(`GET DIAGNOSTICS restored_count = ROW_COUNT;\\s+IF restored_count IS DISTINCT FROM cardinality\\(a.${field}\\) THEN\\s+RAISE EXCEPTION`))
  }
  assert.match(undo, /a.dropped_favourites/); assert.match(undo, /a.merged_stacks/)
  assert.match(undo, /serving_size = 13, name = 'EssentialMax'/)
  assert.match(undo, /AND serving_size = 15 AND name = 'EssentialMAX'/)
  assert.match(undo, /IF restored_count <> 1 THEN RAISE EXCEPTION/)
  assert.match(undo, /DELETE FROM public.product_size_options/)
  assert.match(undo, /DELETE FROM tll_merge_private.merged_product_archive/)
  assert.doesNotMatch(undo, /DROP TABLE|DROP SCHEMA/)
})
test('child nutrients replace parent label, parent null inherits it, and option metadata stays out', () => {
  const parent = { ...product, nutrients: [{ nutrient_name: 'Protein', amount: 17.5, unit: 'g' }] }
  const nutrients = [
    { nutrient_name: 'Protein', amount: 22, unit: 'g' },
    { nutrient_name: 'Calories', amount: 121, unit: 'kcal' },
    { nutrient_name: 'Carbohydrates', amount: 4, unit: 'g' },
    { nutrient_name: 'Fat', amount: 2, unit: 'g' },
    { nutrient_name: 'Leucine', amount: 2100, unit: 'mg' },
  ]
  const small = { ...options[1], slug: '16-servings', label: '16 servings', serving_size: 30, servings_per_container: 16, retail_price: 19.99, nutrients }
  const selected = sizes.productForSize(parent, small)
  assert.equal(selected.nutrients, nutrients); assert.equal(selected.serving_size, 30)
  assert.equal(sizes.productForSize(parent, options[0]).nutrients, parent.nutrients)
  assert.equal(sizes.productForSize(parent, { ...small, nutrients: [] }).nutrients.length, 0)
  for (const key of ['slug', 'label', 'sort', 'shopify_variant_id']) assert.equal(Object.hasOwn(selected, key), false)
  const bar = sizes.productForSize(parent, options[1])
  assert.deepEqual(Array.from(bar.nutrients, n => [n.nutrient_name, n.amount, n.unit]), [['Protein', 20, 'g'], ['Sugar', 2.1, 'g']])
  assert.equal(bar.serving_unit, 'g')
})
test('16-servings clears inherited pack mapping/price and has no Buy', () => {
  const small = { ...options[1], slug: '16-servings', label: '16 servings', serving_size: 30, servings_per_container: 16,
    retail_price: 19.99, buy_url: 'https://teamwarrior.com/products/warrior-whey-protein-1kg' }
  const selected = sizes.productForSize({ ...product, category: 'whey' }, small)
  assert.equal(selected.storeLinkMapping, null); assert.equal(selected.storePrice, undefined)
  assert.equal(selected.retail_price, 19.99)
  const html = renderToStaticMarkup(React.createElement(load('components/ProductOfferLink.tsx').default, { product: selected }))
  assert.doesNotMatch(html, /Buy at|\/cart\//)
})
test('one size keeps multiple flavours visible and selects their offer; multi-size chooseAnother follows Size', () => {
  const other = { ...mapping, shopifyVariantId: 'gid://shopify/ProductVariant/999' }
  const harness = detailHarness({ ...product, sizeOptions: [product.sizeOptions[0]], storeVariants: [
    { variantId: '63535202468170', label: 'Original', mapping }, { variantId: '999', label: 'Other', mapping: other },
  ] })
  harness.render(); harness.mount()
  let view = harness.render()
  assert.ok(view.picker); assert.equal(view.select, undefined); assert.ok(view.variantPicker)
  assert.equal(view.offer.props.chooseAnother, true)
  view.variantPicker.props.onChange('999'); view = harness.render()
  assert.equal(view.offer.props.product.storeLinkMapping, other)
  const multi = detailHarness(product).render()
  assert.equal(multi.variantPicker, undefined); assert.equal(multi.offer.props.chooseAnother, true)
})
test('retired duplicate IDs are absent from historical reseed commands and browser test runs in CI script', () => {
  for (const file of ['scripts/reseed-02-product-fields.sql', 'scripts/reseed-03-nutrients.sql']) {
    assert.match(source(file), /superseded/)
    assert.doesNotMatch(source(file), /60cbe489|8ddfc493|b9058eef/)
  }
  assert.match(JSON.parse(source('package.json')).scripts['test:accessibility'], /node tests\/browser\/product-size.mjs/)
})
