/** Safe browser projection only. Shopify cart IDs, line IDs and keys stay server-side. */
export type StagingCartView = {
  state: 'empty' | 'ready' | 'pending' | 'held' | 'unavailable' | 'session_changed' | 'transition_required'
  revision: number
  productId: string | null
  quantity: number
  unitPricePence: number | null
  subtotalPence: number | null
  currency: 'GBP'
  csrfToken: string | null
  checkoutAvailable?: boolean
  message: string
}

export function stagingCartUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TLL_ENVIRONMENT === 'staging'
    && process.env.NEXT_PUBLIC_TLL_STAGING_CART === 'enabled'
}

/** The browser may display only a handoff to the fixed, non-production Shopify shop. */
export function stagingCheckoutHref(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Checkout destination unavailable')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Checkout destination unavailable') }
  if (url.protocol !== 'https:' || url.hostname !== 'tll-integration-staging.myshopify.com'
    || url.username || url.password || url.port || url.search || url.hash
    || !/^\/cart\/c\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) throw new Error('Checkout destination unavailable')
  return value
}
