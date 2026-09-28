import { guardedSupabaseFetch } from '@/lib/preview-mode'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import StackBuilder from './StackBuilder'
import TopNav from '@/components/TopNav'
import AccountNavigation from '@/components/AccountNavigation'

export default async function StackPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: guardedSupabaseFetch },
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav signedInInitial />
      <header className="tll-on-dark bg-black text-white">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
          <Link href="/account" className="text-sm text-lab-muted transition-colors hover:text-white">← My account</Link>
          <p className="mt-7 text-xs font-bold uppercase tracking-[.18em] text-lab-lime">Saved to your account</p>
          <h1 className="tll-display mt-2 text-5xl uppercase leading-none text-white sm:text-7xl">Build your stack</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-lab-muted sm:text-base">
            Bring your products together, inspect their recorded ingredients and open each available retailer listing when you are ready.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <AccountNavigation />
        <div className="mt-8"><StackBuilder /></div>
        <p className="mt-8 border-t border-lab-border pt-5 text-xs text-lab-muted">For informational purposes only. Not medical advice.</p>
      </main>
    </div>
  )
}
