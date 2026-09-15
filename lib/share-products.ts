export const MAX_SHARE_PRODUCTS = 50

export function isProductId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export type ShareProduct = {
  id: string
  brand: string
  name: string
  category: string
  score: number | null
}

type ShareFailure = { ok: false; status: 400 | 404 | 503; error: string }
export type ShareProductsResult = { ok: true; products: ShareProduct[] } | ShareFailure

// The URL carries identities only. Legacy data/name/score payloads are rejected,
// rather than treating a user-authored number as a catalogue assessment.
export function parseShareProductIds(params: URLSearchParams): string[] | null {
  if ([...params.keys()].some(key => key !== 'ids') || params.getAll('ids').length > 1) return null
  const raw = params.get('ids')
  if (raw === null) return [] // A neutral, empty selection card.
  if (!raw || raw.length > MAX_SHARE_PRODUCTS * 37 - 1) return null
  const ids = raw.split(',')
  if (ids.length > MAX_SHARE_PRODUCTS || ids.some(id => !isProductId(id))) return null
  return [...new Set(ids.map(id => id.toLowerCase()))]
}

/** Resolve public card content from active catalogue identities and server scores. */
export async function resolveShareProducts(
  ids: readonly string[],
  loadProducts: (ids: string[]) => Promise<unknown>,
  getScore: (brand: string, name: string) => number | null,
): Promise<ShareProductsResult> {
  if (ids.length > MAX_SHARE_PRODUCTS || ids.some(id => !isProductId(id))) {
    return { ok: false, status: 400, error: 'Invalid product IDs' }
  }
  const requested = [...new Set(ids.map(id => id.toLowerCase()))]
  if (!requested.length) return { ok: true, products: [] }

  try {
    const rows = await loadProducts(requested)
    if (!Array.isArray(rows)) throw new Error('Invalid catalogue response')
    const products = new Map<string, ShareProduct>()

    for (const row of rows) {
      if (!row || typeof row !== 'object' || !isProductId(row.id)) throw new Error('Invalid catalogue row')
      const id = row.id.toLowerCase()
      if (!requested.includes(id) || row.status !== 'active') continue
      if (products.has(id) || [row.brand, row.name, row.category].some(value => typeof value !== 'string' || !value.trim())) {
        throw new Error('Invalid catalogue product')
      }
      const score = getScore(row.brand, row.name)
      products.set(id, {
        id,
        brand: row.brand,
        name: row.name,
        category: row.category,
        score: typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100 ? score : null,
      })
    }

    if (requested.some(id => !products.has(id))) {
      return { ok: false, status: 404, error: 'One or more products are unavailable' }
    }
    return { ok: true, products: requested.map(id => products.get(id)!) }
  } catch {
    return { ok: false, status: 503, error: 'Product information is temporarily unavailable' }
  }
}
