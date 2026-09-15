import { guardedSupabaseFetch } from '@/lib/preview-mode'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { completeAuthCallback } from '@/lib/auth-flow'

export async function GET(request: Request) {
  return completeAuthCallback(new URL(request.url), async code => {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
      global: { fetch: guardedSupabaseFetch },
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
    return supabase.auth.exchangeCodeForSession(code)
  })
}
