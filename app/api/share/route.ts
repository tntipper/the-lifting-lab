import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { awardPoints } from '@/lib/points'
import { isProductId } from '@/lib/share-products'

// POST { productId } — honour-system share claim. Awards 25 pts (DB enforces
// the 24h-per-product cooldown and the 24h-min-account-age guard).
export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'productId')) {
    return NextResponse.json({ error: 'Only a productId may be submitted' }, { status: 400 })
  }
  const productId = (body as { productId?: unknown }).productId
  if (!isProductId(productId)) {
    return NextResponse.json({ error: 'A valid productId is required' }, { status: 400 })
  }

  const awarded = await awardPoints(supabase, 'share', productId.toLowerCase())
  return NextResponse.json({ ok: true, pointsAwarded: awarded })
}
