import { catalogueAvailabilityFor } from './catalogue-presentation'
import { displayPrice, isUsablePrice } from './display-price'
import { buildStackCartLines, splitStackCartItems, type StackCartItem } from './stack-cart'
import { buildCartPermalink } from './cart-permalink'
import type { StoreAttributionCampaign } from './store-attribution'

export const LIVE_BASKET_KEY = 'tll.live-basket.v1'
export type LiveBasketLine = { id: string; variantId: string; quantity: number; name: string; brand: string; variantLabel?: string; shownPrice: number }

/** Approval and fresh stock are required at add time only. */
export function liveBasketEligible(item: StackCartItem, now = Date.now()): boolean {
  return !item.cataloguePresentation && catalogueAvailabilityFor(item, now) === 'available' &&
    displayPrice({ ...item, retail_price: null }) !== null && splitStackCartItems([item], now).storeItems.length === 1
}

/** Validate saved public data without expiring a shopper's basket. */
export function basketLine(value: unknown): LiveBasketLine | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as LiveBasketLine
  if (typeof item.id !== 'string' || !item.id || item.id.length > 200 ||
    typeof item.variantId !== 'string' || !/^[1-9][0-9]*$/.test(item.variantId) || item.variantId.length > 100 ||
    typeof item.name !== 'string' || !item.name || item.name.length > 500 ||
    typeof item.brand !== 'string' || item.brand.length > 200 ||
    (item.variantLabel !== undefined && (typeof item.variantLabel !== 'string' || item.variantLabel.length > 500)) ||
    !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10 || !isUsablePrice(item.shownPrice)) return null
  return { id: item.id, variantId: item.variantId, name: item.name, brand: item.brand, quantity: item.quantity,
    shownPrice: item.shownPrice, ...(item.variantLabel !== undefined ? { variantLabel: item.variantLabel } : {}) }
}

export function parseBasketStorage(raw: string | null): LiveBasketLine[] {
  if (!raw || raw.length > 100000) return []
  try {
    const data = JSON.parse(raw)
    if (data?.version !== 1 || !Array.isArray(data.lines) || data.lines.length > 20) return []
    const lines: LiveBasketLine[] = [], seen = new Set<string>()
    for (const value of data.lines) {
      // Migrate the original public projection without rechecking its timestamps.
      const line = basketLine(value?.variantId !== undefined ? value : { ...value,
        variantId: value?.storeLinkMapping?.shopifyVariantId?.replace('gid://shopify/ProductVariant/', ''), shownPrice: value?.storePrice?.price })
      if (!line) continue
      if (seen.has(line.variantId)) return []
      seen.add(line.variantId); lines.push(line)
    }
    return lines
  } catch { return [] }
}

export function basketCampaign(raw: string | null): StoreAttributionCampaign {
  try {
    const campaign = JSON.parse(raw ?? '{}').campaign
    return campaign === 'compare' || campaign === 'stack' ? campaign : 'product'
  } catch { return 'product' }
}

export function addBasketLine(lines: readonly LiveBasketLine[], value: StackCartItem & { variantLabel?: string }, now = Date.now()): LiveBasketLine[] {
  if (!liveBasketEligible(value, now)) throw new Error('This offer is unavailable. Refresh the product page.')
  const line = basketLine({ id: value.id, name: value.name, brand: value.brand, quantity: value.quantity,
    variantId: value.storeLinkMapping!.shopifyVariantId.replace('gid://shopify/ProductVariant/', ''),
    shownPrice: displayPrice({ ...value, retail_price: null }), variantLabel: value.variantLabel })
  if (!line) throw new Error('This offer is unavailable. Refresh the product page.')
  const current = parseBasketStorage(JSON.stringify({ version: 1, lines }))
  const index = current.findIndex(row => row.variantId === line.variantId)
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

/** Shopify checks today's price and stock when opening the saved basket. */
export function buildLiveBasketCheckout(items: readonly LiveBasketLine[], campaign: StoreAttributionCampaign = 'product'): string | null {
  if (!items.length || items.length > 20) return null
  const lines = items.map(basketLine)
  if (lines.some(line => !line) || new Set(lines.map(line => line!.variantId)).size !== lines.length) return null
  return buildCartPermalink(lines.map(line => ({ merchandiseId: line!.variantId, quantity: line!.quantity })), campaign)
}

/** Stack quantities are bounded after combining duplicate variants. */
export function buildLiveStackCheckout(items: readonly StackCartItem[], now = Date.now()) {
  const eligible = items.filter(item => liveBasketEligible(item, now) && Number.isSafeInteger(item.quantity) && item.quantity > 0)
  const lines = buildStackCartLines(eligible, now)
  const limited = lines.length > 20 || lines.some(line => line.quantity > 10)
  return { url: buildCartPermalink(lines.slice(0, 20).map(line => ({ ...line, quantity: Math.min(10, line.quantity) })), 'stack'), limited }
}
