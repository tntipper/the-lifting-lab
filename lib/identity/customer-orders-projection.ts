/** Browser-safe Customer Account orders projection validation (no tokens, no provider IDs). */
const FINANCIAL = new Set([
  'AUTHORIZED', 'EXPIRED', 'PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED', 'PENDING', 'REFUNDED', 'VOIDED',
])
const FULFILLMENT = new Set([
  'FULFILLED', 'IN_PROGRESS', 'ON_HOLD', 'OPEN', 'PARTIALLY_FULFILLED', 'PENDING_FULFILLMENT', 'RESTOCKED',
  'SCHEDULED', 'UNFULFILLED',
])

export type CustomerOrdersProjection = Readonly<{
  orders: readonly Readonly<{
    reference: string
    createdAt: string
    financialStatus: string | null
    fulfillmentStatus: string
    totalPence: number
    currency: 'GBP'
    items: readonly Readonly<{ name: string; quantity: number }>[]
    hasMoreItems: boolean
  }>[]
  hasMoreOrders: boolean
}>

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max
  && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value)

/** Accept only the allowlisted bounded projection shape used by `/account/orders`. */
export function parseCustomerOrdersProjection(value: unknown): CustomerOrdersProjection | null {
  if (!object(value) || Object.keys(value).sort().join() !== 'hasMoreOrders,orders' || !Array.isArray(value.orders)
    || value.orders.length > 10 || typeof value.hasMoreOrders !== 'boolean') return null
  const orders: CustomerOrdersProjection['orders'][number][] = []
  for (const raw of value.orders) {
    if (!object(raw) || Object.keys(raw).sort().join() !== 'createdAt,currency,financialStatus,fulfillmentStatus,hasMoreItems,items,reference,totalPence'
      || !text(raw.reference, 128) || !text(raw.createdAt, 64) || !Number.isFinite(Date.parse(raw.createdAt))
      || raw.currency !== 'GBP' || raw.financialStatus !== null && !FINANCIAL.has(raw.financialStatus as string)
      || !FULFILLMENT.has(raw.fulfillmentStatus as string) || !Number.isSafeInteger(raw.totalPence)
      || (raw.totalPence as number) < 0 || !Array.isArray(raw.items) || raw.items.length > 10
      || typeof raw.hasMoreItems !== 'boolean') return null
    const items: { name: string; quantity: number }[] = []
    for (const item of raw.items) {
      if (!object(item) || Object.keys(item).sort().join() !== 'name,quantity' || !text(item.name, 500)
        || !Number.isSafeInteger(item.quantity) || (item.quantity as number) < 1
        || (item.quantity as number) > 10_000) return null
      items.push({ name: item.name, quantity: item.quantity as number })
    }
    orders.push({
      reference: raw.reference,
      createdAt: raw.createdAt,
      financialStatus: raw.financialStatus as string | null,
      fulfillmentStatus: raw.fulfillmentStatus as string,
      totalPence: raw.totalPence as number,
      currency: 'GBP',
      items,
      hasMoreItems: raw.hasMoreItems,
    })
  }
  return { orders, hasMoreOrders: value.hasMoreOrders }
}
