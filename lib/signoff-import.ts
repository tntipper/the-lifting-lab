// @ts-expect-error Explicit extension required by Node's type-strip runtime.
import { canonicalShopifyId, validateProductMappings } from './commerce/product-mapping.ts'
import type { ProductMappingRow } from './commerce/product-mapping'
import type { ApprovedPrice } from './commerce/catalogue-eligibility'
// @ts-expect-error Explicit extension required by Node's type-strip runtime.
import { signoffMargin } from './signoff-margin.ts'

export type SignoffRow = { row: number; cells: Record<string, string>; formulaFields: string[] }
export type MappingCandidate = ProductMappingRow & { variant_title?: string }
/** Proposal fields reuse ApprovedPrice, without inventing live observation or review evidence. */
export type SignoffPrice = Pick<ApprovedPrice, 'shopifyVariantId' | 'currency' | 'amountPence'>
export type PaymentFees = { fixedPence: number; variableBps: number }
function wholeUnits(value: string, scale: number, max: number): number | null {
  if (!/^\d{1,7}(?:\.\d+)?$/.test(value)) return null
  const units = Number(value) * scale, rounded = Math.round(units)
  return Number.isSafeInteger(rounded) && rounded <= max && Math.abs(units - rounded) <= 1e-6 ? rounded : null
}
export function gbpPence(value: string): number | null {
  return wholeUnits(value, 100, 1_000_000_000)
}
const text = (row: Record<string, string>, key: string) => (row[key] ?? '').trim()

export function importSignoff(rows: SignoffRow[], candidates: MappingCandidate[], fees?: PaymentFees) {
  const diagnostics: { row: number; decision: string; reasons: string[]; errors: string[]; exported: boolean }[] = []
  const approvedVariants = new Map<string, number[]>()
  const proposed: { row: number; mapping: ProductMappingRow; price: SignoffPrice; margin: ReturnType<typeof signoffMargin> }[] = []
  for (const source of rows) {
    const c = source.cells, decision = text(c, 'toby_signoff') || 'Undecided', errors: string[] = []
    const reasons = ['toby_notes', 'missing_reason', 'match_notes'].map(key => text(c, key)).filter(Boolean)
    if (!['Approved', 'Rejected', 'Query', 'Undecided'].includes(decision)) errors.push('INVALID_SIGNOFF')
    const handle = text(c, 'handle'), variant = text(c, 'variant_title')
    const matches = candidates.filter(item => item.status === 'store' && item.handle === handle && item.variant_title === variant)
    if (!handle) errors.push('MISSING_HANDLE')
    if (!variant) errors.push('MISSING_VARIANT')
    if (matches.length !== 1) errors.push(matches.length ? 'AMBIGUOUS_MAPPING' : 'MISSING_MAPPING')
    const mapping = matches.length === 1 ? structuredClone(matches[0]) : null
    const price = gbpPence(text(c, 'store_price_gbp')), cost = gbpPence(text(c, 'trade_cost_ex_vat'))
    const delivery = gbpPence(text(c, 'delivery_cost_per_order')), shipping = gbpPence(text(c, 'customer_shipping'))
    const vat = wholeUnits(text(c, 'vat_rate'), 10000, 10000)
    const integer = (key: string) => /^\d{1,10}$/.test(text(c, key)) ? Number(text(c, key)) : NaN
    const payment = fees ?? { fixedPence: integer('payment_fixed_pence'), variableBps: integer('payment_variable_bps') }
    if (price === null || price <= 0) errors.push('MISSING_OR_INVALID_PRICE')
    if (cost === null || cost <= 0) errors.push('MISSING_OR_INVALID_COST')
    if (delivery === null || shipping === null) errors.push('MISSING_OR_INVALID_SHIPPING')
    if (vat === null || vat > 10000) errors.push('MISSING_OR_INVALID_SUPPLIER_VAT')
    if (!Number.isSafeInteger(payment.fixedPence) || payment.fixedPence < 0 || payment.fixedPence > 1_000_000_000 ||
        !Number.isSafeInteger(payment.variableBps) || payment.variableBps < 0 || payment.variableBps > 10000) errors.push('MISSING_OR_INVALID_PAYMENT_FEES')
    const inputs = ['toby_signoff', 'handle', 'variant_title', 'store_price_gbp', 'trade_cost_ex_vat', 'vat_rate',
      'delivery_cost_per_order', 'customer_shipping', ...(fees ? [] : ['payment_fixed_pence', 'payment_variable_bps'])]
    if (source.formulaFields.some(field => inputs.includes(field))) errors.push('FORMULA_INPUT_NOT_SUPPORTED')
    if (mapping) {
      // Retain only the saved table fields; workbook approval never activates runtime behaviour.
      const saved: ProductMappingRow = { comparison_product_id: mapping.comparison_product_id, status: 'store',
        shopify_product_id: canonicalShopifyId(mapping.shopify_product_id, 'Product'),
        shopify_variant_id: canonicalShopifyId(mapping.shopify_variant_id, 'ProductVariant'), handle: mapping.handle,
        supplier: mapping.supplier, supplier_sku: mapping.supplier_sku, ean: mapping.ean ?? null,
        pack: mapping.pack ?? null, flavour: mapping.flavour ?? null,
        cost_ex_vat: cost === null ? text(c, 'trade_cost_ex_vat') : String(cost / 100),
        price_auto: false, active: false, approval_reference: decision === 'Approved' ? `toby-signoff:worksheet-row-${source.row}` : null }
      if (decision === 'Approved' && saved.shopify_variant_id) {
        const group = approvedVariants.get(saved.shopify_variant_id) ?? []
        group.push(source.row); approvedVariants.set(saved.shopify_variant_id, group)
      }
      errors.push(...validateProductMappings([saved]).map(issue => issue.code))
      if (!errors.length && decision === 'Approved') proposed.push({ row: source.row, mapping: saved,
        price: { shopifyVariantId: saved.shopify_variant_id!, currency: 'GBP', amountPence: price! },
        margin: signoffMargin({ pricePence: price!, tradeCostExVatPence: cost!, supplierVatBps: vat!,
          deliveryCostPence: delivery!, customerShippingPence: shipping!, paymentFixedPence: payment.fixedPence,
          paymentVariableBps: payment.variableBps }) })
    }
    diagnostics.push({ row: source.row, decision, reasons, errors: [...new Set(errors)], exported: false })
  }
  // Hold every member of a duplicate group; never silently choose the first approval.
  const duplicates = new Set([...approvedVariants.values()].filter(group => group.length > 1).flat())
  for (const d of diagnostics) if (duplicates.has(d.row)) d.errors.push('DUPLICATE_VARIANT')
  const accepted = proposed.filter(p => !duplicates.has(p.row))
  for (const d of diagnostics) d.exported = accepted.some(p => p.row === d.row)
  return { mappings: accepted.map(p => p.mapping), prices: accepted.map(p => p.price),
    margins: accepted.map(p => ({ row: p.row, ...p.margin })), diagnostics,
    counts: { rows: rows.length, approved: diagnostics.filter(d => d.decision === 'Approved').length,
      rejected: diagnostics.filter(d => d.decision === 'Rejected').length, query: diagnostics.filter(d => d.decision === 'Query').length,
      undecided: diagnostics.filter(d => d.decision === 'Undecided').length,
      exported: accepted.length, invalidRows: diagnostics.filter(d => d.errors.length).length } }
}

export function signoffReport(result: ReturnType<typeof importSignoff>) {
  const escape = (s: string) => s.replaceAll('|', '\\|').replace(/[\r\n]/g, ' ')
  return ['# Sign-off import dry-run', '', 'FACT: Local proposals only; no live mapping, price or workbook changes.',
    'FACT: Output VAT is zero. Unrecoverable supplier VAT is included in trade cost. Cached workbook margins are ignored.',
    'GAP: Workbook approval supplies no fresh stock, price observation or ExactMapping evidence; runtime switches remain OFF.',
    '', ...Object.entries(result.counts).map(([key, value]) => `- ${key}: ${value}`), '',
    '| Worksheet row | Sign-off | Exportable | Validation errors | Reasons |', '| --- | --- | --- | --- | --- |',
    ...result.diagnostics.map(d => `| ${d.row} | ${escape(d.decision)} | ${d.exported ? 'yes' : 'no'} | ${d.errors.join(', ')} | ${escape(d.reasons.join('; '))} |`), ''].join('\n')
}
