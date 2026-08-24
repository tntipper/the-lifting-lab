import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, sortScored, type Product, type Nutrient, type SortKey } from '@/lib/products'

const VALID_SORTS: SortKey[] = ['score', 'name', 'brand', 'value', 'budget']

// GET /api/products?category=creatine&sort=score|name|brand|value|budget
// Public, read-only. Returns active products with clinical scores attached.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const sortParam = searchParams.get('sort') as SortKey | null
  const sort: SortKey = sortParam && VALID_SORTS.includes(sortParam) ? sortParam : 'score'

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
  const scored = products.map((p) => ({ ...withScore(p), nutrients: byId.get(p.id) ?? [] }))
  return NextResponse.json(sortScored(scored, sort))
}
