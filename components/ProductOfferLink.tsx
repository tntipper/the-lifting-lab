'use client'

import type { CSSProperties } from 'react'
import { resolveProductListing } from '@/lib/affiliate'
import { track } from '@/lib/gtag'
import { StagingCartAdd } from './StagingCartActions'
import { useStagingCart } from './StagingCartContext'

/** Interim listing navigation, until a verified commerce projection supplies exact offers. */
export default function ProductOfferLink({ product, className, style }: {
  product: { id?: string; brand: string; name: string; buy_url: string | null }
  className?: string
  style?: CSSProperties
}) {
  const cart = useStagingCart()
  if (cart?.enabled && product.id && cart.view?.productId === product.id) return <span className="flex min-w-0 flex-col gap-1" data-offer-state="staging_test_cart">
    <StagingCartAdd productId={product.id} />
    <span className="text-center text-[9px] text-lab-muted">Synthetic test item · no checkout</span>
  </span>
  const listing = resolveProductListing(product.buy_url)
  if (!listing.url) {
    return <span className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-lab-border px-2 py-2 text-center text-[10px] text-lab-muted"
      data-offer-state="unavailable">
      <span>{listing.relationship === 'own_shop' ? 'Shop offer under review' : 'No verified offer'}</span>
    </span>
  }
  const search = listing.state === 'search_only'
  return <span className="flex min-w-0 flex-col justify-center gap-1" data-offer-state={listing.state}>
    <a href={listing.url} target="_blank" rel="noopener noreferrer nofollow sponsored"
      className={`${className ?? ''} flex min-h-11 items-center justify-center px-2 text-center break-words`}
      style={style}
      aria-label={`${search ? 'Search' : 'View listing at'} ${listing.retailer} for ${product.brand} ${product.name} (opens in a new tab)`}
      onClick={() => track('retailer_listing_click', { retailer: listing.retailer ?? undefined, destination_state: listing.state })}>
      {search ? 'Search retailer ↗' : 'View retailer ↗'}
    </a>
    <span className="text-center text-[9px] leading-tight text-lab-muted">
      {search ? 'Search results · affiliate link' : 'Unverified listing · check pack and price · affiliate link'}
    </span>
  </span>
}
