import { connection } from 'next/server'
import { isIsolatedEnvironment } from '../preview-mode'
import { createStorefrontPriceReader } from './storefront-prices'
import { attachStorePrices } from './store-price-products'
import type { Product } from '../products'

let configured: { shop: string; token: string; read: ReturnType<typeof createStorefrontPriceReader> } | undefined

/** Server loaders only: no token or supplier fields enter browser product data. */
export async function withStorePrices<T extends Product>(products: T[]): Promise<T[]> {
  const enabled = !isIsolatedEnvironment() && process.env.NEXT_PUBLIC_TLL_STORE_LINKS === 'enabled'
    && process.env.NEXT_PUBLIC_TLL_STORE_PRICES === 'enabled'
  if (!enabled) return products
  // Exclude the page cache too, including requests served by the in-memory cache.
  await connection()
  // TODO(T05/Toby/Lifty): attach presentStoreLinkMapping(reviewed saved rows) in the
  // product loaders before this call. No title matching or historical CSV fallback.
  // TODO(Toby/Lifty): approve Storefront read credentials/channel and exact GBP variants
  // before enabling flags. Configuration is intentionally absent/default OFF here.
  const shop = process.env.TLL_STOREFRONT_SHOP ?? ''
  const token = process.env.TLL_STOREFRONT_PRIVATE_TOKEN ?? ''
  if (!configured || configured.shop !== shop || configured.token !== token) {
    configured = { shop, token, read: createStorefrontPriceReader({ enabled: true, shop, privateToken: token, transport: fetch }) }
  }
  return attachStorePrices(products, { enabled, read: configured.read })
}
