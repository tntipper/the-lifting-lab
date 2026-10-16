import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateCommercialBurden } from '../lib/commerce/commercial-burden.ts'
import { MAX_PENCE, SUPPLIER_DELIVERY_TARIFF_VERSION, SUPPLIER_DELIVERY_TARIFF_VALUES, TLL_POLICY_VALUES } from '../lib/commerce/pricing-policy.ts'

const NOW = 1_800_000_000_000
const approval = (version = 'fixture-v1') => ({ version, expectedVersion: version, approved: true, validFromMs: NOW - 1000, expiresAtMs: NOW + 1000 })
const tax = () => ({ approved: true, basis: 'not_subject', vatBps: 0, inputVatRecoverable: false })
const cost = () => ({ approval: approval(), currency: 'GBP', unit: 'sellable_item', unitDefinitionApproved: true, wholesale: { amountPence: 1000, tax: tax() }, otherPerItemCosts: [], returnsReservePence: 50, outputVat: { approved: true, rateBps: 0 } })
const line = (id, price = 3500) => ({ id, supplierOrderId: 'order-a', customerDeliveryId: 'delivery-a', quantity: 1, listUnitPricePence: price, cost: cost(), percentageDiscountBps: 0, fixedDiscountPence: 0 })
function basket(lines = [line('variant-a')], shipping = 0) {
  return { nowMs: NOW, payment: { approval: approval(), fixedPence: 25, variableBps: 200 }, policy: { approval: approval(), ...TLL_POLICY_VALUES, maxDiscountBps: 0 },
    supplierDeliveryTariff: { approval: approval(SUPPLIER_DELIVERY_TARIFF_VERSION), ...SUPPLIER_DELIVERY_TARIFF_VALUES },
    supplierOrders: [{ id: 'order-a', customerDeliveryId: 'delivery-a', approval: approval(), service: 'tropship_standard_uk' }], lines,
    customerShipping: { approval: approval(), grossPence: shipping, outputVat: { approved: true, rateBps: 0 } } }
}
const allocation = (lineId, overrides = {}) => ({ lineId, affiliateCommissionPence: 0, campaignSpendPence: 0, sponsorshipPence: 0, platformCostPence: 0, ...overrides })
const fraction = value => [BigInt(value.numerator), BigInt(value.denominator)]
const equalFraction = (value, numerator, denominator = 1n) => {
  const [n, d] = fraction(value)
  assert.equal(n * BigInt(denominator), BigInt(numerator) * d)
}

test('subtracts all explicit burdens exactly while preserving disabled authority gates', () => {
  const result = evaluateCommercialBurden({ basket: basket([line('variant-a', 3501)]), allocations: [allocation('variant-a', { affiliateCommissionPence: 101, campaignSpendPence: 102, sponsorshipPence: 193, platformCostPence: 204 })] })
  assert.equal(result.eligible, false)
  assert.equal(result.liveEnabled, false)
  assert.equal(result.checkoutVerified, false)
  assert.equal(result.shopifyAllocationVerified, false)
  assert.equal(result.mathematicalStatus, 'PASS')
  assert.equal(result.calculation.lines[0].burdens.totalPence, 600)
  equalFraction(result.calculation.lines[0].contributionPence, 57_799, 50)
  assert.equal(result.calculation.lines[0].targetMarginMet, false)
  assert.equal(result.calculation.order.targetMarginMet, false)
})

test('a paid campaign on one line cannot be hidden by a profitable neighbour or customer shipping', () => {
  const result = evaluateCommercialBurden({
    basket: basket([line('loss-line'), line('profitable-neighbour', 7000)], 10_000),
    allocations: [allocation('loss-line', { campaignSpendPence: 1000 }), allocation('profitable-neighbour')],
  })
  const lossLine = result.calculation.lines.find(value => value.id === 'loss-line')
  assert.equal(result.mathematicalStatus, 'HOLD')
  assert.equal(lossLine.mathematicalStatus, 'HOLD')
  assert.equal(lossLine.minimumMarginMet, false)
  assert.equal(result.calculation.order.mathematicalStatus, 'PASS')
  assert.ok(result.holds.some(value => value.code === 'BELOW_LINE_MARGIN' && value.field === 'loss-line'))
})

test('missing, duplicate, extra and malformed allocations hold without guessing zeroes or throwing', () => {
  const value = basket([line('a'), line('b')])
  const missing = evaluateCommercialBurden({ basket: value, allocations: [allocation('a')] })
  assert.equal(missing.mathematicalStatus, 'HOLD')
  assert.ok(missing.holds.some(value => value.code === 'MISSING_ALLOCATION' && value.field === 'allocations.b'))

  const duplicate = evaluateCommercialBurden({ basket: value, allocations: [allocation('a'), allocation('a'), allocation('b'), allocation('unknown')] })
  assert.ok(duplicate.holds.some(value => value.code === 'DUPLICATE_ALLOCATION'))
  assert.ok(duplicate.holds.some(value => value.code === 'EXTRA_ALLOCATION'))

  assert.doesNotThrow(() => evaluateCommercialBurden({ basket: value, allocations: [{ lineId: 'a', affiliateCommissionPence: -1 }] }))
  const malformed = evaluateCommercialBurden({ basket: value, allocations: [{ lineId: 'a', affiliateCommissionPence: -1 }] })
  assert.ok(malformed.holds.some(value => value.code === 'INVALID_ALLOCATION'))
  assert.ok(malformed.holds.some(value => value.code === 'MISSING_ALLOCATION' && value.field === 'allocations.b'))
})

test('a held base basket does not produce shadow economics', () => {
  const value = basket()
  value.lines[0].listUnitPricePence = 1000
  const result = evaluateCommercialBurden({ basket: value, allocations: [allocation('variant-a')] })
  assert.equal(result.mathematicalStatus, 'HOLD')
  assert.equal(result.calculation, undefined)
  assert.ok(result.holds.some(value => value.code === 'BASE_BASKET_HELD'))
})

test('minimum-margin equality passes at a fractional contribution and one pence either side changes the result', () => {
  // With 25% payment fees, this 3354p line contributes 840.5p before burdens.
  // Its 25% floor is 838.5p, so 2p is the exact equality allocation.
  const value = basket([line('fractional', 3354)])
  value.payment.variableBps = 2500
  const evaluate = burden => evaluateCommercialBurden({ basket: value, allocations: [allocation('fractional', { campaignSpendPence: burden })] })
  const passing = evaluate(1), equality = evaluate(2), failing = evaluate(3)
  equalFraction(equality.calculation.lines[0].contributionPence, 1677, 2)
  assert.equal(passing.calculation.lines[0].minimumMarginMet, true)
  assert.equal(equality.calculation.lines[0].minimumMarginMet, true)
  assert.equal(failing.calculation.lines[0].minimumMarginMet, false)
  assert.ok(failing.holds.some(value => value.code === 'BELOW_LINE_MARGIN'))
})

test('a line can satisfy its margin percentage while failing only its independently approved cash floor', () => {
  const value = basket()
  value.policy.minimumCashPerItemPence = 1000
  const result = evaluateCommercialBurden({ basket: value, allocations: [allocation('variant-a', { sponsorshipPence: 800 })] })
  const assessed = result.calculation.lines[0]
  // 955p after burden exceeds 25% of 3500p (875p), but is below the 1000p cash floor.
  equalFraction(assessed.contributionPence, 955)
  assert.equal(assessed.minimumMarginMet, true)
  assert.equal(assessed.minimumCashMet, false)
  assert.equal(assessed.mathematicalStatus, 'HOLD')
  assert.ok(result.holds.some(value => value.code === 'BELOW_LINE_CASH' && value.field === 'variant-a'))
})

test('an approved order cash floor can fail after burdens even while every line passes', () => {
  const value = basket([line('a'), line('b')])
  value.orderCashPolicy = { approval: approval(), minimumPence: 4000 }
  const result = evaluateCommercialBurden({ basket: value, allocations: [allocation('a', { platformCostPence: 500 }), allocation('b', { platformCostPence: 500 })] })
  assert.equal(result.calculation.lines.every(line => line.mathematicalStatus === 'PASS'), true)
  assert.equal(result.calculation.order.minimumMarginMet, true)
  assert.equal(result.calculation.order.minimumCashMet, false)
  assert.ok(result.holds.some(value => value.code === 'BELOW_MINIMUM_CASH' && value.field === 'basket'))
})

test('aggregate commercial burden totals fail closed before arithmetic can exceed the pence bound', () => {
  const result = evaluateCommercialBurden({
    basket: basket([line('a'), line('b')]),
    allocations: [allocation('a', { affiliateCommissionPence: MAX_PENCE }), allocation('b', { affiliateCommissionPence: MAX_PENCE })],
  })
  assert.equal(result.calculation, undefined)
  assert.ok(result.holds.some(value => value.code === 'OVERFLOW' && value.field === 'allocations.totalPence'))
})

test('sparse allocations and malformed or absent basket JSON hold without escaping an exception', () => {
  const value = basket([line('a'), line('b')])
  const sparse = [allocation('a'), , allocation('b')]
  const sparseResult = evaluateCommercialBurden({ basket: value, allocations: sparse })
  assert.ok(sparseResult.holds.some(value => value.code === 'INVALID_ALLOCATION' && value.field === 'allocations[1]'))

  for (const input of [{ allocations: [] }, { basket: null, allocations: [] }, { basket: [], allocations: [] }]) {
    assert.doesNotThrow(() => evaluateCommercialBurden(input))
    assert.equal(evaluateCommercialBurden(input).mathematicalStatus, 'HOLD')
  }
})
