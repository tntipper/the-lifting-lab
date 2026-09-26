import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { CartSessionChanged, cartRecordView, emptyCart, type createCartService } from './staging-cart-service'
import type { createCartTransitionService } from './staging-cart-transition'
import { MAX_CART_QUANTITY, STAGING_CART_PRODUCT } from './staging-cart-storefront'
import type { StagingCartView } from './staging-cart-types'

export const CART_COOKIE = '__Host-tll-staging-cart'
type Service = ReturnType<typeof createCartService>
type Transition = ReturnType<typeof createCartTransitionService>
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
  transition: Transition
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
      const input = request.method === 'GET' ? {} : await body(request)
      if (!input) return respond(unavailable, 400)
      if (request.method === 'POST') {
        const keys = Object.keys(input).sort().join(',')
        const validPost = input.action === 'open' && keys === 'action'
          || input.action === 'use_account' && keys === 'action'
          || input.action === 'transfer' && keys === 'action,revision' && Number.isSafeInteger(input.revision) && Number(input.revision) >= 0
        if (!validPost) return respond(unavailable, 400)
      }
      const actor = await options.currentActor(request)
      if (actor !== null && !UUID.test(actor)) throw new Error('Invalid verified account')
      const guestActorHash = mac(options.hmacKeyHex, 'cart-actor/v1\nguest')
      const actorHash = mac(options.hmacKeyHex, 'cart-actor/v1\n' + (actor ?? 'guest'))
      const capability = sessionCookie(request), sessionHash = capability ? sha(capability) : null
      const csrf = (hash: string) => mac(options.hmacKeyHex, 'cart-csrf/v1\n' + hash + '\n' + actorHash)
      if (actor !== null) {
        const accountSession = mac(options.hmacKeyHex, 'cart-account-session/v1\n' + actor)
        if (sessionHash) {
          const binding = { sourceSession: sessionHash, sourceActor: guestActorHash, targetSession: accountSession, targetActor: actorHash }
          const transition = await options.transition.inspect(binding)
          if (transition.status === 'reconciled' && transition.target) return respond({ ...cartRecordView(transition.target), csrfToken: csrf(accountSession),
            message: 'Your guest cart is now connected to this account.' }, 200, null)
          if (request.method === 'POST' && input.action === 'use_account' && Object.keys(input).length === 1) {
            if (!same(request.headers.get('x-tll-cart-csrf') ?? '', csrf(sessionHash))) return respond(unavailable, 403)
            try {
              const account = await options.service.read(accountSession, actorHash)
              return respond({ ...account, csrfToken: csrf(accountSession), message: 'Using the cart already saved to this account.' }, 200, null)
            } catch (error) {
              if (error instanceof CartSessionChanged) return respond({ ...emptyCart(), message: 'Started with an empty account cart. The guest cart was not merged.' }, 200, null)
              throw error
            }
          }
          if (request.method === 'POST' && input.action === 'transfer' && Object.keys(input).sort().join(',') === 'action,revision') {
            if (!same(request.headers.get('x-tll-cart-csrf') ?? '', csrf(sessionHash))) return respond(unavailable, 403)
            if (!UUID.test(request.headers.get('idempotency-key') ?? '')) return respond(unavailable, 400)
            const moved = await options.transition.transfer(binding, request.headers.get('idempotency-key')!, Number(input.revision))
            if (moved.status === 'reconciled' && moved.target) return respond({ ...cartRecordView(moved.target), csrfToken: csrf(accountSession),
              message: 'Your guest cart is now connected to this account.' }, 200, null)
            const current = moved.source ? cartRecordView(moved.source) : emptyCart()
            return respond({ ...current, state: moved.status === 'held' ? 'held' : 'transition_required', csrfToken: csrf(sessionHash),
              message: moved.status === 'held' ? 'The cart transfer could not be confirmed. It will not be retried automatically.' : 'This guest cart could not replace the account cart.' }, 409)
          }
          if (request.method !== 'GET') return respond(unavailable, 400)
          let source = transition.source ? cartRecordView(transition.source) : emptyCart()
          if (!transition.source) {
            try { source = await options.service.read(sessionHash, guestActorHash) } catch { /* safe empty projection */ }
          }
          return respond({ ...source, state: transition.status === 'claimed' ? 'pending' : transition.status === 'held' ? 'held' : 'transition_required',
            csrfToken: csrf(sessionHash), message: transition.status === 'conflict'
              ? 'This account already has a cart. Choose which saved cart to use; the carts will not be merged.'
              : 'Choose whether to connect this guest cart to your signed-in account.' }, transition.status === 'held' ? 409 : 200)
        }
        if (request.method === 'GET') {
          try { return respond({ ...await options.service.read(accountSession, actorHash), csrfToken: csrf(accountSession) }, 200) }
          catch (error) { if (error instanceof CartSessionChanged) return respond(emptyCart(), 200); throw error }
        }
        if (request.method === 'POST' && input.action === 'open' && Object.keys(input).length === 1) {
          const view = await options.service.open(accountSession, actorHash)
          return respond({ ...view, csrfToken: csrf(accountSession) }, 200)
        }
        // Account carts use their server-derived session even without a browser cookie.
        if (!sessionHash && ['PATCH','DELETE'].includes(request.method)) {
          const expectedKeys = request.method === 'DELETE' ? ['productId','revision'] : ['productId','quantity','revision']
          if (Object.keys(input).sort().join(',') !== expectedKeys.sort().join(',') || input.productId !== STAGING_CART_PRODUCT
            || !Number.isSafeInteger(input.revision) || Number(input.revision) < 0) return respond(unavailable,400)
          if (!same(request.headers.get('x-tll-cart-csrf') ?? '',csrf(accountSession))) return respond(unavailable,403)
          const quantity=request.method==='DELETE'?0:input.quantity,requestId=request.headers.get('idempotency-key')??''
          if(!Number.isSafeInteger(quantity)||Number(quantity)<0||Number(quantity)>MAX_CART_QUANTITY||!UUID.test(requestId))return respond(unavailable,400)
          const requestHash=sha(JSON.stringify({productId:STAGING_CART_PRODUCT,quantity,revision:input.revision}))
          const result=await options.service.set(accountSession,actorHash,requestId,requestHash,Number(input.revision),Number(quantity))
          return respond({...result.view,csrfToken:csrf(accountSession)},result.status)
        }
      }
      if (request.method === 'GET') {
        if (!sessionHash) return respond(emptyCart(), 200)
        const view = await options.service.read(sessionHash, actorHash)
        return respond({ ...view, csrfToken: csrf(sessionHash) }, 200)
      }
      if (request.method === 'POST') {
        if (input.action !== 'open') return respond(unavailable, 400)
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
