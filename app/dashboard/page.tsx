import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-12">
          <h1 className="text-2xl font-bold">The Lifting Lab</h1>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-gray-400 text-sm hover:text-white transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="mb-8">
          <p className="text-gray-400 text-sm mb-1">Signed in as</p>
          <p className="text-white font-medium">{user.email}</p>
        </div>

        <div className="grid gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-2">My Stack</h2>
            <p className="text-gray-400 text-sm">Build and track your supplement stack with safety analysis.</p>
            <div className="mt-4 inline-block bg-gray-800 text-gray-400 text-xs px-3 py-1 rounded-full">
              Coming soon
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-2">Stack Safety</h2>
            <p className="text-gray-400 text-sm">Check your combined nutrient intake against EFSA upper limits.</p>
            <div className="mt-4 inline-block bg-gray-800 text-gray-400 text-xs px-3 py-1 rounded-full">
              Coming soon
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-2">Product Database</h2>
            <p className="text-gray-400 text-sm">Search and compare UK supplement products.</p>
            <div className="mt-4 inline-block bg-gray-800 text-gray-400 text-xs px-3 py-1 rounded-full">
              Coming soon
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
