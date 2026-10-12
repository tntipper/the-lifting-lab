import type { StorePricePresentation } from './store-price-products'
import type { CatalogueEligibilityResult } from './catalogue-eligibility'

/** Small public view; supplier costs, evidence records and private IDs stay server-side. */
export type CataloguePresentation = {
  productId: string
  availability: 'available' | 'out_of_stock' | 'unavailable'
  purchaseEnabled: false
}

/** Call after evaluating current approvals on the server, never from a raw feed count. */
export function presentCatalogueEligibility(productId: string, result: CatalogueEligibilityResult): CataloguePresentation | null {
  if (!productId?.trim() || !result?.display || result.productId !== productId || result.liveEnabled !== false
    || !['available', 'out_of_stock', 'unavailable'].includes(result.display.availability)) return null
  return { productId, availability: result.display.availability, purchaseEnabled: false }
}

/** A projection is for one exact comparison product, never a whole brand or family. */
export function catalogueAvailabilityFor(product: { id?: string; cataloguePresentation?: CataloguePresentation | null; storePrice?: StorePricePresentation | null }, now = Date.now()): CataloguePresentation['availability'] | null {
  const view = product.cataloguePresentation
  if (!view) {
    const store = product.storePrice
    if (!product.id || store?.productId !== product.id) return null
    if (typeof store.observedAtMs !== 'number' || !Number.isSafeInteger(store.observedAtMs)
      || store.observedAtMs > now || now - store.observedAtMs >= 15 * 60 * 1000
      || typeof store.price !== 'number' || !Number.isFinite(store.price) || store.price <= 0
      || typeof store.availableForSale !== 'boolean') return 'unavailable'
    return store.availableForSale ? 'available' : 'out_of_stock'
  }
  if (!product.id || !view || view.productId !== product.id || view.purchaseEnabled !== false
    || !['available', 'out_of_stock', 'unavailable'].includes(view.availability)) return null
  return view.availability
}
