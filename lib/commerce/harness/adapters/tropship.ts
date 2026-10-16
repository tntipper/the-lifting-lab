import { planSupplierFeed } from '../../supplier-feed'
import { HarnessFeedError } from '../types'
import type { SavedFeed, SupplierAdapter, SupplierProduct } from '../types'

/** Reuses the existing strict parser; a rejected file never returns partial rows. */
export function parseTropShipFeed(feed: SavedFeed): SupplierProduct[] {
  if (feed.options.provenance.supplierId !== 'tropship' || feed.options.maxObservationAgeMs > 6 * 60 * 60 * 1000) {
    throw new HarnessFeedError(['FEED_POLICY_INVALID'])
  }
  const snapshot = planSupplierFeed(feed.bytes, feed.options)
  const codes = [...snapshot.issues, ...snapshot.rows.flatMap(row => row.issues)].map(issue => issue.code)
  const previous = feed.previousGoodRowCount
  if (previous !== undefined && (!Number.isSafeInteger(previous) || previous <= 0)) codes.push('PREVIOUS_ROW_COUNT_INVALID')
  if (previous !== undefined && snapshot.rows.length < previous * 0.7) codes.push('FEED_ROW_COUNT_DROP')
  if (snapshot.ingestionStatus !== 'READY_FOR_REVIEW' || codes.length) throw new HarnessFeedError([...new Set(codes)].sort())
  return snapshot.rows.map(row => ({
    sku: row.observations!.productCode!, stock: row.observations!.stockLevel!, costExVatPence: row.observations!.wholesaleQuotePence!,
    observedAt: feed.options.provenance.supplierObservation!.observedAt,
    ean: row.fields!.Barcode, size: row.fields!.Size, flavour: row.fields!.Flavour,
    name: row.fields!.TranslationName, brand: row.fields!.Brand,
  }))
}
export function createTropShipAdapter(readSavedFeed: () => Promise<SavedFeed>): SupplierAdapter {
  const read = async () => parseTropShipFeed(await readSavedFeed())
  return {
    id: 'tropship', fetchCatalogue: read,
    async fetchStockPrice(skus) {
      // Validate the whole file before filtering, including malformed unmapped rows and count-drop checks.
      const products = await read()
      const wanted = skus === undefined ? null : new Set(skus)
      return products.filter(row => wanted === null || wanted.has(row.sku)).map(row => ({
        sku: row.sku, stock: row.stock, costExVatPence: row.costExVatPence, observedAt: row.observedAt,
        ean: row.ean, size: row.size, flavour: row.flavour,
      }))
    },
    // TODO(Toby): bind confirmed order transport/auth/acknowledgement to the T09 worker; never claim submission here.
    async placeOrder() { return { status: 'rejected', reason: 'ORDER_SUBMISSION_NOT_IMPLEMENTED' } },
    // TODO(Toby/Lifty): confirm tracking transport + stable parcel ID + incremental shipped SKU quantities.
    // T10 job consumes injected normalised evidence; number-only feeds cannot prove shipment lines.
    async fetchTracking() { throw new Error('TODO(T10): confirmed supplier tracking transport is not implemented') },
  }
}
