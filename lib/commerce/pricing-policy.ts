/** Pure GBP pricing assessment. No IO, side effects, checkout enforcement or price writes. */
export const SUPPLIER_DELIVERY_TARIFF_VERSION = 'tll-tropship-standard-uk-order-2026-09-15-v2'
export const SUPPLIER_DELIVERY_TARIFF_VALUES = Object.freeze({ service: 'tropship_standard_uk' as const,
  quotedExVatPence: 500, vatBps: 2000, inputVatRecoverable: false as const,
  freeAboveWholesaleExVatPence: 10000, equalityPolicy: 'hold_with_charge' as const,
  businessVatStatus: 'not_registered' as const })
export const PRICE_WRITES_ENABLED = false
export const TLL_POLICY_VALUES = Object.freeze({ targetMarginBps: 3500, minimumMarginBps: 2500, minimumCashPerItemPence: 300 })
export const MAX_PENCE = 1_000_000_000
const ZERO = BigInt(0), ONE = BigInt(1), TWO = BigInt(2), SCALE = BigInt(10000)

type Rational = { n: bigint; d: bigint }
export type ExactPence = { numerator: string; denominator: string }
export type Approval = {
  version: string
  expectedVersion: string
  approved: boolean
  validFromMs: number
  expiresAtMs: number
}
export type PricingValidityWindow = { validFromMs: number; expiresAtMs: number }
export type CostTax = {
  approved: boolean
  basis: 'inclusive' | 'exclusive' | 'not_subject'
  vatBps: number
  inputVatRecoverable: boolean
}
export type TaxedCost = { amountPence: number; tax: CostTax }
export type CostRecord = {
  approval: Approval
  currency: 'GBP'
  unit: 'sellable_item'
  unitDefinitionApproved: boolean
  wholesale: TaxedCost
  /** Distinct additional costs only; do not repeat wholesale, delivery or reserve. */
  otherPerItemCosts: { id: string; cost: TaxedCost }[]
  /** Explicit economic reserve under the current unrecoverable-input-VAT policy. */
  returnsReservePence: number
  outputVat: { approved: boolean; rateBps: number }
}
export type PaymentTariff = { approval: Approval; fixedPence: number; variableBps: number }
export type PricingPolicy = {
  approval: Approval
  targetMarginBps: number
  minimumMarginBps: number
  minimumCashPerItemPence: number
  maxDiscountBps: number
}
export type SupplierDeliveryTariff = { approval: Approval } & typeof SUPPLIER_DELIVERY_TARIFF_VALUES
export type SupplierOrderGroup = { id: string; customerDeliveryId: string; approval: Approval; service: 'tropship_standard_uk' }
export type PricingContext = { nowMs: number; payment: PaymentTariff; policy: PricingPolicy; supplierDeliveryTariff: SupplierDeliveryTariff }
export type FloorInput = PricingContext & { cost: CostRecord }
export type BasketLine = {
  id: string
  /** An explicitly reviewed supplier order/customer-delivery group, never inferred. */
  supplierOrderId: string
  customerDeliveryId: string
  quantity: number
  listUnitPricePence: number
  cost: CostRecord
  /** Percentage is applied to the line total first; its discount rounds half-up to a penny. */
  percentageDiscountBps: number
  /** Actual additional line allocation, including fixed codes/reward redemption. */
  fixedDiscountPence: number
}
export type BasketInput = PricingContext & {
  lines: BasketLine[]
  supplierOrders: SupplierOrderGroup[]
  customerShipping: { approval: Approval; grossPence: number; outputVat: { approved: boolean; rateBps: number } }
  /** Omit for the derived conservative £3 × quantity safeguard, not a separately approved order policy. */
  orderCashPolicy?: { approval: Approval; minimumPence: number }
}
export type HoldCode = 'MISSING_INPUT' | 'INVALID_INPUT' | 'UNAPPROVED' | 'STALE_VERSION' |
  'EXPIRED' | 'NOT_YET_EFFECTIVE' | 'INVALID_UNIT' | 'INVALID_TAX' | 'DELIVERY_FEE_MISMATCH' |
  'OVERFLOW' | 'NON_POSITIVE_DENOMINATOR' | 'EXCESS_DISCOUNT' | 'BELOW_ITEM_FLOOR' |
  'DELIVERY_THRESHOLD_BOUNDARY' | 'INVALID_DELIVERY_GROUP' | 'BELOW_MINIMUM_MARGIN' | 'BELOW_MINIMUM_CASH' | 'BELOW_LINE_MARGIN' | 'BELOW_LINE_CASH'
export type Hold = { code: HoldCode; field: string }
export type FloorCalculation = {
  minimumListPricePence: number
  targetListPricePence: number
  limitingMinimumRule: 'margin' | 'cash' | 'both'
  supplierDeliveryBasis: 'one_item_supplier_order'
  supplierDeliveryStatus: 'charged' | 'free' | 'boundary_hold'
  wholesaleExVatPence: ExactPence
  supplierDeliveryQuotedExVatPence: number
  supplierDeliveryGrossCashPence: number
  supplierDeliveryEconomicPence: ExactPence
  nonVariableEconomicCostPence: ExactPence
  discountedGrossPenceAtMinimum: ExactPence
  netRevenuePenceAtMinimum: ExactPence
  contributionPenceAtMinimum: ExactPence
  marginAtMinimum: ExactPence
  approvalVersions: { cost: string; policy: string; payment: string; supplierDeliveryTariff: string }
  /** Intersection of the input approvals; reviewing a floor cannot extend it. */
  dependencyValidity: PricingValidityWindow
}
export type BasketLineCalculation = {
  id: string
  supplierOrderId: string
  supplierDeliveryAllocatedQuotedExVatPence: ExactPence
  quantity: number
  grossBeforeDiscountPence: number
  discountPence: number
  grossReceiptsPence: number
  netRevenuePence: ExactPence
  supplierDeliveryGrossCashPence: number
  supplierDeliveryEconomicPence: ExactPence
  allocatedFixedPaymentFeePence: ExactPence
  contributionPence: ExactPence
  conservativeItemListFloorPence: number
  /** Separate gate: standalone delivery and full fixed payment fee per item. */
  conservativeLineContributionPence: ExactPence
  minimumLineCashPence: number
}
export type BasketCalculation = {
  lines: BasketLineCalculation[]
  billableQuantity: number
  supplierOrders: SupplierOrderCalculation[]
  supplierDeliveryQuotedExVatPence: number
  supplierDeliveryGrossCashPence: number
  supplierDeliveryEconomicPence: ExactPence
  grossReceiptsPence: number
  customerShippingGrossPence: number
  customerShippingNetPence: ExactPence
  customerShippingAllocatedFixedFeePence: ExactPence
  customerShippingVariableFeePence: ExactPence
  customerShippingContributionPence: ExactPence
  netRevenuePence: ExactPence
  variablePaymentFeePence: ExactPence
  fixedPaymentFeePence: number
  contributionPence: ExactPence
  contributionMargin: ExactPence
  minimumCashPence: number
  minimumCashBasis: 'derived_per_billable_item' | 'approved_per_order'
  targetMarginMet: boolean
  dependencyValidity: PricingValidityWindow
  approvalVersions: { policy: string; payment: string; supplierDeliveryTariff: string; supplierOrders: { id: string; version: string }[]; costs: { lineId: string; version: string }[]; customerShipping: string; orderCashPolicy?: string }
}
export type SupplierOrderCalculation = {
  id: string
  customerDeliveryId: string
  billableQuantity: number
  wholesaleExVatPence: ExactPence
  deliveryStatus: 'charged' | 'free' | 'boundary_hold'
  quotedExVatPence: number
  grossCashPence: number
  economicPence: ExactPence
}
export type Assessment<T> = {
  eligible: boolean
  liveEnabled: false
  checkoutVerified: false
  holds: Hold[]
  calculation?: T
}

class InvalidInput extends Error {
  hold: Hold
  constructor(hold: Hold) { super(hold.code); this.hold = hold }
}
function fail(code: HoldCode, field: string): never { throw new InvalidInput({ code, field }) }
function required(value: unknown, field: string): asserts value { if (value === undefined || value === null) fail('MISSING_INPUT', field) }
function integer(value: number, field: string, min = 0, max = MAX_PENCE): void {
  required(value, field)
  if (!Number.isSafeInteger(value) || value < min) fail('INVALID_INPUT', field)
  if (value > max) fail('OVERFLOW', field)
}
function approval(value: Approval, field: string, now: number): void {
  required(value, field)
  if (value.approved !== true) fail('UNAPPROVED', field)
  if (typeof value.version !== 'string' || !value.version.trim() || typeof value.expectedVersion !== 'string') fail('MISSING_INPUT', field + '.version')
  if (value.version !== value.expectedVersion) fail('STALE_VERSION', field)
  integer(value.validFromMs, field + '.validFromMs', 0, Number.MAX_SAFE_INTEGER)
  integer(value.expiresAtMs, field + '.expiresAtMs', 1, Number.MAX_SAFE_INTEGER)
  if (value.expiresAtMs <= value.validFromMs) fail('INVALID_INPUT', field + '.expiresAtMs')
  if (now < value.validFromMs) fail('NOT_YET_EFFECTIVE', field)
  if (now >= value.expiresAtMs) fail('EXPIRED', field)
}
function gcd(a: bigint, b: bigint): bigint {
  a = a < ZERO ? -a : a
  while (b !== ZERO) { const t = a % b; a = b; b = t }
  return a
}
function rat(n: bigint, d = ONE): Rational {
  if (d <= ZERO) throw new Error('Internal denominator must be positive')
  const g = gcd(n, d)
  return { n: n / g, d: d / g }
}
function money(n: number): Rational { return rat(BigInt(n)) }
function rate(n: number): Rational { return rat(BigInt(n), SCALE) }
function add(a: Rational, b: Rational): Rational { return rat(a.n * b.d + b.n * a.d, a.d * b.d) }
function neg(a: Rational): Rational { return rat(-a.n, a.d) }
function sub(a: Rational, b: Rational): Rational { return add(a, neg(b)) }
function mul(a: Rational, b: Rational): Rational { return rat(a.n * b.n, a.d * b.d) }
function div(a: Rational, b: Rational): Rational { if (b.n <= ZERO) throw new Error('Internal divisor must be positive'); return rat(a.n * b.d, a.d * b.n) }
function compare(a: Rational, b: Rational): number { const d = a.n * b.d - b.n * a.d; return d < ZERO ? -1 : d > ZERO ? 1 : 0 }
function ceil(a: Rational): bigint { return (a.n + a.d - ONE) / a.d }
function halfUp(a: Rational): bigint { return (TWO * a.n + a.d) / (TWO * a.d) }
function bounded(n: bigint, field: string): number { if (n < ZERO || n > BigInt(MAX_PENCE)) fail('OVERFLOW', field); return Number(n) }
function exact(a: Rational): ExactPence { return { numerator: a.n.toString(), denominator: a.d.toString() } }
function economic(value: TaxedCost, field: string): Rational {
  required(value, field); integer(value.amountPence, field + '.amountPence')
  const tax = value.tax; required(tax, field + '.tax')
  if (tax.approved !== true) fail('UNAPPROVED', field + '.tax')
  if (!['inclusive', 'exclusive', 'not_subject'].includes(tax.basis) || tax.inputVatRecoverable !== false) fail('INVALID_TAX', field)
  integer(tax.vatBps, field + '.tax.vatBps', 0, 10000)
  if (tax.basis === 'not_subject' && (tax.vatBps !== 0 || tax.inputVatRecoverable)) fail('INVALID_TAX', field)
  const grossFactor = add(money(1), rate(tax.vatBps))
  const amount = money(value.amountPence)
  if (tax.basis === 'exclusive') return mul(amount, grossFactor)
  return amount
}
function outputTax(value: { approved: boolean; rateBps: number }, field: string): Rational {
  required(value, field)
  if (value.approved !== true) fail('UNAPPROVED', field)
  integer(value.rateBps, field + '.rateBps', 0, 10000)
  if (value.rateBps !== 0) fail('INVALID_TAX', field)
  return add(money(1), rate(value.rateBps))
}
function context(input: PricingContext): void {
  required(input, 'input'); integer(input.nowMs, 'nowMs', 0, Number.MAX_SAFE_INTEGER)
  required(input.policy, 'policy'); required(input.payment, 'payment')
  approval(input.policy.approval, 'policy.approval', input.nowMs)
  approval(input.payment.approval, 'payment.approval', input.nowMs)
  required(input.supplierDeliveryTariff, 'supplierDeliveryTariff')
  approval(input.supplierDeliveryTariff.approval, 'supplierDeliveryTariff.approval', input.nowMs)
  if (input.supplierDeliveryTariff.approval.version !== SUPPLIER_DELIVERY_TARIFF_VERSION) fail('STALE_VERSION', 'supplierDeliveryTariff')
  for (const key of Object.keys(SUPPLIER_DELIVERY_TARIFF_VALUES) as (keyof typeof SUPPLIER_DELIVERY_TARIFF_VALUES)[]) {
    if (input.supplierDeliveryTariff[key] !== SUPPLIER_DELIVERY_TARIFF_VALUES[key]) fail('DELIVERY_FEE_MISMATCH', 'supplierDeliveryTariff.' + key)
  }
  integer(input.policy.minimumMarginBps, 'policy.minimumMarginBps', 1, 9999)
  integer(input.policy.targetMarginBps, 'policy.targetMarginBps', input.policy.minimumMarginBps, 9999)
  integer(input.policy.minimumCashPerItemPence, 'policy.minimumCashPerItemPence', 1)
  integer(input.policy.maxDiscountBps, 'policy.maxDiscountBps', 0, 9999)
  integer(input.payment.fixedPence, 'payment.fixedPence')
  integer(input.payment.variableBps, 'payment.variableBps', 0, 9999)
}
function costs(value: CostRecord, now: number, field = 'cost'): { perItem: Rational; wholesaleExVat: Rational; taxFactor: Rational } {
  required(value, field); approval(value.approval, field + '.approval', now)
  if (value.currency !== 'GBP' || value.unit !== 'sellable_item') fail('INVALID_UNIT', field)
  if (value.unitDefinitionApproved !== true) fail('UNAPPROVED', field + '.unitDefinition')
  required(value.wholesale, field + '.wholesale'); integer(value.wholesale.amountPence, field + '.wholesale.amountPence', 1)
  // Reject superseded per-item delivery records instead of silently double charging.
  if ('supplierDelivery' in value) fail('DELIVERY_FEE_MISMATCH', field + '.supplierDelivery')
  let perItem = economic(value.wholesale, field + '.wholesale')
  const wholesaleExVat = value.wholesale.tax.basis === 'inclusive'
    ? div(money(value.wholesale.amountPence), add(money(1), rate(value.wholesale.tax.vatBps))) : money(value.wholesale.amountPence)
  if (!Array.isArray(value.otherPerItemCosts)) fail('MISSING_INPUT', field + '.otherPerItemCosts')
  if (value.otherPerItemCosts.length > 30) fail('INVALID_INPUT', field + '.otherPerItemCosts')
  const ids = new Set(['wholesale', 'supplier-delivery', 'returns-reserve'])
  for (const item of value.otherPerItemCosts) {
    required(item, field + '.otherPerItemCosts')
    if (typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) fail('INVALID_INPUT', field + '.otherPerItemCosts.id')
    ids.add(item.id); perItem = add(perItem, economic(item.cost, field + '.otherPerItemCosts.' + item.id))
  }
  integer(value.returnsReservePence, field + '.returnsReservePence')
  perItem = add(perItem, money(value.returnsReservePence))
  bounded(ceil(perItem), field + '.economicTotal')
  return { perItem, wholesaleExVat, taxFactor: outputTax(value.outputVat, field + '.outputVat') }
}
function floorValue(C: Rational, tax: Rational, margin: number, input: PricingContext): { pence: number; limiting: 'margin' | 'cash' | 'both' } {
  const variable = rate(input.payment.variableBps)
  const marginDen = sub(div(sub(money(1), rate(margin)), tax), variable)
  const cashDen = sub(div(money(1), tax), variable)
  if (marginDen.n <= ZERO || cashDen.n <= ZERO) fail('NON_POSITIVE_DENOMINATOR', 'policy/payment/outputVat')
  const marginGross = div(C, marginDen)
  const cashGross = div(add(C, money(input.policy.minimumCashPerItemPence)), cashDen)
  const comparison = compare(marginGross, cashGross)
  const requiredGross = ceil(comparison >= 0 ? marginGross : cashGross)
  // Actual receipt g = P - floor(P*d + 1/2) = ceil(P*(1-d) - 1/2).
  // For integer G, g >= G iff P*(1-d) > G-1/2 (strict at half-penny ties).
  // Invert this monotone condition to obtain the lowest passing integer P.
  const price = ((TWO * requiredGross - ONE) * SCALE) /
    (TWO * (SCALE - BigInt(input.policy.maxDiscountBps))) + ONE
  return { pence: bounded(price, 'calculatedFloor'), limiting: comparison > 0 ? 'margin' : comparison < 0 ? 'cash' : 'both' }
}
function deliveryFor(wholesaleExVat: Rational, tariff: SupplierDeliveryTariff) {
  const threshold = compare(wholesaleExVat, money(tariff.freeAboveWholesaleExVatPence))
  const quoted = threshold > 0 ? 0 : tariff.quotedExVatPence
  const gross = bounded(ceil(mul(money(quoted), add(money(1), rate(tariff.vatBps)))), 'delivery.gross')
  return { quoted, gross, economic: money(gross), status: threshold === 0 ? 'boundary_hold' as const : threshold > 0 ? 'free' as const : 'charged' as const }
}
function validity(approvals: Approval[]): PricingValidityWindow {
  return { validFromMs: Math.max(...approvals.map(a => a.validFromMs)), expiresAtMs: Math.min(...approvals.map(a => a.expiresAtMs)) }
}
function calculateFloor(input: FloorInput): FloorCalculation {
  const cost = costs(input.cost, input.nowMs)
  const delivery = deliveryFor(cost.wholesaleExVat, input.supplierDeliveryTariff)
  const C = add(add(cost.perItem, delivery.economic), money(input.payment.fixedPence))
  const minimum = floorValue(C, cost.taxFactor, input.policy.minimumMarginBps, input)
  const target = floorValue(C, cost.taxFactor, input.policy.targetMarginBps, input)
  const gross = money(minimum.pence - bounded(halfUp(mul(money(minimum.pence), rate(input.policy.maxDiscountBps))), 'discountAtMinimum'))
  const net = div(gross, cost.taxFactor)
  const contribution = sub(sub(net, C), mul(gross, rate(input.payment.variableBps)))
  return {
    minimumListPricePence: minimum.pence, targetListPricePence: target.pence,
    limitingMinimumRule: minimum.limiting,
    supplierDeliveryBasis: 'one_item_supplier_order', supplierDeliveryStatus: delivery.status, wholesaleExVatPence: exact(cost.wholesaleExVat),
    supplierDeliveryQuotedExVatPence: delivery.quoted, supplierDeliveryGrossCashPence: delivery.gross, supplierDeliveryEconomicPence: exact(delivery.economic),
    nonVariableEconomicCostPence: exact(C), discountedGrossPenceAtMinimum: exact(gross),
    netRevenuePenceAtMinimum: exact(net), contributionPenceAtMinimum: exact(contribution), marginAtMinimum: exact(div(contribution, net)),
    approvalVersions: { cost: input.cost.approval.version, policy: input.policy.approval.version, payment: input.payment.approval.version, supplierDeliveryTariff: input.supplierDeliveryTariff.approval.version },
    dependencyValidity: validity([input.cost.approval, input.policy.approval, input.payment.approval, input.supplierDeliveryTariff.approval]),
  }
}
function assess<T>(calculate: () => { calculation: T; holds?: Hold[] }): Assessment<T> {
  try {
    const { calculation, holds = [] } = calculate()
    return { eligible: holds.length === 0, liveEnabled: false, checkoutVerified: false, holds, calculation }
  } catch (error) {
    if (!(error instanceof InvalidInput)) throw error
    return { eligible: false, liveEnabled: false, checkoutVerified: false, holds: [error.hold] }
  }
}
export function calculatePriceFloor(input: FloorInput): Assessment<FloorCalculation> {
  return assess(() => { context(input); const calculation = calculateFloor(input); return { calculation, holds: calculation.supplierDeliveryStatus === 'boundary_hold' ? [{ code: 'DELIVERY_THRESHOLD_BOUNDARY', field: 'standaloneSupplierOrder' }] : [] } })
}
export function evaluateBasket(input: BasketInput): Assessment<BasketCalculation> {
  return assess(() => {
    context(input)
    if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) fail('INVALID_INPUT', 'lines')
    // Iteration deliberately visits sparse entries; missing lines cannot vanish from totals.
    for (let index = 0; index < input.lines.length; index++) if (!Object.prototype.hasOwnProperty.call(input.lines, index)) fail('INVALID_INPUT', `lines[${index}]`)
    if (!Array.isArray(input.supplierOrders) || input.supplierOrders.length < 1 || input.supplierOrders.length > 100) fail('INVALID_DELIVERY_GROUP', 'supplierOrders')
    const groups = new Map<string, { source: SupplierOrderGroup; quantity: number; wholesale: Rational; lines: { id: string; quantity: number }[] }>()
    for (const group of input.supplierOrders) {
      if (!group || typeof group.id !== 'string' || !group.id.trim() || groups.has(group.id) || typeof group.customerDeliveryId !== 'string' || !group.customerDeliveryId.trim() || group.service !== input.supplierDeliveryTariff.service) fail('INVALID_DELIVERY_GROUP', 'supplierOrders')
      approval(group.approval, 'supplierOrders.' + group.id + '.approval', input.nowMs)
      groups.set(group.id, { source: group, quantity: 0, wholesale: money(0), lines: [] })
    }
    required(input.customerShipping, 'customerShipping')
    approval(input.customerShipping.approval, 'customerShipping.approval', input.nowMs)
    integer(input.customerShipping.grossPence, 'customerShipping.grossPence')
    const shippingTax = outputTax(input.customerShipping.outputVat, 'customerShipping.outputVat')
    const shippingNet = div(money(input.customerShipping.grossPence), shippingTax)
    let totalGross = BigInt(input.customerShipping.grossPence), totalQuantity = 0
    let totalNet = shippingNet, totalCost = money(0)
    const holds: Hold[] = [], ids = new Set<string>()
    const intermediate = input.lines.map(line => {
      required(line, 'line')
      if (typeof line.id !== 'string' || !line.id.trim() || ids.has(line.id)) fail('INVALID_INPUT', 'line.id')
      ids.add(line.id)
      const group = groups.get(line.supplierOrderId)
      if (!group || line.customerDeliveryId !== group.source.customerDeliveryId) fail('INVALID_DELIVERY_GROUP', line.id + '.supplierOrderId')
      integer(line.quantity, line.id + '.quantity', 1, 10000)
      integer(line.listUnitPricePence, line.id + '.listUnitPricePence', 1)
      integer(line.percentageDiscountBps, line.id + '.percentageDiscountBps', 0, 9999)
      integer(line.fixedDiscountPence, line.id + '.fixedDiscountPence')
      const cost = costs(line.cost, input.nowMs, line.id + '.cost')
      const before = bounded(BigInt(line.listUnitPricePence) * BigInt(line.quantity), line.id + '.lineTotal')
      const discount = bounded(halfUp(mul(money(before), rate(line.percentageDiscountBps))) + BigInt(line.fixedDiscountPence), line.id + '.discount')
      if (discount >= before) fail('EXCESS_DISCOUNT', line.id)
      if (line.percentageDiscountBps > input.policy.maxDiscountBps || BigInt(discount) > halfUp(mul(money(before), rate(input.policy.maxDiscountBps)))) holds.push({ code: 'EXCESS_DISCOUNT', field: line.id })
      const gross = before - discount, net = div(money(gross), cost.taxFactor)
      const floor = calculateFloor({ ...input, cost: line.cost }), itemFloor = floor.minimumListPricePence
      if (floor.supplierDeliveryStatus === 'boundary_hold') holds.push({ code: 'DELIVERY_THRESHOLD_BOUNDARY', field: line.id + '.standaloneSupplierOrder' })
      if (line.listUnitPricePence < itemFloor) holds.push({ code: 'BELOW_ITEM_FLOOR', field: line.id })
      const lineCost = mul(cost.perItem, money(line.quantity))
      // Independent publication gate models every item sold alone, including its
      // standalone delivery and full fixed payment fee. This is not a basket charge.
      const standaloneDelivery = deliveryFor(cost.wholesaleExVat, input.supplierDeliveryTariff)
      const conservativeCost = add(lineCost, mul(add(standaloneDelivery.economic, money(input.payment.fixedPence)), money(line.quantity)))
      const conservativeContribution = sub(sub(net, conservativeCost), mul(money(gross), rate(input.payment.variableBps)))
      const minimumLineCash = bounded(BigInt(input.policy.minimumCashPerItemPence) * BigInt(line.quantity), line.id + '.minimumLineCash')
      if (compare(conservativeContribution, mul(net, rate(input.policy.minimumMarginBps))) < 0) holds.push({ code: 'BELOW_LINE_MARGIN', field: line.id })
      if (compare(conservativeContribution, money(minimumLineCash)) < 0) holds.push({ code: 'BELOW_LINE_CASH', field: line.id })
      group.quantity += line.quantity; group.wholesale = add(group.wholesale, mul(cost.wholesaleExVat, money(line.quantity))); group.lines.push({ id: line.id, quantity: line.quantity })
      totalGross += BigInt(gross); totalQuantity += line.quantity
      integer(totalQuantity, 'billableQuantity', 1, 10000)
      totalNet = add(totalNet, net); totalCost = add(totalCost, lineCost)
      return { line, before, discount, gross, net, lineCost, itemFloor, conservativeContribution, minimumLineCash }
    })
    const allocations = new Map<string, { gross: number; net: Rational }>(), supplierOrders: SupplierOrderCalculation[] = []
    let deliveryGross = 0, deliveryQuoted = 0
    for (const [id, group] of groups) {
      if (!group.lines.length) fail('INVALID_DELIVERY_GROUP', 'supplierOrders.' + id)
      bounded(ceil(group.wholesale), id + '.wholesaleExVat')
      const delivery = deliveryFor(group.wholesale, input.supplierDeliveryTariff)
      if (delivery.status === 'boundary_hold') holds.push({ code: 'DELIVERY_THRESHOLD_BOUNDARY', field: 'supplierOrders.' + id })
      // Largest remainder by quantity, tie-broken by line ID: penny-exact and
      // stable under input reordering. No thresholds pool across group IDs.
      const shares = group.lines.map(line => ({ ...line, pence: Number(BigInt(delivery.gross) * BigInt(line.quantity) / BigInt(group.quantity)), remainder: Number(BigInt(delivery.gross) * BigInt(line.quantity) % BigInt(group.quantity)) }))
        .sort((a, b) => b.remainder - a.remainder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      let remainder = delivery.gross - shares.reduce((sum, line) => sum + line.pence, 0)
      for (const share of shares) {
        const gross = share.pence + (remainder > 0 ? 1 : 0); if (remainder > 0) remainder--
        allocations.set(share.id, { gross, net: delivery.gross ? mul(money(delivery.quoted), div(money(gross), money(delivery.gross))) : money(0) })
      }
      deliveryGross += delivery.gross; deliveryQuoted += delivery.quoted
      supplierOrders.push({ id, customerDeliveryId: group.source.customerDeliveryId, billableQuantity: group.quantity, wholesaleExVatPence: exact(group.wholesale), deliveryStatus: delivery.status, quotedExVatPence: delivery.quoted, grossCashPence: delivery.gross, economicPence: exact(delivery.economic) })
    }
    totalCost = add(totalCost, money(deliveryGross))
    const grossPence = bounded(totalGross, 'basketGross')
    bounded(ceil(totalCost), 'basketCost')
    const variableFee = mul(money(grossPence), rate(input.payment.variableBps))
    const contribution = sub(sub(sub(totalNet, totalCost), variableFee), money(input.payment.fixedPence))
    let minimumCash = bounded(BigInt(input.policy.minimumCashPerItemPence) * BigInt(totalQuantity), 'basketMinimumCash')
    let cashBasis: BasketCalculation['minimumCashBasis'] = 'derived_per_billable_item'
    if (input.orderCashPolicy !== undefined) {
      required(input.orderCashPolicy, 'orderCashPolicy'); approval(input.orderCashPolicy.approval, 'orderCashPolicy.approval', input.nowMs)
      integer(input.orderCashPolicy.minimumPence, 'orderCashPolicy.minimumPence', 1)
      minimumCash = input.orderCashPolicy.minimumPence; cashBasis = 'approved_per_order'
    }
    if (compare(contribution, mul(totalNet, rate(input.policy.minimumMarginBps))) < 0) holds.push({ code: 'BELOW_MINIMUM_MARGIN', field: 'basket' })
    if (compare(contribution, money(minimumCash)) < 0) holds.push({ code: 'BELOW_MINIMUM_CASH', field: 'basket' })
    const lines = intermediate.map(({ line, before, discount, gross, net, lineCost, itemFloor, conservativeContribution, minimumLineCash }): BasketLineCalculation => {
      const allocation = mul(money(input.payment.fixedPence), div(money(gross), money(grossPence)))
      const delivery = allocations.get(line.id)!
      return { id: line.id, supplierOrderId: line.supplierOrderId, quantity: line.quantity, grossBeforeDiscountPence: before, discountPence: discount,
        grossReceiptsPence: gross, netRevenuePence: exact(net), supplierDeliveryAllocatedQuotedExVatPence: exact(delivery.net), supplierDeliveryGrossCashPence: delivery.gross,
        supplierDeliveryEconomicPence: exact(money(delivery.gross)), allocatedFixedPaymentFeePence: exact(allocation),
        contributionPence: exact(sub(sub(sub(sub(net, lineCost), money(delivery.gross)), mul(money(gross), rate(input.payment.variableBps))), allocation)),
        conservativeItemListFloorPence: itemFloor, conservativeLineContributionPence: exact(conservativeContribution), minimumLineCashPence: minimumLineCash }
    })
    const shippingFixedFee = mul(money(input.payment.fixedPence), div(money(input.customerShipping.grossPence), money(grossPence)))
    const shippingVariableFee = mul(money(input.customerShipping.grossPence), rate(input.payment.variableBps))
    const calculation: BasketCalculation = {
      lines, supplierOrders, billableQuantity: totalQuantity, supplierDeliveryQuotedExVatPence: deliveryQuoted, supplierDeliveryGrossCashPence: deliveryGross,
      supplierDeliveryEconomicPence: exact(money(deliveryGross)), grossReceiptsPence: grossPence,
      customerShippingGrossPence: input.customerShipping.grossPence, customerShippingNetPence: exact(shippingNet),
      customerShippingAllocatedFixedFeePence: exact(shippingFixedFee), customerShippingVariableFeePence: exact(shippingVariableFee),
      customerShippingContributionPence: exact(sub(sub(shippingNet, shippingFixedFee), shippingVariableFee)),
      netRevenuePence: exact(totalNet), variablePaymentFeePence: exact(variableFee), fixedPaymentFeePence: input.payment.fixedPence,
      contributionPence: exact(contribution), contributionMargin: exact(div(contribution, totalNet)),
      minimumCashPence: minimumCash, minimumCashBasis: cashBasis, targetMarginMet: compare(contribution, mul(totalNet, rate(input.policy.targetMarginBps))) >= 0,
      dependencyValidity: validity([input.policy.approval, input.payment.approval, input.supplierDeliveryTariff.approval, input.customerShipping.approval,
        ...input.lines.map(line => line.cost.approval), ...input.supplierOrders.map(group => group.approval), ...(input.orderCashPolicy ? [input.orderCashPolicy.approval] : [])]),
      approvalVersions: { policy: input.policy.approval.version, payment: input.payment.approval.version, supplierDeliveryTariff: input.supplierDeliveryTariff.approval.version,
        supplierOrders: input.supplierOrders.map(group => ({ id: group.id, version: group.approval.version })), costs: input.lines.map(line => ({ lineId: line.id, version: line.cost.approval.version })), customerShipping: input.customerShipping.approval.version,
        ...(input.orderCashPolicy ? { orderCashPolicy: input.orderCashPolicy.approval.version } : {}) },
    }
    return { calculation, holds }
  })
}
