'use client'

import type { CSSProperties } from 'react'
import { DEFAULT_STORE_BUY_LINK_MODE, resolveProductOffer, type StoreBuyLinkMode } from '@/lib/affiliate'
import type { StorePricePresentation } from '@/lib/commerce/store-price-products'
import type { StoreLinkMapping, StoreVariantOption } from '@/lib/commerce/product-mapping'
import type { StoreAttributionCampaign } from '@/lib/commerce/store-attribution'
import { track } from '@/lib/gtag'
import { StagingCartAdd } from './StagingCartActions'
import { useStagingCart } from './StagingCartContext'
import { catalogueAvailabilityFor, type CataloguePresentation } from '@/lib/commerce/catalogue-presentation'

/** Interim listing navigation, until a verified commerce projection supplies exact offers. */
export default function ProductOfferLink({ product, className, style, storeBuyLinkMode = DEFAULT_STORE_BUY_LINK_MODE, storeCampaign = 'product', pickerOwnsStatus = false, chooseAnother = false, storeActionLabel, comingSoonWhenNotSold = false }: {
  product: { id?: string; brand: string; name: string; buy_url: string | null; cataloguePresentation?: CataloguePresentation | null; storeLinkMapping?: StoreLinkMapping | null; storeVariants?: StoreVariantOption[]; storePrice?: StorePricePresentation | null }
  /** Show a disabled action when no store offer or retailer link is available. */
  comingSoonWhenNotSold?: boolean
  /** Label for the existing exact store cart action; never applied to searches or product-page offers. */
  storeActionLabel?: string
  pickerOwnsStatus?: boolean
  /** True only when a multi-variant picker offers other choices. */
  chooseAnother?: boolean
  className?: string
  style?: CSSProperties
  storeBuyLinkMode?: StoreBuyLinkMode
  storeCampaign?: StoreAttributionCampaign
}) {
  const cart = useStagingCart()
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
  const stock = product.storePrice ? catalogueAvailabilityFor(product) : null
  if (!listing.url) {
    return <span className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-lab-border px-2 py-2 text-center text-[10px] text-lab-muted"
      data-offer-state="unavailable">
      {!pickerOwnsStatus && stock && <span>{stock === 'out_of_stock' ? 'Out of stock at TLL Store' : stock === 'unavailable' ? 'TLL Store price and stock unavailable' : 'In stock at TLL Store'}</span>}
      <span>{stock === 'out_of_stock' ? (chooseAnother ? 'Out of stock: choose another flavour/size' : 'Currently unavailable to buy') : listing.relationship === 'own_shop' ? 'Shop offer under review' : 'No verified offer'}</span>
    </span>
  }
  const search = listing.state === 'search_only'
  const store = listing.reason === 'approved_store_mapping'
  return <span className="flex min-w-0 flex-col justify-center gap-1" data-offer-state={listing.state}>
    {!pickerOwnsStatus && stock && <span className="text-center text-[10px] text-lab-muted">{stock === 'out_of_stock' ? 'Out of stock at TLL Store' : stock === 'unavailable' ? 'TLL Store price and stock unavailable' : 'In stock at TLL Store'}</span>}
    <a href={listing.url} target="_blank" rel={store ? 'noopener noreferrer' : 'noopener noreferrer nofollow sponsored'}
      className={actionClassName}
      style={style}
      aria-label={`${store ? 'Buy at' : search ? 'Search' : 'View listing at'} ${listing.retailer} for ${product.brand} ${product.name} (opens in a new tab)`}
      onClick={() => track('retailer_listing_click', { retailer: listing.retailer ?? undefined, destination_state: listing.state })}>
      {store ? (storeBuyLinkMode === 'cart' && product.storePrice?.availableForSale === true ? storeActionLabel ?? 'Buy at TLL Store' : 'Buy at TLL Store') : search ? 'Search retailer ↗' : 'View retailer ↗'}
    </a>
    <span className="text-center text-[9px] leading-tight text-lab-muted">
      {store ? product.storePrice ? 'In stock · price and stock checked within 15 minutes' : 'Check pack, price and stock at TLL Store' : search ? 'Retailer search · affiliate link' : 'Unverified listing · check pack and price · affiliate link'}
    </span>
  </span>
}
