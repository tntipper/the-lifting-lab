import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
function load(entry, env = {}, mounted = false) {
  const bundle = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
    define: Object.fromEntries(['NEXT_PUBLIC_TLL_LIVE_CART', 'NEXT_PUBLIC_TLL_ENVIRONMENT', 'NEXT_PUBLIC_TLL_STACK_CART', 'NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART', 'NEXT_PUBLIC_TLL_STORE_PRICES', 'NEXT_PUBLIC_TLL_STORE_LINKS'].map(key => [`process.env.${key}`, JSON.stringify(env[key] ?? '')])),
  })
  const mod = { exports: {} }
  vm.runInNewContext(bundle.outputFiles[0].text, { module: mod, exports: mod.exports, require: name => mounted && name === 'react' ? { ...React, useState: () => [now, () => {}], useEffect: () => {} } : require(name), URL, URLSearchParams, process: { env }, console, Response, fetch() { throw Error('Network forbidden') } })
  return mod.exports
}
const now = Date.now()
const item = (id = '1', variant = id, quantity = 1) => ({ id, brand: 'Fixture', name: `Item ${id}`, quantity,
  storeLinkMapping: { productId: id, shopifyProductHandle: 'fixture', shopifyVariantId: variant, active: true, approved: true,
    review: { approved: true, version: 'v1', expectedVersion: 'v1', verifiedAtMs: now - 1000, expiresAtMs: now + 600000 } },
  storePrice: { productId: id, price: 12, availableForSale: true, observedAtMs: now - 1000 },
})
const basket = load('lib/commerce/live-basket.ts'), permalink = load('lib/commerce/cart-permalink.ts')
const saved = row => basket.addBasketLine([], row, now)[0]
const stored = lines => JSON.stringify({ version: 1, lines })

test('live gate requires explicit opt-in; staging and synthetic preview always win', () => {
  for (const env of [{}, { NEXT_PUBLIC_TLL_LIVE_CART: 'true' }, { NEXT_PUBLIC_TLL_LIVE_CART: 'enabled', NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging' }, { NEXT_PUBLIC_TLL_LIVE_CART: 'enabled', NEXT_PUBLIC_TLL_ENVIRONMENT: 'synthetic-preview' }]) {
    assert.equal(load('lib/commerce/live-cart-mode.ts', env).liveCartEnabled(), false)
  }
  assert.equal(load('lib/commerce/live-cart-mode.ts', { NEXT_PUBLIC_TLL_LIVE_CART: 'enabled' }).liveCartEnabled(), true)
  const stack = load('lib/commerce/stack-cart.ts', { NEXT_PUBLIC_TLL_LIVE_CART: 'enabled', NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART: 'enabled' })
  assert.equal(stack.stackCartEnabled(), true); assert.equal(stack.stackStorefrontCartEnabled(), false)
})
test('checkout validator rejects alternate hosts, ports, redirects, fragments, credentials and malformed lines', () => {
  const good = 'https://shop.theliftinglab.co.uk/cart/90071992547409931234:2,3:10'
  assert.equal(permalink.liveCheckoutHref(good), good)
  for (const value of [null, '', good.replace('https:', 'http:'), good.replace('shop.', 'evil.'), good.replace('.uk/', '.uk:443/'), good.replace('shop.', 'user@shop.'), good + '#x', good + '?redirect=https://evil.invalid', good + '?utm_campaign=bad', good + '?ref=theliftinglab&ref=theliftinglab', good.replace(':2', ':0'), good.replace(':2', ':-1'), good.replace(':2', ':1.5'), good.replace('/cart/', '/cart/../cart/'), good + '/', good + ',4', good + '\n']) {
    assert.throws(() => permalink.liveCheckoutHref(value), String(value))
  }
})
test('storage rejects malformed/versioned/oversize input, duplicates, invalid quantities and unsafe projections', () => {
  for (const raw of [null, '{', 'null', '{}', JSON.stringify({ version: 2, lines: [item()] }), stored(Array.from({ length: 21 }, (_, i) => saved(item(String(i + 1))))), stored([item(), item()]), stored([{ ...saved(item()), quantity: 0 }]), stored([{ ...saved(item()), quantity: 11 }]), stored([{ ...saved(item()), variantId: '1:2' }]),
    ...[{ variantId: '0' }, { variantId: '1.2' }, { variantId: 1 }, { shownPrice: null }, { shownPrice: -1 }, { name: '' }, { brand: null }, { variantLabel: 3 }].map(change => stored([{ ...saved(item()), ...change }]))]) {
    assert.equal(basket.parseBasketStorage(raw, now).length, 0)
  }
  const line = basket.parseBasketStorage(stored([{ ...item(), privateCost: 99, storePrice: { ...item().storePrice, sku: 'private' } }]), now)[0]
  assert.equal(line.quantity, 1); assert.equal(line.privateCost, undefined); assert.equal(line.storePrice, undefined); assert.equal(line.storeLinkMapping, undefined); assert.equal(line.shownPrice, 12)
})
test('approval, product identity, selection and current availability are all required, independent of price flags', () => {
  const cases = [
    { ...item(), storeVariants: [item(), item()] },
    { ...item(), cataloguePresentation: { productId: '1', availability: 'available', purchaseEnabled: false } },
    ...[{ availableForSale: false }, { price: null }, { price: 0 }, { observedAtMs: now - 900000 }, { observedAtMs: now + 1 }, { productId: 'other' }].map(change => ({ ...item(), storePrice: { ...item().storePrice, ...change } })),
    ...[{ approved: false }, { productId: 'other' }, { shopifyVariantId: '1:2,3' }, { review: { ...item().storeLinkMapping.review, expiresAtMs: now } }].map(change => ({ ...item(), storeLinkMapping: { ...item().storeLinkMapping, ...change } })),
  ]
  for (const row of cases) {
    assert.equal(basket.liveBasketEligible(row, now), false)
    assert.throws(() => basket.addBasketLine([], row, now), /unavailable/)
  }
})
test('basket merges exact variants, retains independent selections, limits quantities and line count', () => {
  let lines = basket.addBasketLine([], item('1', 'gid://shopify/ProductVariant/22', 2), now)
  lines = basket.addBasketLine(lines, item('1', '22', 3), now)
  assert.equal(lines.length, 1); assert.equal(lines[0].quantity, 5)
  lines = basket.addBasketLine(lines, item('1', '23'), now)
  assert.equal(lines.length, 2)
  assert.throws(() => basket.addBasketLine(lines, item('1', '22', 6), now), /Maximum 10/)
  const full = Array.from({ length: 20 }, (_, i) => saved(item(String(i + 1))))
  assert.throws(() => basket.addBasketLine(full, item('21'), now), /Maximum 20/)
})
test('permalink preserves numeric strings, exact quantities and fixed attribution; saved lines survive expiry', () => {
  const lines = [saved(item('1', '90071992547409931234', 2)), saved(item('2', '22', 3))]
  const href = basket.buildLiveBasketCheckout(lines, 'stack', now)
  assert.equal(href, 'https://shop.theliftinglab.co.uk/cart/90071992547409931234:2,22:3?utm_source=theliftinglab&utm_medium=referral&utm_campaign=stack&ref=theliftinglab')
  assert.equal(permalink.liveCheckoutHref(href), href)
  assert.equal(basket.buildLiveBasketCheckout(basket.parseBasketStorage(stored(lines), now + 86400000), 'stack'), href)
  const old = { ...item(), storeLinkMapping: { ...item().storeLinkMapping, review: { ...item().storeLinkMapping.review, expiresAtMs: 1 } },
    storePrice: { ...item().storePrice, observedAtMs: 0 } }
  const persisted = basket.parseBasketStorage(stored([old]))
  assert.equal(persisted.length, 1)
  assert.ok(basket.buildLiveBasketCheckout(persisted))
  assert.equal(basket.addBasketLine(persisted, item('2'), now).length, 2, 'saving a later addition preserves the old line')
  assert.equal(basket.buildLiveBasketCheckout([], 'stack', now), null)
  assert.equal(basket.buildLiveBasketCheckout([saved(item('1', '22', 10)), saved(item('2', '22'))], 'stack', now), null)
})
test('actual product action defaults unchanged, switches to basket only in live mode and hides unavailable offers', () => {
  const env = { NEXT_PUBLIC_TLL_LIVE_CART: 'enabled', NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled', NEXT_PUBLIC_TLL_STORE_PRICES: 'enabled' }
  const render = (product, flags) => renderToStaticMarkup(React.createElement(load('components/ProductOfferLink.tsx', flags, true).default, { product: { ...product, buy_url: null } }))
  assert.match(render(item(), env), /Add to basket/)
  assert.match(render(item(), { NEXT_PUBLIC_TLL_LIVE_CART: 'enabled' }), /Add to basket/)
  assert.doesNotMatch(render(item(), {}), /Add to basket/)
  assert.doesNotMatch(render(item(), { ...env, NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging' }), /Add to basket/)
  assert.doesNotMatch(render({ ...item(), storePrice: { ...item().storePrice, availableForSale: false } }, env), /<button|Buy at/)
})
test('live entry dependency graphs cannot reach staging server, credentials, Storefront cart or database modules', () => {
  for (const entry of ['components/LiveBasket.tsx', 'app/cart/page.tsx', 'components/ProductOfferLink.tsx', 'components/TopNav.tsx']) {
    const output = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', packages: 'external', metafile: true })
    const inputs = Object.keys(output.metafile.inputs).join('\n')
    assert.doesNotMatch(inputs, /lib\/commerce\/staging-cart-(?!types)|staging-customer-(?:server|vault|postgres)|vault|postgres|shopify-admin|lib\/server\//, entry)
    assert.doesNotMatch(output.outputFiles[0].text, /(?<!PUBLIC_)TLL_STAGING_|\/api\/cart/, entry)
  }
})

test('Buy my stack uses live permalink without the legacy stack flag or Storefront setup, and explains skipped items', () => {
  const Component = load('components/BuyMyStack.tsx', { NEXT_PUBLIC_TLL_LIVE_CART: 'enabled', NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART: 'enabled' }).default
  const unavailable = { ...item('2'), storePrice: { ...item('2').storePrice, availableForSale: false } }
  const html = renderToStaticMarkup(React.createElement(Component, { items: [item('1', '55', 2), unavailable], ready: true }))
  assert.match(html, /cart\/55:2\?utm_source=theliftinglab&amp;utm_medium=referral&amp;utm_campaign=stack&amp;ref=theliftinglab/)
  assert.match(html, /Out of stock/)
  assert.doesNotMatch(html, /awaiting setup|cart\/2:/)
})

test('ineligible live offers exactly preserve existing retailer/store links and bordered unavailable markup', () => {
  const render = (product, live, mounted = true) => renderToStaticMarkup(React.createElement(load('components/ProductOfferLink.tsx', {
    NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled', NEXT_PUBLIC_TLL_LIVE_CART: live ? 'enabled' : '',
  }, mounted).default, { product }))
  const affiliate = 'https://www.amazon.co.uk/dp/B000000001'
  for (const product of [
    { ...item(), buy_url: affiliate, storeLinkMapping: { ...item().storeLinkMapping, approved: false } },
    { ...item(), buy_url: affiliate, storeLinkMapping: { ...item().storeLinkMapping, review: { ...item().storeLinkMapping.review, expiresAtMs: now - 1 } } },
    { ...item(), storePrice: undefined },
    { ...item(), storePrice: { ...item().storePrice, observedAtMs: now - 86400000 } },
    { ...item(), storePrice: { ...item().storePrice, availableForSale: false } },
  ]) assert.equal(render(product, true), render(product, false))
  assert.equal(render(item(), true, false), render(item(), false, false), 'server and initial hydration retain the original offer')
})

test('saved baskets preserve compare attribution and only store public fields through later additions', () => {
  const lines = basket.addBasketLine([saved(item())], item('2'), now + 1)
  const raw = JSON.stringify({ version: 1, lines, campaign: 'compare' })
  assert.equal(basket.basketCampaign(raw), 'compare')
  assert.match(basket.buildLiveBasketCheckout(basket.parseBasketStorage(raw), basket.basketCampaign(raw)), /utm_campaign=compare/)
  assert.deepEqual(Object.keys(lines[0]).sort(), ['brand', 'id', 'name', 'quantity', 'shownPrice', 'variantId'])
  assert.equal(basket.basketCampaign('{bad'), 'product')
})

test('live stacks clamp combined quantities and explain truncation instead of losing checkout', () => {
  const Component = load('components/BuyMyStack.tsx', { NEXT_PUBLIC_TLL_LIVE_CART: 'enabled' }).default
  const items = [item('1', '55', 9), item('2', '55', 9), ...Array.from({ length: 21 }, (_, i) => item(String(i + 3), String(i + 100)))]
  const html = renderToStaticMarkup(React.createElement(Component, { items, ready: true }))
  assert.match(html, /cart\/55:10,/)
  assert.match(html, /up to 20 store items and 10 packs per item/)
  assert.doesNotMatch(html, /No store items can be added/)
  const result = basket.buildLiveStackCheckout(items, now)
  assert.equal(new URL(result.url).pathname.split(',').length, 20)
})
