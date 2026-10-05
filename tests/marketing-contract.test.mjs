import test from 'node:test'
import assert from 'node:assert/strict'
import { MARKETING_CONTRACT_SCHEMA_VERSION, validateMarketingContract } from '../lib/commerce/marketing-contract.ts'

const NOW = 1_800_000_000_000
const approval = (revision = 'review-v1') => ({ state: 'approved', revision, expectedRevision: revision, sourceVersion: 'source-v1', validFromMs: NOW - 1_000, expiresAtMs: NOW + 1_000 })
const evidenceApproval = revision => ({ ...approval(revision), sourceVersion: revision })
const evidence = () => ({ retailCost: evidenceApproval('cost-v1'), paymentTariff: evidenceApproval('payment-v1'), supplierDeliveryTariff: evidenceApproval('delivery-v1'), shopifyAllocation: evidenceApproval('allocation-v1'), consentRetention: evidenceApproval('consent-v1'), affiliateTerms: evidenceApproval('terms-v1'), attributionRule: evidenceApproval('attribution-v1') })
const input = () => ({
  schemaVersion: MARKETING_CONTRACT_SCHEMA_VERSION,
  evaluatedAtMs: NOW,
  assessment: 'new_eligibility',
  evidence: evidence(),
  retailPrices: [{ recordId: 'price-a', revision: 'price-v1', shopifyProductId: 'product-a', shopifyVariantId: 'variant-a', supplierSku: 'sku-a', packIdentityVersion: 'pack-v1', currency: 'GBP', ordinaryPricePence: 3000, minimumFloorPence: 2300, targetFloorPence: 2700, maximumCommercialBurdenPence: 700, startsAtMs: NOW - 1_000, endsAtMs: NOW + 1_000, approverId: 'operator-a', reason: 'approved ordinary sale', sourceSnapshotVersion: 'catalogue-v1', approval: approval('price-review-v1') }],
  campaigns: [{ campaignId: 'flash-a', revision: 'campaign-v1', ownerId: 'owner-a', eligibleVariantIds: ['variant-a'], customerEligibilityVersion: 'eligibility-v1', channel: 'affiliate', benefit: { kind: 'percentage_bps', value: 1000 }, budgetCapPence: 5000, spendPence: 100, stockLimit: 10, orderLimit: 10, usageLimit: 10, startsAtMs: NOW - 100, endsAtMs: NOW + 100, killSwitch: false, allowedStackWith: ['ordinary_retail', 'affiliate_code'], approval: approval('campaign-review-v1') }],
  affiliates: [{ internalAffiliateId: 'affiliate-a', publicCode: 'LIFT10', status: 'active', channel: 'instagram', contractVersion: 'terms-v1', commissionRuleVersion: 'commission-v1', affiliateDiscount: { kind: 'percentage_bps', value: 1000 }, attributionRuleVersion: 'attribution-v1', startsAtMs: NOW - 1_000, endsAtMs: NOW + 1_000, budgetCapPence: 1000, spendPence: 100, approval: approval('affiliate-review-v1') }],
  attributions: [{ attributionId: 'attribution-a', internalAffiliateId: 'affiliate-a', publicCode: 'LIFT10', decision: 'accepted', ruleVersion: 'attribution-v1', consentRetentionVersion: 'consent-v1', evaluatedAtMs: NOW }],
  ledger: [{ kind: 'order', eventId: 'event-order-a', orderReference: 'order-a', internalAffiliateId: 'affiliate-a', publicCode: 'LIFT10', attributionId: 'attribution-a', affiliateContractVersion: 'terms-v1', ledgerRevision: 'ledger-v1', campaignId: 'flash-a', eligibleMerchandisePence: 3000, customerDiscountPence: 300, commissionAccruedPence: 200, shopifyAllocationVersion: 'allocation-v1', occurredAtMs: NOW }],
  payouts: [],
})
const payout = () => ({ payoutId: 'payout-a', internalAffiliateId: 'affiliate-a', affiliateContractVersion: 'terms-v1', ledgerRevision: 'ledger-v1', ledgerEventIds: ['event-order-a'], amountPence: 200, status: 'manual_approved', recordedAtMs: NOW, reconciliation: approval('reconciliation-v1'), manualApproval: approval('manual-payout-v1') })

function holds(value, code) { assert.equal(value.eligible, false); assert.equal(value.liveEnabled, false); assert.equal(value.payoutExecutionAuthorized, false); assert.ok(value.holds.some(hold => hold.code === code), JSON.stringify(value.holds)) }

test('a structurally complete draft record remains unavailable for live use', () => {
  const result = validateMarketingContract(input())
  assert.equal(result.eligible, false)
  assert.equal(result.liveEnabled, false)
  assert.equal(result.payoutExecutionAuthorized, false)
  assert.deepEqual(result.holds, [])
  assert.deepEqual(result.accepted, { retailPriceRecords: 1, campaigns: 1, affiliates: 1, orders: 1, adjustments: 0, manualPayoutReviewsSatisfied: 0 })
})

test('partial refund, cancellation and chargeback reconcile to their order', () => {
  const value = input()
  value.ledger.push(
    { kind: 'partial_refund', eventId: 'event-refund-a', orderReference: 'order-a', amountPence: 300, occurredAtMs: NOW + 1 },
    { kind: 'cancellation', eventId: 'event-cancel-a', orderReference: 'order-a', amountPence: 500, occurredAtMs: NOW + 2 },
    { kind: 'chargeback', eventId: 'event-chargeback-a', orderReference: 'order-a', amountPence: 400, occurredAtMs: NOW + 3 },
  )
  const result = validateMarketingContract(value)
  assert.equal(result.eligible, false)
  assert.deepEqual(result.holds, [])
  assert.equal(result.accepted.adjustments, 3)
})

test('commission reversal is a structural ledger record, not a payout calculation', () => {
  const value = input()
  value.ledger.push({ kind: 'commission_reversal', eventId: 'event-commission-reversal-a', orderReference: 'order-a', amountPence: 200, occurredAtMs: NOW + 1 })
  const result = validateMarketingContract(value)
  assert.equal(result.eligible, false)
  assert.deepEqual(result.holds, [])
})

test('unknown, stale and absent commercial approvals HOLD without inferred defaults', () => {
  const missing = input(); missing.evidence = null
  holds(validateMarketingContract(missing), 'MISSING_INPUT')
  const unknown = input(); unknown.evidence.paymentTariff.state = 'unknown'
  holds(validateMarketingContract(unknown), 'UNKNOWN_APPROVAL')
  const stale = input(); stale.affiliates[0].approval.expectedRevision = 'affiliate-review-v2'
  holds(validateMarketingContract(stale), 'STALE_VERSION')
})

test('missing evidence keys, non-arrays, stale dependencies and inactive windows HOLD', () => {
  const missingKey = input(); delete missingKey.evidence.consentRetention
  holds(validateMarketingContract(missingKey), 'MISSING_INPUT')
  const nonArray = input(); nonArray.ledger = null
  holds(validateMarketingContract(nonArray), 'MISSING_INPUT')
  const dependency = input(); dependency.ledger[0].shopifyAllocationVersion = 'allocation-v0'
  holds(validateMarketingContract(dependency), 'STALE_VERSION')
  const inactive = input(); inactive.campaigns[0].endsAtMs = NOW
  holds(validateMarketingContract(inactive), 'EXPIRED')
})

test('public codes cannot be ledger identities and cannot map to more than one affiliate', () => {
  const identical = input(); identical.affiliates[0].internalAffiliateId = 'LIFT10'; identical.attributions[0].internalAffiliateId = 'LIFT10'; identical.ledger[0].internalAffiliateId = 'LIFT10'
  holds(validateMarketingContract(identical), 'CODE_IS_INTERNAL_ID')
  const duplicate = input(); duplicate.affiliates.push({ ...duplicate.affiliates[0], internalAffiliateId: 'affiliate-b' })
  holds(validateMarketingContract(duplicate), 'DUPLICATE_CODE')
})

test('duplicate webhook-style events and unlinked adjustments HOLD', () => {
  const duplicate = input(); duplicate.ledger.push({ ...duplicate.ledger[0] })
  holds(validateMarketingContract(duplicate), 'DUPLICATE_ID')
  const orphan = input(); orphan.ledger.push({ kind: 'partial_refund', eventId: 'orphan-refund', orderReference: 'missing-order', amountPence: 1, occurredAtMs: NOW })
  holds(validateMarketingContract(orphan), 'UNRECONCILED_REFUND')
  const unknown = input(); unknown.ledger.push({ kind: 'unknown_event', eventId: 'unknown-kind', orderReference: 'order-a', amountPence: 1, occurredAtMs: NOW })
  holds(validateMarketingContract(unknown), 'INVALID_INPUT')
})

test('malformed collection entries fail closed without throwing', () => {
  for (const collection of ['retailPrices', 'campaigns', 'affiliates', 'attributions', 'ledger', 'payouts']) {
    const value = input(); value[collection] = [null]
    let result
    assert.doesNotThrow(() => { result = validateMarketingContract(value) })
    holds(result, 'INVALID_INPUT')
  }
  const stacking = input(); stacking.campaigns[0].allowedStackWith = null
  assert.doesNotThrow(() => validateMarketingContract(stacking))
  holds(validateMarketingContract(stacking), 'DISALLOWED_STACKING')
})

test('payout drafts always HOLD for a future reconciler and retain structural references', () => {
  const value = input(); value.payouts.push(payout())
  const result = validateMarketingContract(value)
  holds(result, 'PAYOUT_RECONCILIATION_REQUIRED')
  assert.equal(result.accepted.manualPayoutReviewsSatisfied, 0)
  const malformed = input(); malformed.payouts.push({ ...payout(), ledgerEventIds: ['missing-event'] })
  holds(validateMarketingContract(malformed), 'INVALID_INPUT')
  const hostile = input(); hostile.payouts.push({ ...payout(), payoutId: { toString: null, valueOf: null } })
  let hostileResult
  assert.doesNotThrow(() => { hostileResult = validateMarketingContract(hostile) })
  holds(hostileResult, 'INVALID_INPUT')
})

test('over-budget or kill-switched campaign refuses new eligibility', () => {
  const budget = input(); budget.campaigns[0].spendPence = 5001
  holds(validateMarketingContract(budget), 'BUDGET_EXCEEDED')
  const kill = input(); kill.campaigns[0].killSwitch = true
  holds(validateMarketingContract(kill), 'KILL_SWITCHED')
  const equalCap = input(); equalCap.affiliates[0].spendPence = equalCap.affiliates[0].budgetCapPence
  holds(validateMarketingContract(equalCap), 'BUDGET_EXCEEDED')
})

test('an affiliate order requires an accepted attribution and explicit stacking permission', () => {
  const attribution = input(); attribution.ledger[0].attributionId = 'missing-attribution'
  holds(validateMarketingContract(attribution), 'INVALID_LIFECYCLE')
  const stacking = input(); stacking.campaigns[0].allowedStackWith = ['ordinary_retail']
  holds(validateMarketingContract(stacking), 'DISALLOWED_STACKING')
})

test('reversals cannot exceed accrued commission and refunds cannot exceed merchandise', () => {
  const commission = input(); commission.ledger.push({ kind: 'commission_reversal', eventId: 'too-much-commission', orderReference: 'order-a', amountPence: 201, occurredAtMs: NOW })
  holds(validateMarketingContract(commission), 'INVALID_LIFECYCLE')
  const refund = input(); refund.ledger.push({ kind: 'partial_refund', eventId: 'too-much-refund', orderReference: 'order-a', amountPence: 3001, occurredAtMs: NOW })
  holds(validateMarketingContract(refund), 'UNRECONCILED_REFUND')
})
