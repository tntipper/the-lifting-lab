/** Shared decision foundation only. No routes, database access, links inferred from names, or publishing. */
import type { ExactPence, PricingValidityWindow } from './pricing-policy'

export type CatalogueReview = {
  approved: boolean
  version: string
  expectedVersion: string
  verifiedAtMs: number
  expiresAtMs: number
}
export type PackIdentity = {
  version: string
  sellingUnit: 'single' | 'multipack' | 'case'
  innerCount: number
  amountPerInner: number
  unit: 'g' | 'ml' | 'tablet' | 'capsule' | 'bar' | 'bottle' | 'sachet'
}
export type FormulaIdentity = { formulaId: string; formulaVersion: string; flavourId: string; labelVersion: string; pack: PackIdentity }
export type CataloguePolicy = {
  review: CatalogueReview
  ownShopOrigin: string
  productPathPrefix: '/products/' | '/shop/products/'
  maxStockAgeMs: number
  maxPriceAgeMs: number
  expectedPricingPolicyVersion: string
  expectedPaymentTariffVersion: string
  expectedSupplierDeliveryTariffVersion: string
}
export type ExactMapping = {
  review: CatalogueReview
  productId: string
  shopifyProductId: string
  shopifyProductHandle: string
  shopifyVariantId: string
  supplierSku: string
  status: 'exact' | 'ambiguous' | 'unknown'
  source: 'verified_labels' | 'name_match' | 'feed_estimate' | 'unknown'
  shopIdentity: FormulaIdentity
  supplierIdentity: FormulaIdentity
}
export type CommerceLabel = {
  review: CatalogueReview
  formulaId: string
  formulaVersion: string
  flavourId: string
  labelVersion: string
  packVersion: string
  source: 'manufacturer_label' | 'verified_supplier_label' | 'feed_estimate' | 'unknown'
  requiredSellingInformationComplete: boolean
}
export type ApprovedCostGate = {
  review: CatalogueReview
  shopifyVariantId: string
  supplierSku: string
  mappingVersion: string
  pricingPolicyVersion: string
  paymentTariffVersion: string
  /** Copied from the calculator, without extending any dependency's lifetime. */
  dependencyValidity: PricingValidityWindow
  currency: 'GBP'
  allAttributableCostsKnown: boolean
  taxTreatmentApproved: boolean
  supplierDeliveryTariffVersion: string
  supplierDeliveryBasis: 'one_item_supplier_order'
  supplierDeliveryStatus: 'charged' | 'free' | 'boundary_hold'
  supplierDeliveryGrossCashPence: number
  wholesaleExVatPence: ExactPence
  /** Derived from the approved contribution calculator; never from wholesale alone. */
  minimumListPricePence: number
}
function standaloneDeliveryValid(cost: ApprovedCostGate | null | undefined): boolean {
  if (!cost || cost.supplierDeliveryBasis !== 'one_item_supplier_order') return false
  const value = cost.wholesaleExVatPence
  if (!value || typeof value.numerator !== 'string' || typeof value.denominator !== 'string' || !/^[1-9][0-9]{0,24}$/.test(value.numerator) || !/^[1-9][0-9]{0,24}$/.test(value.denominator)) return false
  const n = BigInt(value.numerator), d = BigInt(value.denominator)
  if (n > BigInt(1_000_000_000) * d) return false
  return cost.supplierDeliveryStatus === 'charged' && cost.supplierDeliveryGrossCashPence === 600 && n < BigInt(10000) * d
    || cost.supplierDeliveryStatus === 'free' && cost.supplierDeliveryGrossCashPence === 0 && n > BigInt(10000) * d
}
export type ApprovedPrice = {
  review: CatalogueReview
  observedAtMs: number
  shopifyVariantId: string
  mappingVersion: string
  costVersion: string
  currency: 'GBP'
  amountPence: number
}
export type StockProjection = {
  review: CatalogueReview
  observedAtMs: number
  shopifyVariantId: string
  supplierSku: string
  packVersion: string
  basis: 'reconciled_sellable_units' | 'supplier_raw' | 'unknown'
  availableToSell: number
}
export type ResearchAssessment = {
  review: CatalogueReview
  formulaId: string
  formulaVersion: string
  flavourId: string
  labelVersion: string
  modelVersion: string
  expectedModelVersion: string
  evidenceVersion: string
  expectedEvidenceVersion: string
  contextId: string
  source: 'verified_label' | 'feed_estimate' | 'brand_alias' | 'unknown'
  independentReviewComplete: boolean
  outcome: 'endorsed' | 'not_endorsed' | 'unknown'
}
export type ServingBasis = {
  review: CatalogueReview
  formulaId: string
  formulaVersion: string
  flavourId: string
  labelVersion: string
  packVersion: string
  source: 'verified_label' | 'feed_estimate' | 'unknown'
  servingsPerSellableUnit: number
}
export type CatalogueEligibilityInput = {
  evaluatedAtMs: number
  requestedQuantity: number
  policy: CataloguePolicy | null
  product: {
    id: string
    status: 'active' | 'draft' | 'archived' | 'unknown'
    publication: 'research_and_shop' | 'shop_only'
    identity: FormulaIdentity
  } | null
  mapping: ExactMapping | null
  commerceLabel: CommerceLabel | null
  cost: ApprovedCostGate | null
  price: ApprovedPrice | null
  stock: StockProjection | null
  operator: { review: CatalogueReview; commerce: 'clear' | 'hold' | 'unknown'; research: 'clear' | 'hold' | 'unknown' } | null
  destination: { kind: 'own_shop_exact'; url: string; productHandle: string } |
    { kind: 'search_only' | 'none' | 'external_exact' } | null
  researchContextId: string | null
  research: ResearchAssessment | null
  servingBasis: ServingBasis | null
}
export type EligibilityReasonCode = 'MISSING_INPUT' | 'INVALID_INPUT' | 'UNAPPROVED' | 'STALE_VERSION' |
  'EXPIRED' | 'NOT_YET_EFFECTIVE' | 'FUTURE_EVIDENCE' | 'STALE_STOCK' | 'STALE_PRICE' | 'PRODUCT_NOT_ACTIVE' |
  'OPERATOR_HOLD' | 'OPERATOR_CLEARANCE_UNKNOWN' | 'MAPPING_NOT_EXACT' | 'ESTIMATED_IDENTITY' |
  'IDENTITY_MISMATCH' | 'INVALID_PACK_UNIT' | 'COMMERCE_LABEL_INCOMPLETE' | 'UNKNOWN_COST' |
  'UNAPPROVED_TAX' | 'DELIVERY_COST_MISSING' | 'BELOW_PRICE_FLOOR' | 'UNRECONCILED_STOCK' |
  'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'NO_EXACT_DESTINATION' | 'DESTINATION_MISMATCH' |
  'UNSUPPORTED_TRACKING' | 'RESEARCH_NOT_REQUESTED' | 'UNVERIFIED_SCIENCE' | 'NOT_ENDORSED' |
  'RESEARCH_CONTEXT_MISMATCH' | 'SERVING_BASIS_UNVERIFIED'
export type EligibilityReason = { code: EligibilityReasonCode; field: string }
export type EligibilityDecision = { status: 'eligible' | 'hold'; reasons: EligibilityReason[] }
export type CatalogueEligibilityResult = {
  evaluatedAtMs: number | null
  liveEnabled: false
  commerce: EligibilityDecision
  research: EligibilityDecision & { assessmentState: 'endorsed' | 'assessed_not_endorsed' | 'unassessed' | 'not_listed' }
  servingValue: EligibilityDecision
  researchComparisonEligible: boolean
  evidenceRankingEligible: boolean
  valueRankingEligible: boolean
  display: { catalogueState: 'research_listed' | 'unassessed' | 'shop_only' | 'unavailable'; availability: 'available' | 'unavailable'; assessmentLabel: 'Research reviewed' | 'Not endorsed' | 'Not assessed' }
  linkState: 'exact_own_shop' | 'search_only' | 'unavailable'
  purchaseTarget: { url: string; shopifyProductId: string; shopifyVariantId: string; supplierSku: string; relationship: 'own_shop' } | null
  versions: { policy: string | null; mapping: string | null; cost: string | null; payment: string | null; price: string | null; stock: string | null; research: string | null }
}

const MAX = 1_000_000_000
const present = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const integer = (value: unknown, min: number, max = MAX): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX
function reason(list: EligibilityReason[], code: EligibilityReasonCode, field: string): void { list.push({ code, field }) }
function review(value: CatalogueReview | null | undefined, field: string, now: number, into: EligibilityReason[]): void {
  if (!value) { reason(into, 'MISSING_INPUT', field); return }
  if (value.approved !== true) reason(into, 'UNAPPROVED', field)
  if (!present(value.version) || !present(value.expectedVersion)) reason(into, 'MISSING_INPUT', field + '.version')
  else if (value.version !== value.expectedVersion) reason(into, 'STALE_VERSION', field)
  if (!integer(value.verifiedAtMs, 0, Number.MAX_SAFE_INTEGER) || !integer(value.expiresAtMs, 1, Number.MAX_SAFE_INTEGER) || value.expiresAtMs <= value.verifiedAtMs) reason(into, 'INVALID_INPUT', field + '.time')
  else {
    if (value.verifiedAtMs > now) reason(into, 'FUTURE_EVIDENCE', field)
    if (value.expiresAtMs <= now) reason(into, 'EXPIRED', field)
  }
}
function observation(value: unknown, field: 'stock.observedAtMs' | 'price.observedAtMs', now: number, maxAge: number | undefined, into: EligibilityReason[]): void {
  if (!integer(value, 0, Number.MAX_SAFE_INTEGER) || !integer(maxAge, 1, Number.MAX_SAFE_INTEGER)) {
    reason(into, 'INVALID_INPUT', field); return
  }
  if (value > now) reason(into, 'FUTURE_EVIDENCE', field)
  if (now - value >= maxAge) reason(into, field === 'stock.observedAtMs' ? 'STALE_STOCK' : 'STALE_PRICE', field)
}
function dependencyValidity(value: PricingValidityWindow | null | undefined, now: number, into: EligibilityReason[]): void {
  const field = 'cost.dependencyValidity'
  if (!value) { reason(into, 'MISSING_INPUT', field); return }
  if (!integer(value.validFromMs, 0, Number.MAX_SAFE_INTEGER) || !integer(value.expiresAtMs, 1, Number.MAX_SAFE_INTEGER) || value.expiresAtMs <= value.validFromMs) {
    reason(into, 'INVALID_INPUT', field); return
  }
  if (value.validFromMs > now) reason(into, 'NOT_YET_EFFECTIVE', field)
  if (value.expiresAtMs <= now) reason(into, 'EXPIRED', field)
}
function identity(value: FormulaIdentity | undefined, field: string, into: EligibilityReason[]): void {
  if (!value) { reason(into, 'MISSING_INPUT', field); return }
  for (const key of ['formulaId', 'formulaVersion', 'flavourId', 'labelVersion'] as const) if (!present(value[key])) reason(into, 'MISSING_INPUT', field + '.' + key)
  const pack = value.pack
  if (!pack) { reason(into, 'MISSING_INPUT', field + '.pack'); return }
  if (!present(pack.version) || !['single','multipack','case'].includes(pack.sellingUnit) || !integer(pack.innerCount, 1, 10000) || !positive(pack.amountPerInner)) reason(into, 'INVALID_INPUT', field + '.pack')
  if (pack.sellingUnit === 'single' && pack.innerCount !== 1) reason(into, 'INVALID_INPUT', field + '.pack.innerCount')
  if (!['g','ml','tablet','capsule','bar','bottle','sachet'].includes(pack.unit)) reason(into, 'INVALID_PACK_UNIT', field + '.pack.unit')
  if (['tablet','capsule','bar','bottle','sachet'].includes(pack.unit) && !integer(pack.amountPerInner, 1)) reason(into, 'INVALID_INPUT', field + '.pack.amountPerInner')
}
function sameIdentity(expected: FormulaIdentity | undefined, actual: FormulaIdentity | undefined): boolean {
  if (!expected?.pack || !actual?.pack) return false
  return ['formulaId','formulaVersion','flavourId','labelVersion'].every(key => expected[key as keyof FormulaIdentity] === actual[key as keyof FormulaIdentity]) &&
    ['version','sellingUnit','innerCount','amountPerInner','unit'].every(key => expected.pack[key as keyof PackIdentity] === actual.pack[key as keyof PackIdentity])
}
function variant(value: unknown): string | null {
  if (typeof value !== 'string' || !/^(?:gid:\/\/shopify\/ProductVariant\/)?[1-9][0-9]*$/.test(value)) return null
  return value.replace('gid://shopify/ProductVariant/', '')
}
function shopProduct(value: unknown): string | null {
  if (typeof value !== 'string' || !/^(?:gid:\/\/shopify\/Product\/)?[1-9][0-9]*$/.test(value)) return null
  return value.replace('gid://shopify/Product/', '')
}
function matches(value: unknown, expected: unknown, field: string, into: EligibilityReason[]): void {
  if (!present(value) || !present(expected) || value !== expected) reason(into, 'IDENTITY_MISMATCH', field)
}
function gate(reasons: EligibilityReason[]): EligibilityDecision {
  const seen = new Set<string>()
  const unique = reasons.filter(value => { const key = value.code + ':' + value.field; if (seen.has(key)) return false; seen.add(key); return true })
  return { status: unique.length === 0 ? 'eligible' : 'hold', reasons: unique }
}
function destination(input: CatalogueEligibilityInput, into: EligibilityReason[]): string | null {
  const target = input.destination, policy = input.policy, mapping = input.mapping
  if (target?.kind !== 'own_shop_exact') { reason(into, 'NO_EXACT_DESTINATION', 'destination'); return null }
  try {
    const url = new URL(target.url), origin = new URL(policy?.ownShopOrigin ?? '')
    const id = variant(mapping?.shopifyVariantId)
    if (origin.protocol !== 'https:' || origin.href !== origin.origin + '/' || origin.username || origin.password ||
        url.protocol !== 'https:' || url.origin !== origin.origin || url.username || url.password || url.hash ||
        !present(target.productHandle) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.productHandle) ||
        target.productHandle !== mapping?.shopifyProductHandle || !shopProduct(mapping?.shopifyProductId) ||
        url.pathname !== policy?.productPathPrefix + target.productHandle || !id ||
        url.searchParams.getAll('variant').length !== 1 || url.searchParams.get('variant') !== id) {
      reason(into, 'DESTINATION_MISMATCH', 'destination'); return null
    }
    for (const key of url.searchParams.keys()) if (key !== 'variant') { reason(into, 'UNSUPPORTED_TRACKING', 'destination.' + key); return null }
    return url.href
  } catch { reason(into, 'DESTINATION_MISMATCH', 'destination'); return null }
}

export function evaluateCatalogueEligibility(input: CatalogueEligibilityInput): CatalogueEligibilityResult {
  // Runtime absence is handled explicitly as well as nullable typed records.
  const value = input ?? {} as CatalogueEligibilityInput
  const common: EligibilityReason[] = [], commerce: EligibilityReason[] = [], research: EligibilityReason[] = [], serving: EligibilityReason[] = []
  const now = value.evaluatedAtMs
  if (!integer(now, 0, Number.MAX_SAFE_INTEGER)) reason(common, 'INVALID_INPUT', 'evaluatedAtMs')
  const policy = value.policy, product = value.product, mapping = value.mapping
  review(policy?.review, 'policy.review', now, common)
  if (!policy || !integer(policy.maxStockAgeMs, 1, Number.MAX_SAFE_INTEGER) || !integer(policy.maxPriceAgeMs, 1, Number.MAX_SAFE_INTEGER) || !present(policy.expectedPricingPolicyVersion) || !present(policy.expectedPaymentTariffVersion) || !present(policy.expectedSupplierDeliveryTariffVersion) || !['/products/','/shop/products/'].includes(policy.productPathPrefix)) reason(commerce, 'INVALID_INPUT', 'policy.commerce')
  if (!product || !present(product.id)) reason(common, 'MISSING_INPUT', 'product')
  if (product?.status !== 'active') reason(common, 'PRODUCT_NOT_ACTIVE', 'product.status')
  if (!['research_and_shop','shop_only'].includes(product?.publication ?? '')) reason(common, 'INVALID_INPUT', 'product.publication')
  identity(product?.identity, 'product.identity', common)
  review(value.operator?.review, 'operator.review', now, common)
  for (const [scope, into] of [['commerce',commerce],['research',research]] as const) {
    if (value.operator?.[scope] === 'hold') reason(into, 'OPERATOR_HOLD', 'operator.' + scope)
    else if (value.operator?.[scope] !== 'clear') reason(into, 'OPERATOR_CLEARANCE_UNKNOWN', 'operator.' + scope)
  }
  commerce.push(...common); research.push(...common)
  if (!integer(value.requestedQuantity, 1, 10000)) reason(commerce, 'INVALID_INPUT', 'requestedQuantity')

  review(mapping?.review, 'mapping.review', now, commerce)
  if (mapping?.status !== 'exact') reason(commerce, 'MAPPING_NOT_EXACT', 'mapping.status')
  if (mapping?.source !== 'verified_labels') reason(commerce, 'ESTIMATED_IDENTITY', 'mapping.source')
  matches(mapping?.productId, product?.id, 'mapping.productId', commerce)
  const variantId = variant(mapping?.shopifyVariantId)
  if (!variantId || !present(mapping?.supplierSku) || !shopProduct(mapping?.shopifyProductId)) reason(commerce, 'MISSING_INPUT', 'mapping.product/variant/supplierSku')
  identity(mapping?.shopIdentity, 'mapping.shopIdentity', commerce)
  identity(mapping?.supplierIdentity, 'mapping.supplierIdentity', commerce)
  if (!sameIdentity(product?.identity, mapping?.shopIdentity)) reason(commerce, 'IDENTITY_MISMATCH', 'mapping.shopIdentity')
  if (!sameIdentity(product?.identity, mapping?.supplierIdentity)) reason(commerce, 'IDENTITY_MISMATCH', 'mapping.supplierIdentity')

  const label = value.commerceLabel
  review(label?.review, 'commerceLabel.review', now, commerce)
  if (!label || !['manufacturer_label','verified_supplier_label'].includes(label.source) || label.requiredSellingInformationComplete !== true) reason(commerce, 'COMMERCE_LABEL_INCOMPLETE', 'commerceLabel')
  for (const key of ['formulaId','formulaVersion','flavourId','labelVersion'] as const) matches(label?.[key], product?.identity?.[key], 'commerceLabel.' + key, commerce)
  matches(label?.packVersion, product?.identity?.pack?.version, 'commerceLabel.packVersion', commerce)

  const cost = value.cost, price = value.price, stock = value.stock
  review(cost?.review, 'cost.review', now, commerce)
  dependencyValidity(cost?.dependencyValidity, now, commerce)
  if (!cost || cost.allAttributableCostsKnown !== true) reason(commerce, 'UNKNOWN_COST', 'cost')
  if (cost?.taxTreatmentApproved !== true) reason(commerce, 'UNAPPROVED_TAX', 'cost.tax')
  if (!standaloneDeliveryValid(cost)) reason(commerce, 'DELIVERY_COST_MISSING', 'cost.supplierDelivery')
  if (cost?.currency !== 'GBP' || !integer(cost.minimumListPricePence, 1)) reason(commerce, 'INVALID_INPUT', 'cost.minimumListPrice')
  matches(cost?.mappingVersion, mapping?.review?.version, 'cost.mappingVersion', commerce)
  matches(cost?.pricingPolicyVersion, policy?.expectedPricingPolicyVersion, 'cost.pricingPolicyVersion', commerce)
  matches(cost?.paymentTariffVersion, policy?.expectedPaymentTariffVersion, 'cost.paymentTariffVersion', commerce)
  matches(cost?.supplierDeliveryTariffVersion, policy?.expectedSupplierDeliveryTariffVersion, 'cost.supplierDeliveryTariffVersion', commerce)
  matches(cost?.supplierSku, mapping?.supplierSku, 'cost.supplierSku', commerce)
  review(price?.review, 'price.review', now, commerce)
  observation(price?.observedAtMs, 'price.observedAtMs', now, policy?.maxPriceAgeMs, commerce)
  if (price?.currency !== 'GBP' || !integer(price.amountPence, 1)) reason(commerce, 'INVALID_INPUT', 'price.amountPence')
  matches(price?.costVersion, cost?.review?.version, 'price.costVersion', commerce)
  matches(price?.mappingVersion, mapping?.review?.version, 'price.mappingVersion', commerce)
  if (price && cost && price.amountPence < cost.minimumListPricePence) reason(commerce, 'BELOW_PRICE_FLOOR', 'price.amountPence')
  review(stock?.review, 'stock.review', now, commerce)
  observation(stock?.observedAtMs, 'stock.observedAtMs', now, policy?.maxStockAgeMs, commerce)
  if (stock?.basis !== 'reconciled_sellable_units') reason(commerce, 'UNRECONCILED_STOCK', 'stock.basis')
  matches(stock?.supplierSku, mapping?.supplierSku, 'stock.supplierSku', commerce)
  matches(stock?.packVersion, product?.identity?.pack?.version, 'stock.packVersion', commerce)
  if (!stock || !integer(stock.availableToSell, 0)) reason(commerce, 'INVALID_INPUT', 'stock.availableToSell')
  else if (stock.availableToSell === 0) reason(commerce, 'OUT_OF_STOCK', 'stock.availableToSell')
  else if (stock.availableToSell < value.requestedQuantity) reason(commerce, 'INSUFFICIENT_STOCK', 'stock.availableToSell')
  for (const [name, record] of [['cost',cost],['price',price],['stock',stock]] as const) if (!variantId || variant(record?.shopifyVariantId) !== variantId) reason(commerce, 'IDENTITY_MISMATCH', name + '.shopifyVariantId')
  const url = destination(value, commerce)

  const assessment = value.research
  if (product?.publication === 'shop_only') reason(research, 'RESEARCH_NOT_REQUESTED', 'product.publication')
  review(assessment?.review, 'research.review', now, research)
  for (const key of ['formulaId','formulaVersion','flavourId','labelVersion'] as const) matches(assessment?.[key], product?.identity?.[key], 'research.' + key, research)
  if (!assessment || assessment.source !== 'verified_label' || assessment.independentReviewComplete !== true) reason(research, 'UNVERIFIED_SCIENCE', 'research.source')
  matches(assessment?.modelVersion, assessment?.expectedModelVersion, 'research.modelVersion', research)
  matches(assessment?.evidenceVersion, assessment?.expectedEvidenceVersion, 'research.evidenceVersion', research)
  if (!present(value.researchContextId) || assessment?.contextId !== value.researchContextId) reason(research, 'RESEARCH_CONTEXT_MISMATCH', 'research.contextId')
  const scienceVerified = research.length === 0
  if (assessment?.outcome !== 'endorsed') reason(research, assessment?.outcome === 'not_endorsed' ? 'NOT_ENDORSED' : 'UNVERIFIED_SCIENCE', 'research.outcome')

  const basis = value.servingBasis
  serving.push(...commerce)
  review(basis?.review, 'servingBasis.review', now, serving)
  if (basis?.source !== 'verified_label' || !positive(basis?.servingsPerSellableUnit)) reason(serving, 'SERVING_BASIS_UNVERIFIED', 'servingBasis')
  matches(basis?.formulaId, product?.identity?.formulaId, 'servingBasis.formulaId', serving)
  matches(basis?.formulaVersion, product?.identity?.formulaVersion, 'servingBasis.formulaVersion', serving)
  matches(basis?.flavourId, product?.identity?.flavourId, 'servingBasis.flavourId', serving)
  matches(basis?.labelVersion, product?.identity?.labelVersion, 'servingBasis.labelVersion', serving)
  matches(basis?.packVersion, product?.identity?.pack?.version, 'servingBasis.packVersion', serving)
  const commerceDecision = gate(commerce), researchDecision = gate(research), servingDecision = gate(serving)
  const sellable = commerceDecision.status === 'eligible', endorsed = researchDecision.status === 'eligible'
  const assessmentState = product?.publication === 'shop_only' ? 'not_listed' : endorsed ? 'endorsed' : scienceVerified && assessment?.outcome === 'not_endorsed' ? 'assessed_not_endorsed' : 'unassessed'
  return {
    evaluatedAtMs: integer(now, 0, Number.MAX_SAFE_INTEGER) ? now : null, liveEnabled: false,
    commerce: commerceDecision, research: { ...researchDecision, assessmentState }, servingValue: servingDecision,
    researchComparisonEligible: scienceVerified && (assessment?.outcome === 'endorsed' || assessment?.outcome === 'not_endorsed'),
    evidenceRankingEligible: endorsed, valueRankingEligible: endorsed && servingDecision.status === 'eligible',
    display: { catalogueState: !sellable ? 'unavailable' : product?.publication === 'shop_only' ? 'shop_only' : (endorsed || assessmentState === 'assessed_not_endorsed') ? 'research_listed' : 'unassessed',
      availability: sellable ? 'available' : 'unavailable', assessmentLabel: endorsed ? 'Research reviewed' : assessmentState === 'assessed_not_endorsed' ? 'Not endorsed' : 'Not assessed' },
    linkState: sellable && url ? 'exact_own_shop' : value.destination?.kind === 'search_only' ? 'search_only' : 'unavailable',
    purchaseTarget: sellable && url && mapping ? { url, shopifyProductId: 'gid://shopify/Product/' + shopProduct(mapping.shopifyProductId), shopifyVariantId: 'gid://shopify/ProductVariant/' + variantId, supplierSku: mapping.supplierSku, relationship: 'own_shop' } : null,
    versions: { policy: policy?.review?.version ?? null, mapping: mapping?.review?.version ?? null, cost: cost?.review?.version ?? null, payment: cost?.paymentTariffVersion ?? null,
      price: price?.review?.version ?? null, stock: stock?.review?.version ?? null, research: assessment?.review?.version ?? null },
  }
}
