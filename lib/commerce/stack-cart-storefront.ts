import { STOREFRONT_VERSION } from './staging-cart-storefront'
import { buildStackCartLines, stackStorefrontCartEnabled, type StackCartItem } from './stack-cart'
import { storeCartAttribution } from './store-attribution'

/** Phase 2 contract only: no fetch, credentials, endpoint or live binding.
 * Reuses staging Storefront version and cartCreate/buyerIdentity pattern; the
 * staging adapter itself supports only its fixed synthetic single variant.
 * TODO(Toby/Lifty): reviewed server transport, exact returned-line validation,
 * approved shop checkout host and guest-checkout proof before live wiring.
 * TODO(Toby/Lifty, S05): authorised test order must verify these source
 * attributes/note and Shopify order attribution; mock proof is not live proof.
 */
export async function createMockStackCheckout(items: readonly StackCartItem[], mock: {
  execute(request: { apiVersion: string; query: string; variables: { input: { lines: ReturnType<typeof buildStackCartLines>; buyerIdentity: { countryCode: 'GB' } } & ReturnType<typeof storeCartAttribution> } }): Promise<unknown>
}, now = Date.now()): Promise<string | null> {
  if (!stackStorefrontCartEnabled()) return null
  const lines = buildStackCartLines(items, now)
  if (!lines.length) return null
  const raw = await mock.execute({ apiVersion: STOREFRONT_VERSION,
    query: 'mutation TllStackCartCreate($input: CartInput!) { cartCreate(input: $input) { cart { checkoutUrl } userErrors { code } warnings { code } } }',
    variables: { input: { lines, buyerIdentity: { countryCode: 'GB' }, ...storeCartAttribution('stack') } },
  })
  const result = raw as { errors?: unknown; data?: { cartCreate?: { cart?: { checkoutUrl?: unknown }; userErrors?: unknown[]; warnings?: unknown[] } } }
  const created = result?.data?.cartCreate
  if (result?.errors || !Array.isArray(created?.userErrors) || created.userErrors.length ||
      !Array.isArray(created.warnings) || created.warnings.length || typeof created.cart?.checkoutUrl !== 'string') throw new Error('Mock stack checkout unavailable')
  const url = new URL(created.cart.checkoutUrl)
  // Deliberately synthetic-only. This function cannot return a live checkout.
  if (url.protocol !== 'https:' || url.hostname !== 'stack-cart.invalid' || url.username || url.password || url.port || url.hash || url.search || !/^\/cart\/c\/[A-Za-z0-9_-]+$/.test(url.pathname)) throw new Error('Mock stack checkout unavailable')
  return url.href
}
