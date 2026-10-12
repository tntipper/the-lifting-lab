import { buildStackCartUrl, stackCartEnabled, stackStorefrontCartEnabled, type StackCartItem } from '@/lib/commerce/stack-cart'

export default function BuyMyStack({ items, ready }: { items: readonly StackCartItem[]; ready: boolean }) {
  if (!stackCartEnabled() || !ready) return null
  const url = buildStackCartUrl(items)
  if (!url) return null
  // TODO(Toby/Lifty): approve a server-only Storefront binding before enabling Phase 2.
  if (stackStorefrontCartEnabled()) return <p role="status" className="mt-4 text-sm">Storefront checkout is awaiting setup.</p>
  return <div className="mt-4">
    <a href={url} className="inline-flex min-h-11 items-center rounded-lg bg-[#14140f] px-5 text-sm font-bold text-white">Buy my stack</a>
    <p className="mt-2 text-xs text-[#62645c]">Adds one pack of each approved store item. Check quantities, price and availability in the store cart.</p>
  </div>
}
