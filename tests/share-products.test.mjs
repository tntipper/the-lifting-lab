import assert from 'node:assert/strict'
import test from 'node:test'
import { isProductId, parseShareProductIds, resolveShareProducts } from '../lib/share-products.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const UNKNOWN = '33333333-3333-4333-8333-333333333333'
const active = { id: A, brand: 'Fixture Brand', name: 'Fixture Product', category: 'creatine', status: 'active' }
const second = { id: B, brand: 'Other Brand', name: 'Other Product', category: 'whey', status: 'active' }

test('card URL accepts only bounded product identities, not names or scores', () => {
  const tampered = new URLSearchParams({ data: JSON.stringify({ score: 100, items: [{ name: 'Invented', score: 100 }] }) })
  assert.equal(parseShareProductIds(tampered), null)
  assert.equal(parseShareProductIds(new URLSearchParams({ ids: A, score: '100', name: 'Invented' })), null)
  assert.equal(parseShareProductIds(new URLSearchParams(`ids=${A}&ids=${B}`)), null)
  for (const ids of ['', 'not-a-product', `${A},`, `${A},${'x'.repeat(2000)}`, Array(51).fill(A).join(',')]) {
    assert.equal(parseShareProductIds(new URLSearchParams({ ids })), null)
  }
  assert.deepEqual(parseShareProductIds(new URLSearchParams({ ids: `${B},${A},${B}` })), [B, A])
  assert.deepEqual(parseShareProductIds(new URLSearchParams()), [])
})

test('official content comes from active records and the trusted score function', async () => {
  let loaded
  const result = await resolveShareProducts([B, A], async ids => {
    loaded = ids
    // Neither returned row order nor an unrelated stored score field is authoritative.
    return [{ ...active, score: 100 }, second]
  }, (brand, name) => brand === active.brand && name === active.name ? 61 : null)

  assert.deepEqual(loaded, [B, A])
  assert.deepEqual(result, { ok: true, products: [
    { id: B, brand: second.brand, name: second.name, category: second.category, score: null },
    { id: A, brand: active.brand, name: active.name, category: active.category, score: 61 },
  ] })
})

test('unknown or inactive products fail honestly without partial authoritative cards', async () => {
  for (const rows of [[], [{ ...active, status: 'pending' }]]) {
    const result = await resolveShareProducts([A], async () => rows, () => 90)
    assert.equal(result.ok, false)
    assert.equal(result.status, 404)
  }
  const partial = await resolveShareProducts([A, UNKNOWN], async () => [active], () => 90)
  assert.equal(partial.ok, false)
  assert.equal(partial.status, 404)
  assert.equal('products' in partial, false)
})

test('malformed IDs cannot reach the catalogue query; empty cards require no lookup', async () => {
  const unexpectedLookup = async () => { throw new Error('Lookup must not run') }
  for (const id of ['bad', `${A}&status=eq.pending`, '', 42, null]) {
    assert.equal(isProductId(id), false)
    const result = await resolveShareProducts([id], unexpectedLookup, () => 90)
    assert.equal(result.status, 400)
  }
  assert.deepEqual(await resolveShareProducts([], unexpectedLookup, () => 90), { ok: true, products: [] })
})

test('lookup errors and invalid returned records produce a generic temporary failure', async () => {
  const lookups = [
    async () => { throw new Error('private provider detail') },
    async () => null,
    async () => [{ ...active, name: { injected: true } }],
    async () => [active, active],
  ]
  for (const lookup of lookups) {
    const result = await resolveShareProducts([A], lookup, () => 90)
    assert.deepEqual(result, { ok: false, status: 503, error: 'Product information is temporarily unavailable' })
  }
})

test('invalid scores remain unassessed, rather than producing impossible grades', async () => {
  for (const score of [null, undefined, '100', NaN, Infinity, -1, 101]) {
    const result = await resolveShareProducts([A], async () => [active], () => score)
    assert.equal(result.ok, true)
    assert.equal(result.products[0].score, null)
  }
  for (const score of [0, 100]) {
    const result = await resolveShareProducts([A], async () => [active], () => score)
    assert.equal(result.products[0].score, score)
  }
})

test('UUID casing and duplicate selection do not create distinct product identities', async () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  let loaded
  const result = await resolveShareProducts([id.toUpperCase(), id], async ids => {
    loaded = ids
    return [{ ...active, id: id.toUpperCase() }]
  }, () => 50)
  assert.deepEqual(loaded, [id])
  assert.equal(result.products.length, 1)
  assert.equal(result.products[0].id, id)
})
