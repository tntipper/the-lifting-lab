import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { PREVIEW_PRODUCTS } from '../lib/preview-products.ts'

test('read-only preview products use only bundled exact-ID assets or missing-image fallback', () => {
  assert.equal(PREVIEW_PRODUCTS.length, 10)
  for (const product of PREVIEW_PRODUCTS) {
    assert.equal(product.buy_url, null)
    if (product.image_url === null) continue
    assert.equal(product.image_url, `/catalogue/${product.id}.png`)
    assert.ok(existsSync(new URL(`../public${product.image_url}`, import.meta.url)), product.id)
  }
})
