import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { awardPoints } from '@/lib/points'

// GET /api/reviews?productId=...  → visible reviews for a product (public).
// GET /api/reviews?mine=1         → the signed-in user's own reviews.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const supabase = await createServerSupabase()

  if (searchParams.get('mine') === '1') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data, error } = await supabase.rpc('get_user_reviews')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ reviews: data ?? [] })
  }

  const productId = searchParams.get('productId')
  if (!productId) return NextResponse.json({ error: 'productId required' }, { status: 400 })

  const { data, error } = await supabase.rpc('get_product_reviews', { p_product: productId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const reviews = data ?? []
  const count = reviews.length
  const average =
    count > 0 ? Math.round((reviews.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / count) * 10) / 10 : null

  return NextResponse.json({ reviews, average, count })
}

// POST /api/reviews  { productId, rating (1-5), body (<=280) } → create + award.
export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let productId: unknown, rating: unknown, body: unknown
  try {
    ({ productId, rating, body } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (typeof productId !== 'string' || !productId) {
    return NextResponse.json({ error: 'productId required' }, { status: 400 })
  }
  const r = Math.round(Number(rating))
  if (!Number.isFinite(r) || r < 1 || r > 5) {
    return NextResponse.json({ error: 'rating must be 1–5' }, { status: 400 })
  }
  const text = typeof body === 'string' ? body.trim().slice(0, 280) : null

  const { error } = await supabase
    .from('reviews')
    .insert({ user_id: user.id, product_id: productId, rating: r, body: text })

  if (error) {
    // 23505 = unique_violation → already reviewed this product
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'already_reviewed' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const awarded = await awardPoints(supabase, 'review', productId)
  return NextResponse.json({ ok: true, pointsAwarded: awarded })
}
