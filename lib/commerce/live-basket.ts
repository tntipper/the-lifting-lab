import { catalogueAvailabilityFor } from './catalogue-presentation'
import { displayPrice } from './display-price'
import { buildStackCartLines, splitStackCartItems, type StackCartItem } from './stack-cart'
import { buildCartPermalink } from './cart-permalink'
import type { StoreAttributionCampaign } from './store-attribution'

export const LIVE_BASKET_KEY = 'tll.live-basket.v1'
export type LiveBasketLine = StackCartItem & { name: string; brand: string; variantLabel?: string }

/** Recheck approval, exact selection and fresh stock even when price flags are off. */
export function liveBasketEligible(item: StackCartItem, now = Date.now()): boolean {
  return !item.cataloguePresentation && catalogueAvailabilityFor(item, now) === 'available' &&
    displayPrice({ ...item, retail_price: null }) !== null && splitStackCartItems([item], now).storeItems.length === 1
}

/** Rebuild a small public projection; never persist the caller's whole product. */
export function basketLine(value: unknown, now = Date.now()): LiveBasketLine | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const item = value as LiveBasketLine
    if (typeof item.id !== 'string' || !item.id || item.id.length > 200 ||
      typeof item.name !== 'string' || !item.name || item.name.length > 500 ||
      typeof item.brand !== 'string' || item.brand.length > 200 ||
      !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10 || !liveBasketEligible(item, now)) return null
    const mapping = item.storeLinkMapping!, review = mapping.review, price = item.storePrice!
    return { id: item.id, name: item.name, brand: item.brand, quantity: item.quantity,
      ...(typeof item.variantLabel === 'string' && item.variantLabel.length <= 500 ? { variantLabel: item.variantLabel } : {}),
      storeLinkMapping: { productId: mapping.productId, shopifyProductHandle: mapping.shopifyProductHandle,
        shopifyVariantId: mapping.shopifyVariantId.replace('gid://shopify/ProductVariant/', ''), active: true, approved: true,
        review: { approved: true, version: review.version, expectedVersion: review.expectedVersion, verifiedAtMs: review.verifiedAtMs, expiresAtMs: review.expiresAtMs } },
      storePrice: { productId: price.productId, price: price.price, availableForSale: price.availableForSale, observedAtMs: price.observedAtMs } }
  } catch { return null }
}

export function parseBasketStorage(raw: string | null, now = Date.now()): LiveBasketLine[] {
  if (!raw || raw.length > 100000) return []
  try {
    const data = JSON.parse(raw)
    if (data?.version !== 1 || !Array.isArray(data.lines) || data.lines.length > 20) return []
    const lines: LiveBasketLine[] = [], seen = new Set<string>()
    for (const value of data.lines) {
      const line = basketLine(value, now)
      if (!line) continue
      const id = line.storeLinkMapping!.shopifyVariantId
      if (seen.has(id)) return []
      seen.add(id); lines.push(line)
    }
    return lines
  } catch { return [] }
}

export function addBasketLine(lines: readonly LiveBasketLine[], value: unknown, now = Date.now()): LiveBasketLine[] {
  const line = basketLine(value, now)
  if (!line) throw new Error('This offer is unavailable. Refresh the product page.')
  const current = parseBasketStorage(JSON.stringify({ version: 1, lines }), now)
  const index = current.findIndex(row => row.storeLinkMapping!.shopifyVariantId === line.storeLinkMapping!.shopifyVariantId)
  if (index >= 0) {
    const quantity = current[index].quantity + line.quantity
    if (quantity > 10) throw new Error('Maximum 10 packs per item.')
    current[index] = { ...line, quantity }
  } else {
    if (current.length >= 20) throw new Error('Maximum 20 basket items.')
    current.push(line)
  }
  return current
}

export function buildLiveBasketCheckout(items: readonly StackCartItem[], campaign: StoreAttributionCampaign = 'product', now = Date.now()): string | null {
  if (!items.length || items.length > 20 || items.some(item => !liveBasketEligible(item, now) ||
    !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10)) return null
  const lines = buildStackCartLines(items, now)
  if (lines.some(line => line.quantity > 10)) return null
  return buildCartPermalink(lines, campaign)
}
