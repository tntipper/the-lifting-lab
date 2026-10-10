import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase-public'
import { PREVIEW_PRODUCTS } from '@/lib/preview-products'
import { isSyntheticPreview } from '@/lib/preview-mode'

type NutrientRow = { product_id: string; nutrient_name: string; amount: number; unit: string }

// GET /api/products/batch?ids=a,b,c
// Public, read-only. Returns products + nutrients for the given ids, in request
// order. Used by the logged-out /stack page to hydrate localStorage stack ids
// (the compare endpoint caps at 3 — this one does not).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ids = (searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50)

  if (!ids.length) return NextResponse.json([])

  if (isSyntheticPreview()) {
    const products = PREVIEW_PRODUCTS
      .filter((product) => ids.includes(product.id))
      .map((product) => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        serving_size: product.serving_size,
        serving_unit: product.serving_unit,
        servings_per_container: product.servings_per_container,
        retail_price: product.retail_price,
        buy_url: null,
        product_nutrients: product.nutrients,
      }))
      .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    return NextResponse.json(products, { headers: { 'Cache-Control': 'no-store', 'X-TLL-Preview': 'synthetic' } })
  }

  const sb = createPublicClient()
  const { data: products, error } = await sb
    .from('products')
    .select('id, name, brand, category, serving_size, serving_unit, servings_per_container, retail_price, buy_url')
    .in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: nutrients } = await sb
    .from('product_nutrients')
    .select('product_id, nutrient_name, amount, unit')
    .in('product_id', ids)

  const rows = (nutrients as NutrientRow[] | null) || []
  const result = (products || []).map((p) => ({
    ...p,
    product_nutrients: rows
      .filter((n) => n.product_id === p.id)
      .map(({ nutrient_name, amount, unit }) => ({ nutrient_name, amount, unit })),
  }))
  result.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
  return NextResponse.json(result)
}
