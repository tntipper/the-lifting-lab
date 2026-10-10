'use client'

import { useStagingCart } from './StagingCartContext'

export function StagingCartButton() {
  const cart = useStagingCart()
  if (!cart?.enabled) return null
  const knownQuantity = cart.view && ['empty', 'ready', 'held', 'pending'].includes(cart.view.state) ? cart.view.quantity : null
  return <button type="button" onClick={cart.open} aria-label={knownQuantity !== null ? `Test cart, ${knownQuantity} items` : 'Test cart, quantity unavailable'}
    className="min-h-11 min-w-11 rounded-lg border border-lab-border px-2 text-[10px] font-bold text-lab-lime">
    Cart <span aria-hidden="true">({knownQuantity ?? '?'})</span>
  </button>
}

export function StagingCartAdd({ productId }: { productId?: string }) {
  const cart = useStagingCart()
  if (!cart?.enabled || !productId || cart.view?.productId !== productId) return null
  return <button type="button" onClick={() => cart.setQuantity((cart.view?.quantity ?? 0) + 1, productId)}
    disabled={cart.busy || !['empty', 'ready'].includes(cart.view.state) || cart.view.quantity >= 5}
    className="min-h-11 w-full rounded-lg border border-lab-lime px-2 py-2 text-[10px] font-bold text-lab-lime disabled:opacity-50">
    Add to test cart
  </button>
}
