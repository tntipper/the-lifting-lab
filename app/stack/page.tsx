import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import StackBuilder from './StackBuilder'

export default async function StackPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/dashboard" className="text-lab-muted text-sm hover:text-white transition-colors">
              ← Dashboard
            </Link>
            <h1 className="text-3xl font-black uppercase tracking-wide mt-3">
              My <span className="text-lab-lime">Stack</span>
            </h1>
            <p className="text-lab-muted text-sm mt-2">
              Add your supplements — we&apos;ll score them and flag anything over EFSA safe limits.
            </p>
            <p className="text-lab-muted/50 text-xs mt-1">
              For informational purposes only. Not medical advice.
            </p>
          </div>
        </div>
        <StackBuilder />
      </div>
    </div>
  )
}
