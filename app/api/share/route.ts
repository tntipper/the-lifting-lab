import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { awardPoints } from '@/lib/points'

// POST { productId } — honour-system share claim. Awards 25 pts (DB enforces
// the 24h-per-product cooldown and the 24h-min-account-age guard).
export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let productId: unknown
  try { ({ productId } = await request.json()) }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  if (typeof productId !== 'string' || !productId) {
    return NextResponse.json({ error: 'productId required' }, { status: 400 })
  }

  const awarded = await awardPoints(supabase, 'share', productId)
  return NextResponse.json({ ok: true, pointsAwarded: awarded })
}
