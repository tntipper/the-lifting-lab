import { buildStoreProductLink } from '../affiliate'
import type { StoreLinkMapping } from './product-mapping'
import type { CataloguePresentation } from './catalogue-presentation'
import { storefrontVariantId, type StorefrontPrice } from './storefront-prices'

export type StorePricePresentation = { productId: string; price: number | null; availableForSale: boolean | null; observedAtMs: number | null }

/** Apply only approved exact mappings. Keep the field used by all existing price and
 * serving-cost displays consistent; an unavailable store price must not reuse retail_price.
 * Existing catalogue holds take precedence and are not replaced by Shopify stock.
 */
export async function attachStorePrices<T extends {
  id: string; retail_price: number | null; storeLinkMapping?: StoreLinkMapping | null; cataloguePresentation?: CataloguePresentation | null
}>(products: T[], options: {
  enabled: boolean; read: (ids: string[]) => Promise<Map<string, StorefrontPrice>>; now?: number
}): Promise<(T & { storePrice?: StorePricePresentation })[]> {
  if (!options.enabled) return products
  const now = options.now ?? Date.now()
  const mapped = products.flatMap(product => {
    if (product.cataloguePresentation || !buildStoreProductLink(product.id, product.storeLinkMapping, now)) return []
    const id = storefrontVariantId(product.storeLinkMapping!.shopifyVariantId)
    return id ? [{ productId: product.id, variantId: id }] : []
  })
  let prices = new Map<string, StorefrontPrice>()
  if (mapped.length) {
    try { prices = await options.read([...new Set(mapped.map(row => row.variantId))]) } catch { /* unavailable */ }
  }
  return products.map(product => {
    const mapping = mapped.find(row => row.productId === product.id)
    if (!mapping) return product
    const price = prices.get(mapping.variantId)
    return { ...product, retail_price: price?.price ?? null,
      storePrice: { productId: product.id, price: price?.price ?? null,
        availableForSale: price?.availableForSale ?? null, observedAtMs: price?.observedAtMs ?? null } }
  })
}
