import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

// GET — avatar catalog + the signed-in user's unlocks, current selection,
// spendable balance, and the active season (to gate seasonal skins).
export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: catalog } = await supabase
    .from('avatar_catalog')
    .select('id,name,type,season_id,points_cost,asset_url,active,sort_order')
    .order('sort_order', { ascending: true })

  const { data: season } = await supabase.rpc('current_season')

  if (!user) {
    return NextResponse.json({
      catalog: catalog ?? [], unlocked: [], profile: null, balance: 0, currentSeasonId: season ?? null,
    })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_type,avatar_id,avatar_url,total_points,points_spent')
    .eq('id', user.id)
    .maybeSingle()

  const { data: unlocks } = await supabase
    .from('avatar_unlocks')
    .select('avatar_id')
    .eq('user_id', user.id)

  const balance = Math.max(0, (profile?.total_points ?? 0) - (profile?.points_spent ?? 0))

  return NextResponse.json({
    catalog: catalog ?? [],
    unlocked: (unlocks ?? []).map((u) => u.avatar_id),
    profile: profile ?? null,
    balance,
    currentSeasonId: (season as string | null) ?? null,
  })
}

// POST { avatarId } — spend points to unlock a premium/seasonal avatar.
export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let avatarId: unknown
  try { ({ avatarId } = await request.json()) } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  if (typeof avatarId !== 'string' || !avatarId) return NextResponse.json({ error: 'avatarId required' }, { status: 400 })

  const { data, error } = await supabase.rpc('unlock_avatar', { p_avatar_id: avatarId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PUT { avatarId, avatarUrl? } — select an owned/standard avatar (or set a
// freshly-uploaded custom photo). Server verifies ownership for non-standard.
export async function PUT(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let avatarId: unknown, avatarUrl: unknown
  try { ({ avatarId, avatarUrl } = await request.json()) } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  if (typeof avatarId !== 'string' || !avatarId) return NextResponse.json({ error: 'avatarId required' }, { status: 400 })

  const { data: item } = await supabase
    .from('avatar_catalog')
    .select('id,type')
    .eq('id', avatarId)
    .maybeSingle()
  if (!item) return NextResponse.json({ error: 'unknown_avatar' }, { status: 400 })

  if (item.type !== 'standard') {
    const { data: owned } = await supabase
      .from('avatar_unlocks')
      .select('avatar_id')
      .eq('user_id', user.id)
      .eq('avatar_id', avatarId)
      .maybeSingle()
    if (!owned) return NextResponse.json({ error: 'not_owned' }, { status: 403 })
  }

  const isCustom = avatarId === 'custom-photo'
  const patch: Record<string, unknown> = {
    avatar_type: isCustom ? 'custom_photo' : item.type,
    avatar_id: avatarId,
  }
  if (isCustom) {
    if (typeof avatarUrl !== 'string' || !avatarUrl) {
      return NextResponse.json({ error: 'avatarUrl required for custom photo' }, { status: 400 })
    }
    patch.avatar_url = avatarUrl
  }

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
