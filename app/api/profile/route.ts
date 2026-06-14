import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

// PUT { username?, display_name? } — update the signed-in user's profile.
export async function PUT(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let username: unknown, displayName: unknown
  try { ({ username, display_name: displayName } = await request.json()) }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}

  if (username !== undefined) {
    const u = String(username).trim().toLowerCase()
    if (!/^[a-z0-9_]{3,20}$/.test(u)) {
      return NextResponse.json({ error: 'Username must be 3–20 chars: a–z, 0–9, _' }, { status: 400 })
    }
    patch.username = u
  }
  if (displayName !== undefined) {
    const d = String(displayName).trim().slice(0, 40)
    patch.display_name = d || null
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'That username is taken' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE — permanently delete the signed-in user's account (cascades all data).
export async function DELETE() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.rpc('delete_own_account')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
