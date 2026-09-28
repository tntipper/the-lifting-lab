import { guardedSupabaseFetch, isSyntheticPreview } from '@/lib/preview-mode'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import StackBuilder from './StackBuilder'
import TopNav from '@/components/TopNav'
import AccountNavigation from '@/components/AccountNavigation'

export default async function StackPage() {
  if (isSyntheticPreview()) {
    return (
      <div className="min-h-screen bg-lab-bg text-[#14140f]">
        <TopNav signedInInitial={false} />
        <main className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 sm:py-12">
          <div className="mb-6 rounded-lg border border-[#ccd0c4] bg-white px-4 py-3 text-sm text-[#62645c]">
            Local design preview: your stack is stored only in this browser. Accounts and purchases remain disabled.
          </div>
          <StackBuilder />
          <p className="mt-8 border-t border-lab-border pt-5 text-xs text-lab-muted">For informational purposes only. Not medical advice.</p>
        </main>
      </div>
    )
  }

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
    <div className="min-h-screen bg-lab-bg text-[#14140f]">
      <TopNav signedInInitial />
      <main className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 sm:py-12">
        <StackBuilder />
        <div className="mt-8 border-t border-lab-border pt-6"><AccountNavigation /></div>
        <p className="mt-8 border-t border-lab-border pt-5 text-xs text-lab-muted">For informational purposes only. Not medical advice.</p>
      </main>
    </div>
  )
}
