import test from 'node:test'
import assert from 'node:assert/strict'
import { listedPackPence, listedPackSubtotal } from '../lib/wizard-budget.ts'

test('listed pack money preserves pence without treating unknown or malformed prices as free', () => {
  for (const price of [null, undefined, '', '25.99', 0, -1, NaN, Infinity, 19.999, 1e20]) assert.equal(listedPackPence(price), null)
  assert.equal(listedPackPence(25.99), 2599)
  assert.equal(listedPackPence(0.29), 29)
})
test('a displayed pack subtotal is exact and requires every selected price', () => {
  assert.equal(listedPackSubtotal([{ retail_price: 19.71 }, { retail_price: 0.29 }]), 2000)
  assert.equal(listedPackSubtotal([{ retail_price: 25.99 }, { retail_price: null }]), null)
  assert.equal(listedPackSubtotal([{ retail_price: 25.99 }, {}]), null)
  assert.equal(listedPackSubtotal([{ retail_price: 50 }, { retail_price: 0 }]), null)
  assert.equal(listedPackSubtotal([{ retail_price: '25.99' }]), null)
  assert.equal(listedPackSubtotal([null]), null)
  assert.equal(listedPackSubtotal(Array(1)), null)
  assert.equal(listedPackSubtotal([{ retail_price: 50_000_000_000_000 }, { retail_price: 50_000_000_000_000 }]), null)
  assert.equal(listedPackSubtotal([]), 0)
})
