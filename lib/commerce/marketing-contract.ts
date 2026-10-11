/**
 * Offline commercial-record validation for the future retail, promotion and
 * affiliate ledger. This module has no I/O and never permits a live action.
 *
 * Amounts are supplied facts in GBP pence; this module deliberately does not
 * calculate a price, margin, commission, attribution window or payout.
 */
export const MARKETING_CONTRACT_SCHEMA_VERSION = 'tll-marketing-contract-v1'

export type ApprovalState = 'approved' | 'unapproved' | 'unknown'
export type VersionedApproval = {
  state: ApprovalState
  revision: string
  expectedRevision: string
  sourceVersion: string
  validFromMs: number
  expiresAtMs: number
}

export type CommercialEvidence = {
  retailCost: VersionedApproval
  paymentTariff: VersionedApproval
  supplierDeliveryTariff: VersionedApproval
  shopifyAllocation: VersionedApproval
  consentRetention: VersionedApproval
  affiliateTerms: VersionedApproval
  attributionRule: VersionedApproval
}

export type RetailPriceRecord = {
  recordId: string
  revision: string
  shopifyProductId: string
  shopifyVariantId: string
  supplierSku: string
  packIdentityVersion: string
  currency: 'GBP'
  ordinaryPricePence: number
  minimumFloorPence: number
  targetFloorPence: number
  maximumCommercialBurdenPence: number
  startsAtMs: number
  endsAtMs: number
  approverId: string
  reason: string
  sourceSnapshotVersion: string
  approval: VersionedApproval
}

export type DiscountBenefit =
  | { kind: 'percentage_bps'; value: number }
  | { kind: 'fixed_pence'; value: number }

export type CampaignRecord = {
  campaignId: string
  revision: string
  ownerId: string
  eligibleVariantIds: string[]
  customerEligibilityVersion: string
  channel: 'shopify' | 'affiliate'
  benefit: DiscountBenefit
  budgetCapPence: number
  spendPence: number
  stockLimit: number
  orderLimit: number
  usageLimit: number
  startsAtMs: number
  endsAtMs: number
  killSwitch: boolean
  allowedStackWith: Array<'ordinary_retail' | 'flash_sale' | 'affiliate_code' | 'other_customer_code' | 'order_adjustment'>
  approval: VersionedApproval
}

/** Public codes are deliberately not accounting identities. No contact, click or customer data belongs here. */
export type AffiliateRecord = {
  internalAffiliateId: string
  publicCode: string
  status: 'active' | 'revoked' | 'held' | 'unknown'
  channel: string
  contractVersion: string
  commissionRuleVersion: string
  affiliateDiscount: DiscountBenefit
  attributionRuleVersion: string
  startsAtMs: number
  endsAtMs: number
  budgetCapPence: number
  spendPence: number
  approval: VersionedApproval
}

export type AttributionRecord = {
  attributionId: string
  internalAffiliateId: string
  publicCode: string
  decision: 'accepted' | 'held'
  ruleVersion: string
  consentRetentionVersion: string
  evaluatedAtMs: number
}

export type OrderLedgerEntry = {
  kind: 'order'
  eventId: string
  orderReference: string
  internalAffiliateId: string
  publicCode: string
  attributionId: string
  affiliateContractVersion: string
  ledgerRevision: string
  campaignId: string | null
  eligibleMerchandisePence: number
  customerDiscountPence: number
  commissionAccruedPence: number
  shopifyAllocationVersion: string
  occurredAtMs: number
}
export type AdjustmentLedgerEntry = {
  kind: 'partial_refund' | 'cancellation' | 'chargeback' | 'commission_reversal'
  eventId: string
  orderReference: string
  amountPence: number
  occurredAtMs: number
}
export type LedgerEntry = OrderLedgerEntry | AdjustmentLedgerEntry

export type PayoutRecord = {
  payoutId: string
  internalAffiliateId: string
  affiliateContractVersion: string
  ledgerRevision: string
  /** Exact event-set snapshot reviewed for this payout; excludes customer data. */
  ledgerEventIds: string[]
  amountPence: number
  status: 'manual_approved' | 'paid'
  recordedAtMs: number
  reconciliation: VersionedApproval
  manualApproval: VersionedApproval
}

export type MarketingContractInput = {
  schemaVersion: string
  evaluatedAtMs: number
  assessment: 'new_eligibility' | 'historical_reconciliation'
  evidence: CommercialEvidence | null
  retailPrices: RetailPriceRecord[]
  campaigns: CampaignRecord[]
  affiliates: AffiliateRecord[]
  attributions: AttributionRecord[]
  ledger: LedgerEntry[]
  payouts: PayoutRecord[]
}

export type MarketingHoldCode =
  | 'MISSING_INPUT' | 'INVALID_INPUT' | 'UNAPPROVED' | 'UNKNOWN_APPROVAL' | 'STALE_VERSION'
  | 'NOT_YET_EFFECTIVE' | 'EXPIRED' | 'DUPLICATE_ID' | 'DUPLICATE_CODE' | 'CODE_IS_INTERNAL_ID'
  | 'UNKNOWN_AFFILIATE' | 'REVOKED_AFFILIATE' | 'UNKNOWN_CAMPAIGN' | 'DISALLOWED_STACKING'
  | 'BUDGET_EXCEEDED' | 'KILL_SWITCHED' | 'UNRECONCILED_REFUND' | 'INVALID_LIFECYCLE'
  | 'PAYOUT_RECONCILIATION_REQUIRED' | 'MANUAL_PAYOUT_APPROVAL_REQUIRED'
export type MarketingHold = { code: MarketingHoldCode; field: string }
export type MarketingContractResult = {
  eligible: boolean
  liveEnabled: false
  payoutExecutionAuthorized: false
  holds: MarketingHold[]
  accepted: {
    retailPriceRecords: number
    campaigns: number
    affiliates: number
    orders: number
    adjustments: number
    manualPayoutReviewsSatisfied: number
  }
}

const MAX_PENCE = 1_000_000_000
const MAX_BPS = 10_000
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const CODE = /^[A-Z0-9][A-Z0-9_-]{1,63}$/
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const id = (value: unknown): value is string => text(value) && ID.test(value)
/** Never interpolate untrusted JSON into a diagnostic path. */
const diagnosticId = (value: unknown): string => id(value) ? value : 'unknown'
const integer = (value: unknown, min = 0, max = MAX_PENCE): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
const add = (holds: MarketingHold[], code: MarketingHoldCode, field: string) => holds.push({ code, field })
const evidenceKeys: Array<keyof CommercialEvidence> = ['retailCost', 'paymentTariff', 'supplierDeliveryTariff', 'shopifyAllocation', 'consentRetention', 'affiliateTerms', 'attributionRule']

function approval(value: VersionedApproval | null | undefined, field: string, now: number, holds: MarketingHold[]): boolean {
  if (!value) { add(holds, 'MISSING_INPUT', field); return false }
  let valid = true
  if (value.state === 'unknown') { add(holds, 'UNKNOWN_APPROVAL', field); valid = false }
  else if (value.state !== 'approved') { add(holds, 'UNAPPROVED', field); valid = false }
  if (!text(value.revision) || !text(value.expectedRevision) || !text(value.sourceVersion)) { add(holds, 'MISSING_INPUT', `${field}.version`); valid = false }
  else if (value.revision !== value.expectedRevision) { add(holds, 'STALE_VERSION', field); valid = false }
  if (!integer(value.validFromMs, 0, Number.MAX_SAFE_INTEGER) || !integer(value.expiresAtMs, 1, Number.MAX_SAFE_INTEGER) || value.expiresAtMs <= value.validFromMs) { add(holds, 'INVALID_INPUT', `${field}.window`); return false }
  if (now < value.validFromMs) { add(holds, 'NOT_YET_EFFECTIVE', field); valid = false }
  if (now >= value.expiresAtMs) { add(holds, 'EXPIRED', field); valid = false }
  return valid
}

function window(startsAtMs: unknown, endsAtMs: unknown, field: string, holds: MarketingHold[]): boolean {
  if (!integer(startsAtMs, 0, Number.MAX_SAFE_INTEGER) || !integer(endsAtMs, 1, Number.MAX_SAFE_INTEGER) || endsAtMs <= startsAtMs) { add(holds, 'INVALID_INPUT', `${field}.window`); return false }
  return true
}
function effective(startsAtMs: unknown, endsAtMs: unknown, now: number, field: string, holds: MarketingHold[]): void {
  if (!integer(startsAtMs, 0, Number.MAX_SAFE_INTEGER) || !integer(endsAtMs, 1, Number.MAX_SAFE_INTEGER) || endsAtMs <= startsAtMs) { add(holds, 'INVALID_INPUT', `${field}.window`); return }
  if (now < startsAtMs) add(holds, 'NOT_YET_EFFECTIVE', field)
  if (now >= endsAtMs) add(holds, 'EXPIRED', field)
}
function benefit(value: DiscountBenefit | null | undefined, field: string, holds: MarketingHold[]): boolean {
  if (!value) { add(holds, 'MISSING_INPUT', field); return false }
  const maximum = value.kind === 'percentage_bps' ? MAX_BPS - 1 : MAX_PENCE
  if ((value.kind !== 'percentage_bps' && value.kind !== 'fixed_pence') || !integer(value.value, 1, maximum)) { add(holds, 'INVALID_INPUT', field); return false }
  return true
}
function distinct(values: string[], code: MarketingHoldCode, field: string, holds: MarketingHold[]): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (!id(value)) add(holds, 'INVALID_INPUT', field)
    else if (seen.has(value)) add(holds, code, `${field}.${value}`)
    else seen.add(value)
  }
}

export function validateMarketingContract(input: MarketingContractInput): MarketingContractResult {
  const holds: MarketingHold[] = []
  const now = input?.evaluatedAtMs
  if (!input || input.schemaVersion !== MARKETING_CONTRACT_SCHEMA_VERSION) add(holds, 'STALE_VERSION', 'schemaVersion')
  if (!integer(now, 0, Number.MAX_SAFE_INTEGER)) add(holds, 'INVALID_INPUT', 'evaluatedAtMs')
  const at = integer(now, 0, Number.MAX_SAFE_INTEGER) ? now : 0
  const evidence = input?.evidence
  if (!evidence) add(holds, 'MISSING_INPUT', 'evidence')
  else for (const name of evidenceKeys) approval(evidence[name], `evidence.${name}`, at, holds)
  const evidenceVersion = (name: keyof CommercialEvidence): string | null => text(evidence?.[name]?.sourceVersion) ? evidence[name].sourceVersion : null
  if (input?.assessment !== 'new_eligibility' && input?.assessment !== 'historical_reconciliation') add(holds, 'INVALID_INPUT', 'assessment')

  const list = <T>(value: unknown, field: string): T[] => {
    if (!Array.isArray(value)) { add(holds, 'MISSING_INPUT', field); return [] }
    return value as T[]
  }
  const retailPrices = list<RetailPriceRecord>(input?.retailPrices, 'retailPrices')
  const campaigns = list<CampaignRecord>(input?.campaigns, 'campaigns')
  const affiliates = list<AffiliateRecord>(input?.affiliates, 'affiliates')
  const attributions = list<AttributionRecord>(input?.attributions, 'attributions')
  const ledger = list<LedgerEntry>(input?.ledger, 'ledger')
  const payouts = list<PayoutRecord>(input?.payouts, 'payouts')

  distinct(retailPrices.map(record => record?.recordId), 'DUPLICATE_ID', 'retailPrices.recordId', holds)
  for (const record of retailPrices) {
    if (!id(record?.recordId) || !id(record?.revision) || !id(record?.shopifyProductId) || !id(record?.shopifyVariantId) || !id(record?.supplierSku) || !text(record?.packIdentityVersion) || !text(record?.approverId) || !text(record?.reason) || !text(record?.sourceSnapshotVersion)) add(holds, 'INVALID_INPUT', 'retailPrices.identity')
    if (record?.currency !== 'GBP' || !integer(record?.ordinaryPricePence, 1) || !integer(record?.minimumFloorPence, 1) || !integer(record?.targetFloorPence, record?.minimumFloorPence ?? 1) || !integer(record?.maximumCommercialBurdenPence, 0)) add(holds, 'INVALID_INPUT', 'retailPrices.amounts')
    if (input?.assessment === 'new_eligibility') effective(record?.startsAtMs, record?.endsAtMs, at, 'retailPrices', holds)
    else window(record?.startsAtMs, record?.endsAtMs, 'retailPrices', holds)
    approval(record?.approval, 'retailPrices.approval', at, holds)
  }

  distinct(campaigns.map(record => record?.campaignId), 'DUPLICATE_ID', 'campaigns.campaignId', holds)
  const campaignById = new Map<string, CampaignRecord>()
  for (const record of campaigns) {
    if (!id(record?.campaignId) || !id(record?.revision) || !id(record?.ownerId) || !text(record?.customerEligibilityVersion) || !['shopify', 'affiliate'].includes(record?.channel ?? '')) add(holds, 'INVALID_INPUT', 'campaigns.identity')
    if (!Array.isArray(record?.eligibleVariantIds) || record.eligibleVariantIds.length === 0) add(holds, 'MISSING_INPUT', 'campaigns.eligibleVariantIds')
    else distinct(record.eligibleVariantIds, 'DUPLICATE_ID', 'campaigns.eligibleVariantIds', holds)
    benefit(record?.benefit, 'campaigns.benefit', holds)
    if (!integer(record?.budgetCapPence, 1) || !integer(record?.spendPence, 0) || !integer(record?.stockLimit, 1) || !integer(record?.orderLimit, 1) || !integer(record?.usageLimit, 1)) add(holds, 'INVALID_INPUT', 'campaigns.limits')
    else if (record.spendPence >= record.budgetCapPence) add(holds, 'BUDGET_EXCEEDED', `campaigns.${diagnosticId(record?.campaignId)}`)
    if (record?.killSwitch !== false) add(holds, 'KILL_SWITCHED', `campaigns.${diagnosticId(record?.campaignId)}`)
    const stacking = record?.allowedStackWith
    if (!Array.isArray(stacking) || !stacking.includes('ordinary_retail') || stacking.some(value => !['ordinary_retail', 'flash_sale', 'affiliate_code', 'other_customer_code', 'order_adjustment'].includes(value))) add(holds, 'DISALLOWED_STACKING', `campaigns.${diagnosticId(record?.campaignId)}.allowedStackWith`)
    if (input?.assessment === 'new_eligibility') effective(record?.startsAtMs, record?.endsAtMs, at, 'campaigns', holds)
    else window(record?.startsAtMs, record?.endsAtMs, 'campaigns', holds)
    approval(record?.approval, 'campaigns.approval', at, holds)
    if (id(record?.campaignId)) campaignById.set(record.campaignId, record)
  }

  distinct(affiliates.map(record => record?.internalAffiliateId), 'DUPLICATE_ID', 'affiliates.internalAffiliateId', holds)
  const affiliateById = new Map<string, AffiliateRecord>()
  const codeOwner = new Map<string, string>()
  for (const record of affiliates) {
    if (!id(record?.internalAffiliateId) || !text(record?.channel) || !text(record?.contractVersion) || !text(record?.commissionRuleVersion) || !text(record?.attributionRuleVersion)) add(holds, 'INVALID_INPUT', 'affiliates.identity')
    if (!text(record?.publicCode) || !CODE.test(record.publicCode)) add(holds, 'INVALID_INPUT', 'affiliates.publicCode')
    else if (record.publicCode === record.internalAffiliateId) add(holds, 'CODE_IS_INTERNAL_ID', `affiliates.${record.internalAffiliateId}`)
    else if (codeOwner.has(record.publicCode)) add(holds, 'DUPLICATE_CODE', `affiliates.${record.publicCode}`)
    else codeOwner.set(record.publicCode, record.internalAffiliateId)
    if (record?.status === 'unknown') add(holds, 'UNKNOWN_APPROVAL', `affiliates.${diagnosticId(record?.internalAffiliateId)}.status`)
    if (record?.status !== 'active') add(holds, 'REVOKED_AFFILIATE', `affiliates.${diagnosticId(record?.internalAffiliateId)}`)
    benefit(record?.affiliateDiscount, 'affiliates.affiliateDiscount', holds)
    if (!integer(record?.budgetCapPence, 1) || !integer(record?.spendPence, 0)) add(holds, 'INVALID_INPUT', 'affiliates.budget')
    else if (record.spendPence >= record.budgetCapPence) add(holds, 'BUDGET_EXCEEDED', `affiliates.${diagnosticId(record?.internalAffiliateId)}`)
    if (record?.contractVersion !== evidenceVersion('affiliateTerms') || record?.attributionRuleVersion !== evidenceVersion('attributionRule')) add(holds, 'STALE_VERSION', `affiliates.${diagnosticId(record?.internalAffiliateId)}.dependencyVersion`)
    if (input?.assessment === 'new_eligibility') effective(record?.startsAtMs, record?.endsAtMs, at, 'affiliates', holds)
    else window(record?.startsAtMs, record?.endsAtMs, 'affiliates', holds)
    approval(record?.approval, 'affiliates.approval', at, holds)
    if (id(record?.internalAffiliateId)) affiliateById.set(record.internalAffiliateId, record)
  }

  distinct(attributions.map(record => record?.attributionId), 'DUPLICATE_ID', 'attributions.attributionId', holds)
  const attributionById = new Map<string, AttributionRecord>()
  for (const record of attributions) {
    const affiliate = affiliateById.get(record?.internalAffiliateId)
    if (!id(record?.attributionId) || !affiliate || affiliate.publicCode !== record?.publicCode || !text(record?.ruleVersion) || !text(record?.consentRetentionVersion) || !integer(record?.evaluatedAtMs, 0, Number.MAX_SAFE_INTEGER)) add(holds, 'UNKNOWN_AFFILIATE', 'attributions.identity')
    if (record?.ruleVersion !== evidenceVersion('attributionRule') || record?.consentRetentionVersion !== evidenceVersion('consentRetention')) add(holds, 'STALE_VERSION', `attributions.${diagnosticId(record?.attributionId)}.dependencyVersion`)
    if (record?.decision !== 'accepted') add(holds, 'INVALID_LIFECYCLE', `attributions.${diagnosticId(record?.attributionId)}`)
    if (id(record?.attributionId)) attributionById.set(record.attributionId, record)
  }

  distinct(ledger.map(record => record?.eventId), 'DUPLICATE_ID', 'ledger.eventId', holds)
  const orders = new Map<string, OrderLedgerEntry>()
  const refunded = new Map<string, number>()
  const reversed = new Map<string, number>()
  let adjustments = 0
  for (const entry of ledger) {
    if (!id(entry?.eventId) || !id(entry?.orderReference) || !integer(entry?.occurredAtMs, 0, Number.MAX_SAFE_INTEGER)) { add(holds, 'INVALID_INPUT', 'ledger.identity'); continue }
    if (!['order', 'partial_refund', 'cancellation', 'chargeback', 'commission_reversal'].includes(entry.kind)) { add(holds, 'INVALID_INPUT', `ledger.${entry.eventId}.kind`); continue }
    if (entry.kind === 'order') {
      if (orders.has(entry.orderReference)) add(holds, 'DUPLICATE_ID', `ledger.order.${entry.orderReference}`)
      const affiliate = affiliateById.get(entry.internalAffiliateId)
      if (!affiliate || affiliate.publicCode !== entry.publicCode) add(holds, 'UNKNOWN_AFFILIATE', `ledger.${entry.eventId}`)
      if (entry.affiliateContractVersion !== affiliate?.contractVersion || !text(entry.ledgerRevision) || entry.shopifyAllocationVersion !== evidenceVersion('shopifyAllocation')) add(holds, 'STALE_VERSION', `ledger.${entry.eventId}.dependencyVersion`)
      const attribution = attributionById.get(entry.attributionId)
      if (!id(entry.attributionId) || !attribution || attribution.decision !== 'accepted' || attribution.internalAffiliateId !== entry.internalAffiliateId || attribution.publicCode !== entry.publicCode) add(holds, 'INVALID_LIFECYCLE', `ledger.${entry.eventId}.attribution`)
      if (entry.campaignId !== null) {
        const campaign = campaignById.get(entry.campaignId)
        if (!campaign) add(holds, 'UNKNOWN_CAMPAIGN', `ledger.${entry.eventId}`)
        else if (!Array.isArray(campaign.allowedStackWith) || !campaign.allowedStackWith.includes('affiliate_code')) add(holds, 'DISALLOWED_STACKING', `ledger.${entry.eventId}`)
      }
      if (!integer(entry.eligibleMerchandisePence, 1) || !integer(entry.customerDiscountPence, 0, entry.eligibleMerchandisePence) || !integer(entry.commissionAccruedPence, 0) || !text(entry.shopifyAllocationVersion)) add(holds, 'INVALID_INPUT', `ledger.${entry.eventId}.amounts`)
      orders.set(entry.orderReference, entry)
    } else {
      adjustments += 1
      const order = orders.get(entry.orderReference)
      if (!order || !integer(entry.amountPence, 1)) { add(holds, 'UNRECONCILED_REFUND', `ledger.${entry.eventId}`); continue }
      if (entry.kind === 'commission_reversal') {
        const total = (reversed.get(entry.orderReference) ?? 0) + entry.amountPence
        if (total > order.commissionAccruedPence) add(holds, 'INVALID_LIFECYCLE', `ledger.${entry.eventId}`)
        reversed.set(entry.orderReference, total)
      } else {
        const total = (refunded.get(entry.orderReference) ?? 0) + entry.amountPence
        if (total > order.eligibleMerchandisePence) add(holds, 'UNRECONCILED_REFUND', `ledger.${entry.eventId}`)
        refunded.set(entry.orderReference, total)
      }
    }
  }

  distinct(payouts.map(record => record?.payoutId), 'DUPLICATE_ID', 'payouts.payoutId', holds)
  for (const payout of payouts) {
    if (!payout || typeof payout !== 'object') { add(holds, 'INVALID_INPUT', 'payouts.identity'); continue }
    const affiliate = affiliateById.get(payout?.internalAffiliateId)
    if (!id(payout?.payoutId) || !affiliate || !integer(payout?.amountPence, 1) || !integer(payout?.recordedAtMs, 0, Number.MAX_SAFE_INTEGER) || (payout?.status !== 'manual_approved' && payout?.status !== 'paid')) add(holds, 'INVALID_INPUT', 'payouts.identity')
    if (payout?.affiliateContractVersion !== affiliate?.contractVersion || !text(payout?.ledgerRevision)) add(holds, 'STALE_VERSION', `payouts.${diagnosticId(payout?.payoutId)}.dependencyVersion`)
    if (!Array.isArray(payout.ledgerEventIds) || payout.ledgerEventIds.length === 0 || payout.ledgerEventIds.some(eventId => !id(eventId) || !ledger.some(entry => entry?.eventId === eventId))) add(holds, 'INVALID_INPUT', `payouts.${diagnosticId(payout?.payoutId)}.ledgerEventIds`)
    add(holds, 'PAYOUT_RECONCILIATION_REQUIRED', `payouts.${diagnosticId(payout?.payoutId)}`)
  }

  return {
    eligible: false,
    liveEnabled: false,
    payoutExecutionAuthorized: false,
    holds,
    accepted: { retailPriceRecords: retailPrices.length, campaigns: campaigns.length, affiliates: affiliates.length, orders: orders.size, adjustments, manualPayoutReviewsSatisfied: 0 },
  }
}
