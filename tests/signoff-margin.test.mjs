import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateProposalMargin } from '../lib/commerce/pricing-policy.ts'
import { signoffMargin } from '../lib/signoff-margin.ts'
const input = { pricePence: 3000, tradeCostExVatPence: 1000, supplierVatBps: 2000,
  returnsReserveBps: 0, paymentFixedPence: 25, paymentVariableBps: 200, deliveryCostPence: 600, customerShippingPence: 499 }
test('no output VAT; supplier VAT, dispatch and payment fees remain costs', () => {
  const result = signoffMargin(input)
  assert.deepEqual(result, { outputVatPence: 0, receiptsPence: 3499, tradeCostPence: 1200,
    paymentFeePence: 94.98, returnsReservePence: 0, feesPence: 694.98, marginPence: 1604.02, marginRatio: 1604.02 / 3499 })
})
test('zero-rated supplier costs do not change sale revenue; negative margin retained', () => {
  assert.equal(signoffMargin({ ...input, supplierVatBps: 0 }).marginPence, 1804.02)
  assert.equal(signoffMargin({ ...input, pricePence: 100 }).marginPence, -1237.98)
})
test('invalid amounts/rates fail instead of manufacturing a margin', () => {
  for (const value of [-1, NaN, Infinity, 1.2, 1_000_000_001]) assert.throws(() => signoffMargin({ ...input, tradeCostExVatPence: value }))
  assert.throws(() => signoffMargin({ ...input, supplierVatBps: 10001 }))
  assert.throws(() => signoffMargin({ ...input, pricePence: 0 }))
})

test('signoff is the canonical policy function, including price-only reserve and exact fractions', () => {
  assert.equal(signoffMargin, calculateProposalMargin)
  const result = signoffMargin({ ...input, returnsReserveBps: 333, tradeCostExVatPence: 1001 })
  assert.equal(result.returnsReservePence, 99.9)
  assert.equal(result.tradeCostPence, 1201.2)
  assert.equal(result.marginPence, 1502.92)
  assert.equal(result.outputVatPence, 0)
  for (const value of [undefined, -1, 0.5, 10001, NaN]) {
    assert.throws(() => signoffMargin({ ...input, returnsReserveBps: value }))
  }
  for (const key of Object.keys(input)) {
    const missing = { ...input }; delete missing[key]
    assert.throws(() => signoffMargin(missing))
  }
})
