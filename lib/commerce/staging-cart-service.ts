import type { StagingCartView } from './staging-cart-types'
import { MAX_CART_QUANTITY, STAGING_CART_PRODUCT, type CartObservation, type StorefrontCart } from './staging-cart-storefront'

export type CartEnvelope = { v: 1; alg: 'A256GCM'; kid: string; iv: string; tag: string; ciphertext: string }
export type CartRecord = {
  sessionHash: string; actorHash: string; revision: number; phase: 'ready' | 'working' | 'held'
  envelope: CartEnvelope | null; quantity: number; unitPricePence: number | null; subtotalPence: number
  operationId: string | null; expiresAt: string
}
export type CartRepository = {
  open(sessionHash: string, actorHash: string): Promise<CartRecord>
  read(sessionHash: string, actorHash: string): Promise<CartRecord | null>
  claim(sessionHash: string, actorHash: string, requestId: string, requestHash: string, revision: number, target: number): Promise<{ status: 'claimed' | 'replay' | 'conflict' | 'held'; record: CartRecord }>
  finish(sessionHash: string, actorHash: string, requestId: string, state: 'ready' | 'held', envelope: CartEnvelope | null, observation: Pick<CartObservation, 'quantity' | 'unitPricePence' | 'subtotalPence'> | null): Promise<CartRecord>
}
export type CartVault = {
  seal(value: object, context: readonly string[]): CartEnvelope
  open<T>(value: unknown, context: readonly string[]): T
}
export class CartSessionChanged extends Error { constructor() { super('Cart session context changed') } }
export class CartUnavailable extends Error { constructor() { super('Staging cart unavailable') } }
export function emptyCart(): StagingCartView {
  return { state: 'empty', revision: 0, productId: STAGING_CART_PRODUCT, quantity: 0, unitPricePence: null, subtotalPence: 0, currency: 'GBP', csrfToken: null,
    message: 'Anonymous test cart only. No checkout or account connection.' }
}
export function cartRecordView(record: CartRecord): StagingCartView {
  return { ...emptyCart(), state: record.phase === 'working' ? 'pending' : record.phase === 'held' ? 'held' : record.quantity ? 'ready' : 'empty',
    revision: record.revision, quantity: record.quantity, unitPricePence: record.unitPricePence, subtotalPence: record.subtotalPence,
    message: record.phase === 'working' ? 'Checking a cart change. Refresh to check its status; do not add it again.'
      : record.phase === 'held' ? 'A cart change could not be confirmed. Editing is paused for review; no automatic retry or checkout.'
        : emptyCart().message }
}
export function createCartService(options: { repository: CartRepository; storefront: StorefrontCart; vault: CartVault; context: readonly string[] }) {
  const { repository, storefront, vault } = options
  const aad = (sessionHash: string, actorHash: string) => ['tll-staging-cart/v1', ...options.context, sessionHash, actorHash]
  async function owned(sessionHash: string, actorHash: string): Promise<CartRecord> {
    const record = await repository.read(sessionHash, actorHash)
    if (!record || record.actorHash !== actorHash || record.sessionHash !== sessionHash) throw new CartSessionChanged()
    return record
  }
  return {
    async open(sessionHash: string, actorHash: string): Promise<StagingCartView> {
      const record = await repository.open(sessionHash, actorHash)
      if (record.actorHash !== actorHash || record.sessionHash !== sessionHash) throw new CartSessionChanged()
      return cartRecordView(record)
    },
    async read(sessionHash: string, actorHash: string): Promise<StagingCartView> {
      const record = await owned(sessionHash, actorHash)
      // Read reconciliation cannot prove that a previously timed-out write will
      // never finish later. Preserve the durable hold, even if desired state is seen.
      if (record.envelope && record.phase !== 'working') {
        try {
          const saved = vault.open<{ id: string }>(record.envelope, aad(sessionHash, actorHash))
          const observed = await storefront.read(saved.id)
          return { ...cartRecordView(record), quantity: observed.quantity, unitPricePence: observed.unitPricePence, subtotalPence: observed.subtotalPence }
        } catch { return { ...cartRecordView(record), state: 'unavailable', message: 'The current cart could not be read. Editing is paused; refresh to check again.' } }
      }
      return cartRecordView(record)
    },
    async set(sessionHash: string, actorHash: string, requestId: string, requestHash: string, revision: number, target: number): Promise<{ status: number; view: StagingCartView }> {
      if (!Number.isSafeInteger(target) || target < 0 || target > MAX_CART_QUANTITY) throw new CartUnavailable()
      await owned(sessionHash, actorHash)
      const claimed = await repository.claim(sessionHash, actorHash, requestId, requestHash, revision, target)
      if (claimed.status !== 'claimed') return { status: claimed.status === 'replay' ? 200 : 409,
        view: { ...cartRecordView(claimed.record), ...(claimed.status === 'conflict' ? { message: 'This change was not applied. Review the current cart quantity before making another change.' } : {}) } }
      const record = claimed.record
      try {
        let observed: CartObservation
        if (record.envelope) {
          const saved = vault.open<{ id: string }>(record.envelope, aad(sessionHash, actorHash))
          const previous = await storefront.read(saved.id)
          observed = await storefront.set(previous, target)
        } else if (target > 0) observed = await storefront.create(target)
        else {
          const finished = await repository.finish(sessionHash, actorHash, requestId, 'ready', null, { quantity: 0, unitPricePence: null, subtotalPence: 0 })
          return { status: 200, view: cartRecordView(finished) }
        }
        const envelope = vault.seal({ id: observed.id }, aad(sessionHash, actorHash))
        const finished = await repository.finish(sessionHash, actorHash, requestId, 'ready', envelope, observed)
        return { status: 200, view: cartRecordView(finished) }
      } catch {
        // A cartCreate response can be lost before its ID is known; Shopify has
        // no documented lookup by our request ID. Keep this session on hold.
        try { await repository.finish(sessionHash, actorHash, requestId, 'held', record.envelope, null) } catch { /* durable claim already blocks another write */ }
        let current = record
        try { current = await owned(sessionHash, actorHash) } catch { /* no fabricated empty/success projection */ }
        return { status: 503, view: { ...cartRecordView(current), state: 'held', message: 'The change could not be confirmed. Refresh to inspect the saved cart; it will not be sent again automatically.' } }
      }
    },
  }
}
