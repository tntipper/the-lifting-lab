import { createHash } from 'node:crypto'
import { presentStoreLinkMapping, validateProductMappings } from '../product-mapping'
import type { ProductMappingRow } from '../product-mapping'
import type { PaidOrderEvent } from './orders-paid-http'
import type { DeliveryAddress, SubmitResult, SupplierAdapter, SupplierId } from './types'

export type FreshOrder = {
  id: string; shop: string; paid: boolean; cancelled: boolean; refunded: boolean;
  /** True only when the injected Shopify reader fetched every line (including pagination). */
  complete: boolean; deliveryAddress: DeliveryAddress;
  lines: { id: string; variantId: string; quantity: number }[]
}
export type RoutedLine = { lineId: string; variantId: string; mappingId: string; supplier: SupplierId; sku: string; quantity: number; localKey: string }
export type SupplierGroup = { supplier: SupplierId; localKey: string; lines: RoutedLine[]; absorbedDispatchPence: number }
export type OrderPlan = { shop: string; orderId: string; encryptedAddress: string; groups: SupplierGroup[] }
export type OrderStatus = 'submitted' | 'accepted' | 'rejected' | 'manual'
export interface OrderRoutingStore {
  /** One DB transaction: unique(shop,order), encrypted address, all line rows and stock reservations.
   * Reserve from trusted stock atomically; insufficient stock must rollback. Never append to an existing plan.
   * Replays (including new event IDs) return duplicate. Recovery of incomplete plans is manual only. */
  planAndReserve(plan: OrderPlan): Promise<'created' | 'duplicate'>
  /** Atomic compare-and-set pending -> manual/SUBMISSION_IN_PROGRESS, attempts=1 for ALL group lines.
   * Persist/commit the spent marker BEFORE returning true; only pending/unspent groups may be claimed. */
  claimSubmission(localKey: string): Promise<boolean>
  /** Atomic all-group update. Rejected releases reservations; manual retains them pending reconciliation.
   * Error codes only. Never persist adapter messages (may contain customer data or credentials). */
  recordResult(localKey: string, result: { status: OrderStatus; supplierRef?: string; code: string }): Promise<void>
  /** Close the inbox event; existing pending/manual batches must stay manual for recovery. */
  complete(event: PaidOrderEvent): Promise<void>
  /** Private operator hold; no address, raw provider errors, or secrets. Alert delivery belongs to T11. */
  hold(event: PaidOrderEvent, code: string): Promise<void>
}
export type OrderRoutingDependencies = {
  enabled?: string;
  shop: string;
  shopify: { readOrder(orderId: string): Promise<FreshOrder> };
  mappings: () => Promise<{ id: string; row: ProductMappingRow }[]>;
  store: OrderRoutingStore;
  adapters: Partial<Record<SupplierId, Pick<SupplierAdapter, 'id' | 'placeOrder'>>>;
  /** Must be reviewed per supplier using pricing-policy/commercial-burden; no unapproved default. */
  dispatchCostPence: Partial<Record<SupplierId, number>>;
  protectDelivery: (address: DeliveryAddress, context: string) => Promise<string>;
  timeoutMs?: number; now?: () => number
}
const key = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
const supplierId = (value: unknown): value is SupplierId => value === 'tropship' || value === 'bodypower' || value === 'supplier3'
function validAddress(a: DeliveryAddress): boolean {
  return !!a && ['name', 'address1', 'city', 'postcode', 'countryCode'].every(field => {
    const value = a[field as keyof DeliveryAddress]
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 256
  }) && /^[A-Z]{2}$/.test(a.countryCode) && (a.address2 === undefined || typeof a.address2 === 'string' && a.address2.length <= 256)
}
async function boundedSubmit(adapter: Pick<SupplierAdapter, 'placeOrder'>, request: Parameters<SupplierAdapter['placeOrder']>[0], ms: number): Promise<SubmitResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // Late outcomes are deliberately ignored. A timeout cannot prove the supplier received nothing.
    return await Promise.race([Promise.resolve().then(() => adapter.placeOrder(request)), new Promise<SubmitResult>(resolve => {
      timer = setTimeout(() => resolve({ status: 'uncertain' }), ms)
    })])
  } catch { return { status: 'uncertain' } }
  finally { if (timer) clearTimeout(timer) }
}
/** Private worker entry point; never called inline by the webhook, and never retries a submission. */
export async function routePaidOrder(event: PaidOrderEvent, deps: OrderRoutingDependencies): Promise<{ status: string; groups?: number }> {
  if (deps.enabled !== 'true') return { status: 'disabled' }
  const hold = async (code: string) => { await deps.store.hold(event, code); return { status: 'manual' } }
  if (event.shop !== deps.shop || !/^gid:\/\/shopify\/Order\/[1-9][0-9]*$/.test(event.orderId)) return hold('ORDER_IDENTITY_INVALID')
  const timeout = deps.timeoutMs ?? 10_000
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000) return hold('TIMEOUT_CONFIG_INVALID')
  let order: FreshOrder
  try { order = await deps.shopify.readOrder(event.orderId) } catch { return hold('FRESH_ORDER_READ_FAILED') }
  if (!order || order.id !== event.orderId || order.shop !== event.shop || order.paid !== true || order.cancelled !== false || order.refunded !== false || order.complete !== true) {
    // Also holds cancellations/refunds arriving after a previous submission; no cancel API is called.
    return hold('ORDER_NOT_ELIGIBLE')
  }
  if (!validAddress(order.deliveryAddress) || !Array.isArray(order.lines) || !order.lines.length ||
      new Set(order.lines.map(l => l.id)).size !== order.lines.length || order.lines.some(l =>
        !/^gid:\/\/shopify\/LineItem\/[1-9][0-9]*$/.test(l.id) || !/^gid:\/\/shopify\/ProductVariant\/[1-9][0-9]*$/.test(l.variantId) ||
        !Number.isSafeInteger(l.quantity) || l.quantity <= 0)) return hold('ORDER_DATA_INVALID')
  let mappings: Awaited<ReturnType<OrderRoutingDependencies['mappings']>>
  try { mappings = await deps.mappings() } catch { return hold('MAPPING_READ_FAILED') }
  if (validateProductMappings(mappings.map(m => m.row)).length || new Set(mappings.map(m => m.id)).size !== mappings.length || mappings.some(m => !m.id)) return hold('MAPPING_INVALID')
  const groups = new Map<SupplierId, SupplierGroup>(), now = (deps.now ?? Date.now)()
  for (const line of order.lines) {
    const matches = mappings.filter(m => presentStoreLinkMapping(m.row, now)?.shopifyVariantId === line.variantId)
    if (matches.length !== 1) return hold('EXACT_MAPPING_REQUIRED')
    const mapping = matches[0], supplier = mapping.row.supplier
    if (!supplierId(supplier) || !mapping.row.supplier_sku) return hold('SUPPLIER_MAPPING_INVALID')
    const adapter = deps.adapters[supplier], cost = deps.dispatchCostPence[supplier]
    if (!adapter || adapter.id !== supplier) return hold('SUPPLIER_ADAPTER_REQUIRED')
    if (!Number.isSafeInteger(cost) || cost === undefined || cost < 0) return hold('DISPATCH_POLICY_REQUIRED')
    const group = groups.get(supplier) ?? { supplier, localKey: key(event.shop, order.id, supplier), lines: [], absorbedDispatchPence: cost }
    group.lines.push({ lineId: line.id, variantId: line.variantId, mappingId: mapping.id, supplier, sku: mapping.row.supplier_sku,
      quantity: line.quantity, localKey: key(event.shop, order.id, line.id, supplier) })
    groups.set(supplier, group)
  }
  // Persist/send only the delivery fields in our contract, never arbitrary Shopify customer fields.
  const delivery: DeliveryAddress = { name: order.deliveryAddress.name, address1: order.deliveryAddress.address1,
    ...(order.deliveryAddress.address2 ? { address2: order.deliveryAddress.address2 } : {}), city: order.deliveryAddress.city,
    postcode: order.deliveryAddress.postcode, countryCode: order.deliveryAddress.countryCode }
  let encryptedAddress: string
  try { encryptedAddress = await deps.protectDelivery(delivery, key(event.shop, order.id))
    if (!encryptedAddress) return hold('DELIVERY_PROTECTION_FAILED')
  } catch { return hold('DELIVERY_PROTECTION_FAILED') }
  try {
    if (await deps.store.planAndReserve({ shop: event.shop, orderId: order.id, encryptedAddress, groups: [...groups.values()] }) === 'duplicate') {
      await deps.store.complete(event); return { status: 'duplicate' }
    }
  } catch { return hold('PLAN_OR_RESERVATION_FAILED') }
  let manual = false
  for (const group of groups.values()) {
    try { if (!await deps.store.claimSubmission(group.localKey)) { manual = true; continue } }
    catch { return hold('SUBMISSION_CLAIM_FAILED') } // possibly committed; do not send
    const result = await boundedSubmit(deps.adapters[group.supplier]!, {
      localKey: group.localKey, lines: group.lines.map(l => ({ sku: l.sku, quantity: l.quantity })), deliveryAddress: structuredClone(delivery),
    }, timeout)
    const ref = result?.supplierRef
    const validRef = typeof ref === 'string' && /^[A-Za-z0-9_./:-]{1,128}$/.test(ref)
    const status: OrderStatus = result?.status === 'accepted' && validRef ? 'accepted' :
      result?.status === 'submitted' ? 'submitted' : result?.status === 'rejected' ? 'rejected' : 'manual'
    manual ||= status === 'manual'
    try { await deps.store.recordResult(group.localKey, { status, ...(validRef ? { supplierRef: ref } : {}),
      code: status === 'manual' ? 'SUPPLIER_RESULT_UNCERTAIN' : `SUPPLIER_${status.toUpperCase()}` }) }
    catch { return hold('RESULT_SAVE_FAILED') } // spent marker remains manual; never resend
  }
  if (manual) return hold('SUPPLIER_RECONCILIATION_REQUIRED')
  try { await deps.store.complete(event) } catch { return hold('INBOX_COMPLETION_FAILED') }
  return { status: 'processed', groups: groups.size }
}
