import TopNav from '@/components/TopNav'
import { createServerSupabase } from '@/lib/supabase-server'
import LeaderboardView, { type Row, type ArchiveSeason } from './LeaderboardView'

export const dynamic = 'force-dynamic'

type SeasonRow = {
  id: string
  name: string
  starts_at: string
  ends_at: string
  status: string
  prize_description: string
}

function toRows(data: unknown): Row[] {
  const arr = (data as Record<string, unknown>[] | null) ?? []
  return arr.map((r) => ({
    rank: Number(r.rank),
    user_id: String(r.user_id),
    username: String(r.username ?? ''),
    display_name: (r.display_name as string | null) ?? null,
    avatar_type: String(r.avatar_type ?? 'standard'),
    avatar_id: String(r.avatar_id ?? 'barbell'),
    avatar_url: (r.avatar_url as string | null) ?? null,
    season_points: Number(r.season_points),
  }))
}

export default async function LeaderboardPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  const nowIso = new Date().toISOString()

  // Active season = window contains now; else fall back to the most recent
  // season (off-season shows that season's final standings).
  const { data: active } = await supabase
    .from('seasons')
    .select('id,name,starts_at,ends_at,status,prize_description')
    .lte('starts_at', nowIso)
    .gt('ends_at', nowIso)
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let season = active as SeasonRow | null
  let isActive = !!season
  if (!season) {
    const { data: latest } = await supabase
      .from('seasons')
      .select('id,name,starts_at,ends_at,status,prize_description')
      .lte('starts_at', nowIso)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    season = latest as SeasonRow | null
  }

  let rows: Row[] = []
  let userRow: Row | null = null

  if (season) {
    const { data: lb } = await supabase.rpc('get_leaderboard', { p_season: season.id, p_limit: 50 })
    rows = toRows(lb)

    if (user) {
      const inView = rows.find((r) => r.user_id === user.id)
      if (inView) {
        userRow = inView
      } else {
        const { data: ur } = await supabase.rpc('get_user_rank', { p_season: season.id, p_user: user.id })
        const rec = (ur as Record<string, unknown>[] | null)?.[0]
        if (rec) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('username,display_name,avatar_type,avatar_id,avatar_url')
            .eq('id', user.id)
            .maybeSingle()
          userRow = {
            rank: Number(rec.rank),
            user_id: user.id,
            username: String(prof?.username ?? 'you'),
            display_name: (prof?.display_name as string | null) ?? null,
            avatar_type: String(prof?.avatar_type ?? 'standard'),
            avatar_id: String(prof?.avatar_id ?? 'barbell'),
            avatar_url: (prof?.avatar_url as string | null) ?? null,
            season_points: Number(rec.season_points),
          }
        }
      }
    }
  }

  // Past-season archive — top 3 of each ended season (most recent first).
  const { data: ended } = await supabase
    .from('seasons')
    .select('id,name,prize_description')
    .lt('ends_at', nowIso)
    .order('starts_at', { ascending: false })
    .limit(4)

  const archive: ArchiveSeason[] = []
  for (const s of (ended as { id: string; name: string; prize_description: string }[] | null) ?? []) {
    if (season && s.id === season.id && !isActive) continue // don't duplicate the displayed final board
    const { data: w } = await supabase.rpc('get_leaderboard', { p_season: s.id, p_limit: 3 })
    archive.push({ id: s.id, name: s.name, prize: s.prize_description, winners: toRows(w) })
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      {!season ? (
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-black uppercase tracking-wide">Off-Season</h1>
          <p className="text-lab-muted text-sm mt-3">
            The next season hasn’t started yet. Keep earning — points you collect now count toward your all-time total.
          </p>
        </div>
      ) : (
        <LeaderboardView
          seasonName={isActive ? season.name : `${season.name} — Final`}
          endsAt={isActive ? season.ends_at : null}
          prize={season.prize_description}
          rows={rows}
          userId={user?.id ?? null}
          userRow={userRow}
          archive={archive}
        />
      )}
    </div>
  )
}
