import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase-server'
import TopNav from '@/components/TopNav'

export const dynamic = 'force-dynamic'

export default async function RewardsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  let balance: number | null = null
  if (user) {
    const { data: p } = await supabase
      .from('profiles').select('total_points,points_spent').eq('id', user.id).maybeSingle()
    if (p) balance = Math.max(0, (p.total_points ?? 0) - (p.points_spent ?? 0))
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <div className="max-w-xl mx-auto px-5 py-16 text-center">
        <div className="text-5xl mb-6">🎁</div>
        <h1 className="text-3xl font-black uppercase tracking-wide">Rewards</h1>
        <p className="text-lab-lime text-sm font-bold uppercase tracking-widest mt-2">Coming Soon</p>

        {balance != null && (
          <div className="mt-8 bg-lab-panel border border-lab-border rounded-2xl p-6 inline-block">
            <p className="text-[10px] uppercase tracking-widest text-lab-muted font-bold">Your spendable balance</p>
            <p className="text-4xl font-black text-lab-lime tabular-nums mt-1">{balance.toLocaleString()}</p>
            <p className="text-[10px] text-lab-muted">points</p>
          </div>
        )}

        <p className="text-white/70 mt-8 leading-relaxed">
          Points you earn now will unlock rewards when we launch. Keep building stacks, reviewing products,
          and climbing the leaderboard — every point counts toward what’s coming.
        </p>

        {!user && (
          <Link href="/auth" className="inline-block mt-8 text-[11px] font-black uppercase tracking-widest bg-lab-lime text-black rounded-lg px-5 py-3 hover:brightness-110 transition-all">
            Sign in to start earning
          </Link>
        )}
        {user && (
          <Link href="/dashboard" className="inline-block mt-8 text-[11px] font-black uppercase tracking-widest text-lab-lime hover:underline">
            Back to dashboard →
          </Link>
        )}
      </div>
    </div>
  )
}
