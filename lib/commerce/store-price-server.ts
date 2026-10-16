import { liveCartEnabled } from './live-cart-mode'
import { connection } from 'next/server'
import { isIsolatedEnvironment } from '../preview-mode'
import { createStorefrontPriceReader } from './storefront-prices'
import { attachStorePrices } from './store-price-products'
import { attachStoreMappings, createStoreMappingReader, type StoreMappingReader } from './store-mapping-server'
import type { Product } from '../products'

let configured: { shop: string; token: string; read: ReturnType<typeof createStorefrontPriceReader> } | undefined

/** Server loaders only: no token or supplier fields enter browser product data. */
export async function withStorePrices<T extends Product>(products: T[], options: { readMappings?: StoreMappingReader; now?: number } = {}): Promise<T[]> {
  const enabled = !isIsolatedEnvironment() && (process.env.NEXT_PUBLIC_TLL_STORE_LINKS === 'enabled' || liveCartEnabled())
  if (!enabled) return products
  // Exclude the page cache too, including requests served by the in-memory cache.
  await connection()
  products = await attachStoreMappings(products, {
    read: options.readMappings ?? createStoreMappingReader({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }), now: options.now,
  })
  if (process.env.NEXT_PUBLIC_TLL_STORE_PRICES !== 'enabled') return products
  const shop = process.env.TLL_STOREFRONT_SHOP ?? ''
  const token = process.env.TLL_STOREFRONT_PRIVATE_TOKEN ?? ''
  if (!configured || configured.shop !== shop || configured.token !== token) {
    configured = { shop, token, read: createStorefrontPriceReader({ enabled: true, shop, privateToken: token, transport: fetch }) }
  }
  const read = options.now === undefined ? configured.read : createStorefrontPriceReader({
    enabled: true, shop, privateToken: token, transport: fetch, now: () => options.now!,
  })
  return attachStorePrices(products, { enabled, read, now: options.now })
}
