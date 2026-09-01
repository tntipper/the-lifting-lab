import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, sortScored, type Product, type Nutrient, type SortKey } from '@/lib/products'

const VALID_SORTS: SortKey[] = ['score', 'name', 'brand', 'value', 'budget', 'price']
const MAX_PAGE_SIZE = 100

function positiveInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

// GET /api/products?category=creatine&sort=score|price&page=1&limit=24
// Public, read-only. Returns active products with clinical scores attached.
// Pagination is opt-in to preserve the legacy array response for existing clients.
// When page or limit is supplied, the array is sliced and pagination metadata is
// returned in response headers.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const sortParam = searchParams.get('sort') as SortKey | null
  const sort: SortKey = sortParam && VALID_SORTS.includes(sortParam) ? sortParam : 'score'
  const requestedPage = positiveInteger(searchParams.get('page'))
  const requestedLimit = positiveInteger(searchParams.get('limit') ?? searchParams.get('perPage'))
  const paginationRequested = requestedPage !== null || requestedLimit !== null

  const sb = createPublicClient()
  let query = sb.from('products').select(PRODUCT_COLUMNS).eq('status', 'active')
  if (category && category !== 'all') query = query.eq('category', category)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const products = (data as Product[] | null) || []
  const ids = products.map((p) => p.id)
  const { data: nutrients } = ids.length
    ? await sb
        .from('product_nutrients')
        .select('product_id, nutrient_name, amount, unit')
        .in('product_id', ids)
    : { data: [] as (Nutrient & { product_id: string })[] }
  const rows = (nutrients as (Nutrient & { product_id: string })[] | null) ?? []
  const byId = new Map<string, Nutrient[]>()
  for (const n of rows) {
    const list = byId.get(n.product_id) ?? []
    list.push({ nutrient_name: n.nutrient_name, amount: n.amount, unit: n.unit })
    byId.set(n.product_id, list)
  }
  const scored = sortScored(
    products.map((p) => ({ ...withScore(p), nutrients: byId.get(p.id) ?? [] })),
    sort,
  )

  const page = requestedPage ?? 1
  const limit = Math.min(requestedLimit ?? 24, MAX_PAGE_SIZE)
  const start = (page - 1) * limit
  const result = paginationRequested ? scored.slice(start, start + limit) : scored
  const totalPages = scored.length === 0 ? 0 : Math.ceil(scored.length / limit)

  return NextResponse.json(result, {
    headers: {
      'X-Total-Count': String(scored.length),
      'X-Page': String(page),
      'X-Per-Page': String(paginationRequested ? limit : scored.length),
      'X-Total-Pages': String(paginationRequested ? totalPages : scored.length > 0 ? 1 : 0),
    },
  })
}
