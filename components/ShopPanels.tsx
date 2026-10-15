'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import AccessibleDialog from './AccessibleDialog'
import { useLocalStack } from './LocalStackContext'
import { useStagingCart } from './StagingCartContext'
import StackSummary from './StackSummary'
import CompareBar from './CompareBar'
import CompareTable from './CompareTable'
import { ShopPanelsContext, panelMoney, type BasketLine, type PanelsContext } from './ShopPanelsContext'
import { isIsolatedEnvironment } from '@/lib/preview-mode'
import ProductOfferLink from './ProductOfferLink'
import type { ScoredProduct } from '@/lib/products'
import { track } from '@/lib/gtag'

export { useShopPanels, BasketAddButton } from './ShopPanelsContext'

export function ShopPanelsProvider({ children }: { children: ReactNode }) {
  const cart = useStagingCart()
  const { stack } = useLocalStack()
  const [panel, setPanel] = useState<'basket' | 'stack' | null>(null)
  const [basket, setBasket] = useState<BasketLine[]>([])
  const [compared, setCompared] = useState<ScoredProduct[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  const [toast, setToast] = useState<{ name: string } | null>(null)
  const title = useId(), compareTitle = useId()
  const trigger = useRef<HTMLElement | null>(null)
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2400); return () => clearTimeout(timer) }, [toast])
  function capture() { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }
  function closePanel() { setPanel(null) }
  function openBasket() { if (cart?.enabled) { setPanel(null); cart.open(); return }; capture(); setPanel('basket') }
  function removeCompare(id: string) {
    // Move focus before removing a focused column/slot.
    const dialog = document.activeElement?.closest('dialog')
    dialog?.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus()
    setCompared(items => items.filter(item => item.id !== id))
  }
  function addToBasket(product: ScoredProduct) {
    if (cart?.enabled) {
      if (cart.view?.productId === product.id) void cart.setQuantity(cart.view.quantity + 1, product.id)
      return
    }
    setBasket(lines => {
      const existing = lines.find(line => line.product.id === product.id)
      return existing ? lines.map(line => line === existing ? { product, quantity: line.quantity + 1 } : line) : [...lines, { product, quantity: 1 }]
    })
    setToast({ name: product.name })
  }
  const value: PanelsContext = {
    panel, openBasket, openStack: () => { capture(); setPanel('stack') }, closePanel, basket, addToBasket,
    setBasketQuantity: (id, quantity) => {
      if (!Number.isSafeInteger(quantity) || quantity < 0) return
      if (quantity === 0) document.activeElement?.closest('dialog')?.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus()
      setBasket(lines => lines.flatMap(line => line.product.id !== id ? [line] : quantity > 0 ? [{ ...line, quantity }] : []))
    },
    compared, toggleCompare: product => setCompared(items => items.some(item => item.id === product.id) ? items.filter(item => item.id !== product.id) : items.length < 3 ? [...items, product] : items),
    removeCompare, clearCompare: () => setCompared([]),
  }
  const subtotal = basket.every(line => typeof line.product.retail_price === 'number' && line.product.retail_price > 0)
    ? basket.reduce((sum, line) => sum + line.product.retail_price! * line.quantity, 0) : null
  return <ShopPanelsContext.Provider value={value}>
    {children}
    <AccessibleDialog open={panel !== null} onClose={closePanel} labelledBy={title} returnFocusRef={trigger} className="shop-drawer">
      <div className="shop-panel-heading"><h2 id={title}>{panel === 'stack' ? 'My Stack' : 'Basket'}</h2><button type="button" data-dialog-initial-focus onClick={closePanel} aria-label={`Close ${panel === 'stack' ? 'My Stack' : 'Basket'}`}>Close</button></div>
      {panel === 'stack' ? <StackSummary onClose={closePanel} /> : <>
        {!isIsolatedEnvironment() && process.env.NEXT_PUBLIC_TLL_STORE_LINKS === 'enabled' && <a className="shop-primary" href="https://shop.theliftinglab.co.uk/cart">Open your TLL Store basket</a>}
        <p className="shop-muted">Saved in this browser for this visit. Prices are recorded catalogue prices. Check pack, price and availability at the retailer before buying.</p>
        {basket.length === 0 ? <><p>Your basket is empty.</p><Link className="shop-primary" href="/products" onClick={closePanel}>Browse products</Link></> : <section className="shop-summary" aria-label="Basket items">
          {basket.map(({ product, quantity }) => <div key={product.id} className="shop-basket-line">
            <div><p className="shop-eyebrow">{product.brand}</p><Link href={`/products/${product.id}`} onClick={closePanel}>{product.name}</Link></div>
            <b className="shop-mono">{panelMoney(product.retail_price == null ? null : product.retail_price * quantity)}</b>
            <div className="shop-quantity"><button type="button" aria-label={`Remove one ${product.name}`} onClick={() => value.setBasketQuantity(product.id, quantity - 1)}>−</button><span className="shop-mono">{quantity}</span><button type="button" aria-label={`Add one ${product.name}`} onClick={() => value.setBasketQuantity(product.id, quantity + 1)}>+</button></div>
            <span className="shop-muted shop-mono">{panelMoney(product.retail_price)} each</span>
            <div className="shop-basket-offer"><ProductOfferLink product={product} className="shop-secondary" /></div>
          </div>)}
          <div className="shop-total"><span>Recorded subtotal</span><b className="shop-mono">{panelMoney(subtotal)}</b></div>
          <p className="shop-muted">Delivery is £4.99 per store order. This browser basket has not been sent to Shopify.</p>
          <Link className="shop-primary" href="/products" onClick={closePanel}>Continue browsing</Link>
        </section>}
      </>}
    </AccessibleDialog>
    <CompareBar onCompare={() => { capture(); track('compare_start', { count: compared.length }); setCompareOpen(true) }} />
    <AccessibleDialog open={compareOpen && compared.length >= 2} onClose={() => setCompareOpen(false)} labelledBy={compareTitle} returnFocusRef={trigger} className="shop-compare-dialog">
      <div className="shop-panel-heading"><h2 id={compareTitle}>Compare products</h2><button type="button" data-dialog-initial-focus onClick={() => setCompareOpen(false)}>Close</button></div>
      <CompareTable products={compared} onRemove={id => { if (compared.length <= 2) setCompareOpen(false); removeCompare(id) }} />
    </AccessibleDialog>
    <div role="status" aria-live="polite" aria-atomic="true" className={toast ? 'shop-toast' : 'sr-only'}>{toast ? `Added ${toast.name} to your basket` : ''}</div>
    <button type="button" className={`shop-stack-trigger${compared.length ? ' shop-stack-trigger-raised' : ''}`} onClick={value.openStack} aria-label="My Stack" aria-haspopup="dialog" aria-expanded={panel === 'stack'}>My stack <span className="shop-mono">{stack.length}</span></button>
  </ShopPanelsContext.Provider>
}
