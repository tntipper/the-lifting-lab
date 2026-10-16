import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateCompetitorPriceCheck } from '../lib/commerce/competitor-price-check.ts'

const NOW = 1_800_000_000_000
const variant = (id = 'creatine-500g', overrides = {}) => ({ id, currency: 'GBP', packIdentityVersion: 'creatine-500g-v1', own: { itemPricePence: 2500, customerShippingPence: 399, shippingScenarioId: 'uk-standard' }, floor: { itemPricePence: 1900, sourceVersion: 'floor-v1', dependencyVersion: 'cost-v1' }, ...overrides })
const offer = (id = 'offer-1', overrides = {}) => ({ id, retailerId: 'retailer-a', currency: 'GBP', observedAtMs: NOW - 1000, availability: 'in_stock', itemPricePence: 2400, customerShippingPence: 399, shippingScenarioId: 'uk-standard', match: { variantId: 'creatine-500g', packIdentityVersion: 'creatine-500g-v1', reviewed: true, exactVariantAndPack: true, evidenceId: 'review-1', reviewedAtMs: NOW - 1000, expiresAtMs: NOW + 1000 }, ...overrides })
const input = (overrides = {}) => ({ snapshot: { id: 'snapshot-1', observedAtMs: NOW - 1000 }, evaluatedAtMs: NOW, freshness: { maxObservationAgeMs: 86_400_000 }, shippingScenario: { id: 'uk-standard' }, variants: [variant()], offers: [offer()], ...overrides })

test('uses reviewed exact sellable-unit evidence and delivered prices only, with disabled authority', () => {
  const result = evaluateCompetitorPriceCheck(input())
  const compared = result.variants[0]
  assert.equal(result.writesEnabled, false); assert.equal(result.automationEnabled, false); assert.equal(result.priceChangeAuthorized, false)
  assert.equal(compared.lowestComparableOffer.deliveredPence, 2799)
  assert.equal(compared.ownDeliveredPence, 2899)
  assert.equal(compared.deliveredGapPence, 100)
  assert.equal(compared.position, 'COMPETITOR_CHEAPER')
  assert.equal(compared.floorCanMeetLowestComparable, true)
  assert.deepEqual(compared.comparableOffers.map(value => value.id), ['offer-1'])
  assert.equal('recommendedRetailPricePence' in compared, false)
})

test('retains each valid comparable offer and projects the lowest without discarding evidence', () => {
  const result = evaluateCompetitorPriceCheck(input({ offers: [offer('higher', { itemPricePence: 2600 }), offer('lower', { itemPricePence: 2300 })] }))
  assert.deepEqual(result.variants[0].comparableOffers.map(value => value.id), ['higher', 'lower'])
  assert.equal(result.variants[0].lowestComparableOffer.id, 'lower')
})

test('reports parity, own-cheaper outcomes, delivery differences, and a floor constraint', () => {
  const parity = evaluateCompetitorPriceCheck(input({ offers: [offer('parity', { itemPricePence: 2500 })] })).variants[0]
  assert.equal(parity.position, 'PARITY')
  const ownCheaper = evaluateCompetitorPriceCheck(input({ offers: [offer('more', { itemPricePence: 2700 })] })).variants[0]
  assert.equal(ownCheaper.position, 'OWN_CHEAPER')
  const delivery = evaluateCompetitorPriceCheck(input({ offers: [offer('delivery', { itemPricePence: 2300, customerShippingPence: 700 })] })).variants[0]
  assert.equal(delivery.lowestComparableOffer.deliveredPence, 3000)
  assert.equal(delivery.position, 'OWN_CHEAPER')
  const constrained = evaluateCompetitorPriceCheck(input({ variants: [variant('creatine-500g', { floor: { itemPricePence: 2600, sourceVersion: 'floor-v1', dependencyVersion: 'cost-v1' } })] })).variants[0]
  assert.equal(constrained.floorCanMeetLowestComparable, false)
})

test('held observations do not suppress a separate valid offer, while duplicate identity does', () => {
  const offers = [
    offer('duplicate', { itemPricePence: 1 }), offer('duplicate', { itemPricePence: 2 }),
    offer('stale', { observedAtMs: NOW - 86_400_001 }), offer('future', { observedAtMs: NOW + 1 }),
    offer('pack', { match: { variantId: 'creatine-500g', reviewed: true, exactVariantAndPack: false, evidenceId: 'x' } }),
    offer('unapproved', { match: { variantId: 'creatine-500g', reviewed: false, exactVariantAndPack: true, evidenceId: '' } }),
    offer('sold', { availability: 'sold_out' }), offer('unknown', { availability: 'unknown' }),
    offer('shipping', { shippingScenarioId: 'uk-express' }), offer('unmatched', { match: { variantId: 'other', reviewed: true, exactVariantAndPack: true, evidenceId: 'x' } }),
  ]
  const withDuplicate = evaluateCompetitorPriceCheck(input({ offers }))
  assert.equal(withDuplicate.heldOffers.length, offers.length)
  assert.equal(withDuplicate.variants[0].position, 'HOLD')
  const validAlongsideHeld = evaluateCompetitorPriceCheck(input({ offers: [offer('valid'), offer('sold', { availability: 'sold_out' }), offer('unknown', { availability: 'unknown' }), offer('stale', { observedAtMs: NOW - 86_400_000 })] }))
  assert.equal(validAlongsideHeld.heldOffers.length, 3)
  assert.equal(validAlongsideHeld.variants[0].position, 'COMPETITOR_CHEAPER')
  assert.equal(validAlongsideHeld.variants[0].lowestComparableOffer.id, 'valid')
  const result = withDuplicate
  assert.equal(result.variants[0].position, 'HOLD')
  assert.ok(result.heldOffers.some(value => value.holds.some(item => item.code === 'DUPLICATE_OFFER_ID')))
  assert.ok(result.heldOffers.some(value => value.holds.some(item => item.code === 'UNMATCHED_OFFER')))
})

test('requires matching reviewed pack identity and review validity, and holds snapshots at the freshness boundary', () => {
  const mismatch = evaluateCompetitorPriceCheck(input({ offers: [offer('pack', { match: { ...offer().match, packIdentityVersion: 'other-pack' } })] }))
  assert.ok(mismatch.heldOffers[0].holds.some(value => value.code === 'PACK_IDENTITY_MISMATCH'))
  for (const [label, match, code] of [
    ['expired', { ...offer().match, expiresAtMs: NOW }, 'EXPIRED_REVIEW'],
    ['future', { ...offer().match, reviewedAtMs: NOW + 1, expiresAtMs: NOW + 2 }, 'FUTURE_REVIEW'],
  ]) {
    const result = evaluateCompetitorPriceCheck(input({ offers: [offer(label, { match })] }))
    assert.ok(result.heldOffers[0].holds.some(value => value.code === code))
  }
  const boundary = evaluateCompetitorPriceCheck(input({ snapshot: { id: 'old', observedAtMs: NOW - 86_400_000 } }))
  assert.ok(boundary.holds.some(value => value.code === 'STALE_SNAPSHOT'))
  assert.equal(boundary.variants[0].position, 'HOLD')
})

test('accounts for sparse slots and malformed shared metadata without throwing away enumerable rows', () => {
  const variants = [variant(), , null]
  const offers = [offer('valid'), , null]
  const result = evaluateCompetitorPriceCheck({ variants, offers, snapshot: null, freshness: null, shippingScenario: null, evaluatedAtMs: NOW })
  assert.equal(result.variants.length, 3)
  assert.deepEqual(result.variants.map(value => value.inputIndex), [0, 1, 2])
  assert.equal(result.heldOffers.length, 3)
  assert.deepEqual(result.heldOffers.map(value => value.inputIndex), [0, 1, 2])
  assert.doesNotThrow(() => evaluateCompetitorPriceCheck({ variants, offers }))
  assert.ok(result.heldOffers[0].holds.some(value => value.code === 'SHARED_CONTEXT_INVALID'))
})

test('holds otherwise valid offers when the shared snapshot is invalid and states when no comparable offer exists', () => {
  const invalidSnapshot = evaluateCompetitorPriceCheck(input({ snapshot: { id: 'future', observedAtMs: NOW + 1 } }))
  assert.equal(invalidSnapshot.heldOffers.length, 1)
  assert.ok(invalidSnapshot.heldOffers[0].holds.some(value => value.code === 'SHARED_CONTEXT_INVALID'))
  const absent = evaluateCompetitorPriceCheck(input({ offers: [] }))
  assert.ok(absent.variants[0].holds.some(value => value.code === 'NO_COMPARABLE_OFFER'))
})

test('duplicate identity checks preserve opaque variant IDs without delimiter interpretation', () => {
  const opaque = 'a\\u0000b'
  const ordinary = 'a'
  const variants = [variant(opaque, { packIdentityVersion: 'pack-a' }), variant(ordinary, { packIdentityVersion: 'b\\u0000pack-a' })]
  const duplicateA = offer('duplicate', { match: { ...offer().match, variantId: opaque, packIdentityVersion: 'pack-a' } })
  const duplicateB = offer('duplicate', { match: { ...offer().match, variantId: opaque, packIdentityVersion: 'pack-b' } })
  const ordinaryValid = offer('ordinary', { match: { ...offer().match, variantId: ordinary, packIdentityVersion: 'b\\u0000pack-a' } })
  const result = evaluateCompetitorPriceCheck(input({ variants, offers: [duplicateA, duplicateB, ordinaryValid] }))
  assert.equal(result.variants.find(value => value.id === opaque).position, 'HOLD')
  assert.equal(result.variants.find(value => value.id === ordinary).position, 'COMPETITOR_CHEAPER')
})

test('accounts for every supplied variant and fails closed on duplicate IDs and malformed GBP pence', () => {
  const result = evaluateCompetitorPriceCheck(input({ variants: [variant('same'), variant('same'), variant('bad', { currency: 'USD' }), null], offers: [] }))
  assert.equal(result.variants.length, 4)
  assert.ok(result.variants.every(value => value.position === 'HOLD'))
  assert.ok(result.variants[0].holds.some(value => value.code === 'DUPLICATE_VARIANT_ID'))
  assert.ok(result.variants[2].holds.some(value => value.code === 'INVALID_CURRENCY'))
  assert.doesNotThrow(() => evaluateCompetitorPriceCheck(input({ offers: [offer('bad-pence', { itemPricePence: 1.5 })] })))
  assert.ok(evaluateCompetitorPriceCheck(input({ offers: [offer('bad-pence', { itemPricePence: 1.5 })] })).heldOffers[0].holds.some(value => value.code === 'INVALID_PENCE'))
  const futureSnapshot = evaluateCompetitorPriceCheck(input({ snapshot: { id: 'future-snapshot', observedAtMs: NOW + 1 } }))
  assert.ok(futureSnapshot.holds.some(value => value.field === 'snapshot.observedAtMs'))
  const missingRetailer = evaluateCompetitorPriceCheck(input({ offers: [offer('no-retailer', { retailerId: '' })] }))
  assert.ok(missingRetailer.heldOffers[0].holds.some(value => value.field === 'offers.no-retailer.retailerId'))
})

test('does not confuse the £6 TropShip supplier charge with customer delivery', () => {
  const result = evaluateCompetitorPriceCheck(input({ variants: [variant('creatine-500g', { own: { itemPricePence: 2500, customerShippingPence: 399, shippingScenarioId: 'uk-standard' } })], offers: [offer('supplier-cost-is-not-shipping', { itemPricePence: 2500, customerShippingPence: 399 })] }))
  assert.equal(result.variants[0].ownDeliveredPence, 2899)
  assert.equal(result.variants[0].position, 'PARITY')
})
