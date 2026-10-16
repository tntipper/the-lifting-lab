import type { FailureReporter } from './manual-queue'
import { createHash } from 'node:crypto'
import { SHOPIFY_ADMIN_API_VERSION } from '../shopify-admin'
import type { SupplierAdapter, SupplierId, TrackingUpdate } from './types'

export type TrackingOrderLine = {
  localKey: string; shop: string; orderId: string; lineId: string; supplier: SupplierId;
  supplierRef: string | null; sku: string; quantity: number; fulfilledQuantity: number;
  status: string
}
export type FulfillmentSnapshot = {
  apiVersion: string; shop: string; orderId: string; complete: boolean; cancelled: boolean; refunded: boolean;
  /** Fresh, fully paginated order + fulfillment-order lines. canFulfill means CREATE_FULFILLMENT supported. */
  lines: { lineId: string; fulfillmentOrderId: string; fulfillmentOrderLineItemId: string;
    locationId: string; remainingQuantity: number; canFulfill: boolean }[]
}
export type FulfillmentRequest = {
  apiVersion: typeof SHOPIFY_ADMIN_API_VERSION; operationName: 'fulfillmentCreate'; query: string;
  variables: { fulfillment: { notifyCustomer: true; trackingInfo: { number: string; company: string };
    lineItemsByFulfillmentOrder: { fulfillmentOrderId: string; fulfillmentOrderLineItems: { id: string; quantity: number }[] }[] } }
}
export type TrackingClaim = {
  key: string; fingerprint: string; shop: string; orderId: string;
  lines: { localKey: string; quantity: number }[]; request: FulfillmentRequest
}
export interface TrackingStore {
  /** Only submitted/accepted batches with outstanding quantities; include ALL lines of each selected batch. */
  listCandidates(shop: string): Promise<TrackingOrderLine[]>
  lookup(key: string, fingerprint: string): Promise<'new' | 'duplicate' | 'conflict' | 'unresolved'>
  /** Commit a unique spent marker before returning claimed. Atomically lock order/lines and check
   * quantities minus completed AND unresolved attempts. Concurrent jobs cannot claim the same units. */
  claim(plan: TrackingClaim): Promise<'claimed' | 'duplicate' | 'conflict' | 'blocked'>
  /** Atomic receipt + completed quantities. A failed save leaves the spent marker in progress;
   * uncertain/in-progress results require reconciliation, NEVER automatic replay. */
  finish(key: string, result: { status: 'completed' | 'rejected' | 'uncertain'; fulfillmentId?: string }): Promise<void>
}
export type TrackingDependencies = {
  reportFailure?: FailureReporter; runReference?: string;
  writeEnabled?: string; shop: string; store: TrackingStore;
  adapters: Partial<Record<SupplierId, Pick<SupplierAdapter, 'id' | 'fetchTracking'>>>;
  shopify: {
    readFulfillmentOrder(orderId: string): Promise<FulfillmentSnapshot>;
    /** Inject existing restricted server transport (2026-07); no implicit network/default client. */
    fulfillmentCreate(request: FulfillmentRequest): Promise<unknown>
  }; timeoutMs?: number
}
export type TrackingRun = { status: 'disabled' | 'completed' | 'held'; created: number; duplicates: number; codes: string[] }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const gid = (kind: string, value: string) => new RegExp(`^gid://shopify/${kind}/[1-9][0-9]*$`).test(value)
const positive = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= 2_147_483_647
const text = (s: string) => typeof s === 'string' && s.trim() === s && s.length > 0 && s.length <= 128 && !/[\u0000-\u001f\u007f]/.test(s)
const query = `mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id } userErrors { field message } }
}`
/** Exact shipped SKU -> stored order line -> fresh fulfillment-order line ID; never use variant IDs. */
export function buildTrackingClaim(lines: TrackingOrderLine[], shipment: TrackingUpdate, snapshot: FulfillmentSnapshot): TrackingClaim {
  if (!lines.length || !text(shipment.shipmentId) || !text(shipment.supplierRef) || !text(shipment.trackingNumber) || !text(shipment.carrier) ||
      !Array.isArray(shipment.shippedLines) || !shipment.shippedLines.length ||
      new Set(shipment.shippedLines.map(l => l.sku)).size !== shipment.shippedLines.length ||
      shipment.shippedLines.some(l => !text(l.sku) || !positive(l.quantity))) throw new Error('SHIPMENT_DATA_INVALID')
  const first = lines[0]
  if (lines.some(l => l.shop !== first.shop || l.orderId !== first.orderId || l.supplier !== first.supplier || l.supplierRef !== shipment.supplierRef ||
    !['submitted', 'accepted'].includes(l.status) || !gid('Order', l.orderId) || !gid('LineItem', l.lineId) ||
    !/^[a-f0-9]{64}$/.test(l.localKey) || !positive(l.quantity) || !Number.isSafeInteger(l.fulfilledQuantity) || l.fulfilledQuantity < 0 || l.fulfilledQuantity > l.quantity)) {
    throw new Error('SUPPLIER_ORDER_INVALID')
  }
  if (!snapshot || snapshot.apiVersion !== SHOPIFY_ADMIN_API_VERSION || snapshot.shop !== first.shop || snapshot.orderId !== first.orderId ||
    snapshot.complete !== true || snapshot.cancelled !== false || snapshot.refunded !== false || !Array.isArray(snapshot.lines) ||
    new Set(snapshot.lines.map(l => l.fulfillmentOrderLineItemId)).size !== snapshot.lines.length) throw new Error('FULFILLMENT_SNAPSHOT_INVALID')
  const selected: TrackingClaim['lines'] = [], groups = new Map<string, { id: string; quantity: number }[]>(), locations = new Set<string>()
  for (const shipped of [...shipment.shippedLines].sort((a, b) => a.sku.localeCompare(b.sku))) {
    const matches = lines.filter(l => l.sku === shipped.sku)
    // Repeated SKU across order lines needs supplier line evidence; never guess which line shipped.
    if (matches.length !== 1) throw new Error('SHIPPED_LINE_AMBIGUOUS')
    const line = matches[0]
    if (shipped.quantity > line.quantity - line.fulfilledQuantity) throw new Error('SHIPPED_QUANTITY_EXCEEDED')
    const targets = snapshot.lines.filter(l => l.lineId === line.lineId && l.remainingQuantity > 0)
    if (targets.length !== 1) throw new Error('FULFILLMENT_LINE_AMBIGUOUS')
    const target = targets[0]
    if (target.canFulfill !== true || !gid('FulfillmentOrder', target.fulfillmentOrderId) || !gid('FulfillmentOrderLineItem', target.fulfillmentOrderLineItemId) ||
      !gid('Location', target.locationId) || !positive(target.remainingQuantity) || shipped.quantity > target.remainingQuantity) throw new Error('FULFILLMENT_LINE_UNAVAILABLE')
    selected.push({ localKey: line.localKey, quantity: shipped.quantity }); locations.add(target.locationId)
    const items = groups.get(target.fulfillmentOrderId) ?? []
    items.push({ id: target.fulfillmentOrderLineItemId, quantity: shipped.quantity }); groups.set(target.fulfillmentOrderId, items)
  }
  // Shopify requires one order and one location per fulfillmentCreate. Multi-location review is explicit.
  if (locations.size !== 1) throw new Error('SHIPMENT_MULTIPLE_LOCATIONS')
  const identity = shipmentIdentity(first, shipment)
  return { ...identity, shop: first.shop, orderId: first.orderId, lines: selected,
    request: { apiVersion: SHOPIFY_ADMIN_API_VERSION, operationName: 'fulfillmentCreate', query, variables: { fulfillment: {
      notifyCustomer: true, trackingInfo: { number: shipment.trackingNumber, company: shipment.carrier },
      lineItemsByFulfillmentOrder: [...groups].map(([fulfillmentOrderId, fulfillmentOrderLineItems]) => ({ fulfillmentOrderId, fulfillmentOrderLineItems })),
    } } } }
}
function shipmentIdentity(line: TrackingOrderLine, shipment: TrackingUpdate) {
  return { key: hash([line.shop, line.orderId, line.supplier, shipment.supplierRef, shipment.shipmentId]),
    fingerprint: hash([shipment.trackingNumber, shipment.carrier,
      [...shipment.shippedLines].sort((a, b) => a.sku.localeCompare(b.sku)).map(l => [l.sku, l.quantity])]) }
}
function receipt(value: unknown): { status: 'completed' | 'rejected' | 'uncertain'; fulfillmentId?: string } {
  const response = value as { errors?: unknown; data?: { fulfillmentCreate?: { fulfillment?: { id?: string }; userErrors?: unknown[] } } } | null
  const payload = response?.data?.fulfillmentCreate
  if (response?.errors || !payload || !Array.isArray(payload.userErrors)) return { status: 'uncertain' }
  if (payload.userErrors.length && !payload.fulfillment) return { status: 'rejected' }
  if (!payload.userErrors.length && payload.fulfillment?.id && gid('Fulfillment', payload.fulfillment.id)) return { status: 'completed', fulfillmentId: payload.fulfillment.id }
  return { status: 'uncertain' }
}
async function boundedWrite(deps: TrackingDependencies, request: FulfillmentRequest, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return receipt(await Promise.race([Promise.resolve().then(() => deps.shopify.fulfillmentCreate(request)),
    new Promise(resolve => { timer = setTimeout(() => resolve(null), ms) })])) }
  catch { return { status: 'uncertain' as const } }
  finally { if (timer) clearTimeout(timer) }
}
/** Scheduled-job core. Flag OFF means no reads, supplier calls, persistence or Shopify writes. */
export async function runTracking(deps: TrackingDependencies): Promise<TrackingRun> {
  const result: TrackingRun = { status: 'disabled', created: 0, duplicates: 0, codes: [] }
  if (deps.writeEnabled !== 'true') return result
  result.status = 'completed'
  let reviewReference = `${deps.shop}:${deps.runReference ?? new Date().toISOString()}`
  let reviewOrderId: string | undefined, reviewSupplier: SupplierId | undefined
  const runReference = reviewReference
  const hold = async (code: string) => {
    result.status = 'held'; result.codes.push(code)
    const reported = await deps.reportFailure?.({ job: 'tracking', code, reference: reviewReference, orderId: reviewOrderId, supplier: reviewSupplier })
    if (reported === 'queue_failed' || reported === 'alert_failed') result.codes.push(reported === 'queue_failed' ? 'MANUAL_QUEUE_FAILED' : 'ALERT_SEND_FAILED')
  }
  const timeout = deps.timeoutMs ?? 10_000
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(deps.shop) || !positive(timeout) || timeout > 60_000) { await hold('TRACKING_CONFIG_INVALID'); return result }
  let rows: TrackingOrderLine[]
  try { rows = await deps.store.listCandidates(deps.shop) } catch { await hold('TRACKING_READ_FAILED'); return result }
  if (rows.some(l => l.shop !== deps.shop) || new Set(rows.map(l => l.localKey)).size !== rows.length) { await hold('TRACKING_ORDER_IDENTITY_INVALID'); return result }
  const eligible = rows.filter(l => ['submitted', 'accepted'].includes(l.status))
  if (eligible.some(l => !['tropship', 'bodypower', 'supplier3'].includes(l.supplier))) { await hold('TRACKING_ADAPTER_REQUIRED'); return result }
  for (const supplier of ['tropship', 'bodypower', 'supplier3'] as const) {
    reviewReference = `${runReference}:${supplier}`
    reviewOrderId = undefined; reviewSupplier = supplier
    const supplierLines = eligible.filter(l => l.supplier === supplier)
    if (!supplierLines.length) continue
    const adapter = deps.adapters[supplier]
    if (!adapter || adapter.id !== supplier) { await hold('TRACKING_ADAPTER_REQUIRED'); continue }
    if (supplierLines.some(l => !l.supplierRef)) await hold('SUPPLIER_REFERENCE_REQUIRED')
    const refs = [...new Set(supplierLines.map(l => l.supplierRef).filter((ref): ref is string => !!ref))]
    if (!refs.length) continue
    let shipments: TrackingUpdate[]
    try { shipments = await adapter.fetchTracking(refs); if (!Array.isArray(shipments)) throw new Error() }
    catch { await hold('TRACKING_FETCH_FAILED'); continue }
    for (const shipment of shipments) {
      reviewOrderId = undefined
      reviewReference = hash([deps.shop, supplier, shipment?.supplierRef, shipment?.shipmentId])
      let plan: TrackingClaim
      try {
        if (!shipment || !refs.includes(shipment.supplierRef) || !Array.isArray(shipment.shippedLines)) throw new Error()
        const lines = supplierLines.filter(l => l.supplierRef === shipment.supplierRef)
        if (new Set(lines.map(l => l.orderId)).size !== 1) throw new Error()
        reviewOrderId = lines[0].orderId
        const identity = shipmentIdentity(lines[0], shipment)
        const seen = await deps.store.lookup(identity.key, identity.fingerprint)
        if (seen === 'duplicate' || seen === 'unresolved') {
          result.duplicates++; if (seen === 'unresolved') await hold('TRACKING_RECONCILIATION_REQUIRED'); continue
        }
        if (seen !== 'new') { await hold('SHIPMENT_CHANGED'); continue }
        plan = buildTrackingClaim(lines, shipment, await deps.shopify.readFulfillmentOrder(lines[0].orderId))
      } catch { await hold('TRACKING_PLAN_INVALID'); continue }
      try {
        const claimed = await deps.store.claim(plan)
        if (claimed === 'duplicate') { result.duplicates++; continue }
        if (claimed !== 'claimed') { await hold('TRACKING_CLAIM_BLOCKED'); continue }
      } catch { await hold('TRACKING_CLAIM_FAILED'); return result }
      const outcome = await boundedWrite(deps, structuredClone(plan.request), timeout)
      try { await deps.store.finish(plan.key, outcome) }
      catch { await hold('TRACKING_RECEIPT_SAVE_FAILED'); return result }
      if (outcome.status !== 'completed') { await hold(outcome.status === 'uncertain' ? 'TRACKING_RECONCILIATION_REQUIRED' : 'TRACKING_REJECTED'); return result }
      result.created++
      // Keep the in-run view current for later parcels in the same response.
      for (const shipped of plan.lines) rows.find(l => l.localKey === shipped.localKey)!.fulfilledQuantity += shipped.quantity
    }
  }
  return result
}
