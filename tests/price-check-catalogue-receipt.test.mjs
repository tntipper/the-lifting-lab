import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluatePriceCheckCatalogueReceipt as evaluate } from '../lib/commerce/price-check-catalogue-receipt.ts'

const page = (variantIds, requestCursor, endCursor, hasNextPage, overrides = {}) => ({ shopId: 'shop-1', scopeId: 'active-uk-v1', snapshotId: 'snapshot-1', requestCursor, endCursor, hasNextPage, variantIds, ...overrides })
const fixture = (overrides = {}) => ({ shopId: 'shop-1', scopeId: 'active-uk-v1', snapshotId: 'snapshot-1', declaredVariantCount: 3, variants: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], pages: [page(['a', 'b'], null, 'cursor-1', true), page(['c'], 'cursor-1', 'cursor-2', false)], ...overrides })
const has = (value, code) => assert.ok(value.holds.includes(code), `${code}: ${JSON.stringify(value.holds)}`)

test('passes only a matching terminal paginated receipt and remains non-authoritative', () => {
  const result = evaluate(fixture())
  assert.deepEqual(result, { status: 'PASS', readOnly: true, automationEnabled: false, priceChangeAuthorized: false, snapshotId: 'snapshot-1', suppliedVariantCount: 3, pagedVariantCount: 3, holds: [] })
})

test('holds omitted, extra and mismatched variant IDs even when counts coincide', () => {
  has(evaluate(fixture({ pages: [page(['a', 'b'], null, 'cursor-1', true), page(['x'], 'cursor-1', 'cursor-2', false)] })), 'VARIANT_SET_MISMATCH')
  has(evaluate(fixture({ pages: [page(['a', 'b'], null, 'cursor-1', true), page([], 'cursor-1', 'cursor-2', false)] })), 'COUNT_MISMATCH')
  has(evaluate(fixture({ variants: [{ id: 'a' }, { id: 'b' }, { id: 'x' }] })), 'VARIANT_SET_MISMATCH')
})

test('holds skipped, reordered, repeated or unterminated cursor chains', () => {
  has(evaluate(fixture({ pages: [page(['a', 'b'], null, 'cursor-1', true), page(['c'], 'wrong', 'cursor-2', false)] })), 'INVALID_CURSOR')
  has(evaluate(fixture({ pages: [page(['a', 'b'], 'cursor-1', 'cursor-2', true), page(['c'], 'cursor-2', 'cursor-3', false)] })), 'INVALID_CURSOR')
  has(evaluate(fixture({ pages: [page(['a', 'b'], null, 'cursor-1', true), page(['c'], 'cursor-1', 'cursor-2', true)] })), 'MISSING_TERMINAL_PAGE')
  has(evaluate(fixture({ pages: [page(['a'], null, 'cursor-1', true), page(['b'], 'cursor-1', 'cursor-1', true), page(['c'], 'cursor-1', 'cursor-2', false)] })), 'DUPLICATE_CURSOR')
  has(evaluate(fixture({ pages: [page(['a', 'b'], null, 'cursor-1', true), page(['c'], 'cursor-1', 'cursor-1', false)] })), 'INVALID_CURSOR')
  has(evaluate(fixture({ pages: [page(['a'], null, 'cursor-1', true), page(['b'], 'cursor-1', 'cursor-2', true), page(['c'], 'cursor-2', 'cursor-1', false)] })), 'DUPLICATE_CURSOR')
  has(evaluate(fixture({ pages: [page(['a', 'b', 'c'], null, 'cursor-1', false), page(['a'], 'cursor-1', 'cursor-2', false)] })), 'INVALID_PAGE')
})

test('holds mismatched shop, scope, snapshot and declared count', () => {
  for (const key of ['shopId', 'scopeId', 'snapshotId']) has(evaluate(fixture({ pages: [page(['a', 'b'], null, 'cursor-1', true, { [key]: 'other' }), page(['c'], 'cursor-1', 'cursor-2', false)] })), 'INVALID_BINDING')
  has(evaluate(fixture({ declaredVariantCount: 4 })), 'COUNT_MISMATCH')
  has(evaluate(fixture({ declaredVariantCount: 1.5 })), 'INVALID_COUNT')
})

test('holds duplicate IDs, empty catalogue, sparse rows and malformed pages without throwing', () => {
  has(evaluate(fixture({ variants: [{ id: 'a' }, { id: 'a' }, { id: 'c' }] })), 'DUPLICATE_VARIANT_ID')
  has(evaluate(fixture({ pages: [page(['a', 'a'], null, 'cursor-1', true), page(['c'], 'cursor-1', 'cursor-2', false)] })), 'DUPLICATE_VARIANT_ID')
  has(evaluate(fixture({ variants: [], pages: [page([], null, null, false)], declaredVariantCount: 0 })), 'EMPTY_CATALOGUE')
  has(evaluate(fixture({ variants: [{ id: 'a' }, , { id: 'c' }] })), 'INVALID_VARIANT_ID')
  has(evaluate(fixture({ pages: [null, page(['c'], 'cursor-1', 'cursor-2', false)] })), 'INVALID_PAGE')
  has(evaluate(fixture({ pages: [page(['a', , 'b'], null, 'cursor-1', true), page(['c'], 'cursor-1', 'cursor-2', false)] })), 'INVALID_VARIANT_ID')
  has(evaluate(fixture({ pages: [page(['a'], null, 'cursor-1', true), , page(['c'], 'cursor-1', 'cursor-2', false)] })), 'INVALID_PAGE')
  assert.equal(evaluate(null).status, 'HOLD')
})

test('holds malformed page metadata and bounded-input violations', () => {
  has(evaluate(fixture({ pages: [page(['a', 'b'], null, 'cursor-1', 'true'), page(['c'], 'cursor-1', 'cursor-2', false)] })), 'INVALID_PAGE')
  has(evaluate(fixture({ pages: [page(['a', 'b'], null, null, true), page(['c'], null, 'cursor-2', false)] })), 'INVALID_PAGE')
  has(evaluate(fixture({ pages: [page(Array(251).fill('a'), null, 'cursor-1', false)] })), 'INVALID_PAGE')
  has(evaluate(fixture({ pages: Array(1001).fill(page(['a'], null, 'cursor-1', false)) })), 'LIMIT_EXCEEDED')
})
