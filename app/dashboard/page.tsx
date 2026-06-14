import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { syncSession } from '@/lib/account'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // server components cannot set cookies
          }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  // Ensure profile + apply idempotent engagement awards (signup, daily login, referral).
  await syncSession(supabase, user)

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-12">
          <div>
            <span className="font-black uppercase tracking-widest text-xl">
              THE LIFTING<span className="text-lab-lime">LAB</span>
            </span>
            <p className="text-[10px] text-gray-500 tracking-[0.3em] font-bold mt-0.5 uppercase">
              Evidence-Based Supplement Stacks · UK
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-lab-muted text-sm hover:text-white transition-colors border border-lab-border rounded-lg px-3 py-1.5"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="mb-10">
          <h1 className="text-3xl font-black uppercase tracking-wide">
            Welcome <span className="text-lab-lime">back</span>
          </h1>
          <p className="text-lab-muted text-sm mt-2">
            Signed in as <span className="text-white font-medium">{user.email}</span>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <a
            href="/stack"
            className="group block bg-lab-panel border border-lab-border rounded-2xl p-6 hover:border-lab-lime transition-colors"
          >
            <div className="text-3xl mb-4">🧪</div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">My Stack</h2>
            <p className="text-lab-muted text-sm">
              Build and track your supplement stack with live EFSA safety analysis and clinical scoring.
            </p>
            <div className="mt-5 inline-block text-lab-lime text-xs font-bold uppercase tracking-widest group-hover:underline">
              Build your stack →
            </div>
          </a>

          <a
            href="/products"
            className="group block bg-lab-panel border border-lab-border rounded-2xl p-6 hover:border-lab-lime transition-colors"
          >
            <div className="text-3xl mb-4">📊</div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Browse Products</h2>
            <p className="text-lab-muted text-sm">
              Search and compare UK supplements, ranked by effective dosing and true value.
            </p>
            <div className="mt-5 inline-block text-lab-lime text-xs font-bold uppercase tracking-widest group-hover:underline">
              Browse the database →
            </div>
          </a>

          <a
            href="/favourites"
            className="group block bg-lab-panel border border-lab-border rounded-2xl p-6 hover:border-lab-lime transition-colors"
          >
            <div className="text-3xl mb-4">💚</div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">My Favourites</h2>
            <p className="text-lab-muted text-sm">
              Quick access to the products you&apos;ve saved across the database.
            </p>
            <div className="mt-5 inline-block text-lab-lime text-xs font-bold uppercase tracking-widest group-hover:underline">
              View favourites →
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}
