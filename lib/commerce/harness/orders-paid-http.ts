import { createHmac, timingSafeEqual } from 'node:crypto'

export type PaidOrderEvent = { shop: string; eventId: string; orderId: string }
export interface OrderInbox {
  /** Durable INSERT, unique (shop, eventId); resolves only after commit. Never stores raw webhook/address. */
  save(event: PaidOrderEvent): Promise<'saved' | 'duplicate'>
}
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const MAX_BODY_BYTES = 1024 * 1024
async function readBody(request: Request): Promise<Buffer> {
  if (!request.body) throw new Error('BODY_REQUIRED')
  const reader = request.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('BODY_TOO_LARGE') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks)
}
export function createOrdersPaidHandler(options: {
  env: () => Record<string, string | undefined>;
  loadInbox?: () => Promise<OrderInbox>
}) {
  return async (request: Request): Promise<Response> => {
    const env = options.env()
    if (env.ORDER_FORWARDING_ENABLED !== 'true') return reply({ status: 'disabled' })
    if (!env.SHOPIFY_WEBHOOK_SECRET || !env.ORDER_FORWARDING_SHOP) return reply({ error: 'webhook_not_configured' }, 503)
    let bytes: Buffer
    try { bytes = await readBody(request) } catch { return reply({ error: 'invalid_body' }, 413) }
    const signature = request.headers.get('x-shopify-hmac-sha256') ?? ''
    const expected = createHmac('sha256', env.SHOPIFY_WEBHOOK_SECRET).update(bytes).digest()
    if (!/^[A-Za-z0-9+/]{43}=$/.test(signature) || !timingSafeEqual(expected, Buffer.from(signature, 'base64'))) {
      return reply({ error: 'unauthorised' }, 401)
    }
    const shop = request.headers.get('x-shopify-shop-domain') ?? ''
    const eventId = request.headers.get('x-shopify-event-id') ?? request.headers.get('x-shopify-webhook-id') ?? ''
    if (shop !== env.ORDER_FORWARDING_SHOP || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ||
        request.headers.get('x-shopify-topic') !== 'orders/paid' || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) {
      return reply({ error: 'invalid_event' }, 400)
    }
    let orderId: string
    try {
      const body = JSON.parse(bytes.toString('utf8'))
      // Prefer the lossless GraphQL ID. Never round a large numeric Shopify ID.
      const id = body.admin_graphql_api_id ?? (typeof body.id === 'string' || Number.isSafeInteger(body.id) ? `gid://shopify/Order/${body.id}` : '')
      if (typeof id !== 'string' || !/^gid:\/\/shopify\/Order\/[1-9][0-9]*$/.test(id)) throw new Error('INVALID_ORDER_ID')
      orderId = id
    } catch { return reply({ error: 'invalid_order' }, 400) }
    // TODO(Toby): bind private durable inbox after approved static migration; no live client here.
    if (!options.loadInbox) return reply({ error: 'inbox_not_configured' }, 503)
    try {
      const status = await (await options.loadInbox()).save({ shop, eventId, orderId })
      return reply({ status })
    } catch { return reply({ error: 'inbox_save_failed' }, 503) }
  }
}
