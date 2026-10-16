/**
 * Shadow-only replay of explicit commercial costs. This does not approve a
 * checkout or infer any allocation that has not been supplied per line.
 */
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { evaluateBasket, MAX_PENCE, type BasketInput, type ExactPence, type Hold } from './pricing-policy.ts'

type Rational = { n: bigint; d: bigint }
const ZERO = BigInt(0), ONE = BigInt(1), SCALE = BigInt(10_000)

export type CommercialBurdenAllocation = {
  lineId: string
  affiliateCommissionPence: number
  campaignSpendPence: number
  sponsorshipPence: number
  platformCostPence: number
}

export type CommercialBurdenInput = {
  basket: BasketInput
  allocations: CommercialBurdenAllocation[]
}

export type CommercialBurdenHoldCode =
  | 'BASE_BASKET_HELD' | 'MISSING_ALLOCATION' | 'INVALID_ALLOCATION'
  | 'DUPLICATE_ALLOCATION' | 'EXTRA_ALLOCATION' | 'OVERFLOW'
  | 'BELOW_LINE_MARGIN' | 'BELOW_LINE_CASH' | 'BELOW_MINIMUM_MARGIN'
  | 'BELOW_MINIMUM_CASH'
export type CommercialBurdenHold = { code: CommercialBurdenHoldCode | Hold['code']; field: string }
export type CommercialAmounts = Omit<CommercialBurdenAllocation, 'lineId'> & { totalPence: number }
export type CommercialMarginCheck = {
  netRevenuePence: ExactPence
  contributionPence: ExactPence
  minimumMarginMet: boolean
  minimumCashPence: number
  minimumCashMet: boolean
  targetMarginMet: boolean
  mathematicalStatus: 'PASS' | 'HOLD'
}
export type CommercialBurdenLine = CommercialMarginCheck & { id: string; burdens: CommercialAmounts }
export type CommercialBurdenCalculation = {
  lines: CommercialBurdenLine[]
  order: CommercialMarginCheck & { burdens: CommercialAmounts }
}
export type CommercialBurdenAssessment = {
  /** Deliberately disabled: a mathematical result never grants authority. */
  eligible: false
  liveEnabled: false
  checkoutVerified: false
  shopifyAllocationVerified: false
  mathematicalStatus: 'PASS' | 'HOLD'
  holds: CommercialBurdenHold[]
  calculation?: CommercialBurdenCalculation
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < ZERO ? -a : a
  b = b < ZERO ? -b : b
  while (b !== ZERO) { const next = a % b; a = b; b = next }
  return a
}
function rational(n: bigint, d = ONE): Rational {
  if (d <= ZERO) throw new Error('invalid rational denominator')
  const divisor = gcd(n, d)
  return { n: n / divisor, d: d / divisor }
}
function exact(value: Rational): ExactPence { return { numerator: value.n.toString(), denominator: value.d.toString() } }
function fromExact(value: ExactPence): Rational | null {
  if (!value || typeof value.numerator !== 'string' || typeof value.denominator !== 'string') return null
  try {
    const n = BigInt(value.numerator), d = BigInt(value.denominator)
    return d > ZERO ? rational(n, d) : null
  } catch { return null }
}
function subtract(value: Rational, pence: number): Rational { return rational(value.n - BigInt(pence) * value.d, value.d) }
function compare(a: Rational, b: Rational): number { const result = a.n * b.d - b.n * a.d; return result < ZERO ? -1 : result > ZERO ? 1 : 0 }
function pence(value: number): Rational { return rational(BigInt(value)) }
function validInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_PENCE }
function emptyAmounts(): CommercialAmounts { return { affiliateCommissionPence: 0, campaignSpendPence: 0, sponsorshipPence: 0, platformCostPence: 0, totalPence: 0 } }
function amounts(value: unknown): CommercialAmounts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (!validInteger(record.affiliateCommissionPence) || !validInteger(record.campaignSpendPence) || !validInteger(record.sponsorshipPence) || !validInteger(record.platformCostPence)) return null
  const total = BigInt(record.affiliateCommissionPence) + BigInt(record.campaignSpendPence) + BigInt(record.sponsorshipPence) + BigInt(record.platformCostPence)
  if (total > BigInt(MAX_PENCE)) return null
  return { affiliateCommissionPence: record.affiliateCommissionPence, campaignSpendPence: record.campaignSpendPence, sponsorshipPence: record.sponsorshipPence, platformCostPence: record.platformCostPence, totalPence: Number(total) }
}
function addAmounts(left: CommercialAmounts, right: CommercialAmounts): CommercialAmounts | null {
  const total = BigInt(left.totalPence) + BigInt(right.totalPence)
  if (total > BigInt(MAX_PENCE)) return null
  return {
    affiliateCommissionPence: left.affiliateCommissionPence + right.affiliateCommissionPence,
    campaignSpendPence: left.campaignSpendPence + right.campaignSpendPence,
    sponsorshipPence: left.sponsorshipPence + right.sponsorshipPence,
    platformCostPence: left.platformCostPence + right.platformCostPence,
    totalPence: Number(total),
  }
}
function held(holds: CommercialBurdenHold[], code: CommercialBurdenHoldCode, field: string): void { holds.push({ code, field }) }
function result(holds: CommercialBurdenHold[], calculation?: CommercialBurdenCalculation): CommercialBurdenAssessment {
  return { eligible: false, liveEnabled: false, checkoutVerified: false, shopifyAllocationVerified: false,
    mathematicalStatus: holds.length ? 'HOLD' : 'PASS', holds, ...(calculation ? { calculation } : {}) }
}

/** Evaluates supplied per-line costs only; this function is intentionally never eligible. */
export function evaluateCommercialBurden(input: unknown): CommercialBurdenAssessment {
  const holds: CommercialBurdenHold[] = []
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return result([{ code: 'INVALID_ALLOCATION', field: 'input' }])
    const source = input as { basket?: unknown; allocations?: unknown }
    const base = evaluateBasket(source.basket as BasketInput)
    if (!base.eligible || !base.calculation) {
      held(holds, 'BASE_BASKET_HELD', 'basket')
      holds.push(...base.holds)
      return result(holds)
    }
    if (!Array.isArray(source.allocations)) return result([{ code: 'MISSING_ALLOCATION', field: 'allocations' }])
    const expected = new Set(base.calculation.lines.map(line => line.id))
    const seen = new Map<string, CommercialAmounts>()
    for (let index = 0; index < source.allocations.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(source.allocations, index)) { held(holds, 'INVALID_ALLOCATION', `allocations[${index}]`); continue }
      const allocation = source.allocations[index]
      if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation) || typeof (allocation as { lineId?: unknown }).lineId !== 'string' || !(allocation as { lineId: string }).lineId.trim()) { held(holds, 'INVALID_ALLOCATION', `allocations[${index}]`); continue }
      const lineId = (allocation as { lineId: string }).lineId
      const value = amounts(allocation)
      if (!value) { held(holds, 'INVALID_ALLOCATION', `allocations.${lineId}`); continue }
      if (seen.has(lineId)) { held(holds, 'DUPLICATE_ALLOCATION', `allocations.${lineId}`); continue }
      if (!expected.has(lineId)) { held(holds, 'EXTRA_ALLOCATION', `allocations.${lineId}`); continue }
      seen.set(lineId, value)
    }
    for (const id of expected) if (!seen.has(id)) held(holds, 'MISSING_ALLOCATION', `allocations.${id}`)
    if (holds.length) return result(holds)

    let total = emptyAmounts()
    const lines: CommercialBurdenLine[] = []
    for (const baseLine of base.calculation.lines) {
      const burdens = seen.get(baseLine.id)!
      const nextTotal = addAmounts(total, burdens)
      if (!nextTotal) return result([{ code: 'OVERFLOW', field: 'allocations.totalPence' }])
      total = nextTotal
      const contribution = fromExact(baseLine.conservativeLineContributionPence)
      const netRevenue = fromExact(baseLine.netRevenuePence)
      if (!contribution || !netRevenue) return result([{ code: 'INVALID_ALLOCATION', field: `basket.lines.${baseLine.id}` }])
      const afterBurden = subtract(contribution, burdens.totalPence)
      const minimumMarginMet = compare(afterBurden, rational(netRevenue.n * BigInt((source.basket as BasketInput).policy.minimumMarginBps), netRevenue.d * SCALE)) >= 0
      const minimumCashMet = compare(afterBurden, pence(baseLine.minimumLineCashPence)) >= 0
      const targetMarginMet = compare(afterBurden, rational(netRevenue.n * BigInt((source.basket as BasketInput).policy.targetMarginBps), netRevenue.d * SCALE)) >= 0
      if (!minimumMarginMet) held(holds, 'BELOW_LINE_MARGIN', baseLine.id)
      if (!minimumCashMet) held(holds, 'BELOW_LINE_CASH', baseLine.id)
      lines.push({ id: baseLine.id, burdens, netRevenuePence: exact(netRevenue), contributionPence: exact(afterBurden), minimumMarginMet, minimumCashPence: baseLine.minimumLineCashPence, minimumCashMet, targetMarginMet, mathematicalStatus: minimumMarginMet && minimumCashMet ? 'PASS' : 'HOLD' })
    }
    const orderContribution = fromExact(base.calculation.contributionPence), orderRevenue = fromExact(base.calculation.netRevenuePence)
    if (!orderContribution || !orderRevenue) return result([{ code: 'INVALID_ALLOCATION', field: 'basket.calculation' }])
    const afterBurden = subtract(orderContribution, total.totalPence)
    const basket = source.basket as BasketInput
    const minimumMarginMet = compare(afterBurden, rational(orderRevenue.n * BigInt(basket.policy.minimumMarginBps), orderRevenue.d * SCALE)) >= 0
    const minimumCashMet = compare(afterBurden, pence(base.calculation.minimumCashPence)) >= 0
    const targetMarginMet = compare(afterBurden, rational(orderRevenue.n * BigInt(basket.policy.targetMarginBps), orderRevenue.d * SCALE)) >= 0
    if (!minimumMarginMet) held(holds, 'BELOW_MINIMUM_MARGIN', 'basket')
    if (!minimumCashMet) held(holds, 'BELOW_MINIMUM_CASH', 'basket')
    return result(holds, { lines, order: { burdens: total, netRevenuePence: exact(orderRevenue), contributionPence: exact(afterBurden), minimumMarginMet, minimumCashPence: base.calculation.minimumCashPence, minimumCashMet, targetMarginMet, mathematicalStatus: minimumMarginMet && minimumCashMet ? 'PASS' : 'HOLD' } })
  } catch {
    return result([{ code: 'INVALID_ALLOCATION', field: 'input' }])
  }
}
