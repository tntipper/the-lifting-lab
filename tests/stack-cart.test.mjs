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
      URL, URLSearchParams, Response, Request, Headers, AbortSignal, Buffer, Uint8Array, TextDecoder, Date,
      fetch: overrides.fetch ?? (() => { throw new Error('Live network forbidden') }) }, { filename })
    cache.set(path, mod.exports); return mod.exports
  }
  return load
}

const now = Date.now()
const item = (id, variant = id, quantity = 1) => ({ id, quantity, storeLinkMapping: {
  productId: id, shopifyProductHandle: 'fixture', shopifyVariantId: variant, active: true, approved: true,
  review: { approved: true, version: 'v1', expectedVersion: 'v1', verifiedAtMs: now - 1000, expiresAtMs: now + 600000 },
} })
const enabled = { NEXT_PUBLIC_TLL_STACK_CART: 'enabled' }
const cart = modules()('lib/commerce/stack-cart.ts')
test('three approved guest items produce exact quantities without rounding string IDs', () => {
  assert.equal(cart.buildStackCartUrl([item('1'), item('2', 'gid://shopify/ProductVariant/22', 2), item('3', '90071992547409931234', 3)], now),
    'https://shop.theliftinglab.co.uk/cart/1:1,22:2,90071992547409931234:3?utm_source=theliftinglab&utm_medium=referral&utm_campaign=stack&ref=theliftinglab')
})
test('empty and unmapped stacks have no cart', () => {
  assert.equal(cart.buildStackCartUrl([], now), null)
  assert.equal(cart.buildStackCartUrl([{ id: '1', quantity: 1 }], now), null)
})
test('unapproved, inactive, expired, wrong-product and malformed IDs are excluded', () => {
  const fixtures = [item('1'), item('2'), item('3'), item('4'), item('5', '1:2,3')]
  fixtures[0].storeLinkMapping.approved = false
  fixtures[1].storeLinkMapping.active = false
  fixtures[2].storeLinkMapping.review.expiresAtMs = now
  fixtures[3].storeLinkMapping.productId = 'other'
  assert.equal(cart.buildStackCartUrl(fixtures, now), null)
})
test('version mismatch, future review and denied review are excluded', () => {
  for (const patch of [{ expectedVersion: 'v2' }, { verifiedAtMs: now + 1 }, { approved: false }]) {
    const p = item('1'); Object.assign(p.storeLinkMapping.review, patch)
    assert.equal(cart.buildStackCartUrl([p], now), null)
  }
})
test('duplicate variant lines combine pack quantities', () => {
  assert.equal(cart.buildStackCartUrl([item('1', '55', 2), item('2', '55', 3)], now), 'https://shop.theliftinglab.co.uk/cart/55:5?utm_source=theliftinglab&utm_medium=referral&utm_campaign=stack&ref=theliftinglab')
})
test('invalid pack quantities and sum overflow cannot produce a broken link', () => {
  for (const qty of [0, -1, 1.5, NaN, Infinity, '2', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => cart.buildStackCartUrl([item('1', '1', qty)], now))
  assert.throws(() => cart.buildStackCartUrl([item('1', '1', Number.MAX_SAFE_INTEGER), item('2', '1')], now))
})
test('existing stock holds are respected; price mode requires available evidence', () => {
  for (const availability of ['out_of_stock', 'unavailable']) assert.equal(cart.buildStackCartUrl([{ ...item('1'), cataloguePresentation: { productId: '1', availability, purchaseEnabled: false } }], now), null)
  const pricing = modules({ NEXT_PUBLIC_TLL_STORE_PRICES: 'enabled' })('lib/commerce/stack-cart.ts')
  assert.equal(pricing.buildStackCartUrl([item('1')], now), null)
})
const html = (env, items = [item('1'), item('2'), item('3')], ready = true) => renderToStaticMarkup(React.createElement(modules(env)('components/BuyMyStack.tsx').default, { items, ready }))
test('render: guest gets Buy my stack with three lines and no sign-in prompt', () => {
  const rendered = html(enabled)
  assert.match(rendered, /href="https:\/\/shop.theliftinglab.co.uk\/cart\/1:1,2:1,3:1\?utm_source=theliftinglab&amp;utm_medium=referral&amp;utm_campaign=stack&amp;ref=theliftinglab"/)
  assert.match(rendered, /Buy my stack/); assert.doesNotMatch(rendered, /sign.in|login|auth/i)
})
test('render: default off, empty, loading and isolated environments hide the link', () => {
  assert.equal(html({}), ''); assert.equal(html({ NEXT_PUBLIC_TLL_STACK_CART: 'true' }), '')
  assert.equal(html(enabled, []), ''); assert.equal(html(enabled, [item('1')], false), '')
  for (const environment of ['synthetic-preview', 'staging']) assert.equal(html({ ...enabled, NEXT_PUBLIC_TLL_ENVIRONMENT: environment }), '')
})
test('render: second flag leaves Phase 2 awaiting setup with no live link', () => {
  const rendered = html({ ...enabled, NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART: 'enabled' })
  assert.match(rendered, /awaiting setup/); assert.doesNotMatch(rendered, /href=/)
})
test('Job B: stack Buy uses one exact cart permalink with combined pack quantities', () => {
  const rendered = html(enabled, [item('1', '90071992547409931234', 2), item('2', '22', 3), item('3', '22', 1)])
  assert.match(rendered, /href="https:\/\/shop.theliftinglab.co.uk\/cart\/90071992547409931234:2,22:4\?utm_source=theliftinglab&amp;utm_medium=referral&amp;utm_campaign=stack&amp;ref=theliftinglab"/)
  assert.equal((rendered.match(/Buy my stack/g) ?? []).length, 1)
  assert.doesNotMatch(rendered, /\/products\/|sign.in|login/i)
})
test('Job B: single and stack switches remain independent and default OFF', () => {
  assert.equal(html({ NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled' }), '')
  assert.equal(html({ NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART: 'enabled' }), '')
  assert.equal(html({ ...enabled, NEXT_PUBLIC_TLL_STACK_CART: 'disabled', NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled' }), '')
  assert.match(html({ ...enabled, NEXT_PUBLIC_TLL_STORE_LINKS: 'disabled' }), /\/cart\/1:1,2:1,3:1/)
})
test('mock Phase 2 is disabled unless both flags enabled and skips empty stacks', async () => {
  const mock = { execute() { throw Error('must not call') } }
  for (const env of [{}, enabled, { NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART: 'enabled' }]) {
    assert.equal(await modules(env)('lib/commerce/stack-cart-storefront.ts').createMockStackCheckout([item('1')], mock, now), null)
  }
  assert.equal(await modules({ ...enabled, NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART: 'enabled' })('lib/commerce/stack-cart-storefront.ts').createMockStackCheckout([], mock, now), null)
})
test('mock Phase 2 uses existing API version, multi-line cartCreate and GB buyer without identity', async () => {
  const sf = modules({ ...enabled, NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART: 'enabled' })('lib/commerce/stack-cart-storefront.ts')
  let calls = 0
  const url = await sf.createMockStackCheckout([item('1'), item('2', '2', 2), item('3')], { async execute(req) {
    calls++; assert.equal(req.apiVersion, '2026-07'); assert.match(req.query, /cartCreate/)
    assert.equal(JSON.stringify(req.variables), JSON.stringify({ input: { lines: [{ merchandiseId: 'gid://shopify/ProductVariant/1', quantity: 1 }, { merchandiseId: 'gid://shopify/ProductVariant/2', quantity: 2 }, { merchandiseId: 'gid://shopify/ProductVariant/3', quantity: 1 }], buyerIdentity: { countryCode: 'GB' }, attributes: [
      { key: 'utm_source', value: 'theliftinglab' }, { key: 'utm_medium', value: 'referral' },
      { key: 'utm_campaign', value: 'stack' }, { key: 'ref', value: 'theliftinglab' },
    ], note: 'The Lifting Lab referral (stack)' } }))
    return { data: { cartCreate: { cart: { checkoutUrl: 'https://stack-cart.invalid/cart/c/fixture' }, userErrors: [], warnings: [] } } }
  } }, now)
  assert.equal(calls, 1); assert.equal(url, 'https://stack-cart.invalid/cart/c/fixture')
})
test('mock Phase 2 rejects live checkout and provider errors without retry', async () => {
  const sf = modules({ ...enabled, NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART: 'enabled' })('lib/commerce/stack-cart-storefront.ts')
  for (const response of [{ errors: [{}] }, { data: { cartCreate: { cart: { checkoutUrl: 'https://shop.theliftinglab.co.uk/cart/c/live' }, userErrors: [], warnings: [] } } }]) {
    let calls = 0
    await assert.rejects(sf.createMockStackCheckout([item('1')], { async execute() { calls++; return response } }, now)); assert.equal(calls, 1)
  }
})
for (const flag of [undefined, 'enabled']) test(`actual stack page restores flag-gated purchase: ${flag}`, () => {
  const rows = ['1', '2', '3'].map(id => ({ ...item(id), name: `Fixture ${id}`, brand: 'Fixture', category: 'creatine', serving_size: 5, serving_unit: 'g', buy_url: null, product_nutrients: [] }))
  let hook = 0
  const local = modules({ NEXT_PUBLIC_TLL_STACK_CART: flag }, {
    react: { ...React, useState(initial) {
      const index = hook++
      return React.useState(index === 0 ? rows.map(p => ({ id: p.id, products: p, servings_per_day: 3 })) : index === 4 ? false : index === 11 ? rows : initial)
    } },
    '@/components/LocalStackContext': { useLocalStack: () => ({ stack: rows.map(p => ({ id: p.id })), state: { loading: false, guest: [] }, add() {}, remove() {}, retry() {} }) },
    '@/components/CombinedDosePanel': { __esModule: true, default: () => null },
  })
  const rendered = renderToStaticMarkup(React.createElement(local('app/stack/StackBuilder.tsx').default))
  if (flag === 'enabled') {
    assert.match(rendered, /href="https:\/\/shop.theliftinglab.co.uk\/cart\/1:1,2:1,3:1\?/)
    assert.doesNotMatch(rendered, /Coming soon/)
  } else {
    assert.match(rendered, /disabled="">Buy my stack · Coming soon/)
    assert.doesNotMatch(rendered, /href="https:\/\/shop.theliftinglab.co.uk\/cart\//)
  }
  assert.doesNotMatch(rendered, /sign.in|login/i)
})

const availableItem = id => ({ ...item(id), name: `Store ${id}`, cataloguePresentation: { productId: id, availability: 'available', purchaseEnabled: false } })
const oosItem = { ...availableItem('3'), name: 'Unavailable creatine', cataloguePresentation: { productId: '3', availability: 'out_of_stock', purchaseEnabled: false } }
const affiliateItem = { id: '4', name: 'Affiliate protein', quantity: 1, buy_url: 'https://www.amazon.co.uk/dp/B012345678' }
const mixed = [availableItem('1'), availableItem('2'), oosItem, affiliateItem]
test('S02: two store, one OOS and one affiliate split into two cart lines and two skipped items', () => {
  const split = cart.splitStackCartItems(mixed, now)
  assert.equal(JSON.stringify(split.storeItems.map(p => p.id)), '["1","2"]')
  assert.equal(split.outOfStock[0].id, '3')
  assert.equal(split.affiliateOnly[0].item.id, '4')
  assert.equal(split.unavailable.length, 0)
  assert.equal(cart.buildStackCartLines(mixed, now).length, 2)
  assert.equal(cart.buildStackCartUrl(mixed, now), 'https://shop.theliftinglab.co.uk/cart/1:1,2:1?utm_source=theliftinglab&utm_medium=referral&utm_campaign=stack&ref=theliftinglab')
  assert.match(split.affiliateOnly[0].listing.url, /B012345678\?tag=theliftinglab-21/)
})
test('S02 render: skipped products and the individual affiliate link appear beside the two-line cart', () => {
  const rendered = html(enabled, mixed)
  assert.match(rendered, /href="https:\/\/shop.theliftinglab.co.uk\/cart\/1:1,2:1\?utm_source=theliftinglab&amp;utm_medium=referral&amp;utm_campaign=stack&amp;ref=theliftinglab"/)
  assert.match(rendered, /Out of stock/)
  assert.match(rendered, /Unavailable creatine.*skipped from your cart/)
  assert.match(rendered, /choose an alternative/)
  assert.match(rendered, /Not sold in our store/)
  assert.match(rendered, /Affiliate protein/)
  assert.match(rendered, /href="https:\/\/www.amazon.co.uk\/dp\/B012345678\?tag=theliftinglab-21"/)
  assert.match(rendered, /rel="noopener noreferrer nofollow sponsored"/)
})
test('S02: all-skipped stacks keep explanations but never build an empty cart link', () => {
  for (const rows of [[oosItem], [affiliateItem], [oosItem, affiliateItem], [{ id: '5', name: 'Missing offer', quantity: 1 }]]) {
    assert.equal(cart.buildStackCartUrl(rows, now), null)
    const rendered = html(enabled, rows)
    assert.match(rendered, /No store items can be added/)
    assert.doesNotMatch(rendered, /href="https:\/\/shop.theliftinglab.co.uk\/cart\//)
    for (const row of rows) assert.ok(rendered.includes(row.name))
  }
})
test('S02: stale or unapproved store items remain under review, even with an affiliate fallback', () => {
  const stale = { ...item('5'), name: 'Stale price', storePrice: { productId: '5', observedAtMs: now - 900000, price: 20, availableForSale: true } }
  const denied = { ...item('6'), name: 'Unapproved offer', buy_url: affiliateItem.buy_url }
  denied.storeLinkMapping.approved = false
  const split = cart.splitStackCartItems([stale, denied], now)
  assert.equal(split.unavailable.length, 2)
  assert.equal(split.affiliateOnly.length, 0)
  assert.equal(cart.buildStackCartUrl([stale, denied], now), null)
  assert.match(html(enabled, [stale, denied]), /Store availability under review/)
})
test('S02: unsafe affiliate destinations have no link and retailer searches retain their label', () => {
  for (const buy_url of ['javascript:alert(1)', 'https://unknown.invalid/product', 'https://shop.theliftinglab.co.uk/products/fixture']) {
    const rendered = html(enabled, [{ ...affiliateItem, buy_url }])
    assert.doesNotMatch(rendered, /href=/)
    assert.match(rendered, /could not be confirmed/)
  }
  const rendered = html(enabled, [{ ...affiliateItem, buy_url: 'https://www.amazon.co.uk/s?k=protein' }])
  assert.match(rendered, /Search Amazon/)
  assert.match(rendered, /retailer search/)
})
test('S02: Phase 2 setup notice and price mode still explain skipped items', () => {
  const rendered = html({ ...enabled, NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART: 'enabled' }, mixed)
  assert.match(rendered, /awaiting setup/)
  assert.match(rendered, /Unavailable creatine/)
  assert.match(rendered, /Affiliate protein/)
  assert.doesNotMatch(rendered, /href="https:\/\/shop.theliftinglab.co.uk\/cart\//)
  const pricing = modules({ NEXT_PUBLIC_TLL_STORE_PRICES: 'enabled' })('lib/commerce/stack-cart.ts')
  assert.equal(pricing.splitStackCartItems([item('1')], now).unavailable.length, 1)
  assert.equal(pricing.buildStackCartLines(mixed, now).length, 2)
})
test('S02: each affiliate item retains its own destination rather than a shared retailer link', () => {
  const rendered = html(enabled, [affiliateItem, { ...affiliateItem, id: '5', name: 'Second affiliate', buy_url: 'https://www.amazon.co.uk/dp/B098765432' }])
  assert.match(rendered, /href="https:\/\/www.amazon.co.uk\/dp\/B012345678\?tag=theliftinglab-21"/)
  assert.match(rendered, /href="https:\/\/www.amazon.co.uk\/dp\/B098765432\?tag=theliftinglab-21"/)
  assert.doesNotMatch(rendered, /Buy my stack/)
})
test('S02: mock Storefront cart uses only the two store lines of a mixed stack', async () => {
  const sf = modules({ ...enabled, NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART: 'enabled' })('lib/commerce/stack-cart-storefront.ts')
  let calls = 0
  await sf.createMockStackCheckout(mixed, { async execute(req) {
    calls++
    assert.equal(JSON.stringify(req.variables.input.lines), JSON.stringify([
      { merchandiseId: 'gid://shopify/ProductVariant/1', quantity: 1 },
      { merchandiseId: 'gid://shopify/ProductVariant/2', quantity: 1 },
    ]))
    return { data: { cartCreate: { cart: { checkoutUrl: 'https://stack-cart.invalid/cart/c/fixture' }, userErrors: [], warnings: [] } } }
  } }, now)
  assert.equal(calls, 1)
})

test('S05 stack cart retains combined quantities with one copy of each attribution parameter', () => {
  const link = cart.buildStackCartUrl([item('1', '55', 2), item('2', '55', 3)], now)
  const url = new URL(link)
  assert.equal(url.pathname, '/cart/55:5')
  for (const [key, value] of Object.entries({ utm_source: 'theliftinglab', utm_medium: 'referral', utm_campaign: 'stack', ref: 'theliftinglab' })) {
    assert.deepEqual(url.searchParams.getAll(key), [value])
  }
})
test('S05 mock Storefront request carries unique source attributes and note without customer data', async () => {
  const sf = modules({ ...enabled, NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART: 'enabled' })('lib/commerce/stack-cart-storefront.ts')
  await sf.createMockStackCheckout([{ ...item('1'), name: 'Private fixture name', buy_url: 'https://example.invalid/private' }], { async execute(req) {
    const input = req.variables.input
    assert.equal(input.note, 'The Lifting Lab referral (stack)')
    assert.equal(new Set(input.attributes.map(a => a.key)).size, 4)
    assert.equal(JSON.stringify(input.attributes), JSON.stringify([
      { key: 'utm_source', value: 'theliftinglab' }, { key: 'utm_medium', value: 'referral' },
      { key: 'utm_campaign', value: 'stack' }, { key: 'ref', value: 'theliftinglab' },
    ]))
    assert.doesNotMatch(JSON.stringify(input), /Private fixture|example.invalid/)
    return { data: { cartCreate: { cart: { checkoutUrl: 'https://stack-cart.invalid/cart/c/fixture' }, userErrors: [], warnings: [] } } }
  } }, now)
})
