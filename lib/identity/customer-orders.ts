// Server-only, default-disabled Customer Account API reader. Token custody and
// operation fencing belong to the account-operations gateway that calls it.
const SHOP = 'tll-integration-staging.myshopify.com'
export const CUSTOMER_ORDERS_VERSION = '2026-07'
export const CUSTOMER_ORDERS_URL = `https://${SHOP}/customer/api/${CUSTOMER_ORDERS_VERSION}/graphql`
const MAX_BYTES = 65_536
const QUERY = `query TllCustomerOrders {
  customer {
    orders(first: 10, reverse: true) {
      nodes {
        name
        createdAt
        financialStatus
        fulfillmentStatus
        totalPrice { amount currencyCode }
        lineItems(first: 10) { nodes { name quantity } pageInfo { hasNextPage } }
      }
      pageInfo { hasNextPage }
    }
  }
}`

export type CustomerOrderProjection = Readonly<{
  reference: string
  createdAt: string
  financialStatus: string | null
  fulfillmentStatus: string
  totalPence: number
  currency: 'GBP'
  items: readonly Readonly<{ name: string; quantity: number }>[]
  hasMoreItems: boolean
}>
export type CustomerOrdersProjection = Readonly<{ orders: readonly CustomerOrderProjection[]; hasMoreOrders: boolean }>
export type CustomerOrdersTransport = (input: Readonly<{
  url: string; method: 'POST'; headers: Readonly<Record<string, string>>; body: string; signal: AbortSignal
}>) => Promise<Response>

export class CustomerOrdersHeld extends Error {
  readonly code = 'CUSTOMER_ORDERS_HELD'
  readonly outcome: 'not_attempted' | 'uncertain'
  constructor(outcome: 'not_attempted' | 'uncertain') { super('Customer orders unavailable'); this.name = 'CustomerOrdersHeld'; this.outcome = outcome }
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
  && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value)
const credential = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 32_768
  && !/[\x00-\x20\x7f]/.test(value)
const FINANCIAL = new Set(['AUTHORIZED','EXPIRED','PAID','PARTIALLY_PAID','PARTIALLY_REFUNDED','PENDING','REFUNDED','VOIDED'])
const FULFILLMENT = new Set(['FULFILLED','IN_PROGRESS','ON_HOLD','OPEN','PARTIALLY_FULFILLED','PENDING_FULFILLMENT','RESTOCKED','SCHEDULED','UNFULFILLED'])
function pence(value: unknown) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)) throw new Error('invalid money')
  const [whole, fraction = ''] = value.split('.'), result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(result)) throw new Error('invalid money'); return result
}
function timestamp(value: unknown) {
  if (!text(value, 64) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('invalid timestamp')
  return value
}
async function bounded(response: Response) {
  if (!response.body) throw new Error('missing body')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > MAX_BYTES) throw new Error('oversized'); chunks.push(item.value) }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
function projection(value: unknown): CustomerOrdersProjection {
  if (!object(value) || !object(value.data) || 'errors' in value || !object(value.data.customer)
    || !object(value.data.customer.orders) || !Array.isArray(value.data.customer.orders.nodes)
    || value.data.customer.orders.nodes.length > 10 || !object(value.data.customer.orders.pageInfo)
    || typeof value.data.customer.orders.pageInfo.hasNextPage !== 'boolean') throw new Error('invalid result')
  const orders = value.data.customer.orders.nodes.map(orderValue => {
    if (!object(orderValue) || !text(orderValue.name, 128) || !object(orderValue.totalPrice)
      || orderValue.totalPrice.currencyCode !== 'GBP' || !object(orderValue.lineItems)
      || !Array.isArray(orderValue.lineItems.nodes) || orderValue.lineItems.nodes.length > 10
      || !object(orderValue.lineItems.pageInfo) || typeof orderValue.lineItems.pageInfo.hasNextPage !== 'boolean'
      || orderValue.financialStatus !== null && !FINANCIAL.has(orderValue.financialStatus as string)
      || !FULFILLMENT.has(orderValue.fulfillmentStatus as string)) throw new Error('invalid order')
    const items = orderValue.lineItems.nodes.map(item => {
      if (!object(item) || !text(item.name, 500) || !Number.isSafeInteger(item.quantity) || (item.quantity as number) < 1 || (item.quantity as number) > 10_000) throw new Error('invalid item')
      return Object.freeze({ name: item.name as string, quantity: item.quantity as number })
    })
    return Object.freeze({ reference: orderValue.name, createdAt: timestamp(orderValue.createdAt),
      financialStatus: orderValue.financialStatus as string | null, fulfillmentStatus: orderValue.fulfillmentStatus as string,
      totalPence: pence(orderValue.totalPrice.amount), currency: 'GBP' as const, items: Object.freeze(items),
      hasMoreItems: orderValue.lineItems.pageInfo.hasNextPage })
  })
  return Object.freeze({ orders: Object.freeze(orders), hasMoreOrders: value.data.customer.orders.pageInfo.hasNextPage })
}

export function createCustomerOrdersReader(options: { enabled?: boolean; transport?: CustomerOrdersTransport; timeoutMs?: number } = {}) {
  const timeout = options.timeoutMs ?? 5000
  return Object.freeze({
    async read(accessToken: string): Promise<CustomerOrdersProjection> {
      if (options.enabled !== true || typeof window !== 'undefined' || !credential(accessToken)
        || !Number.isInteger(timeout) || timeout < 50 || timeout > 10_000) throw new CustomerOrdersHeld('not_attempted')
      const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const response = await Promise.race([
          (options.transport ?? ((input) => fetch(input.url, { method: input.method, headers: input.headers, body: input.body,
            signal: input.signal, redirect: 'manual', credentials: 'omit', cache: 'no-store' })))(Object.freeze({
              url: CUSTOMER_ORDERS_URL, method: 'POST' as const, headers: Object.freeze({ accept: 'application/json', 'content-type': 'application/json',
                authorization: `Bearer ${accessToken}`, 'accept-encoding': 'identity', 'cache-control': 'no-store' }),
              body: JSON.stringify({ query: QUERY }), signal: controller.signal })),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')) }, timeout) }),
        ])
        const media = response.headers.get('content-type') ?? ''
        if (controller.signal.aborted || response.status !== 200 || response.redirected
          || !/^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(media)
          || response.headers.has('content-encoding') && response.headers.get('content-encoding') !== 'identity') throw new Error('invalid response')
        return projection(await bounded(response))
      } catch { throw new CustomerOrdersHeld('uncertain') }
      finally { if (timer) clearTimeout(timer); controller.abort() }
    },
  })
}
