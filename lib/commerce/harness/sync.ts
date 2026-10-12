import { presentStoreLinkMapping, validateProductMappings } from '../product-mapping'
import { HarnessFeedError } from './types'
import type { HarnessRun, StockPrice, SupplierAdapter, SyncDiff, SyncMapping, VariantState } from './types'

export type SyncDependencies = {
  adapter: SupplierAdapter; mappings: readonly SyncMapping[]; variants: readonly VariantState[];
  now?: () => number; writeEnabled?: string;
  /** TODO(T05): approved saved mapping loader. Historical CSVs must not be wired here. */
  /** TODO(Toby/Lifty): supply reviewed pricing-policy/commercial-burden calculation, not wholesale as retail. */
  proposePrice?: (mapping: SyncMapping, quote: StockPrice) => number | null;
  /** TODO: bind inventory to existing shopify-admin identity/reconciliation adapter; price needs approved writer. */
  apply?: (diff: SyncDiff, mapping: SyncMapping) => Promise<'applied' | 'rejected' | 'uncertain'>;
  /** Only called behind the same exact write flag; default dry runs do not persist anything. */
  record?: (run: HarnessRun) => Promise<void>
}
const validAmount = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000

export async function syncStockPrice(deps: SyncDependencies): Promise<HarnessRun> {
  const now = deps.now ?? Date.now, started = now(), writable = deps.writeEnabled === 'true'
  const result: HarnessRun = { status: writable ? 'completed' : 'dry_run', supplier: deps.adapter.id,
    startedAt: new Date(started).toISOString(), finishedAt: '', diffs: [], alerts: [] }
  const finish = async () => {
    result.finishedAt = new Date(now()).toISOString()
    if (writable && deps.record) {
      try { await deps.record(structuredClone(result)) } catch { result.status = 'failed'; result.alerts.push({ code: 'RUN_RECORD_FAILED' }) }
    }
    return result
  }
  const skip = (code: string, issueCodes?: string[]) => {
    result.status = 'skipped'; result.alerts.push({ code, ...(issueCodes ? { issueCodes } : {}) }); return finish()
  }
  if (validateProductMappings(deps.mappings.map(m => m.row)).length ||
      new Set(deps.mappings.map(m => m.id)).size !== deps.mappings.length || deps.mappings.some(m => !m.id.trim())) return skip('MAPPING_INVALID')
  let quotes: StockPrice[]
  try { quotes = await deps.adapter.fetchStockPrice() }
  catch (error) { return skip(error instanceof HarnessFeedError ? 'FEED_REJECTED' : 'FEED_READ_FAILED', error instanceof HarnessFeedError ? error.codes : undefined) }
  const bySku = new Map(quotes.map(q => [q.sku, q]))
  if (bySku.size !== quotes.length || quotes.some(q => !validAmount(q.stock) || !validAmount(q.costExVatPence) || q.costExVatPence === 0 ||
      !Number.isFinite(Date.parse(q.observedAt)) || Date.parse(q.observedAt) > started || started - Date.parse(q.observedAt) >= 6 * 3600_000)) return skip('STOCK_PRICE_INVALID')
  const variants = new Map(deps.variants.map(v => [v.variantId, v]))
  if (variants.size !== deps.variants.length || deps.variants.some(v => !validAmount(v.stock) || !validAmount(v.pricePence))) return skip('VARIANT_STATE_INVALID')
  for (const mapping of deps.mappings) {
    const row = mapping.row
    if (row.supplier !== deps.adapter.id || row.active !== true || row.status !== 'store') continue
    const approved = presentStoreLinkMapping(row, started)
    if (!approved) { result.alerts.push({ code: 'MAPPING_REVIEW_REQUIRED' }); continue }
    const quote = bySku.get(row.supplier_sku!), variant = variants.get(approved.shopifyVariantId)
    if (!quote || !variant) { result.alerts.push({ code: !quote ? 'MAPPED_SKU_MISSING' : 'VARIANT_STATE_MISSING' }); continue }
    if (!mapping.feedSize || quote.size !== mapping.feedSize || quote.ean !== row.ean || quote.flavour !== row.flavour) {
      result.alerts.push({ code: 'FEED_IDENTITY_MISMATCH' }); continue
    }
    const add = (field: SyncDiff['field'], old: number, value: number, reason: string) => {
      if (old !== value) result.diffs.push({ mappingId: mapping.id, variantId: variant.variantId, field, old, new: value, applied: false, reason })
    }
    add('inventory', variant.stock, quote.stock, 'ready')
    // Supplier cost is private review evidence; it never becomes a customer price or an automatic mapping write.
    add('cost_ex_vat', Number(row.cost_ex_vat), quote.costExVatPence / 100, row.price_auto === true ? 'cost_review_required' : 'price_locked')
    if (row.price_auto === true) {
      let price: number | null = null
      try { price = deps.proposePrice?.(mapping, quote) ?? null } catch { result.alerts.push({ code: 'PRICE_POLICY_FAILED' }) }
      if (price === null || !validAmount(price) || price === 0) result.alerts.push({ code: 'PRICE_POLICY_REQUIRED' })
      else add('price', variant.pricePence, price, 'ready')
    }
  }
  // Plan the complete run first. No retry or subsequent writes after an uncertain/failed write.
  for (const diff of result.diffs) {
    if (diff.field === 'cost_ex_vat') continue
    if (!writable) { diff.reason = 'dry_run'; continue }
    if (!deps.apply) {
      diff.reason = 'writer_not_configured'; result.status = 'skipped'
      if (!result.alerts.some(alert => alert.code === 'WRITER_NOT_CONFIGURED')) result.alerts.push({ code: 'WRITER_NOT_CONFIGURED' })
      continue
    }
    try {
      const outcome = await deps.apply(structuredClone(diff), deps.mappings.find(m => m.id === diff.mappingId)!)
      diff.applied = outcome === 'applied'; diff.reason = outcome
      if (outcome !== 'applied') { result.status = outcome === 'uncertain' ? 'uncertain' : 'failed'; break }
    } catch { diff.reason = 'uncertain'; result.status = 'uncertain'; break }
  }
  if (result.alerts.length && result.status === 'completed') result.status = 'skipped'
  return finish()
}
