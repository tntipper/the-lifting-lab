import { STOREFRONT_VERSION } from './staging-cart-storefront'
import { cartJson } from './staging-cart-json'

export const STOREFRONT_PRICE_CACHE_MS = 15 * 60 * 1000
export const STOREFRONT_PRICE_BATCH_SIZE = 100
export type StorefrontPrice = { variantId: string; price: number; availableForSale: boolean; observedAtMs: number }
const QUERY = `query TllVariantPrices($ids: [ID!]!) {
  nodes(ids: $ids) { ... on ProductVariant { id price { amount currencyCode } availableForSale } }
}`
export function storefrontVariantId(value: string): string | null {
  const id = /^(?:gid:\/\/shopify\/ProductVariant\/)?([1-9][0-9]*)$/.exec(value)?.[1]
  return id ? `gid://shopify/ProductVariant/${id}` : null
}

/** Read-only adapter, sharing the cart adapter's pinned API and bounded JSON reader.
 * Cache belongs to this configured reader, so shops/tokens cannot share observations.
 * Failed/missing results are never cached or served after their 15-minute lifetime.
 */
export function createStorefrontPriceReader(options: {
  enabled?: boolean; shop: string; privateToken: string; transport: typeof fetch; now?: () => number
}) {
  const cache = new Map<string, StorefrontPrice>()
  const now = options.now ?? Date.now
  return async (variantIds: string[]): Promise<Map<string, StorefrontPrice>> => {
    const result = new Map<string, StorefrontPrice>()
    if (options.enabled !== true || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(options.shop)
      || !/^[^\s\x00-\x1f]{16,512}$/.test(options.privateToken)) return result
    const ids = [...new Set(variantIds.flatMap(id => {
      const canonical = storefrontVariantId(id); return canonical ? [canonical] : []
    }))]
    const started = now()
    for (const [id, row] of cache) if (started - row.observedAtMs >= STOREFRONT_PRICE_CACHE_MS || started < row.observedAtMs) cache.delete(id)
    const missing = ids.filter(id => !cache.has(id))
    for (let offset = 0; offset < missing.length; offset += STOREFRONT_PRICE_BATCH_SIZE) {
      const batch = missing.slice(offset, offset + STOREFRONT_PRICE_BATCH_SIZE)
      try {
        const response = await options.transport(`https://${options.shop}/api/${STOREFRONT_VERSION}/graphql.json`, {
          method: 'POST', redirect: 'manual', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8000),
          headers: { 'Content-Type': 'application/json', 'Shopify-Storefront-Private-Token': options.privateToken },
          body: JSON.stringify({ query: QUERY, variables: { ids: batch } }),
        })
        if (response.status !== 200 || response.headers.get('x-shopify-api-version') !== STOREFRONT_VERSION) continue
        const body = await cartJson(response) as { errors?: unknown; data?: { nodes?: unknown[] } }
        if (!body || body.errors || !Array.isArray(body.data?.nodes) || body.data.nodes.length !== batch.length) continue
        const observedAtMs = started // Request time bounds cache age even if a provider is slow.
        const accepted = new Map<string, StorefrontPrice>()
        for (const node of body.data.nodes) {
          if (!node || typeof node !== 'object') continue
          const row = node as { id?: string; availableForSale?: boolean; price?: { amount?: string; currencyCode?: string } }
          if (!row.id || !batch.includes(row.id) || accepted.has(row.id)) throw new Error('Unexpected variant')
          if (typeof row.availableForSale !== 'boolean' || row.price?.currencyCode !== 'GBP'
            || typeof row.price.amount !== 'string' || !/^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,2})?$/.test(row.price.amount)
            || Number(row.price.amount) <= 0) continue
          accepted.set(row.id, { variantId: row.id, price: Number(row.price.amount), availableForSale: row.availableForSale, observedAtMs })
        }
        for (const [id, row] of accepted) cache.set(id, row)
      } catch { /* No logs containing provider bodies or credentials; fall back to affiliate. */ }
    }
    for (const id of ids) {
      const row = cache.get(id)
      if (row && now() >= row.observedAtMs && now() - row.observedAtMs < STOREFRONT_PRICE_CACHE_MS) result.set(id, { ...row })
    }
    return result
  }
}
