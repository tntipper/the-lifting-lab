'use client'

import { useStagingCart } from './StagingCartContext'

/** This branch's cart supports one bound product; full-stack purchase needs grok/live-cart. */
export default function StackPurchaseButton({ productIds, ready }: { productIds: string[]; ready: boolean }) {
  const cart = useStagingCart()
  const view = cart?.view
  const supported = cart?.enabled && ready && productIds.length === 1 && view?.productId === productIds[0]
    && ['empty', 'ready'].includes(view.state)
  if (!supported) return <button type="button" disabled>Buy my stack · Coming soon</button>
  return <button type="button" disabled={cart.busy || view.quantity >= 5}
    onClick={() => { void cart.setQuantity(view.quantity + 1, productIds[0]) }}>
    Buy my stack
  </button>
}
