import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, type Product, type Nutrient, type ComparedProduct } from '@/lib/products'

type NutrientRow = Nutrient & { product_id: string }

// GET /api/products/compare?ids=a,b,c
// Returns full nutrient data for up to 3 products, in the requested order.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ids = (searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)

  if (!ids.length) return NextResponse.json([] as ComparedProduct[])

  const sb = createPublicClient()
  const { data: products, error } = await sb
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('status', 'active')
    .in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: nutrients, error: nErr } = await sb
    .from('product_nutrients')
    .select('product_id, nutrient_name, amount, unit')
    .in('product_id', ids)
  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 })

  const nutrientRows = (nutrients as NutrientRow[] | null) || []
  const result: ComparedProduct[] = (products as Product[] | null || []).map((p) => ({
    ...withScore(p),
    nutrients: nutrientRows
      .filter((n) => n.product_id === p.id)
      .map(({ nutrient_name, amount, unit }) => ({ nutrient_name, amount, unit })),
  }))

  // preserve the requested order
  result.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
  return NextResponse.json(result)
}
