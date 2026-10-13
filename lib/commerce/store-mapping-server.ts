import { createClient } from '@supabase/supabase-js'
import { presentStoreLinkMapping, type StoreMappingRow } from './product-mapping'
import type { Product } from '../products'

export type StoreMappingReader = (productIds: string[]) => Promise<StoreMappingRow[]>

/** Server-only by convention, like lib/server: never create a privileged client in a browser.
 * The RPC reads the private schema without exposing it through PostgREST.
 */
export function createStoreMappingReader(options: {
  url?: string; serviceRoleKey?: string; transport?: typeof fetch
} = {}): StoreMappingReader {
  return async productIds => {
    const ids = [...new Set(productIds.filter(id => typeof id === 'string' && id.trim()))]
    if (typeof window !== 'undefined' || !ids.length || !options.url || !options.serviceRoleKey) return []
    try {
      const client = createClient(options.url, options.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => (options.transport ?? fetch)(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(5000) }) },
      })
      const { data, error } = await client.rpc('tll_store_link_mapping_rows', { product_ids: ids })
      return error || !Array.isArray(data) ? [] : data
    } catch { return [] }
  }
}

/** Replace any cached projection with this request's saved authority; never expose raw rows. */
export async function attachStoreMappings<T extends Product>(products: T[], options: {
  read: StoreMappingReader; now?: number
}): Promise<T[]> {
  let rows: StoreMappingRow[] = []
  try { rows = await options.read([...new Set(products.map(product => product.id))]) } catch { /* fail closed */ }
  const now = options.now ?? Date.now()
  return products.map(product => {
    const matches = rows.filter(row => row?.comparison_product_id === product.id && row.active === true && row.status === 'store')
    return { ...product, storeLinkMapping: matches.length === 1 ? presentStoreLinkMapping(matches[0], now) : null }
  })
}
