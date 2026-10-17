import type { StoreLinkMapping } from './product-mapping'
import { withStoreAttribution, type StoreAttributionCampaign } from './store-attribution'

export type StoreBuyLinkMode = 'product_page' | 'cart'
// Toby's Buy default: exact in-stock variants go to cart. STORE_LINKS remains OFF by default.
export const DEFAULT_STORE_BUY_LINK_MODE: StoreBuyLinkMode = 'cart'

/** Exact destination only; string IDs avoid losing precision on large Shopify IDs. */
export function buildStoreProductLink(productId: string | undefined, mapping?: StoreLinkMapping | null, now = Date.now(), options: { mode?: StoreBuyLinkMode; inStock?: boolean; campaign?: StoreAttributionCampaign } = {}): string | null {
  const review = mapping?.review
  if (!productId || mapping?.productId !== productId || mapping.active !== true || mapping.approved !== true ||
      !review || review.approved !== true || typeof review.version !== 'string' || !review.version.trim() || review.version !== review.expectedVersion ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(review.verifiedAtMs) || review.verifiedAtMs < 0 ||
      review.verifiedAtMs > now || !Number.isSafeInteger(review.expiresAtMs) || review.expiresAtMs <= now ||
      typeof mapping.shopifyProductHandle !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mapping.shopifyProductHandle) ||
      typeof mapping.shopifyVariantId !== 'string') return null
  const variant = /^(?:gid:\/\/shopify\/ProductVariant\/)?([1-9][0-9]*)$/.exec(mapping.shopifyVariantId)?.[1]
  if (!variant) return null
  if ((options.mode ?? DEFAULT_STORE_BUY_LINK_MODE) === 'cart' && options.inStock === true)
    return withStoreAttribution(`https://shop.theliftinglab.co.uk/cart/${variant}:1`, options.campaign ?? 'product')
  return withStoreAttribution(`https://shop.theliftinglab.co.uk/products/${mapping.shopifyProductHandle}?variant=${variant}`, options.campaign ?? 'product')
}

