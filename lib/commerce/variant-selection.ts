import type { StoreVariantOption } from './product-mapping'
import { catalogueAvailabilityFor } from './catalogue-presentation'

export function flavourSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Exact numeric ID wins; unknown query values use the normal stock-aware default. */
export function selectStoreVariant(productId: string, variants: readonly StoreVariantOption[],
  query: { variant?: string; flavour?: string } = {}, now = Date.now()): StoreVariantOption | undefined {
  const exact = variants.find(v => v.variantId === query.variant)
  if (exact) return exact
  const flavour = query.flavour && variants.find(v => v.flavour && flavourSlug(v.flavour) === flavourSlug(query.flavour!))
  if (flavour) return flavour
  return variants.find(v => catalogueAvailabilityFor({ id: productId, storePrice: v.storePrice }, now) === 'available') ?? variants[0]
}

/** Keep other query values/hash; a manual selection replaces the flavour alias. */
export function variantSelectionUrl(href: string, variantId: string): string {
  const url = new URL(href)
  url.searchParams.set('variant', variantId)
  url.searchParams.delete('flavour')
  return `${url.pathname}${url.search}${url.hash}`
}
