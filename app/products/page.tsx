import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ProductBrowser from './ProductBrowser'

export default async function ProductsPage() {
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
        <div className="mb-8">
          <Link href="/dashboard" className="text-lab-muted text-sm hover:text-white transition-colors">
            ← Dashboard
          </Link>
          <h1 className="text-3xl font-black uppercase tracking-wide mt-3">
            Browse <span className="text-lab-lime">Products</span>
          </h1>
          <p className="text-lab-muted text-sm mt-2">
            Search UK supplements, ranked by effective dosing and true value.
          </p>
        </div>
        <ProductBrowser />
      </div>
    </div>
  )
}
