import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { CartSessionChanged, emptyCart, type createCartService } from './staging-cart-service'
import { MAX_CART_QUANTITY, STAGING_CART_PRODUCT } from './staging-cart-storefront'
import type { StagingCartView } from './staging-cart-types'

export const CART_COOKIE = '__Host-tll-staging-cart'
type Service = ReturnType<typeof createCartService>
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const KEY = /^[a-f0-9]{64}$/
const mac = (key: string, value: string) => createHmac('sha256', Buffer.from(key, 'hex')).update(value).digest('hex')
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
const same = (left: string, right: string) => KEY.test(left) && KEY.test(right) && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
function sessionCookie(request: Request): string | null {
  const entries = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(CART_COOKIE + '='))
  if (entries.length > 1) throw new CartSessionChanged()
  if (!entries.length) return null
  const value = entries[0].slice(CART_COOKIE.length + 1)
  if (!/^[a-zA-Z0-9_-]{43}$/.test(value)) throw new CartSessionChanged()
  return value
}
function respond(view: StagingCartView, status: number, cookie?: string | null): Response {
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff' })
  if (cookie !== undefined) headers.set('Set-Cookie', `${CART_COOKIE}=${cookie ?? ''}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${cookie ? 86400 : 0}`)
  return Response.json(view, { status, headers })
}
async function body(request: Request): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '') || request.headers.has('content-encoding')) return null
  const reader = request.body?.getReader(); if (!reader) return null
  const chunks: Uint8Array[] = []; let total = 0
  try {
    while (true) { const item = await reader.read(); if (item.done) break; total += item.value.byteLength; if (total > 2048) { await reader.cancel(); return null }; chunks.push(item.value) }
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch { return null } finally { reader.releaseLock() }
}

/** Route dependency injection is test-only code; request data cannot choose configuration or providers. */
export function createCartHandler(options: {
  enabled: boolean; origin: string; hmacKeyHex: string; service: Service
  currentActor(request: Request): Promise<string | null>
}) {
  return async (request: Request): Promise<Response> => {
    const unavailable: StagingCartView = { ...emptyCart(), productId: null, subtotalPence: null, state: 'unavailable', message: 'Test cart unavailable.' }
    if (!options.enabled || !KEY.test(options.hmacKeyHex)) return respond(unavailable, 404)
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return respond(unavailable, 405)
    const url = new URL(request.url), origin = request.headers.get('origin'), site = request.headers.get('sec-fetch-site')
    if (url.origin !== options.origin || url.pathname !== '/api/cart' || url.search || origin && origin !== options.origin
      || site && !['same-origin', 'none'].includes(site) || request.method !== 'GET' && (origin !== options.origin || request.headers.get('x-tll-cart-intent') !== 'staging-cart')) return respond(unavailable, 403)
    try {
      const actor = await options.currentActor(request)
      if (actor !== null && !UUID.test(actor)) throw new Error('Invalid verified account')
      const actorHash = mac(options.hmacKeyHex, 'cart-actor/v1\n' + (actor ?? 'guest'))
      const capability = sessionCookie(request), sessionHash = capability ? sha(capability) : null
      const csrf = (hash: string) => mac(options.hmacKeyHex, 'cart-csrf/v1\n' + hash + '\n' + actorHash)
      if (request.method === 'GET') {
        if (!sessionHash) return respond(emptyCart(), 200)
        const view = await options.service.read(sessionHash, actorHash)
        return respond({ ...view, csrfToken: csrf(sessionHash) }, 200)
      }
      const input = await body(request)
      if (!input) return respond(unavailable, 400)
      if (request.method === 'POST' && input.action === 'open' && Object.keys(input).length === 1) {
        if (sessionHash) return respond({ ...await options.service.read(sessionHash, actorHash), csrfToken: csrf(sessionHash) }, 200)
        // Bootstrap sets the opaque cookie before a separate request can create a
        // Shopify cart. Losing this response can only orphan an empty local session.
        const fresh = randomBytes(32).toString('base64url'), hash = sha(fresh)
        const view = await options.service.open(hash, actorHash)
        return respond({ ...view, csrfToken: csrf(hash) }, 200, fresh)
      }
      if (!sessionHash || !same(request.headers.get('x-tll-cart-csrf') ?? '', csrf(sessionHash))) return respond(unavailable, 403)
      const expectedKeys = request.method === 'DELETE' ? ['productId', 'revision'] : ['productId', 'quantity', 'revision']
      if (Object.keys(input).sort().join(',') !== expectedKeys.sort().join(',') || input.productId !== STAGING_CART_PRODUCT
        || !Number.isSafeInteger(input.revision) || Number(input.revision) < 0) return respond(unavailable, 400)
      const quantity = request.method === 'DELETE' ? 0 : input.quantity
      if (!Number.isSafeInteger(quantity) || Number(quantity) < 0 || Number(quantity) > MAX_CART_QUANTITY) return respond(unavailable, 400)
      const requestId = request.headers.get('idempotency-key') ?? ''
      if (!UUID.test(requestId)) return respond(unavailable, 400)
      const hash = sha(JSON.stringify({ productId: STAGING_CART_PRODUCT, quantity, revision: input.revision }))
      const result = await options.service.set(sessionHash, actorHash, requestId, hash, Number(input.revision), Number(quantity))
      return respond({ ...result.view, csrfToken: csrf(sessionHash) }, result.status)
    } catch (error) {
      if (error instanceof CartSessionChanged) return respond({ ...unavailable, state: 'session_changed', message: 'Your account context changed or this cart expired. The previous cart has not been transferred. Open a new anonymous test cart to continue.' }, 409, null)
      return respond(unavailable, 503)
    }
  }
}
