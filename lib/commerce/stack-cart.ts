import { buildStoreProductLink, resolveProductListing, type ProductListing } from '../affiliate'
import { isIsolatedEnvironment } from '../preview-mode'
import { catalogueAvailabilityFor, type CataloguePresentation } from './catalogue-presentation'
import type { StoreLinkMapping } from './product-mapping'
import type { StorePricePresentation } from './store-price-products'

export type StackCartItem = {
  id: string
  quantity: number // Packs, never daily servings.
  name?: string
  brand?: string
  buy_url?: string | null
  storeLinkMapping?: StoreLinkMapping | null
  cataloguePresentation?: CataloguePresentation | null
  storePrice?: StorePricePresentation | null
}
export type StackCartLine = { merchandiseId: string; quantity: number }
export function stackCartEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TLL_STACK_CART === 'enabled' && !isIsolatedEnvironment()
}
export function stackStorefrontCartEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TLL_STACK_STOREFRONT_CART === 'enabled' && stackCartEnabled()
}

/** One classification for both the cart and the explanation of skipped items. */
export function splitStackCartItems(items: readonly StackCartItem[], now = Date.now()) {
  const storeItems: StackCartItem[] = []
  const outOfStock: StackCartItem[] = []
  const affiliateOnly: { item: StackCartItem; listing: ProductListing }[] = []
  const unavailable: StackCartItem[] = []
  for (const item of items) {
    if (!buildStoreProductLink(item.id, item.storeLinkMapping, now)) {
      const listing = resolveProductListing(item.buy_url)
      if (!item.storeLinkMapping && listing.relationship === 'affiliate' && listing.url) affiliateOnly.push({ item, listing })
      else unavailable.push(item)
      continue
    }
    const availability = catalogueAvailabilityFor(item, now)
    if (availability === 'out_of_stock') outOfStock.push(item)
    else if (availability === 'unavailable' ||
      (process.env.NEXT_PUBLIC_TLL_STORE_PRICES === 'enabled' && availability !== 'available')) unavailable.push(item)
    else storeItems.push(item)
  }
  return { storeItems, outOfStock, affiliateOnly, unavailable }
}

/** Existing public mapping approval checks; no CSV lookup, credentials or requests. */
export function buildStackCartLines(items: readonly StackCartItem[], now = Date.now()): StackCartLine[] {
  const quantities = new Map<string, number>()
  for (const item of splitStackCartItems(items, now).storeItems) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error('Invalid pack quantity')
    const variant = item.storeLinkMapping!.shopifyVariantId.replace('gid://shopify/ProductVariant/', '')
    const total = (quantities.get(variant) ?? 0) + item.quantity
    if (!Number.isSafeInteger(total)) throw new Error('Invalid pack quantity')
    quantities.set(variant, total)
  }
  return Array.from(quantities, ([id, quantity]) => ({ merchandiseId: `gid://shopify/ProductVariant/${id}`, quantity }))
}
export function buildStackCartUrl(items: readonly StackCartItem[], now = Date.now()): string | null {
  const lines = buildStackCartLines(items, now)
  return lines.length ? `https://shop.theliftinglab.co.uk/cart/${lines.map(line => `${line.merchandiseId.replace('gid://shopify/ProductVariant/', '')}:${line.quantity}`).join(',')}` : null
}
