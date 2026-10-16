import type { ProductMappingRow } from '../product-mapping'
import type { FeedOptions } from '../supplier-feed'

export type SupplierId = 'tropship' | 'bodypower' | 'supplier3'
export type StockPrice = { sku: string; stock: number; costExVatPence: number; observedAt: string; ean: string; size: string; flavour: string }
export type SupplierProduct = StockPrice & { name: string; brand: string }
export type DeliveryAddress = { name: string; address1: string; address2?: string; city: string; postcode: string; countryCode: string }
export type SupplierOrderRequest = { localKey: string; lines: { sku: string; quantity: number }[]; deliveryAddress?: DeliveryAddress }
export type SubmitResult = { status: 'submitted' | 'accepted' | 'rejected' | 'uncertain'; supplierRef?: string; reason?: string }
/** One immutable parcel, with incremental (not cumulative) shipped quantities.
 * Supplier normalisation must provide a stable shipment ID and actual shipped lines;
 * tracking-number-only feeds must never imply that every ordered line shipped. */
export type TrackingUpdate = {
  supplierRef: string; shipmentId: string; trackingNumber: string; carrier: string;
  shippedLines: { sku: string; quantity: number }[]
}
export interface SupplierAdapter {
  id: SupplierId
  fetchCatalogue(): Promise<SupplierProduct[]>
  fetchStockPrice(skus?: string[]): Promise<StockPrice[]>
  placeOrder(req: SupplierOrderRequest): Promise<SubmitResult>
  fetchTracking(refs: string[]): Promise<TrackingUpdate[]>
}
/** Bytes and supplier observation evidence supplied by the caller; no SFTP implementation in T08. */
export type SavedFeed = { bytes: Uint8Array; options: FeedOptions; previousGoodRowCount?: number }
/** feedSize is the reviewed literal supplier Size, never inferred from a title. */
export type SyncMapping = { id: string; row: ProductMappingRow; feedSize: string }
export type VariantState = { variantId: string; stock: number; pricePence: number }
export type SyncDiff = {
  mappingId: string; variantId: string; field: 'inventory' | 'price' | 'cost_ex_vat';
  old: number; new: number; applied: boolean; reason: string
}
export type HarnessAlert = { code: string; issueCodes?: string[] }
export type HarnessRun = {
  status: 'dry_run' | 'completed' | 'skipped' | 'failed' | 'uncertain'; supplier: SupplierId;
  startedAt: string; finishedAt: string; diffs: SyncDiff[]; alerts: HarnessAlert[]
}
export class HarnessFeedError extends Error {
  readonly codes: string[]
  constructor(codes: string[]) { super('Supplier feed rejected'); this.name = 'HarnessFeedError'; this.codes = codes }
}
