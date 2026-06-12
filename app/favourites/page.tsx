import type { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import TopNav from '@/components/TopNav'
import FavouritesList from './FavouritesList'

export const metadata: Metadata = {
  title: 'My Favourites — The Lifting Lab',
  robots: { index: false, follow: false },
}

export default async function FavouritesPage() {
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
  if (!user) redirect('/auth')

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black uppercase tracking-wide">
            My <span className="text-lab-lime">Favourites</span>
          </h1>
          <p className="text-lab-muted text-sm mt-2">
            Products you&apos;ve saved. Tap the heart to remove.
          </p>
        </div>
        <FavouritesList />
      </div>
    </div>
  )
}
