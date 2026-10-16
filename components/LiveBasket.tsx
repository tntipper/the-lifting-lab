'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { liveCartEnabled } from '@/lib/commerce/live-cart-mode'
import { LIVE_BASKET_KEY, addBasketLine, basketCampaign, parseBasketStorage, buildLiveBasketCheckout, type LiveBasketLine } from '@/lib/commerce/live-basket'
import type { StackCartItem } from '@/lib/commerce/stack-cart'
import type { StoreAttributionCampaign } from '@/lib/commerce/store-attribution'
import { liveCheckoutHref } from '@/lib/commerce/cart-permalink'

const changed = 'tll-live-basket-changed'
function readBasket() {
  try { return parseBasketStorage(localStorage.getItem(LIVE_BASKET_KEY)) } catch { return [] }
}
function writeBasket(lines: LiveBasketLine[], campaign = basketCampaign(localStorage.getItem(LIVE_BASKET_KEY))) {
  localStorage.setItem(LIVE_BASKET_KEY, JSON.stringify({ version: 1, lines, campaign }))
  window.dispatchEvent(new Event(changed))
}
export function useLiveBasket() {
  const [lines, setLines] = useState<LiveBasketLine[]>([])
  useEffect(() => {
    if (!liveCartEnabled()) return
    const refresh = () => setLines(readBasket())
    refresh()
    window.addEventListener(changed, refresh)
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 15000)
    return () => {
      window.removeEventListener(changed, refresh)
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      window.clearInterval(timer)
    }
  }, [])
  return lines
}

export function LiveBasketAdd({ product, className, style, showStock = true, campaign = 'product' }: {
  product: StackCartItem; campaign?: StoreAttributionCampaign; className?: string; style?: CSSProperties; showStock?: boolean
}) {
  const [quantity, setQuantity] = useState(1)
  const [notice, setNotice] = useState('')
  return <span className="flex min-w-0 flex-col justify-center gap-1" data-offer-state="live_basket">
    {showStock && <span className="text-center text-[10px] text-lab-muted">In stock at TLL Store</span>}
    <span className="flex min-w-0 items-stretch gap-1">
      <select aria-label={`Pack quantity for ${product.brand} ${product.name}`} value={quantity}
        onChange={event => { setQuantity(Number(event.target.value)); setNotice('') }}
        className="min-h-11 w-12 shrink-0 rounded-lg border border-lab-border bg-white text-xs text-black">
        {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
      </select>
      <button type="button" className={`${className ?? ''} flex min-h-11 min-w-0 flex-1 items-center justify-center px-2 text-center`} style={style}
        onClick={() => {
          if (!liveCartEnabled()) return
          try { writeBasket(addBasketLine(readBasket(), { ...product, quantity }), campaign); setNotice('Added to basket') }
          catch (error) { setNotice(error instanceof Error && (error.message.startsWith('Maximum') || error.message === 'This offer is unavailable. Refresh the product page.') ? error.message : 'Basket unavailable. Refresh the product page and allow browser storage.') }
        }}>Add to basket</button>
    </span>
    <span className="relative min-w-0 text-center text-[9px] leading-tight text-lab-muted">
      <span className={notice ? 'invisible' : undefined}>In stock · price and stock checked within 15 minutes</span>
      <span role="status" title={notice || undefined} className="absolute inset-0 truncate">{notice && <Link href="/cart">{notice}</Link>}</span>
    </span>
  </span>
}

export function LiveBasketContents() {
  const lines = useLiveBasket()
  const [notice, setNotice] = useState('')
  if (!liveCartEnabled()) return null
  let campaign: StoreAttributionCampaign = 'product'
  try { campaign = basketCampaign(localStorage.getItem(LIVE_BASKET_KEY)) } catch { /* server or blocked storage */ }
  const href = buildLiveBasketCheckout(lines, campaign)
  function update(id: string, quantity: number) {
    try {
      writeBasket(readBasket().flatMap(line => line.variantId !== id ? [line] : quantity ? [{ ...line, quantity }] : []))
      setNotice('')
    } catch { setNotice('Basket unavailable. Allow browser storage and try again.') }
  }
  return <div className="space-y-4">
    {lines.length ? <ul className="space-y-4">{lines.map(line => {
      const id = line.variantId
      const price = line.shownPrice
      return <li key={id} className="rounded-lg border border-lab-border p-4">
        <Link href={`/products/${encodeURIComponent(line.id)}?variant=${encodeURIComponent(id)}`} className="font-semibold">{line.brand} {line.name}</Link>
        {line.variantLabel && <p className="text-sm">{line.variantLabel}</p>}
        <p>{price === null ? 'Not listed' : `£${price.toFixed(2)} per pack · £${(price * line.quantity).toFixed(2)}`}</p>
        <label>Quantity <select aria-label={`Quantity for ${line.name}`} value={line.quantity} onChange={event => update(id, Number(event.target.value))} className="min-h-11 border bg-white text-black">
          {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select></label>{' '}
        <button type="button" className="min-h-11 underline" onClick={() => update(id, 0)}>Remove {line.name}</button>
      </li>
    })}</ul> : <p>Your basket is empty.</p>}
    <p className="text-sm">Price and stock are checked again at Shopify checkout.</p>
    {lines.length > 0 && <p>Estimated total: £{lines.reduce((total, line) => total + line.shownPrice * line.quantity, 0).toFixed(2)}</p>}
    {href && <a href={liveCheckoutHref(href)} className="inline-flex min-h-11 items-center rounded-lg bg-black px-5 font-bold text-white"
      onClick={event => {
        const current = buildLiveBasketCheckout(readBasket(), basketCampaign(localStorage.getItem(LIVE_BASKET_KEY)))
        if (!current || current !== href) { event.preventDefault(); window.dispatchEvent(new Event(changed)); setNotice('Basket changed. Review your items before checkout.') }
      }}>Checkout</a>}
    <p role="status">{notice}</p>
  </div>
}
