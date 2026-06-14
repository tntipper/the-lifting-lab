import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase-server'
import { syncSession } from '@/lib/account'
import Avatar from '@/components/Avatar'
import CopyButton from '@/components/CopyButton'
import TopNav from '@/components/TopNav'

export const dynamic = 'force-dynamic'

const ACTION_LABEL: Record<string, { label: string; icon: string }> = {
  signup:      { label: 'Welcome bonus', icon: '🎉' },
  review:      { label: 'Product review', icon: '⭐' },
  favourite:   { label: 'Saved a favourite', icon: '💚' },
  build_stack: { label: 'Built a stack', icon: '🧪' },
  share:       { label: 'Shared a product', icon: '📣' },
  daily_login: { label: 'Daily login', icon: '📅' },
  referral:    { label: 'Referral bonus', icon: '🤝' },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const profile = await syncSession(supabase, user)

  // Season + rank
  const { data: seasonId } = await supabase.rpc('current_season')
  let seasonPoints = 0
  let rank: number | null = null
  let tenthPts: number | null = null
  let seasonName: string | null = null

  if (seasonId) {
    const { data: srow } = await supabase.from('seasons').select('name').eq('id', seasonId).maybeSingle()
    seasonName = srow?.name ?? null
    const { data: ur } = await supabase.rpc('get_user_rank', { p_season: seasonId, p_user: user.id })
    const rec = (ur as Record<string, unknown>[] | null)?.[0]
    if (rec) { rank = Number(rec.rank); seasonPoints = Number(rec.season_points) }
    const { data: top } = await supabase.rpc('get_leaderboard', { p_season: seasonId, p_limit: 10 })
    const arr = (top as Record<string, unknown>[] | null) ?? []
    if (arr.length >= 10) tenthPts = Number(arr[arr.length - 1].season_points)
  }

  // Ledger history
  const { data: ledger } = await supabase
    .from('points_ledger')
    .select('action_type,points,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Favourites (compact)
  const { data: favs } = await supabase
    .from('user_favourites')
    .select('product_id, products (id,name,brand)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(6)

  // Active stack summary
  const { data: stack } = await supabase
    .from('user_stacks').select('id,name').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  let stackCount = 0
  if (stack) {
    const { count } = await supabase
      .from('stack_products').select('id', { count: 'exact', head: true }).eq('stack_id', stack.id)
    stackCount = count ?? 0
  }

  // My reviews
  const { data: reviews } = await supabase.rpc('get_user_reviews')
  const myReviews = ((reviews as Record<string, unknown>[] | null) ?? []).slice(0, 5)

  // Referral
  const { count: referralCount } = await supabase
    .from('profiles').select('id', { count: 'exact', head: true }).eq('referred_by', user.id)

  const hdrs = await headers()
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `https://${hdrs.get('x-forwarded-host') || hdrs.get('host') || 'theliftinglab.co.uk'}`
  const referralLink = `${origin}/auth?ref=${profile?.referral_code ?? ''}`

  // Badges (visual milestones, derived from ledger actions present)
  const actions = new Set((ledger ?? []).map((l) => l.action_type))
  // ledger limit is 10 — also infer from points; do a lightweight presence check
  const { data: allActions } = await supabase
    .from('points_ledger').select('action_type').eq('user_id', user.id)
  for (const a of (allActions ?? [])) actions.add(a.action_type)
  const badges = [
    { id: 'review', label: 'First Review', icon: '⭐', earned: actions.has('review') },
    { id: 'build_stack', label: 'Stack Builder', icon: '🧪', earned: actions.has('build_stack') },
    { id: 'share', label: 'Social Sharer', icon: '📣', earned: actions.has('share') },
    { id: 'favourite', label: 'Collector', icon: '💚', earned: actions.has('favourite') },
    { id: 'referral', label: 'Recruiter', icon: '🤝', earned: actions.has('referral') },
  ]

  const username = profile?.display_name || profile?.username || 'Lifter'
  const allTime = profile?.total_points ?? 0
  const progressPct = rank == null ? 0 : rank <= 10 ? 100 : tenthPts && tenthPts > 0 ? Math.min(99, Math.round((seasonPoints / tenthPts) * 100)) : 0

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <div className="max-w-4xl mx-auto px-5 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <Avatar type={profile?.avatar_type} avatarId={profile?.avatar_id} url={profile?.avatar_url} username={username} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black uppercase tracking-wide truncate">{username}</h1>
            <p className="text-lab-muted text-xs truncate">{user.email}</p>
            <div className="flex gap-3 mt-1">
              <Link href="/account/settings" className="text-[11px] font-bold uppercase tracking-widest text-lab-lime hover:underline">Edit profile →</Link>
              <form action="/auth/signout" method="post">
                <button className="text-[11px] font-bold uppercase tracking-widest text-lab-muted hover:text-white">Sign out</button>
              </form>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-lab-panel border border-lab-border rounded-2xl p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-lab-muted font-bold">All-time</p>
            <p className="text-2xl font-black text-lab-lime tabular-nums mt-1">{allTime.toLocaleString()}</p>
            <p className="text-[10px] text-lab-muted">points</p>
          </div>
          <div className="bg-lab-panel border border-lab-border rounded-2xl p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-lab-muted font-bold">This season</p>
            <p className="text-2xl font-black text-white tabular-nums mt-1">{seasonPoints.toLocaleString()}</p>
            <p className="text-[10px] text-lab-muted">points</p>
          </div>
          <Link href="/leaderboard" className="bg-lab-panel border border-lab-border rounded-2xl p-4 text-center hover:border-lab-lime/50 transition-colors">
            <p className="text-[10px] uppercase tracking-widest text-lab-muted font-bold">Rank</p>
            <p className="text-2xl font-black text-white tabular-nums mt-1">{rank ? `#${rank}` : '—'}</p>
            <p className="text-[10px] text-lab-muted">{seasonName ? 'leaderboard →' : 'off-season'}</p>
          </Link>
        </div>

        {/* Progress toward top 10 */}
        {rank != null && (
          <div className="bg-lab-panel border border-lab-border rounded-2xl p-4">
            <div className="flex justify-between text-[11px] mb-2">
              <span className="text-lab-muted uppercase tracking-widest font-bold">{rank <= 10 ? 'In the top 10 🔥' : 'Climb to the top 10'}</span>
              <span className="text-lab-muted">{rank <= 10 ? '' : tenthPts ? `${(tenthPts - seasonPoints).toLocaleString()} pts to go` : ''}</span>
            </div>
            <div className="h-2 rounded-full bg-lab-bg overflow-hidden">
              <div className="h-full rounded-full bg-lab-lime" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        {/* Badges */}
        <div className="bg-lab-panel border border-lab-border rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-3">Badges</p>
          <div className="flex flex-wrap gap-3">
            {badges.map((b) => (
              <div key={b.id} className="flex flex-col items-center gap-1" style={{ opacity: b.earned ? 1 : 0.3 }}>
                <span className="text-2xl">{b.icon}</span>
                <span className="text-[9px] uppercase tracking-widest text-lab-muted text-center w-16">{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Two-column: history + referral */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-lab-panel border border-lab-border rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-3">Points history</p>
            {(ledger ?? []).length === 0 ? (
              <p className="text-lab-muted text-sm">No activity yet — start earning.</p>
            ) : (
              <div className="space-y-2">
                {(ledger ?? []).map((l, i) => {
                  const meta = ACTION_LABEL[l.action_type] ?? { label: l.action_type, icon: '•' }
                  return (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-white/80">{meta.icon} {meta.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-lab-lime font-bold tabular-nums">+{l.points}</span>
                        <span className="text-[10px] text-lab-muted">{fmtDate(l.created_at)}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="bg-lab-panel border border-lab-border rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-3">Refer a friend · +150 pts</p>
            <p className="text-sm text-white/80 mb-3">Share your link. When a friend signs up, you earn 150 points.</p>
            <div className="flex gap-2 items-center">
              <input readOnly value={referralLink}
                className="flex-1 min-w-0 bg-lab-bg text-white/80 text-xs border border-lab-border rounded-lg px-3 py-2" />
              <CopyButton text={referralLink} label="Copy" />
            </div>
            <p className="text-[11px] text-lab-muted mt-2">{referralCount ?? 0} friend{(referralCount ?? 0) === 1 ? '' : 's'} referred</p>
          </div>
        </div>

        {/* My stuff quick sections */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/favourites" className="bg-lab-panel border border-lab-border rounded-2xl p-4 hover:border-lab-lime/50 transition-colors">
            <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-2">My Favourites</p>
            <p className="text-3xl font-black text-white">{(favs ?? []).length}{(favs ?? []).length === 6 ? '+' : ''}</p>
            <p className="text-[11px] text-lab-lime mt-1">View all →</p>
          </Link>
          <Link href="/stack" className="bg-lab-panel border border-lab-border rounded-2xl p-4 hover:border-lab-lime/50 transition-colors">
            <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-2">My Stack</p>
            <p className="text-3xl font-black text-white">{stackCount}</p>
            <p className="text-[11px] text-lab-lime mt-1">{stackCount >= 3 ? 'Build & score →' : `${3 - stackCount} more for +50 →`}</p>
          </Link>
          <Link href="/rewards" className="bg-lab-panel border border-lab-border rounded-2xl p-4 hover:border-lab-lime/50 transition-colors">
            <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-2">Rewards</p>
            <p className="text-3xl font-black text-white">🎁</p>
            <p className="text-[11px] text-lab-lime mt-1">Coming soon →</p>
          </Link>
        </div>

        {/* My reviews */}
        <div className="bg-lab-panel border border-lab-border rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-3">My Reviews</p>
          {myReviews.length === 0 ? (
            <p className="text-lab-muted text-sm">No reviews yet — review a product to earn 75 points.</p>
          ) : (
            <div className="space-y-3">
              {myReviews.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Link href={`/products/${r.product_id}`} className="min-w-0 flex-1 truncate text-sm text-white hover:text-lab-lime">
                    <span className="text-lab-muted">{String(r.product_brand)}</span> {String(r.product_name)}
                  </Link>
                  <span className="text-lab-amber text-sm tabular-nums shrink-0">{'★'.repeat(Number(r.rating))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
