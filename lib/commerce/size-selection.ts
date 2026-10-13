import type { ComparedProduct } from '../products'
import { canonicalShopifyId } from './product-mapping'

export type ProductSizeOption = {
  slug: string; label: string; serving_size: number | null; serving_unit: string | null
  servings_per_container: number | null; retail_price: number | null; buy_url: string | null
  shopify_variant_id: string | null; sort: number
}

export function selectProductSize(options: readonly ProductSizeOption[], search: string): ProductSizeOption | undefined {
  const slug = new URLSearchParams(search).get('size')
  return options.find(option => option.slug === slug) ?? options[0]
}

export function sizeSelectionUrl(href: string, slug: string): string {
  const url = new URL(href)
  url.searchParams.set('size', slug)
  // A legacy variant query must not override the selected pack.
  url.searchParams.delete('variant')
  url.searchParams.delete('flavour')
  return `${url.pathname}${url.search}${url.hash}`
}

/** Size identity alone never authorises a store offer. Reuse only the exact approved projection. */
export function productForSize(product: ComparedProduct, option: ProductSizeOption, ready = true): ComparedProduct {
  const id = canonicalShopifyId(option.shopify_variant_id, 'ProductVariant')
  const variant = id ? product.storeVariants?.find(v => canonicalShopifyId(v.mapping.shopifyVariantId, 'ProductVariant') === id) : undefined
  const mapping = variant?.mapping ?? (id && canonicalShopifyId(product.storeLinkMapping?.shopifyVariantId, 'ProductVariant') === id ? product.storeLinkMapping : null)
  const price = variant ? variant.storePrice : mapping ? product.storePrice : undefined
  const retail = price ? price.price : option.retail_price
  return { ...product, ...option, retail_price: retail,
    storeVariants: undefined, storeLinkMapping: ready ? mapping : null, storePrice: price,
    cost_per_serving: retail != null && retail > 0 && option.servings_per_container != null && option.servings_per_container > 0
      ? retail / option.servings_per_container : null }
}

// Synthetic preview data only; no saved mapping and no external offer.
export const PREVIEW_SIZE_OPTIONS: Record<string, ProductSizeOption[]> = {
  '1fab2546-6a25-4fd9-8e49-abf6bb6b362c': [
    { slug: '12-pack', label: '12 × 64g', serving_size: 64, serving_unit: 'g', servings_per_container: 12,
      retail_price: 23.99, buy_url: null, shopify_variant_id: null, sort: 0 },
    { slug: 'single-bar', label: 'Single 64g bar', serving_size: 64, serving_unit: 'bar', servings_per_container: 1,
      retail_price: 2, buy_url: null, shopify_variant_id: null, sort: 1 },
  ],
}
