import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase-public'
import { withScore } from '@/lib/products'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = createPublicClient()

  const { data: product, error: pe } = await sb
    .from('products')
    .select('id, name, brand, category, serving_size, serving_unit, servings_per_container, image_url, informed_sport, retail_price, buy_url, proprietary_blend, amino_spiked, protein_yield')
    .eq('id', id)
    .single()

  if (pe || !product) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: nutrients } = await sb
    .from('product_nutrients')
    .select('nutrient_name, amount, unit')
    .eq('product_id', id)
    .order('nutrient_name')

  return NextResponse.json({ ...withScore(product), nutrients: nutrients ?? [] })
}
