import { buildStoreProductLink } from '../affiliate'
import type { StoreLinkMapping, StoreVariantOption } from './product-mapping'
import type { CataloguePresentation } from './catalogue-presentation'
import { storefrontVariantId, type StorefrontPrice } from './storefront-prices'

export type StorePricePresentation = { productId: string; price: number | null; availableForSale: boolean | null; observedAtMs: number | null; sku?: string; barcode?: string }

/** Apply only approved exact mappings. Keep the field used by all existing price and
 * serving-cost displays consistent; an unavailable store price must not reuse retail_price.
 * Existing catalogue holds take precedence and are not replaced by Shopify stock.
 */
export async function attachStorePrices<T extends {
  id: string; retail_price: number | null; storeLinkMapping?: StoreLinkMapping | null; storeVariants?: StoreVariantOption[]; cataloguePresentation?: CataloguePresentation | null
}>(products: T[], options: {
  enabled: boolean; read: (ids: string[]) => Promise<Map<string, StorefrontPrice>>; now?: number
}): Promise<(T & { storePrice?: StorePricePresentation })[]> {
  if (!options.enabled) return products
  const now = options.now ?? Date.now()
  const mapped = products.flatMap(product => {
    if (product.cataloguePresentation) return []
    const mappings = product.storeVariants?.length ? product.storeVariants.map(v => v.mapping) : [product.storeLinkMapping]
    return mappings.flatMap(mapping => {
      if (!buildStoreProductLink(product.id, mapping, now)) return []
      const id = storefrontVariantId(mapping!.shopifyVariantId)
      return id ? [{ productId: product.id, variantId: id }] : []
    })
  })
  let prices = new Map<string, StorefrontPrice>()
  if (mapped.length) {
    try { prices = await options.read([...new Set(mapped.map(row => row.variantId))]) } catch { /* unavailable */ }
  }
  const observedNow = options.now ?? Date.now()
  const presentation = (productId: string, variantId: string): StorePricePresentation => {
    const row = prices.get(variantId)
    const fresh = row?.variantId === variantId && Number.isSafeInteger(row.observedAtMs) &&
      row.observedAtMs <= observedNow && observedNow - row.observedAtMs < 15 * 60 * 1000 &&
      Number.isFinite(row.price) && row.price > 0 && typeof row.availableForSale === 'boolean'
    return { productId, price: fresh ? row.price : null,
      availableForSale: fresh ? row.availableForSale : null, observedAtMs: fresh ? row.observedAtMs : null,
      ...(fresh && row.sku ? { sku: row.sku } : {}), ...(fresh && row.barcode ? { barcode: row.barcode } : {}) }
  }
  return products.map(product => {
    const matches = mapped.filter(row => row.productId === product.id)
    if (!matches.length) return product
    const storeVariants = product.storeVariants?.map(variant => ({ ...variant,
      storePrice: presentation(product.id, storefrontVariantId(variant.variantId)!) }))
    // Family grids have no selected pack: never show an arbitrary variant's price.
    const storePrice = matches.length === 1 ? presentation(product.id, matches[0].variantId) :
      { productId: product.id, price: null, availableForSale: null, observedAtMs: null }
    return { ...product, storeVariants, retail_price: storePrice.price, storePrice }
  })
}
