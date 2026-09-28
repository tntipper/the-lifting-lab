import test from 'node:test'
import assert from 'node:assert/strict'
import { readShopifyVariantSnapshot as read, SHOPIFY_VARIANT_COUNT_AFTER_QUERY, SHOPIFY_VARIANT_COUNT_BEFORE_QUERY, SHOPIFY_VARIANT_PAGE_QUERY, SHOPIFY_VARIANT_SNAPSHOT_SCOPE_ID } from '../lib/commerce/shopify-variant-snapshot.ts'

const shopId = 'gid://shopify/Shop/123'
const variant = (id, price = '12.34', status = 'ACTIVE') => ({ id: `gid://shopify/ProductVariant/${id}`, price, updatedAt: '2026-09-23T10:11:12.123Z', product: { id: `gid://shopify/Product/${id}`, status } })
const envelope = data => ({ data })
const count = value => envelope({ shop: { id: shopId, currencyCode: 'GBP' }, productVariantsCount: { count: value, precision: 'EXACT' } })
const page = (nodes, hasNextPage, endCursor) => envelope({ shop: { id: shopId, currencyCode: 'GBP' }, productVariants: { nodes, pageInfo: { hasNextPage, endCursor } } })
const port = responses => {
  const calls = []
  return { calls, request: async value => { calls.push(value); const next = responses.shift(); if (next instanceof Error) throw next; return next } }
}
const input = request => ({ request, expectedShopId: shopId, snapshotId: 'snapshot-1' })
const hold = result => assert.deepEqual(result, { status: 'HOLD', readOnly: true, shadowUseAuthorized: false, automationEnabled: false, priceChangeAuthorized: false, snapshot: null, holdReason: 'SHOPIFY_VARIANT_SNAPSHOT_HOLD' })

test('collects a two-page GBP exact-count receipt through fixed unfiltered query documents', async () => {
  const client = port([count(3), page([variant(1), variant(2)], true, 'cursor-1'), page([variant(3, '0.99', 'UNLISTED')], false, 'cursor-2'), count(3)])
  const result = await read(input(client.request))
  assert.equal(result.status, 'PASS')
  assert.deepEqual(result.snapshot, { shopId, currencyCode: 'GBP', scopeId: SHOPIFY_VARIANT_SNAPSHOT_SCOPE_ID, snapshotId: 'snapshot-1', declaredVariantCount: 3, variants: [{ id: 'gid://shopify/ProductVariant/1', pricePence: 1234, updatedAt: '2026-09-23T10:11:12.123Z', product: { id: 'gid://shopify/Product/1', status: 'ACTIVE' } }, { id: 'gid://shopify/ProductVariant/2', pricePence: 1234, updatedAt: '2026-09-23T10:11:12.123Z', product: { id: 'gid://shopify/Product/2', status: 'ACTIVE' } }, { id: 'gid://shopify/ProductVariant/3', pricePence: 99, updatedAt: '2026-09-23T10:11:12.123Z', product: { id: 'gid://shopify/Product/3', status: 'UNLISTED' } }] })
  assert.deepEqual(client.calls.map(call => [call.operationName, call.query, call.variables]), [['TllShopifyVariantCountBefore', SHOPIFY_VARIANT_COUNT_BEFORE_QUERY, {}], ['TllShopifyVariantPage', SHOPIFY_VARIANT_PAGE_QUERY, { after: null }], ['TllShopifyVariantPage', SHOPIFY_VARIANT_PAGE_QUERY, { after: 'cursor-1' }], ['TllShopifyVariantCountAfter', SHOPIFY_VARIANT_COUNT_AFTER_QUERY, {}]])
  assert.equal(result.shadowUseAuthorized, false); assert.equal(result.automationEnabled, false); assert.equal(result.priceChangeAuthorized, false)
})

test('holds count disagreement, approximate counts, foreign/non-GBP shops, and GraphQL errors without a snapshot', async t => {
  const cases = [
    [count(1), page([variant(1)], false, 'end'), count(2)],
    [envelope({ shop: { id: shopId, currencyCode: 'GBP' }, productVariantsCount: { count: 1, precision: 'AT_LEAST' } })],
    [envelope({ shop: { id: 'gid://shopify/Shop/999', currencyCode: 'GBP' }, productVariantsCount: { count: 1, precision: 'EXACT' } })],
    [envelope({ shop: { id: shopId, currencyCode: 'USD' }, productVariantsCount: { count: 1, precision: 'EXACT' } })],
    [{ data: {}, errors: [{ message: 'nope' }] }]
  ]
  for (const responses of cases) await t.test('scrubs malformed evidence', async () => hold(await read(input(port(responses).request))))
})

test('holds malformed prices/status/pages, changed cursors, repeated IDs, missing terminal pages, and empty catalogues', async t => {
  const cases = [
    [count(1), page([variant(1, '12.3')], false, 'end')],
    [count(1), page([variant(1, '12.34', 'PUBLISHED')], false, 'end')],
    [count(1), page([variant(1)], true, 'cursor-1'), page([variant(2)], false, 'cursor-1')],
    [count(2), page([variant(1)], true, 'cursor-1'), page([variant(1)], false, 'cursor-2'), count(2)],
    [count(1), page([variant(1)], true, 'cursor-1'), page([variant(2)], true, 'cursor-2'), count(1)],
    [count(0), envelope({ shop: { id: shopId, currencyCode: 'GBP' }, productVariants: { nodes: [], pageInfo: { hasNextPage: false, endCursor: 'end' } } }), count(0)]
  ]
  for (const responses of cases) await t.test('fails closed', async () => hold(await read(input(port(responses).request))))
})

test('holds normalized-invalid UTC dates, caller supplied scopes, and prices outside the downstream pence bound', async () => {
  hold(await read(input(port([count(1), page([{ ...variant(1), updatedAt: '2026-02-30T10:11:12.000Z' }], false, 'end'), count(1)]).request)))
  hold(await read({ ...input(port([]).request), scopeId: 'active-only' }))
  const exactLimit = await read(input(port([count(1), page([variant(1, '10000000.00')], false, 'end'), count(1)]).request))
  assert.equal(exactLimit.status, 'PASS')
  hold(await read(input(port([count(1), page([variant(1, '10000000.01')], false, 'end'), count(1)]).request)))
})

test('holds rejected transport and never calls a default request implementation', async () => {
  hold(await read(input(port([new Error('transport')]).request)))
  hold(await read({ expectedShopId: shopId, scopeId: 'all-variants', snapshotId: 'snapshot-1' }))
})
