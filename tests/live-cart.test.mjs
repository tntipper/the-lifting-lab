import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
function load(entry, env = {}, mounted = false, reactOverrides = {}) {
  const bundle = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
    define: Object.fromEntries(['NEXT_PUBLIC_TLL_LIVE_CART', 'NEXT_PUBLIC_TLL_ENVIRONMENT', 'NEXT_PUBLIC_TLL_STACK_CART', 'NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART', 'NEXT_PUBLIC_TLL_STORE_PRICES', 'NEXT_PUBLIC_TLL_STORE_LINKS'].map(key => [`process.env.${key}`, JSON.stringify(env[key] ?? '')])),
  })
  const mod = { exports: {} }
  vm.runInNewContext(bundle.outputFiles[0].text, { module: mod, exports: mod.exports, require: name => name === 'react' ? { ...React, ...(mounted ? { useState: () => [now, () => {}], useEffect: () => {} } : {}), ...reactOverrides } : require(name), URL, URLSearchParams, process: { env }, console, Response, fetch() { throw Error('Network forbidden') } })
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

test('live store links use exact selected variants without STORE_LINKS and block known unavailable offers', () => {
  const resolve = load('lib/affiliate.ts', { NEXT_PUBLIC_TLL_LIVE_CART: 'enabled' }).resolveProductOffer
  const mapped = { ...item('1', '90071992547409931234'), buy_url: null }
  const url = new URL(resolve(mapped, 'cart', 'compare').url)
  assert.equal(url.pathname, '/products/fixture')
  assert.equal(url.searchParams.get('variant'), '90071992547409931234')
  assert.equal(url.searchParams.get('utm_campaign'), 'compare')
  for (const price of [{ ...mapped.storePrice, availableForSale: false }, { ...mapped.storePrice, observedAtMs: 0 }])
    assert.equal(resolve({ ...mapped, buy_url: 'https://shop.theliftinglab.co.uk/products/fixture', storePrice: price }).url, null)
  const fallback = { buy_url: 'https://shop.theliftinglab.co.uk/products/fixture' }
  assert.equal(new URL(resolve(fallback).url).searchParams.get('ref'), 'theliftinglab')
  const selected = resolve({ ...mapped, ...fallback, storePrice: undefined })
  assert.equal(new URL(selected.url).searchParams.get('variant'), '90071992547409931234')
  const Component = load('components/ProductOfferLink.tsx', { NEXT_PUBLIC_TLL_LIVE_CART: 'enabled' }).default
  const html = renderToStaticMarkup(React.createElement(Component, { product: { ...fallback, brand: 'Fixture', name: 'Fixture' } }))
  assert.match(html, /Buy at TLL Store/)
  assert.doesNotMatch(html, /sponsored|affiliate link|Add to basket/)
})

test('shop product fallback accepts only exact HTTPS public product references', () => {
  const { liveStoreProductUrl, isTllSoldProduct } = load('lib/commerce/live-cart-mode.ts')
  const good = 'https://shop.theliftinglab.co.uk/products/fixture-123'
  assert.equal(liveStoreProductUrl(good), good)
  assert.equal(isTllSoldProduct({ buy_url: good }), true)
  assert.equal(isTllSoldProduct(item()), true)
  for (const value of [null, {}, '', good + '\n', ' ' + good, good + '/', good + '?', good + '?variant=1', good + '#', good + '#details',
    good.replace('https:', 'http:'), good.replace('shop.', 'www.'), good.replace('.uk/', '.uk.evil/'),
    good.replace('shop.', 'user@shop.'), good.replace('shop.', 'user:password@shop.'), good.replace('.uk/', '.uk:443/'),
    good.replace('/products/', '/collections/'), good.replace('/products/', '/products/../products/'), good.replace('fixture-123', 'Fixture'), good.replace('fixture-123', '%66ixture')]) {
    assert.equal(liveStoreProductUrl(value), null, String(value))
    assert.equal(isTllSoldProduct({ buy_url: value }), false, String(value))
  }
})

test('flag off and isolated modes retain identical pre-live resolver and rendered behaviour', () => {
  const products = [{ ...item(), buy_url: null }, { buy_url: 'https://shop.theliftinglab.co.uk/products/fixture' },
    { buy_url: 'https://www.amazon.co.uk/dp/B000000001' }, { buy_url: null }]
  for (const legacy of ['', 'enabled']) {
    const base = { NEXT_PUBLIC_TLL_STORE_LINKS: legacy }
    const original = load('lib/affiliate.ts', base)
    const render = (env, product) => renderToStaticMarkup(React.createElement(load('components/ProductOfferLink.tsx', env).default, { product: { brand: 'Fixture', name: 'Fixture', ...product } }))
    for (const product of products) {
      assert.equal(JSON.stringify(load('lib/affiliate.ts', { ...base, NEXT_PUBLIC_TLL_LIVE_CART: 'disabled' }).resolveProductOffer(product)), JSON.stringify(original.resolveProductOffer(product)))
      assert.equal(render(base, product), render({ ...base, NEXT_PUBLIC_TLL_LIVE_CART: 'disabled' }, product))
      if (!product.storeLinkMapping && !product.buy_url?.includes('shop.')) assert.equal(render(base, product), render({ ...base, NEXT_PUBLIC_TLL_LIVE_CART: 'enabled' }, product))
      for (const isolated of ['staging', 'synthetic-preview']) {
        const flags = { ...base, NEXT_PUBLIC_TLL_ENVIRONMENT: isolated }
        assert.equal(render(flags, product), render({ ...flags, NEXT_PUBLIC_TLL_LIVE_CART: 'enabled' }, product))
      }
    }
  }
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


test('stale add keeps refresh guidance and status truncates inside the reserved area', () => {
  let message = '', hook = 0
  const { LiveBasketAdd } = load('components/LiveBasket.tsx', { NEXT_PUBLIC_TLL_LIVE_CART: 'enabled' }, false, {
    useState: initial => [initial, ++hook === 2 ? value => { message = value } : () => {}],
  })
  const element = LiveBasketAdd({ product: { ...item(), storePrice: { ...item().storePrice, observedAtMs: 0 } } })
  element.props.children[1].props.children[1].props.onClick()
  assert.equal(message, 'This offer is unavailable. Refresh the product page.')
  hook = 0
  const Status = load('components/LiveBasket.tsx', {}, false, {
    useState: initial => [++hook === 2 ? message : initial, () => {}],
  }).LiveBasketAdd
  const html = renderToStaticMarkup(React.createElement(Status, { product: item() }))
  assert.match(html, /role="status" title="This offer is unavailable. Refresh the product page." class="absolute inset-0 truncate"/)
})

test('approved mapping alone permits exact product navigation; invalid mappings preserve affiliate path', () => {
  const live = load('lib/affiliate.ts', { NEXT_PUBLIC_TLL_LIVE_CART: 'enabled' })
  const { isTllSoldProduct } = load('lib/commerce/live-cart-mode.ts')
  const mapped = { ...item(), storePrice: undefined, buy_url: null }
  assert.match(live.resolveProductOffer(mapped).url, /products\/fixture\?variant=1&/)
  for (const change of [{ approved: false }, { productId: 'other' }, { shopifyVariantId: 'bad' },
    { review: { ...mapped.storeLinkMapping.review, expiresAtMs: now - 1 } }]) {
    const product = { ...mapped, storeLinkMapping: { ...mapped.storeLinkMapping, ...change }, buy_url: 'https://www.amazon.co.uk/dp/B000000001' }
    assert.equal(isTllSoldProduct(product), false)
    assert.equal(JSON.stringify(live.resolveProductOffer(product)), JSON.stringify(live.resolveProductListing(product.buy_url)))
  }
})
test('pre-hydration store navigation never uses an Add to basket link label', () => {
  const Component = load('components/ProductOfferLink.tsx', { NEXT_PUBLIC_TLL_LIVE_CART: 'enabled' }).default
  const html = renderToStaticMarkup(React.createElement(Component, { product: { ...item(), buy_url: null }, storeActionLabel: 'Add to basket' }))
  assert.match(html, /Buy at TLL Store/)
  assert.doesNotMatch(html, /Add to basket/)
  assert.match(html, /products\/fixture\?variant=1/)
})
