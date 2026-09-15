import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { completeSignOut } from '@/lib/auth-flow'

export async function POST(request: Request) {
  return completeSignOut(new URL(request.url), async () => {
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

    return supabase.auth.signOut()
  })
}
