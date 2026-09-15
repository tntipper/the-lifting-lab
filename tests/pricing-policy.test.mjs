import test from 'node:test'
import assert from 'node:assert/strict'
import { calculatePriceFloor, evaluateBasket, SUPPLIER_DELIVERY_FEE_PENCE, PRICE_WRITES_ENABLED, TLL_POLICY_VALUES, MAX_PENCE } from '../lib/commerce/pricing-policy.ts'

const NOW = 1800000000000
function approved() { return { version: 'fixture-v1', expectedVersion: 'fixture-v1', approved: true, validFromMs: NOW - 1000, expiresAtMs: NOW + 1000 } }
function tax() { return { approved: true, basis: 'not_subject', vatBps: 0, inputVatRecoverable: false } }
function quote() {
  return { approval: approved(), currency: 'GBP', unit: 'sellable_item', unitDefinitionApproved: true,
    wholesale: { amountPence: 1000, tax: tax() }, supplierDelivery: { amountPence: 500, tax: tax() },
    otherPerItemCosts: [], returnsReservePence: 50, outputVat: { approved: true, rateBps: 2000 } }
}
function input(discount = 0) {
  return { nowMs: NOW, cost: quote(), payment: { approval: approved(), fixedPence: 25, variableBps: 200 },
    policy: { approval: approved(), ...TLL_POLICY_VALUES, maxDiscountBps: discount } }
}
function line(id = 'variant-a', quantity = 1, price = 3500) {
  return { id, quantity, listUnitPricePence: price, cost: quote(), percentageDiscountBps: 0, fixedDiscountPence: 0 }
}
function basket(lines = [line()]) {
  const ctx = input()
  return { nowMs: ctx.nowMs, payment: ctx.payment, policy: ctx.policy, lines, customerShipping: { approval: approved(), grossPence: 0, outputVat: { approved: true, rateBps: 2000 } } }
}
function fraction(value) { return [BigInt(value.numerator), BigInt(value.denominator)] }
function equalFraction(value, n, d = 1) { const [a, b] = fraction(value); assert.equal(a * BigInt(d), BigInt(n) * b) }
function rationalAdd(values) {
  return values.map(fraction).reduce(([n, d], [a, b]) => [n * b + a * d, d * b], [0n, 1n])
}
function hold(result, code) { assert.equal(result.eligible, false); assert.ok(result.holds.some(h => h.code === code), JSON.stringify(result)); assert.equal(result.liveEnabled, false) }

// Independent integer cross-multiplication oracle, using the declared economic fixture.
function referencePass(price, discount, C = 1575n, cash = 300n, margin = 2500n, vat = 2000n, fee = 200n) {
  const discountPence = (2n * BigInt(price) * BigInt(discount) + 10000n) / 20000n
  const grossN = BigInt(price) - discountPence, grossD = 1n
  const netN = grossN * 10000n, netD = grossD * (10000n + vat)
  const contribN = netN * grossD * 10000n - C * netD * grossD * 10000n - grossN * fee * netD
  const contribD = netD * grossD * 10000n
  return contribN >= cash * contribD && contribN * 10000n * netD >= margin * netN * contribD
}

test('reference 2604p and 2893p floors use exact arithmetic and both rules', () => {
  for (const [discount, expected] of [[0, 2604], [1000, 2893]]) {
    const result = calculatePriceFloor(input(discount))
    assert.equal(result.eligible, true)
    assert.equal(result.calculation.minimumListPricePence, expected)
    assert.equal(referencePass(expected, discount), true)
    assert.equal(referencePass(expected - 1, discount), false)
    equalFraction(result.calculation.nonVariableEconomicCostPence, 1575)
  }
  equalFraction(calculatePriceFloor(input()).calculation.netRevenuePenceAtMinimum, 2170)
  equalFraction(calculatePriceFloor(input()).calculation.contributionPenceAtMinimum, 13573, 25)
})

test('minimum is lowest passing penny across a grid of approved policies and taxes', () => {
  for (const discount of [0, 1, 333, 1000, 2500]) for (const vat of [0, 500, 2000]) for (const cash of [300, 2000]) {
    const value = input(discount); value.cost.outputVat.rateBps = vat; value.policy.minimumCashPerItemPence = cash
    const result = calculatePriceFloor(value)
    assert.equal(result.eligible, true)
    const price = result.calculation.minimumListPricePence
    assert.ok(referencePass(price, discount, 1575n, BigInt(cash), 2500n, BigInt(vat)))
    assert.equal(referencePass(price - 1, discount, 1575n, BigInt(cash), 2500n, BigInt(vat)), false)
  }
})

test('cash floor can dominate and target margin stays separate from minimum', () => {
  const value = input(); value.policy.minimumCashPerItemPence = 2000
  const result = calculatePriceFloor(value)
  assert.equal(result.calculation.limitingMinimumRule, 'cash')
  assert.ok(result.calculation.targetListPricePence >= result.calculation.minimumListPricePence)
  const normal = calculatePriceFloor(input()).calculation
  assert.equal(normal.targetListPricePence, 3020)
  assert.ok(referencePass(3020, 0, 1575n, 300n, 3500n))
  assert.equal(referencePass(3019, 0, 1575n, 300n, 3500n), false)
})

test('£5 fact is independent of approved economic VAT treatment', () => {
  const value = input()
  assert.equal(SUPPLIER_DELIVERY_FEE_PENCE, 500)
  value.cost.supplierDelivery.tax = { approved: true, basis: 'inclusive', vatBps: 2000, inputVatRecoverable: true }
  let result = calculatePriceFloor(value)
  assert.equal(result.eligible, true); equalFraction(result.calculation.supplierDeliveryEconomicPence, 1250, 3)
  assert.equal(result.calculation.supplierDeliveryAmountPence, 500)
  value.cost.supplierDelivery.tax = { approved: true, basis: 'exclusive', vatBps: 2000, inputVatRecoverable: false }
  result = calculatePriceFloor(value); equalFraction(result.calculation.supplierDeliveryEconomicPence, 600)
  value.cost.supplierDelivery.tax.inputVatRecoverable = true
  equalFraction(calculatePriceFloor(value).calculation.supplierDeliveryEconomicPence, 500)
  value.cost.supplierDelivery.tax = { approved: false, basis: 'inclusive', vatBps: 2000, inputVatRecoverable: true }
  hold(calculatePriceFloor(value), 'UNAPPROVED')
})

test('quantity 5 incurs 2500p supplier delivery despite free customer shipping', () => {
  const result = evaluateBasket(basket([line('same-sku-five', 5)]))
  assert.equal(result.eligible, true)
  assert.equal(result.calculation.supplierDeliveryAmountPence, 2500)
  equalFraction(result.calculation.supplierDeliveryEconomicPence, 2500)
  assert.equal(result.calculation.customerShippingGrossPence, 0)
  assert.equal(result.calculation.fixedPaymentFeePence, 25)
  assert.equal(result.calculation.minimumCashPence, 1500)
  assert.equal(result.calculation.minimumCashBasis, 'derived_per_billable_item')
  assert.equal(result.calculation.billableQuantity, 5)
})

test('one SKU quantity2 and two SKU lines reconcile to identical basket economics', () => {
  const one = evaluateBasket(basket([line('one', 2)])), two = evaluateBasket(basket([line('a'), line('b')]))
  assert.equal(one.calculation.supplierDeliveryAmountPence, 1000)
  assert.deepEqual(one.calculation.contributionPence, two.calculation.contributionPence)
  const [n, d] = rationalAdd(two.calculation.lines.map(l => l.allocatedFixedPaymentFeePence))
  assert.equal(n, 25n * d)
})

test('mixed VAT and paid shipping include payment fees and reconcile allocations', () => {
  const value = basket([line('standard'), line('zero')]); value.lines[1].cost.outputVat.rateBps = 0
  value.customerShipping.grossPence = 499
  const result = evaluateBasket(value)
  assert.equal(result.eligible, true)
  assert.equal(result.calculation.grossReceiptsPence, 7499)
  equalFraction(result.calculation.netRevenuePence, 40995, 6)
  equalFraction(result.calculation.variablePaymentFeePence, 7499, 50)
  const [n, d] = rationalAdd([...result.calculation.lines.map(l => l.contributionPence), result.calculation.customerShippingContributionPence])
  const [cn, cd] = fraction(result.calculation.contributionPence)
  assert.equal(n * cd, cn * d)
  const [fn, fd] = rationalAdd([...result.calculation.lines.map(l => l.allocatedFixedPaymentFeePence), result.calculation.customerShippingAllocatedFixedFeePence])
  assert.equal(fn, 25n * fd)
})

test('shipping receipts cannot make an individually below-floor item eligible', () => {
  const value = basket([line('underpriced', 1, 2000), line('expensive', 1, 10000)])
  value.customerShipping.grossPence = 999
  const result = evaluateBasket(value)
  hold(result, 'BELOW_ITEM_FLOOR')
  assert.ok(result.calculation)
})

test('actual percentage discount rounds half-up, fixed allocations stack and remain capped', () => {
  const value = basket([line('discounted', 1, 2896)]); value.policy.maxDiscountBps = 1000
  value.lines[0].percentageDiscountBps = 1000
  let result = evaluateBasket(value)
  assert.equal(result.eligible, true)
  assert.equal(result.calculation.lines[0].discountPence, 290)
  value.lines[0].fixedDiscountPence = 1
  hold(evaluateBasket(value), 'EXCESS_DISCOUNT')
  value.lines[0].percentageDiscountBps = 500; value.lines[0].fixedDiscountPence = 100
  result = evaluateBasket(value)
  assert.equal(result.eligible, true); assert.equal(result.calculation.lines[0].discountPence, 245)
})

test('basket minimum and just-below prices capture margin/cash failures', () => {
  const result = evaluateBasket(basket([line('below', 1, 2603)]))
  hold(result, 'BELOW_ITEM_FLOOR'); hold(result, 'BELOW_MINIMUM_MARGIN')
  const low = evaluateBasket(basket([line('loss', 5, 1000)]))
  hold(low, 'BELOW_MINIMUM_CASH'); hold(low, 'BELOW_MINIMUM_MARGIN')
  assert.equal(evaluateBasket(basket([line('floor', 1, 2604)])).eligible, true)
})

test('customer delivery threshold is caller-supplied, never inferred or netted from supplier cost', () => {
  for (const price of [4999, 5000, 5001]) {
    const value = basket([line('threshold', 1, price)])
    value.customerShipping.grossPence = price < 5000 ? 499 : 0
    const result = evaluateBasket(value)
    assert.equal(result.calculation.supplierDeliveryAmountPence, 500)
    assert.equal(result.calculation.customerShippingGrossPence, value.customerShipping.grossPence)
  }
})

test('future order cash policy requires a separate fresh approval', () => {
  const value = basket([line('items', 5)])
  value.orderCashPolicy = { approval: { ...approved(), approved: false }, minimumPence: 300 }
  hold(evaluateBasket(value), 'UNAPPROVED')
  value.orderCashPolicy.approval.approved = true
  const result = evaluateBasket(value)
  assert.equal(result.calculation.minimumCashPence, 300)
  assert.equal(result.calculation.minimumCashBasis, 'approved_per_order')
})

for (const [label, mutate, code] of [
  ['missing wholesale', v => delete v.cost.wholesale, 'MISSING_INPUT'],
  ['missing explicit reserve', v => delete v.cost.returnsReservePence, 'MISSING_INPUT'],
  ['unapproved cost', v => v.cost.approval.approved = false, 'UNAPPROVED'],
  ['unapproved output tax', v => v.cost.outputVat.approved = false, 'UNAPPROVED'],
  ['missing tax basis', v => delete v.cost.supplierDelivery.tax.basis, 'INVALID_TAX'],
  ['unapproved unit/multipack definition', v => v.cost.unitDefinitionApproved = false, 'UNAPPROVED'],
  ['wrong unit', v => v.cost.unit = 'per_order', 'INVALID_UNIT'],
  ['wrong currency', v => v.cost.currency = 'USD', 'INVALID_UNIT'],
  ['stale cost version', v => v.cost.approval.expectedVersion = 'v2', 'STALE_VERSION'],
  ['expired cost', v => v.cost.approval.expiresAtMs = NOW, 'EXPIRED'],
  ['future cost', v => v.cost.approval.validFromMs = NOW + 1, 'NOT_YET_EFFECTIVE'],
  ['expired payment', v => v.payment.approval.expiresAtMs = NOW, 'EXPIRED'],
  ['unapproved policy', v => v.policy.approval.approved = false, 'UNAPPROVED'],
  ['zero wholesale', v => v.cost.wholesale.amountPence = 0, 'INVALID_INPUT'],
  ['negative wholesale', v => v.cost.wholesale.amountPence = -1, 'INVALID_INPUT'],
  ['fractional penny', v => v.cost.wholesale.amountPence = 1000.5, 'INVALID_INPUT'],
  ['unsafe number', v => v.cost.wholesale.amountPence = Number.MAX_SAFE_INTEGER + 1, 'INVALID_INPUT'],
  ['NaN', v => v.payment.variableBps = NaN, 'INVALID_INPUT'],
  ['Infinity', v => v.cost.wholesale.amountPence = Infinity, 'INVALID_INPUT'],
  ['oversized amount', v => v.cost.wholesale.amountPence = MAX_PENCE + 1, 'OVERFLOW'],
  ['calculated floor overflow', v => v.cost.wholesale.amountPence = MAX_PENCE - 550, 'OVERFLOW'],
  ['changed delivery fee', v => v.cost.supplierDelivery.amountPence = 499, 'DELIVERY_FEE_MISMATCH'],
  ['zero minimum cash', v => v.policy.minimumCashPerItemPence = 0, 'INVALID_INPUT'],
  ['zero margin', v => v.policy.minimumMarginBps = 0, 'INVALID_INPUT'],
  ['target below minimum', v => v.policy.targetMarginBps = 2000, 'INVALID_INPUT'],
  ['100% discount', v => v.policy.maxDiscountBps = 10000, 'OVERFLOW'],
  ['negative discount', v => v.policy.maxDiscountBps = -1, 'INVALID_INPUT'],
  ['impossible payment denominator', v => v.payment.variableBps = 9000, 'NON_POSITIVE_DENOMINATOR'],
  ['contradictory tax exemption', v => v.cost.wholesale.tax.vatBps = 2000, 'INVALID_TAX'],
  ['duplicate supplier-delivery component', v => v.cost.otherPerItemCosts = [{id:'supplier-delivery',cost:{amountPence:500,tax:tax()}}], 'INVALID_INPUT'],
]) {
  test(`HOLD: ${label}`, () => { const value = input(); mutate(value); hold(calculatePriceFloor(value), code) })
}

test('invalid basket quantities, discount exhaustion and overflow hold', () => {
  for (const quantity of [0, -1, 1.5]) hold(evaluateBasket(basket([line('bad', quantity)])), 'INVALID_INPUT')
  hold(evaluateBasket(basket([line('bad', 10001)])), 'OVERFLOW')
  hold(evaluateBasket(basket([line('bad', 2, MAX_PENCE)])), 'OVERFLOW')
  const value = basket(); value.lines[0].fixedDiscountPence = 3500
  hold(evaluateBasket(value), 'EXCESS_DISCOUNT')
  hold(evaluateBasket(basket([])), 'INVALID_INPUT')
  hold(evaluateBasket(basket([line('duplicate'),line('duplicate')])), 'INVALID_INPUT')
})

test('inputs remain unchanged and all results serialize without enabling writes', () => {
  const value = input(), copy = structuredClone(value)
  const one = calculatePriceFloor(value), two = calculatePriceFloor(value)
  assert.deepEqual(value, copy); assert.deepEqual(one, two)
  assert.equal(one.liveEnabled, false); assert.equal(one.checkoutVerified, false)
  assert.equal(PRICE_WRITES_ENABLED, false)
  assert.doesNotThrow(() => JSON.stringify(one))
  assert.doesNotThrow(() => JSON.stringify(evaluateBasket(basket())))
})


test('missing or expired customer shipping tax policy is held even with free shipping', () => {
  const value = basket()
  value.customerShipping.outputVat.approved = false
  hold(evaluateBasket(value), 'UNAPPROVED')
  value.customerShipping.outputVat.approved = true
  value.customerShipping.approval.expiresAtMs = NOW
  hold(evaluateBasket(value), 'EXPIRED')
})

test('approved additional unit costs and unrecoverable wholesale tax raise the floor', () => {
  const value = input(), baseline = calculatePriceFloor(value).calculation.minimumListPricePence
  value.cost.otherPerItemCosts = [{ id: 'packaging', cost: { amountPence: 100, tax: tax() } }]
  const withPackaging = calculatePriceFloor(value)
  equalFraction(withPackaging.calculation.nonVariableEconomicCostPence, 1675)
  assert.ok(withPackaging.calculation.minimumListPricePence > baseline)
  value.cost.wholesale.tax = { approved: true, basis: 'exclusive', vatBps: 2000, inputVatRecoverable: false }
  equalFraction(calculatePriceFloor(value).calculation.nonVariableEconomicCostPence, 1875)
})


test('regression: continuous floor can fail when the actual discount rounds upward', () => {
  const value = input(2) // 0.02% of 2604p rounds to a 1p discount.
  const oldFloor = basket([line('previous-floor', 1, 2604)])
  oldFloor.policy.maxDiscountBps = 2; oldFloor.lines[0].percentageDiscountBps = 2
  hold(evaluateBasket(oldFloor), 'BELOW_MINIMUM_MARGIN')
  const corrected = calculatePriceFloor(value)
  assert.equal(corrected.calculation.minimumListPricePence, 2605)
  assert.ok(referencePass(2605, 2)); assert.equal(referencePass(2604, 2), false)
  const cashCase = input(5); cashCase.cost.wholesale.amountPence = 1
  assert.equal(calculatePriceFloor(cashCase).calculation.minimumListPricePence, 1079)
  assert.ok(referencePass(1079, 5, 576n)); assert.equal(referencePass(1078, 5, 576n), false)
})

test('minimum and target floors survive their own rounded one-item checkout model', () => {
  for (const wholesale of [1, 999, 1000, 1001, 1500]) for (const discount of [0, 2, 5, 333, 500, 1000, 2500, 9999]) {
    const value = input(discount); value.cost.wholesale.amountPence = wholesale
    const floors = calculatePriceFloor(value)
    assert.equal(floors.eligible, true)
    for (const [key, margin] of [['minimumListPricePence',2500], ['targetListPricePence',3500]]) {
      const p = floors.calculation[key], C = BigInt(wholesale + 575)
      assert.ok(referencePass(p, discount, C, 300n, BigInt(margin)))
      assert.equal(referencePass(p - 1, discount, C, 300n, BigInt(margin)), false)
      const request = basket([line('rounding', 1, p)])
      request.lines[0].cost = value.cost; request.policy.maxDiscountBps = discount
      request.lines[0].percentageDiscountBps = discount
      const result = evaluateBasket(request)
      assert.equal(result.eligible, true, JSON.stringify({wholesale,discount,key,result}))
      if (key === 'targetListPricePence') assert.equal(result.calculation.targetMarginMet, true)
    }
  }
})


test('entirely and partially sparse baskets hold before aggregation, including shipping-only revenue', () => {
  for (const grossPence of [0, 3500]) {
    for (const lines of [Array(1), [, line('second')], [line('first'), ,]]) {
      const value = basket(lines); value.customerShipping.grossPence = grossPence
      const result = evaluateBasket(value)
      hold(result, 'INVALID_INPUT')
      assert.equal(result.calculation, undefined)
    }
  }
})
