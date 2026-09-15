import test from 'node:test'
import assert from 'node:assert/strict'
import { calculatePriceFloor, evaluateBasket, SUPPLIER_DELIVERY_TARIFF_VERSION, SUPPLIER_DELIVERY_TARIFF_VALUES, PRICE_WRITES_ENABLED, TLL_POLICY_VALUES, MAX_PENCE } from '../lib/commerce/pricing-policy.ts'

const NOW = 1800000000000
function approved(version = 'fixture-v1') { return { version, expectedVersion: version, approved: true, validFromMs: NOW - 1000, expiresAtMs: NOW + 1000 } }
function tariff() { return { approval: approved(SUPPLIER_DELIVERY_TARIFF_VERSION), ...SUPPLIER_DELIVERY_TARIFF_VALUES } }
function group(id='order-a') { return { id, customerDeliveryId: 'delivery-a', approval: approved(), service: 'tropship_standard_uk' } }
function tax() { return { approved: true, basis: 'not_subject', vatBps: 0, inputVatRecoverable: false } }
function quote() {
  return { approval: approved(), currency: 'GBP', unit: 'sellable_item', unitDefinitionApproved: true,
    wholesale: { amountPence: 1000, tax: tax() },
    otherPerItemCosts: [], returnsReservePence: 50, outputVat: { approved: true, rateBps: 0 } }
}
function input(discount = 0) {
  return { nowMs: NOW, supplierDeliveryTariff: tariff(), cost: quote(), payment: { approval: approved(), fixedPence: 25, variableBps: 200 },
    policy: { approval: approved(), ...TLL_POLICY_VALUES, maxDiscountBps: discount } }
}
function line(id = 'variant-a', quantity = 1, price = 3500) {
  return { id, supplierOrderId: 'order-a', customerDeliveryId: 'delivery-a', quantity, listUnitPricePence: price, cost: quote(), percentageDiscountBps: 0, fixedDiscountPence: 0 }
}
function basket(lines = [line()]) {
  const ctx = input()
  return { nowMs: ctx.nowMs, payment: ctx.payment, policy: ctx.policy, supplierDeliveryTariff: ctx.supplierDeliveryTariff, supplierOrders: [group()], lines, customerShipping: { approval: approved(), grossPence: 0, outputVat: { approved: true, rateBps: 0 } } }
}
function fraction(value) { return [BigInt(value.numerator), BigInt(value.denominator)] }
function equalFraction(value, n, d = 1) { const [a, b] = fraction(value); assert.equal(a * BigInt(d), BigInt(n) * b) }
function rationalAdd(values) {
  return values.map(fraction).reduce(([n, d], [a, b]) => [n * b + a * d, d * b], [0n, 1n])
}
function hold(result, code) { assert.equal(result.eligible, false); assert.ok(result.holds.some(h => h.code === code), JSON.stringify(result)); assert.equal(result.liveEnabled, false) }

// Independent integer cross-multiplication oracle, using the declared economic fixture.
function referencePass(price, discount, C = 1675n, cash = 300n, margin = 2500n, vat = 0n, fee = 200n) {
  const discountPence = (2n * BigInt(price) * BigInt(discount) + 10000n) / 20000n
  const grossN = BigInt(price) - discountPence, grossD = 1n
  const netN = grossN * 10000n, netD = grossD * (10000n + vat)
  const contribN = netN * grossD * 10000n - C * netD * grossD * 10000n - grossN * fee * netD
  const contribD = netD * grossD * 10000n
  return contribN >= cash * contribD && contribN * 10000n * netD >= margin * netN * contribD
}

test('reference 2295p and 2550p floors use exact arithmetic and both rules', () => {
  for (const [discount, expected] of [[0, 2295], [1000, 2550]]) {
    const result = calculatePriceFloor(input(discount))
    assert.equal(result.eligible, true)
    assert.equal(result.calculation.minimumListPricePence, expected)
    assert.equal(referencePass(expected, discount), true)
    assert.equal(referencePass(expected - 1, discount), false)
    equalFraction(result.calculation.nonVariableEconomicCostPence, 1675)
  }
  equalFraction(calculatePriceFloor(input()).calculation.netRevenuePenceAtMinimum, 2295)
  equalFraction(calculatePriceFloor(input()).calculation.contributionPenceAtMinimum, 5741, 10)
})

test('minimum is lowest passing penny across approved discount and cash policies', () => {
  for (const discount of [0, 1, 333, 1000, 2500]) for (const vat of [0]) for (const cash of [300, 2000]) {
    const value = input(discount); value.cost.outputVat.rateBps = vat; value.policy.minimumCashPerItemPence = cash
    const result = calculatePriceFloor(value)
    assert.equal(result.eligible, true)
    const price = result.calculation.minimumListPricePence
    assert.ok(referencePass(price, discount, 1675n, BigInt(cash), 2500n, BigInt(vat)))
    assert.equal(referencePass(price - 1, discount, 1675n, BigInt(cash), 2500n, BigInt(vat)), false)
  }
})

test('cash floor can dominate and target margin stays separate from minimum', () => {
  const value = input(); value.policy.minimumCashPerItemPence = 2000
  const result = calculatePriceFloor(value)
  assert.equal(result.calculation.limitingMinimumRule, 'cash')
  assert.ok(result.calculation.targetListPricePence >= result.calculation.minimumListPricePence)
  const normal = calculatePriceFloor(input()).calculation
  assert.equal(normal.targetListPricePence, 2659)
  assert.ok(referencePass(2659, 0, 1675n, 300n, 3500n))
  assert.equal(referencePass(2658, 0, 1675n, 300n, 3500n), false)
})

test('owner-confirmed tariff quotes £5 ex VAT and costs £6 unrecoverable gross', () => {
  const value = input(), result = calculatePriceFloor(value)
  assert.equal(result.eligible, true)
  assert.equal(result.calculation.supplierDeliveryQuotedExVatPence, 500)
  assert.equal(result.calculation.supplierDeliveryGrossCashPence, 600)
  equalFraction(result.calculation.supplierDeliveryEconomicPence, 600)
  value.supplierDeliveryTariff.inputVatRecoverable = true
  hold(calculatePriceFloor(value), 'DELIVERY_FEE_MISMATCH')
})

test('quantity 5 incurs one 600p supplier-order delivery despite free customer shipping', () => {
  const result = evaluateBasket(basket([line('same-sku-five', 5)]))
  assert.equal(result.eligible, true)
  assert.equal(result.calculation.supplierDeliveryGrossCashPence, 600)
  equalFraction(result.calculation.supplierDeliveryEconomicPence, 600)
  assert.equal(result.calculation.customerShippingGrossPence, 0)
  assert.equal(result.calculation.fixedPaymentFeePence, 25)
  assert.equal(result.calculation.minimumCashPence, 1500)
  assert.equal(result.calculation.minimumCashBasis, 'derived_per_billable_item')
  assert.equal(result.calculation.billableQuantity, 5)
})

test('one SKU quantity2 and two SKU lines reconcile to identical basket economics', () => {
  const one = evaluateBasket(basket([line('one', 2)])), two = evaluateBasket(basket([line('a'), line('b')]))
  assert.equal(one.calculation.supplierDeliveryGrossCashPence, 600)
  assert.deepEqual(one.calculation.contributionPence, two.calculation.contributionPence)
  const [n, d] = rationalAdd(two.calculation.lines.map(l => l.allocatedFixedPaymentFeePence))
  assert.equal(n, 25n * d)
})

test('mixed approved wholesale VAT and paid shipping include payment fees and reconcile allocations', () => {
  const value = basket([line('standard'), line('zero')]); value.lines[1].cost.wholesale.tax = { approved: true, basis: 'exclusive', vatBps: 2000, inputVatRecoverable: false }
  value.customerShipping.grossPence = 499
  const result = evaluateBasket(value)
  assert.equal(result.eligible, true)
  assert.equal(result.calculation.grossReceiptsPence, 7499)
  equalFraction(result.calculation.netRevenuePence, 7499)
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
  const result = evaluateBasket(basket([line('below', 1, 2294)]))
  hold(result, 'BELOW_ITEM_FLOOR'); hold(result, 'BELOW_MINIMUM_MARGIN')
  const low = evaluateBasket(basket([line('loss', 5, 1000)]))
  hold(low, 'BELOW_MINIMUM_CASH'); hold(low, 'BELOW_MINIMUM_MARGIN')
  assert.equal(evaluateBasket(basket([line('floor', 1, 2295)])).eligible, true)
})

test('customer delivery threshold is caller-supplied, never inferred or netted from supplier cost', () => {
  for (const price of [4999, 5000, 5001]) {
    const value = basket([line('threshold', 1, price)])
    value.customerShipping.grossPence = price < 5000 ? 499 : 0
    const result = evaluateBasket(value)
    assert.equal(result.calculation.supplierDeliveryGrossCashPence, 600)
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
  ['missing tax basis', v => delete v.cost.wholesale.tax.basis, 'INVALID_TAX'],
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
  ['changed delivery fee', v => v.supplierDeliveryTariff.quotedExVatPence = 499, 'DELIVERY_FEE_MISMATCH'],
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
  equalFraction(withPackaging.calculation.nonVariableEconomicCostPence, 1775)
  assert.ok(withPackaging.calculation.minimumListPricePence > baseline)
  value.cost.wholesale.tax = { approved: true, basis: 'exclusive', vatBps: 2000, inputVatRecoverable: false }
  equalFraction(calculatePriceFloor(value).calculation.nonVariableEconomicCostPence, 1975)
})


test('regression: continuous floor can fail when the actual discount rounds upward', () => {
  const value = input(3) // 0.03% of 2295p rounds to a 1p discount.
  const oldFloor = basket([line('previous-floor', 1, 2295)])
  oldFloor.policy.maxDiscountBps = 3; oldFloor.lines[0].percentageDiscountBps = 3
  hold(evaluateBasket(oldFloor), 'BELOW_MINIMUM_MARGIN')
  const corrected = calculatePriceFloor(value)
  assert.equal(corrected.calculation.minimumListPricePence, 2296)
  assert.ok(referencePass(2296, 3)); assert.equal(referencePass(2295, 3), false)
  const cashCase = input(5); cashCase.cost.wholesale.amountPence = 1
  assert.equal(calculatePriceFloor(cashCase).calculation.minimumListPricePence, 996)
  assert.ok(referencePass(996, 5, 676n)); assert.equal(referencePass(995, 5, 676n), false)
})

test('minimum and target floors survive their own rounded one-item checkout model', () => {
  for (const wholesale of [1, 999, 1000, 1001, 1500]) for (const discount of [0, 2, 5, 333, 500, 1000, 2500, 9999]) {
    const value = input(discount); value.cost.wholesale.amountPence = wholesale
    const floors = calculatePriceFloor(value)
    assert.equal(floors.eligible, true)
    for (const [key, margin] of [['minimumListPricePence',2500], ['targetListPricePence',3500]]) {
      const p = floors.calculation[key], C = BigInt(wholesale + 675)
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

test('floor lifetime is the intersection of cost, policy and payment approvals', () => {
  for (const latest of ['cost', 'policy', 'payment', 'supplierDeliveryTariff']) {
    const value = input()
    for (const name of ['cost', 'policy', 'payment', 'supplierDeliveryTariff']) {
      value[name].approval.validFromMs = NOW - 1000
      value[name].approval.expiresAtMs = NOW + 1000
    }
    value[latest].approval.validFromMs = NOW - 1
    value[latest].approval.expiresAtMs = NOW + 1
    const result = calculatePriceFloor(value)
    assert.equal(result.eligible, true)
    assert.deepEqual(result.calculation.dependencyValidity, { validFromMs: NOW - 1, expiresAtMs: NOW + 1 })
    value.nowMs = NOW + 1
    hold(calculatePriceFloor(value), 'EXPIRED')
  }
})

test('quantity-level discount rounding cannot hide a below-margin line behind profitable items or shipping', () => {
  const ctx = input(2000); ctx.payment.fixedPence = 0; ctx.cost.wholesale.amountPence = 236
  const floor = calculatePriceFloor(ctx).calculation.minimumListPricePence
  assert.equal(floor, 1517)
  for (const cover of ['item', 'shipping']) {
    const bulk = line('bulk', 100, floor); bulk.cost = ctx.cost; bulk.percentageDiscountBps = 2000
    const value = basket(cover === 'item' ? [bulk, line('profitable', 1, 100000)] : [bulk])
    value.payment = ctx.payment; value.policy = ctx.policy
    if (cover === 'shipping') value.customerShipping.grossPence = 100000
    const result = evaluateBasket(value)
    hold(result, 'BELOW_LINE_MARGIN')
    assert.ok(result.holds.some(h => h.code === 'BELOW_LINE_MARGIN' && h.field === 'bulk'))
    assert.equal(result.holds.some(h => h.code === 'BELOW_ITEM_FLOOR' || h.code === 'BELOW_MINIMUM_MARGIN'), false)
    const observed = result.calculation.lines[0]
    assert.notDeepEqual(observed.conservativeLineContributionPence, observed.contributionPence) // basket delivery is free; standalone publication guard is separate
    const [cn, cd] = fraction(observed.conservativeLineContributionPence), [rn, rd] = fraction(observed.netRevenuePence)
    assert.ok(cn * rd * 10000n < rn * cd * 2500n)
    bulk.listUnitPricePence = floor + 1
    assert.equal(evaluateBasket(value).eligible, true)
  }
})

test('a profitable neighbour and lower order minimum cannot conceal a line below the £3-per-item cash floor', () => {
  const ctx = input(2000); ctx.payment.fixedPence = 0
  ctx.cost.wholesale.amountPence = 15; ctx.cost.returnsReservePence = 0
  const floor = calculatePriceFloor(ctx).calculation.minimumListPricePence
  assert.equal(floor, 1167)
  const bulk = line('bulk-cash', 100, floor); bulk.cost = ctx.cost; bulk.percentageDiscountBps = 2000
  const value = basket([bulk, line('profitable', 1, 100000)])
  value.payment = ctx.payment; value.policy = ctx.policy
  value.orderCashPolicy = { approval: approved(), minimumPence: 300 }
  const result = evaluateBasket(value)
  hold(result, 'BELOW_LINE_CASH')
  assert.ok(result.holds.some(h => h.code === 'BELOW_LINE_CASH' && h.field === 'bulk-cash'))
  assert.equal(result.holds.some(h => h.code === 'BELOW_ITEM_FLOOR' || h.code === 'BELOW_MINIMUM_CASH'), false)
  assert.equal(result.calculation.lines[0].minimumLineCashPence, 30000)
  const [cn, cd] = fraction(result.calculation.lines[0].conservativeLineContributionPence)
  assert.ok(cn < 30000n * cd)
  bulk.listUnitPricePence = floor + 1
  assert.equal(evaluateBasket(value).eligible, true)
})

for (const [wholesale, state, charged, eligible] of [[9999,'charged',600,true],[10000,'boundary_hold',600,false],[10001,'free',0,true]]) {
  test(`standalone order threshold ${wholesale}p ex VAT is ${state}`, () => {
    const value=input(); value.cost.wholesale={amountPence:wholesale,tax:{approved:true,basis:'exclusive',vatBps:2000,inputVatRecoverable:false}}
    const result=calculatePriceFloor(value)
    assert.equal(result.eligible,eligible)
    assert.equal(result.calculation.supplierDeliveryBasis,'one_item_supplier_order')
    assert.equal(result.calculation.supplierDeliveryStatus,state)
    assert.equal(result.calculation.supplierDeliveryGrossCashPence,charged)
    assert.equal(result.calculation.supplierDeliveryQuotedExVatPence,charged?500:0)
    equalFraction(result.calculation.supplierDeliveryEconomicPence,charged)
    equalFraction(result.calculation.wholesaleExVatPence,wholesale)
    if(!eligible) hold(result,'DELIVERY_THRESHOLD_BOUNDARY')
  })
}
for (const [gross,state] of [[11999,'charged'],[12000,'boundary_hold'],[12001,'free']]) test(`inclusive wholesale ${gross}p uses exact ex-VAT threshold`,()=>{
  const value=input(); value.cost.wholesale={amountPence:gross,tax:{approved:true,basis:'inclusive',vatBps:2000,inputVatRecoverable:false}}
  const result=calculatePriceFloor(value)
  assert.equal(result.calculation.supplierDeliveryStatus,state)
  equalFraction(result.calculation.wholesaleExVatPence,BigInt(gross)*5n,6)
  equalFraction(result.calculation.nonVariableEconomicCostPence,gross+75+(state==='free'?0:600))
})
test('exclusive and inclusive approved wholesale agree on economic cost and threshold',()=>{
  const exclusive=input(),inclusive=input()
  exclusive.cost.wholesale={amountPence:5000,tax:{approved:true,basis:'exclusive',vatBps:2000,inputVatRecoverable:false}}
  inclusive.cost.wholesale={amountPence:6000,tax:{approved:true,basis:'inclusive',vatBps:2000,inputVatRecoverable:false}}
  const a=calculatePriceFloor(exclusive).calculation,b=calculatePriceFloor(inclusive).calculation
  assert.deepEqual(a,b)
})
test('unknown product tax does not become a threshold exemption or cost estimate',()=>{
  for(const mutate of [v=>v.cost.wholesale.tax.approved=false,v=>v.cost.wholesale.tax.basis='unknown',v=>delete v.cost.wholesale.tax.vatBps,v=>v.cost.wholesale.tax.inputVatRecoverable=true,v=>v.cost.outputVat.rateBps=2000]) {
    const value=input(); value.cost.wholesale.amountPence=10001; mutate(value)
    const result=calculatePriceFloor(value); assert.equal(result.eligible,false); assert.equal(result.calculation,undefined)
  }
})
test('superseded per-item delivery inputs are explicitly rejected',()=>{
  const value=input(); value.cost.supplierDelivery={amountPence:500,tax:tax()}
  hold(calculatePriceFloor(value),'DELIVERY_FEE_MISMATCH')
})
test('wholesale sums include repeated quantities with one charge per supplier order',()=>{
  for(const [quantity,status,charge] of [[5,'charged',600],[10,'boundary_hold',600],[11,'free',0]]) {
    const result=evaluateBasket(basket([line('repeat',quantity)]))
    assert.equal(result.calculation.supplierOrders[0].deliveryStatus,status)
    assert.equal(result.calculation.supplierDeliveryGrossCashPence,charge)
    equalFraction(result.calculation.supplierOrders[0].wholesaleExVatPence,quantity*1000)
    if(status==='boundary_hold') hold(result,'DELIVERY_THRESHOLD_BOUNDARY'); else assert.equal(result.eligible,true)
    assert.equal(result.calculation.lines[0].supplierDeliveryGrossCashPence,charge)
  }
})
test('multiple line wholesale totals qualify within the approved supplier order only',()=>{
  const a=line('a',1,15000),b=line('b',1,15000)
  a.cost.wholesale.amountPence=5000; b.cost.wholesale.amountPence=5001
  const together=basket([a,b]),free=evaluateBasket(together)
  assert.equal(free.eligible,true); assert.equal(free.calculation.supplierDeliveryGrossCashPence,0)
  equalFraction(free.calculation.supplierOrders[0].wholesaleExVatPence,10001)
  const split=structuredClone(together); split.supplierOrders.push({...group('order-b'),customerDeliveryId:'delivery-b'})
  split.lines[1].supplierOrderId='order-b'; split.lines[1].customerDeliveryId='delivery-b'
  const charged=evaluateBasket(split)
  assert.equal(charged.eligible,true); assert.equal(charged.calculation.supplierDeliveryGrossCashPence,1200)
  assert.deepEqual(charged.calculation.supplierOrders.map(g=>g.grossCashPence),[600,600])
  assert.deepEqual(charged.calculation.supplierOrders.map(g=>g.customerDeliveryId),['delivery-a','delivery-b'])
})
test('separate supplier orders to the same customer delivery still do not pool thresholds',()=>{
  const value=basket([line('a',6),line('b',6)])
  value.supplierOrders.push(group('order-b')); value.lines[1].supplierOrderId='order-b'
  const result=evaluateBasket(value)
  assert.equal(result.eligible,true); assert.equal(result.calculation.supplierDeliveryGrossCashPence,1200)
})
test('retail totals, customer shipping and discounts cannot set the supplier free-delivery threshold',()=>{
  const value=basket([line('a',1,50000)])
  value.customerShipping.grossPence=10000; value.policy.maxDiscountBps=1000; value.lines[0].percentageDiscountBps=1000
  const result=evaluateBasket(value)
  assert.equal(result.eligible,true); assert.equal(result.calculation.supplierDeliveryGrossCashPence,600)
  equalFraction(result.calculation.supplierOrders[0].wholesaleExVatPence,1000)
  value.lines[0].cost.wholesale.amountPence=10001
  assert.equal(evaluateBasket(value).calculation.supplierDeliveryGrossCashPence,0)
})
test('actual boundary order preserves calculations and £6 estimate without authorizing it',()=>{
  const value=basket([line('a',5),line('b',5)])
  const result=evaluateBasket(value); hold(result,'DELIVERY_THRESHOLD_BOUNDARY')
  assert.equal(result.calculation.supplierOrders[0].deliveryStatus,'boundary_hold')
  assert.equal(result.calculation.supplierDeliveryQuotedExVatPence,500)
  assert.equal(result.calculation.supplierDeliveryGrossCashPence,600)
  assert.equal(result.liveEnabled,false); assert.equal(result.checkoutVerified,false)
})
test('delivery penny allocation and rational net/economic totals reconcile under reordering',()=>{
  const value=basket('abcdefg'.split('').map(id=>line(id)))
  const result=evaluateBasket(value), reverse=evaluateBasket({...value,lines:[...value.lines].reverse()})
  assert.equal(result.eligible,true)
  assert.equal(result.calculation.lines.reduce((sum,l)=>sum+l.supplierDeliveryGrossCashPence,0),600)
  const byId=rows=>Object.fromEntries(rows.map(l=>[l.id,l.supplierDeliveryGrossCashPence]).sort())
  assert.deepEqual(byId(result.calculation.lines),{a:86,b:86,c:86,d:86,e:86,f:85,g:85})
  assert.deepEqual(byId(reverse.calculation.lines),byId(result.calculation.lines))
  for(const [key,expected] of [['supplierDeliveryAllocatedQuotedExVatPence',500],['supplierDeliveryEconomicPence',600]]) {
    const [n,d]=rationalAdd(result.calculation.lines.map(l=>l[key])); assert.equal(n,BigInt(expected)*d)
  }
  const [n,d]=rationalAdd([...result.calculation.lines.map(l=>l.contributionPence),result.calculation.customerShippingContributionPence])
  const [bn,bd]=fraction(result.calculation.contributionPence); assert.equal(n*bd,bn*d)
})
for(const [label,mutate,code] of [
  ['missing tariff',v=>delete v.supplierDeliveryTariff,'MISSING_INPUT'],
  ['old tariff version',v=>v.supplierDeliveryTariff.approval.version=v.supplierDeliveryTariff.approval.expectedVersion='old-per-item','STALE_VERSION'],
  ['mismatched tariff version',v=>v.supplierDeliveryTariff.approval.expectedVersion='next','STALE_VERSION'],
  ['expired tariff',v=>v.supplierDeliveryTariff.approval.expiresAtMs=NOW,'EXPIRED'],
  ['unapproved tariff',v=>v.supplierDeliveryTariff.approval.approved=false,'UNAPPROVED'],
  ['unapproved group',v=>v.supplierOrders[0].approval.approved=false,'UNAPPROVED'],
  ['expired group',v=>v.supplierOrders[0].approval.expiresAtMs=NOW,'EXPIRED'],
  ['stale group',v=>v.supplierOrders[0].approval.expectedVersion='different','STALE_VERSION'],
  ['missing groups',v=>delete v.supplierOrders,'INVALID_DELIVERY_GROUP'],
  ['duplicate group',v=>v.supplierOrders.push(group()),'INVALID_DELIVERY_GROUP'],
  ['empty declared group',v=>v.supplierOrders.push(group('unused')),'INVALID_DELIVERY_GROUP'],
  ['missing line group',v=>delete v.lines[0].supplierOrderId,'INVALID_DELIVERY_GROUP'],
  ['different customer delivery',v=>v.lines[0].customerDeliveryId='another-customer-delivery','INVALID_DELIVERY_GROUP'],
  ['missing delivery identity',v=>delete v.supplierOrders[0].customerDeliveryId,'INVALID_DELIVERY_GROUP'],
  ['unsupported delivery service',v=>v.supplierOrders[0].service='saturday','INVALID_DELIVERY_GROUP'],
  ['sparse groups',v=>v.supplierOrders=[,group()],'INVALID_DELIVERY_GROUP'],
]) test(`order tariff/group HOLD: ${label}`,()=>{const value=basket();mutate(value);hold(evaluateBasket(value),code)})
test('basket provenance intersects tariff, group and all cost/fee/shipping approvals',()=>{
  const value=basket([line('a'),line('b')]); value.supplierOrders[0].approval.validFromMs=NOW-1; value.supplierOrders[0].approval.expiresAtMs=NOW+1
  const result=evaluateBasket(value)
  assert.deepEqual(result.calculation.dependencyValidity,{validFromMs:NOW-1,expiresAtMs:NOW+1})
  assert.equal(result.calculation.approvalVersions.supplierDeliveryTariff,SUPPLIER_DELIVERY_TARIFF_VERSION)
  assert.deepEqual(result.calculation.approvalVersions.supplierOrders,[{id:'order-a',version:'fixture-v1'}])
  value.nowMs=NOW+1;hold(evaluateBasket(value),'EXPIRED')
})
test('free delivery on a large basket cannot reduce a standalone publication floor',()=>{
  const alone=calculatePriceFloor(input()).calculation.minimumListPricePence
  const result=evaluateBasket(basket([line('a',11,alone-1)]))
  assert.equal(result.calculation.supplierDeliveryGrossCashPence,0)
  hold(result,'BELOW_ITEM_FLOOR')
  assert.equal(result.calculation.lines[0].conservativeItemListFloorPence,alone)
})

test('exclusive wholesale VAT retains fractional economic pence without rounding the threshold',()=>{
  const value=input();value.cost.wholesale={amountPence:9999,tax:{approved:true,basis:'exclusive',vatBps:2000,inputVatRecoverable:false}}
  const result=calculatePriceFloor(value);assert.equal(result.eligible,true)
  equalFraction(result.calculation.wholesaleExVatPence,9999)
  equalFraction(result.calculation.nonVariableEconomicCostPence,63369,5)
  assert.equal(result.calculation.supplierDeliveryStatus,'charged')
})
