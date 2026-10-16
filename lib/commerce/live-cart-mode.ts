import { isIsolatedEnvironment } from '../preview-mode'

/** Public build-time opt-in. Hosted staging always owns its separate cart. */
export function liveCartEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TLL_LIVE_CART === 'enabled' && !isIsolatedEnvironment()
}

/** Legacy shop references must be exact public product URLs, without navigation parameters. */
export function liveStoreProductUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https:\/\/shop\.theliftinglab\.co\.uk\/products\/[a-z0-9-]+$/.test(value)
    && !/[\r\n]/.test(value) ? value : null
}

/** Shared sold-product classification; does not change the non-sold render path. */
export function isTllSoldProduct(product: { buy_url?: string | null; storeLinkMapping?: unknown }): boolean {
  return Boolean(product.storeLinkMapping) || liveStoreProductUrl(product.buy_url) !== null
}
