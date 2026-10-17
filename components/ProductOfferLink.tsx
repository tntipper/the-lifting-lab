'use client'

import { liveCartEnabled, isTllSoldProduct } from '@/lib/commerce/live-cart-mode'
import { liveBasketEligible } from '@/lib/commerce/live-basket'
import { LiveBasketAdd } from './LiveBasket'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { DEFAULT_STORE_BUY_LINK_MODE, resolveProductOffer, type StoreBuyLinkMode } from '@/lib/affiliate'
import type { StorePricePresentation } from '@/lib/commerce/store-price-products'
import type { StoreLinkMapping, StoreVariantOption } from '@/lib/commerce/product-mapping'
import type { StoreAttributionCampaign } from '@/lib/commerce/store-attribution'
import { track } from '@/lib/gtag'
import { StagingCartAdd } from './StagingCartActions'
import { useStagingCart } from './StagingCartContext'
import { catalogueAvailabilityFor, type CataloguePresentation } from '@/lib/commerce/catalogue-presentation'

/** Interim listing navigation, until a verified commerce projection supplies exact offers. */
export default function ProductOfferLink({ product, className, style, storeBuyLinkMode = DEFAULT_STORE_BUY_LINK_MODE, storeCampaign = 'product', compact = false, fixedActionSlot = false, pickerOwnsStatus = false, chooseAnother = false, storeActionLabel, variantLabel, comingSoonWhenNotSold = false }: {
  product: { id?: string; brand: string; name: string; buy_url: string | null; cataloguePresentation?: CataloguePresentation | null; storeLinkMapping?: StoreLinkMapping | null; storeVariants?: StoreVariantOption[]; storePrice?: StorePricePresentation | null }
  /** Show a disabled action when no store offer or retailer link is available. */
  comingSoonWhenNotSold?: boolean
  /** Label for the existing exact store cart action; never applied to searches or product-page offers. */
  storeActionLabel?: string
  compact?: boolean
  /** ProductGrid alone reserves a 64px action slot. */
  fixedActionSlot?: boolean
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
  // Server and hydration share a fixed shell; fresh add eligibility is checked after mount.
  const [eligibilityTime, setEligibilityTime] = useState<number | null>(null)
  useEffect(() => { if (liveCartEnabled()) setEligibilityTime(Date.now()) }, [product])
  const liveMode = liveCartEnabled()
  const fixedSlot = liveMode && fixedActionSlot && !compact
  const frame = (content: ReactNode) => fixedSlot
    ? <span className="flex h-16 min-w-0 flex-col justify-start" data-live-offer-shell>{content}</span>
    : content
  const listing = resolveProductOffer(product, storeBuyLinkMode, storeCampaign)
  const actionClassName = `${className ?? ''} flex min-h-11 items-center justify-center px-2 text-center break-words`
  if (comingSoonWhenNotSold && !listing.url && listing.relationship !== 'own_shop' && !product.storeLinkMapping && !product.storeVariants?.length && !product.cataloguePresentation && !product.storePrice && !(cart?.enabled && product.id && cart.view?.productId === product.id)) {
    return <span className="flex min-w-0 flex-col justify-center gap-1" data-offer-state="coming_soon">
      <button type="button" disabled aria-disabled="true" className={actionClassName} style={{ ...style, opacity: .55, cursor: 'not-allowed' }}>Coming soon</button>
      <span aria-hidden="true" className="invisible text-center text-[9px] leading-tight text-lab-muted">Check pack, price and stock at TLL Store</span>
    </span>
  }
  const availability = catalogueAvailabilityFor({ id: product.id, cataloguePresentation: product.cataloguePresentation })
  if (pickerOwnsStatus && (availability || (product.storePrice && catalogueAvailabilityFor(product) !== 'available'))) {
    return frame(<span data-offer-state="unavailable" className="text-xs text-lab-muted">
      {availability ? 'Purchasing not enabled' : catalogueAvailabilityFor(product) === 'out_of_stock' && chooseAnother ? 'Out of stock: choose another flavour/size' : null}
    </span>)
  }
  if (availability) return frame(<span className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-lab-border px-2 py-2 text-center text-[10px] text-lab-muted"
    style={fixedSlot ? { height: 44, minHeight: 44 } : undefined} data-offer-state={availability}>
    <span>{availability === 'out_of_stock' ? 'Out of stock' : availability === 'available' ? 'In stock' : 'Availability under review'}</span>
    <span className="text-[9px]">{availability === 'out_of_stock' ? 'Currently unavailable to buy' : 'Purchasing not enabled'}</span>
  </span>)
  if (cart?.enabled && product.id && cart.view?.productId === product.id) return <span className="flex min-w-0 flex-col gap-1" data-offer-state="staging_test_cart">
    <StagingCartAdd productId={product.id} />
    <span className="text-center text-[9px] text-lab-muted">Synthetic test item · no checkout</span>
  </span>
  if (!(liveMode && compact && isTllSoldProduct(product)) && product.id && (product.storeVariants?.length ?? 0) > 1) return frame(<a href={`/products/${encodeURIComponent(product.id)}`}
    className={`${className ?? ''} flex min-h-11 items-center justify-center px-2 text-center`} style={style}>
    Choose flavour on product page
  </a>)
  const item = product.id ? { ...product, id: product.id, quantity: 1, variantLabel } : null
  const basketItem = liveCartEnabled() && eligibilityTime !== null && item && liveBasketEligible(item, eligibilityTime) ? item : null
  const live = liveCartEnabled() && isTllSoldProduct(product, eligibilityTime ?? Date.now())
  const stock = product.storePrice ? catalogueAvailabilityFor(product) : null
  const renderOffer = (listing: ReturnType<typeof resolveProductOffer>) => {
    if (!listing.url) {
      return (<span className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-lab-border px-2 py-2 text-center text-[10px] text-lab-muted"
        data-offer-state="unavailable">
        {!pickerOwnsStatus && stock && <span>{stock === 'out_of_stock' ? 'Out of stock at TLL Store' : stock === 'unavailable' ? 'TLL Store price and stock unavailable' : 'In stock at TLL Store'}</span>}
        <span>{stock === 'out_of_stock' ? (chooseAnother ? 'Out of stock: choose another flavour/size' : 'Currently unavailable to buy') : listing.relationship === 'own_shop' ? 'Shop offer under review' : 'No verified offer'}</span>
      </span>)
    }
    const search = listing.state === 'search_only'
    const store = listing.reason === 'approved_store_mapping'
    const stockText = !pickerOwnsStatus && stock ? (stock === 'out_of_stock' ? 'Out of stock at TLL Store' : stock === 'unavailable' ? 'TLL Store price and stock unavailable' : 'In stock at TLL Store') : null
    const caption = store ? product.storePrice ? 'In stock · price and stock checked within 15 minutes' : 'Check pack, price and stock at TLL Store' : search ? 'Retailer search · affiliate link' : 'Unverified listing · check pack and price · affiliate link'
    return (<span className={`flex min-w-0 flex-col justify-center ${fixedSlot ? "gap-0" : "gap-1"}`} data-offer-state={listing.state}>
      {!fixedSlot && stockText && <span className="text-center text-[10px] text-lab-muted">{stockText}</span>}
      <a href={listing.url} target="_blank" rel={store ? 'noopener noreferrer' : 'noopener noreferrer nofollow sponsored'}
        className={actionClassName}
        style={fixedSlot ? { ...style, height: 44, minHeight: 44, flexShrink: 0, paddingTop: 0, paddingBottom: 0 } : style}
        title={fixedSlot && stockText ? stockText : undefined}
        aria-label={`${store ? 'Buy at' : search ? 'Search' : 'View listing at'} ${listing.retailer} for ${product.brand} ${product.name} (opens in a new tab)${fixedSlot && stockText ? ` · ${stockText}` : ''}`}
        onClick={() => track('retailer_listing_click', { retailer: listing.retailer ?? undefined, destination_state: listing.state })}>
        {store ? (!liveCartEnabled() && storeBuyLinkMode === 'cart' && product.storePrice?.availableForSale === true ? storeActionLabel ?? 'Buy at TLL Store' : 'Buy at TLL Store') : search ? 'Search retailer ↗' : 'View retailer ↗'}
      </a>
      <span className={fixedSlot ? 'text-center text-[9px] text-lab-muted flex h-5 shrink-0 flex-col items-center justify-center' : 'text-center text-[9px] leading-tight text-lab-muted'}
        data-offer-caption={liveMode ? true : undefined} title={fixedSlot ? caption : undefined}>
        {fixedSlot && !store ? <>
          <span className="w-full min-w-0 line-clamp-1 leading-[10px]">{search ? 'Retailer search' : 'Unverified listing · check pack and price'}</span>
          <span className="block shrink-0 whitespace-nowrap leading-[10px]" data-affiliate-disclosure>affiliate link</span>
        </> : fixedSlot ? <span className="line-clamp-2 leading-[10px]">{caption}</span> : caption}
      </span>
    </span>)
  }
  if (!live) return renderOffer(listing)
  // The server link and mounted basket share a 44px action plus one status row.
  // Compact placements retain product navigation without a quantity selector.
  const actionStyle = fixedSlot ? { ...style, height: 44, minHeight: 44, paddingTop: 0, paddingBottom: 0 } : style
  return frame(basketItem && !compact ? <LiveBasketAdd product={basketItem} campaign={storeCampaign} className={className} style={style} showStock={!pickerOwnsStatus} /> :
    <span className="flex min-w-0 flex-col gap-1" data-offer-state={listing.state} data-live-store-link>
      {listing.url ? <a href={listing.url} target="_blank" rel="noopener noreferrer"
        className={`${className ?? ''} flex min-h-11 min-w-0 items-center justify-center px-2 text-center`}
        style={actionStyle}
        aria-label={`Buy at TLL Store for ${product.brand} ${product.name} (opens in a new tab)`}
        onClick={() => track('retailer_listing_click', { retailer: listing.retailer ?? undefined, destination_state: listing.state })}>Buy at TLL Store</a> :
        <span className="flex min-h-11 items-center justify-center rounded-lg border border-lab-border px-2 text-center text-[10px] text-lab-muted" style={fixedSlot ? { height: 44 } : undefined}>
          {stock === 'out_of_stock' ? (chooseAnother ? 'Out of stock: choose another flavour/size' : 'Currently unavailable to buy') : listing.relationship === 'own_shop' ? 'Shop offer under review' : 'No verified offer'}
        </span>}
      {!compact && <span className={`min-w-0 text-center text-[9px] text-lab-muted ${fixedSlot ? "h-4 truncate leading-4" : "leading-tight"}`}>
        {product.storePrice && stock === 'available' ? 'In stock · price and stock checked within 15 minutes' : listing.url ? 'Check pack, price and stock at TLL Store' : stock === 'out_of_stock' ? 'Out of stock at TLL Store' : 'TLL Store price and stock unavailable'}
      </span>}
    </span>)
}
