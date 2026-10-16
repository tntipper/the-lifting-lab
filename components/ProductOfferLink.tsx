'use client'

import { liveCartEnabled } from '@/lib/commerce/live-cart-mode'
import { liveBasketEligible } from '@/lib/commerce/live-basket'
import { LiveBasketAdd } from './LiveBasket'
import { useEffect, useState, type CSSProperties } from 'react'
import { DEFAULT_STORE_BUY_LINK_MODE, resolveProductOffer, resolveLegacyProductOffer, type StoreBuyLinkMode } from '@/lib/affiliate'
import type { StorePricePresentation } from '@/lib/commerce/store-price-products'
import type { StoreLinkMapping, StoreVariantOption } from '@/lib/commerce/product-mapping'
import type { StoreAttributionCampaign } from '@/lib/commerce/store-attribution'
import { track } from '@/lib/gtag'
import { StagingCartAdd } from './StagingCartActions'
import { useStagingCart } from './StagingCartContext'
import { catalogueAvailabilityFor, type CataloguePresentation } from '@/lib/commerce/catalogue-presentation'

/** Interim listing navigation, until a verified commerce projection supplies exact offers. */
export default function ProductOfferLink({ product, className, style, storeBuyLinkMode = DEFAULT_STORE_BUY_LINK_MODE, storeCampaign = 'product', pickerOwnsStatus = false, chooseAnother = false, storeActionLabel, variantLabel }: {
  product: { id?: string; brand: string; name: string; buy_url: string | null; cataloguePresentation?: CataloguePresentation | null; storeLinkMapping?: StoreLinkMapping | null; storeVariants?: StoreVariantOption[]; storePrice?: StorePricePresentation | null }
  /** Label for the existing exact store cart action; never applied to searches or product-page offers. */
  storeActionLabel?: string
  variantLabel?: string
  pickerOwnsStatus?: boolean
  /** True only when a multi-variant picker offers other choices. */
  chooseAnother?: boolean
  className?: string
  style?: CSSProperties
  storeBuyLinkMode?: StoreBuyLinkMode
  storeCampaign?: StoreAttributionCampaign
}) {
  const cart = useStagingCart()
  // Match the server's existing link on hydration; fresh eligibility is checked after mount.
  const [eligibilityTime, setEligibilityTime] = useState<number | null>(null)
  useEffect(() => { if (liveCartEnabled()) setEligibilityTime(Date.now()) }, [product])
  const availability = catalogueAvailabilityFor({ id: product.id, cataloguePresentation: product.cataloguePresentation })
  if (pickerOwnsStatus && (availability || (product.storePrice && catalogueAvailabilityFor(product) !== 'available'))) {
    return <span data-offer-state="unavailable" className="text-xs text-lab-muted">
      {availability ? 'Purchasing not enabled' : catalogueAvailabilityFor(product) === 'out_of_stock' && chooseAnother ? 'Out of stock: choose another flavour/size' : null}
    </span>
  }
  if (availability) return <span className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-lab-border px-2 py-2 text-center text-[10px] text-lab-muted"
    data-offer-state={availability}>
    <span>{availability === 'out_of_stock' ? 'Out of stock' : availability === 'available' ? 'In stock' : 'Availability under review'}</span>
    <span className="text-[9px]">{availability === 'out_of_stock' ? 'Currently unavailable to buy' : 'Purchasing not enabled'}</span>
  </span>
  if (cart?.enabled && product.id && cart.view?.productId === product.id) return <span className="flex min-w-0 flex-col gap-1" data-offer-state="staging_test_cart">
    <StagingCartAdd productId={product.id} />
    <span className="text-center text-[9px] text-lab-muted">Synthetic test item · no checkout</span>
  </span>
  if (product.id && (product.storeVariants?.length ?? 0) > 1) return <a href={`/products/${encodeURIComponent(product.id)}`}
    className={`${className ?? ''} flex min-h-11 items-center justify-center px-2 text-center`} style={style}>
    Choose flavour on product page
  </a>
  const item = product.id ? { ...product, id: product.id, quantity: 1, variantLabel } : null
  const basketItem = liveCartEnabled() && eligibilityTime !== null && item && liveBasketEligible(item, eligibilityTime) ? item : null
  // Keep the flag-off action as an inert sizing shell: hydration and notices cannot resize cards.
  const frame = (fallback: React.ReactNode) => basketItem ? <span className="relative block min-h-11 min-w-0">
    <span className="invisible block pointer-events-none" aria-hidden="true" inert>{fallback}</span>
    <span className="absolute inset-0"><LiveBasketAdd product={basketItem} campaign={storeCampaign} className={className} style={style} showStock={!pickerOwnsStatus} /></span>
  </span> : fallback
  const listing = basketItem ? resolveLegacyProductOffer(product, storeBuyLinkMode, storeCampaign) : resolveProductOffer(product, storeBuyLinkMode, storeCampaign)
  const stock = product.storePrice ? catalogueAvailabilityFor(product) : null
  if (!listing.url) {
    return frame(<span className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-lab-border px-2 py-2 text-center text-[10px] text-lab-muted"
      data-offer-state="unavailable">
      {!pickerOwnsStatus && stock && <span>{stock === 'out_of_stock' ? 'Out of stock at TLL Store' : stock === 'unavailable' ? 'TLL Store price and stock unavailable' : 'In stock at TLL Store'}</span>}
      <span>{stock === 'out_of_stock' ? (chooseAnother ? 'Out of stock: choose another flavour/size' : 'Currently unavailable to buy') : listing.relationship === 'own_shop' ? 'Shop offer under review' : 'No verified offer'}</span>
    </span>)
  }
  const search = listing.state === 'search_only'
  const store = listing.relationship === 'own_shop'
  return frame(<span className="flex min-w-0 flex-col justify-center gap-1" data-offer-state={listing.state}>
    {!pickerOwnsStatus && stock && <span className="text-center text-[10px] text-lab-muted">{stock === 'out_of_stock' ? 'Out of stock at TLL Store' : stock === 'unavailable' ? 'TLL Store price and stock unavailable' : 'In stock at TLL Store'}</span>}
    <a href={listing.url} target="_blank" rel={store ? 'noopener noreferrer' : 'noopener noreferrer nofollow sponsored'}
      className={`${className ?? ''} flex min-h-11 items-center justify-center px-2 text-center break-words`}
      style={style}
      aria-label={`${store ? 'Buy at' : search ? 'Search' : 'View listing at'} ${listing.retailer} for ${product.brand} ${product.name} (opens in a new tab)`}
      onClick={() => track('retailer_listing_click', { retailer: listing.retailer ?? undefined, destination_state: listing.state })}>
      {store ? (!liveCartEnabled() && storeBuyLinkMode === 'cart' && product.storePrice?.availableForSale === true ? storeActionLabel ?? 'Buy at TLL Store' : 'Buy at TLL Store') : search ? 'Search retailer ↗' : 'View retailer ↗'}
    </a>
    <span className="text-center text-[9px] leading-tight text-lab-muted">
      {store ? product.storePrice ? 'In stock · price and stock checked within 15 minutes' : 'Check pack, price and stock at TLL Store' : search ? 'Search results · affiliate link' : 'Unverified listing · check pack and price · affiliate link'}
    </span>
  </span>)
}
