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
    'https://shop.theliftinglab.co.uk/cart/1:1,22:2,90071992547409931234:3')
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
  assert.equal(cart.buildStackCartUrl([item('1', '55', 2), item('2', '55', 3)], now), 'https://shop.theliftinglab.co.uk/cart/55:5')
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
  assert.match(rendered, /href="https:\/\/shop.theliftinglab.co.uk\/cart\/1:1,2:1,3:1"/)
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
    assert.equal(JSON.stringify(req.variables), JSON.stringify({ input: { lines: [{ merchandiseId: 'gid://shopify/ProductVariant/1', quantity: 1 }, { merchandiseId: 'gid://shopify/ProductVariant/2', quantity: 2 }, { merchandiseId: 'gid://shopify/ProductVariant/3', quantity: 1 }], buyerIdentity: { countryCode: 'GB' } } }))
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
test('actual stack page renders the guest cart from hydrated products with one pack each', () => {
  const rows = ['1', '2', '3'].map(id => ({ ...item(id), name: `Fixture ${id}`, brand: 'Fixture', category: 'creatine', serving_size: 5, serving_unit: 'g', buy_url: null, product_nutrients: [] }))
  let hook = 0
  const local = modules(enabled, {
    react: { ...React, useState(initial) {
      const index = hook++
      return React.useState(index === 0 ? rows.map(p => ({ id: p.id, products: p, servings_per_day: 3 })) : index === 4 ? false : index === 11 ? rows : initial)
    } },
    '@/components/LocalStackContext': { useLocalStack: () => ({ stack: rows.map(p => ({ id: p.id })), state: { loading: false, guest: [] }, add() {}, remove() {}, retry() {} }) },
    '@/components/CombinedDosePanel': { __esModule: true, default: () => null },
  })
  const rendered = renderToStaticMarkup(React.createElement(local('app/stack/StackBuilder.tsx').default))
  assert.match(rendered, /href="https:\/\/shop.theliftinglab.co.uk\/cart\/1:1,2:1,3:1"/)
  assert.match(rendered, /Buy my stack/)
  assert.doesNotMatch(rendered, /sign.in|login/i)
})
