import { buildStackCartUrl, splitStackCartItems, stackCartEnabled, stackStorefrontCartEnabled, type StackCartItem } from '@/lib/commerce/stack-cart'

const itemName = (item: StackCartItem) => [item.brand, item.name || item.id].filter(Boolean).join(' ')

export default function BuyMyStack({ items, ready }: { items: readonly StackCartItem[]; ready: boolean }) {
  if (!stackCartEnabled() || !ready || !items.length) return null
  const now = Date.now()
  const { storeItems, outOfStock, affiliateOnly, unavailable } = splitStackCartItems(items, now)
  const url = buildStackCartUrl(storeItems, now)
  // TODO(Toby/Lifty): approve a server-only Storefront binding before enabling Phase 2.
  const awaitingSetup = stackStorefrontCartEnabled()
  return <div className="stack-cart-root mt-4 space-y-4">
    {url ? awaitingSetup ? <p role="status" className="text-sm">Storefront checkout is awaiting setup.</p> : <div>
      <div className="stack-cart-action fixed inset-x-0 bottom-0 z-50 border-t border-[#a8aaa0] bg-white px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:border-0 md:bg-transparent md:p-0">
        <a href={url} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#14140f] px-5 text-sm font-bold text-white md:w-auto">Buy my stack</a>
      </div>
      <p className="mt-2 text-xs text-[#62645c]">Adds the listed pack quantities of approved store items. Items listed below are skipped. Check quantities, price and availability in the store cart.</p>
    </div> : <p role="status" className="text-sm">No store items can be added to your cart right now.</p>}
    {outOfStock.length > 0 && <section aria-label="Out of stock" className="rounded-lg border border-[#a8aaa0] p-4 text-sm">
      <h2 className="font-bold">Out of stock</h2>
      <ul className="mt-2 space-y-2">{outOfStock.map((item, index) => <li key={`${item.id}-${index}`}>
        <span className="font-semibold">{itemName(item)}</span> — skipped from your cart. Check back for stock or choose an alternative from the comparison pages.
      </li>)}</ul>
    </section>}
    {affiliateOnly.length > 0 && <section aria-label="Not sold in our store" className="rounded-lg border border-[#a8aaa0] p-4 text-sm">
      <h2 className="font-bold">Not sold in our store</h2>
      <p className="mt-2">These items are skipped from your cart. You can view them separately at their retailers.</p>
      <ul className="mt-2 space-y-2">{affiliateOnly.map(({ item, listing }, index) => <li key={`${item.id}-${index}`}>
        <span className="font-semibold">{itemName(item)}</span>{' — '}
        <a href={listing.url!} target="_blank" rel="noopener noreferrer nofollow sponsored" className="inline-flex min-h-11 items-center underline"
          aria-label={`${listing.state === 'search_only' ? 'Search' : 'View listing at'} ${listing.retailer} for ${itemName(item)} (opens in a new tab)`}>
          {listing.state === 'search_only' ? 'Search' : 'View listing at'} {listing.retailer} ↗
        </a>
        <p className="text-xs text-[#62645c]">Affiliate link · {listing.state === 'search_only' ? 'retailer search' : 'unverified listing'} · check pack, price and stock.</p>
      </li>)}</ul>
    </section>}
    {unavailable.length > 0 && <section aria-label="Store availability under review" className="rounded-lg border border-[#a8aaa0] p-4 text-sm">
      <h2 className="font-bold">Store availability under review</h2>
      <ul className="mt-2 space-y-2">{unavailable.map((item, index) => <li key={`${item.id}-${index}`}>
        <span className="font-semibold">{itemName(item)}</span>{' — '}{(item.storeVariants?.length ?? 0) > 1
          ? <a href={`/products/${encodeURIComponent(item.id)}`} className="inline-flex min-h-11 items-center underline">Choose flavour on product page</a>
          : 'skipped from your cart. Store approval, price or stock could not be confirmed; check back or choose an alternative from the comparison pages.'}
      </li>)}</ul>
    </section>}
  </div>
}
