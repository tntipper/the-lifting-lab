/** Server route authority. Add entries only after Toby confirms parent + exact variant.
 * Candidates and review process: docs/commerce/variant-picker.md. No guessed merges.
 */
export type ProductVariantRedirect = { parentProductId: string; variantId?: string }
export const PRODUCT_VARIANT_REDIRECTS: Readonly<Record<string, ProductVariantRedirect>> = {}

export function productVariantRedirectUrl(childProductId: string,
  redirects: Readonly<Record<string, ProductVariantRedirect>> = PRODUCT_VARIANT_REDIRECTS, incomingQuery = ''): string | null {
  if (!Object.hasOwn(redirects, childProductId)) return null
  const entry = redirects[childProductId]
  const query = new URLSearchParams(incomingQuery)
  if (entry.variantId) query.set('variant', entry.variantId)
  return `/products/${encodeURIComponent(entry.parentProductId)}${query.size ? `?${query}` : ''}`
}
