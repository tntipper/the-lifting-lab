import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, sortScored, type Product, type SortKey } from '@/lib/products'

// GET /api/products?category=creatine&sort=score|name|brand
// Public, read-only. Returns active products with clinical scores attached.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const sortParam = (searchParams.get('sort') || 'score') as SortKey
  const sort: SortKey = ['score', 'name', 'brand'].includes(sortParam) ? sortParam : 'score'

  const sb = createPublicClient()
  let query = sb.from('products').select(PRODUCT_COLUMNS).eq('status', 'active')
  if (category && category !== 'all') query = query.eq('category', category)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const scored = (data as Product[] | null || []).map(withScore)
  return NextResponse.json(sortScored(scored, sort))
}
