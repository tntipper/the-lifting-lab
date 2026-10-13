import test from 'node:test'
import assert from 'node:assert/strict'
import { signoffMargin } from '../lib/signoff-margin.ts'
const input = { pricePence: 3000, tradeCostExVatPence: 1000, supplierVatBps: 2000,
  paymentFixedPence: 25, paymentVariableBps: 200, deliveryCostPence: 600, customerShippingPence: 499 }
test('no output VAT; supplier VAT, dispatch and payment fees remain costs', () => {
  const result = signoffMargin(input)
  assert.deepEqual(result, { outputVatPence: 0, receiptsPence: 3499, tradeCostPence: 1200,
    paymentFeePence: 95, feesPence: 695, marginPence: 1604, marginRatio: 1604 / 3499 })
})
test('zero-rated supplier costs do not change sale revenue; negative margin retained', () => {
  assert.equal(signoffMargin({ ...input, supplierVatBps: 0 }).marginPence, 1804)
  assert.equal(signoffMargin({ ...input, pricePence: 100 }).marginPence, -1238)
})
test('invalid amounts/rates fail instead of manufacturing a margin', () => {
  for (const value of [-1, NaN, Infinity, 1.2, 1_000_000_001]) assert.throws(() => signoffMargin({ ...input, tradeCostExVatPence: value }))
  assert.throws(() => signoffMargin({ ...input, supplierVatBps: 10001 }))
  assert.throws(() => signoffMargin({ ...input, pricePence: 0 }))
})
