'use client'

import { useEffect, useId, useRef } from 'react'
import Link from 'next/link'
import AccessibleDialog from './AccessibleDialog'
import { useStagingCart } from './StagingCartContext'

const money = (pence: number | null | undefined) => pence === null || pence === undefined ? 'Unavailable' : `£${(pence / 100).toFixed(2)}`
export function StagingCartContents() {
  const cart = useStagingCart(), status = useRef<HTMLParagraphElement>(null), wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !cart?.busy && status.current?.isConnected) status.current.focus({ preventScroll: true })
    wasBusy.current = cart?.busy ?? false
  }, [cart?.busy, cart?.notice])
  if (!cart?.enabled) return <p>Test cart unavailable.</p>
  const view = cart.view, editable = !!view && ['ready', 'empty'].includes(view.state) && !cart.busy
  return <div className="space-y-5">
    <p className="text-sm text-lab-muted">Anonymous staging cart. Synthetic items only; checkout is disabled. Signing in or switching accounts does not transfer this cart.</p>
    <p ref={status} role="status" aria-live="polite" aria-atomic="true" tabIndex={-1} className="break-words rounded-lg border border-lab-border p-3 text-sm focus:outline-2 focus:outline-lab-lime">{cart.notice || (cart.busy ? 'Loading test cart…' : 'Your test cart is empty.')}</p>
    {view && view.quantity > 0 && <section aria-label="Test cart item" className="rounded-xl border border-lab-border p-4 space-y-3">
      <h3 className="break-words text-base font-bold">Synthetic staging test product — not for sale</h3>
      <p className="text-sm">Listed test price per item: {money(view.unitPricePence)}</p>
      <div className="flex flex-wrap items-center gap-3">
        <span>Quantity: {view.quantity}</span>
        <button type="button" aria-label="Decrease test product quantity" disabled={!editable || view.quantity <= 1} onClick={() => cart.setQuantity(view.quantity - 1)} className="min-h-11 min-w-11 rounded-lg border border-lab-border disabled:opacity-50">−</button>
        <button type="button" aria-label="Increase test product quantity" disabled={!editable || view.quantity >= 5} onClick={() => cart.setQuantity(view.quantity + 1)} className="min-h-11 min-w-11 rounded-lg border border-lab-border disabled:opacity-50">+</button>
        <button type="button" disabled={!editable} onClick={() => cart.setQuantity(0)} className="min-h-11 rounded-lg border border-lab-border px-3 text-sm disabled:opacity-50">Remove item</button>
      </div>
    </section>}
    {view && ['empty', 'ready'].includes(view.state) && view.quantity === 0 && <p>No items in this test cart.</p>}
    <p className="flex flex-wrap justify-between gap-2 font-bold"><span>{view && ['held', 'pending', 'unavailable'].includes(view.state) ? 'Observed subtotal · change unresolved' : 'Item subtotal'}</span><span>{money(view?.subtotalPence)}</span></p>
    <p className="text-xs text-lab-muted">Item subtotal only. Delivery and final taxes have not been calculated. No payment or order will be created here.</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={cart.busy} onClick={() => cart.refresh()} className="min-h-11 rounded-lg border border-lab-border px-3 text-sm disabled:opacity-50">Refresh cart</button>
      <Link href="/products" onClick={cart.close} className="min-h-11 inline-flex items-center rounded-lg border border-lab-border px-3 text-sm">Browse research records</Link>
    </div>
  </div>
}

export default function StagingCartPanel({ open, onClose }: { open: boolean; onClose(): void }) {
  const title = useId()
  return <AccessibleDialog open={open} onClose={onClose} labelledBy={title} className="w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-lab-border bg-lab-panel p-4 sm:p-6 text-white shadow-2xl">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id={title} className="text-xl font-black">Test cart</h2>
      <button type="button" data-dialog-initial-focus onClick={onClose} aria-label="Close test cart" className="min-h-11 min-w-11 rounded-lg border border-lab-border">✕</button>
    </div>
    <StagingCartContents />
    <Link href="/cart" onClick={onClose} className="mt-4 inline-flex min-h-11 items-center text-sm text-lab-lime underline">View cart page</Link>
  </AccessibleDialog>
}
