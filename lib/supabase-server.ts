import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Shared cookie-bound server client for route handlers and server components.
// Mirrors the inline pattern used by the favourites/stack routes.
export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
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
}
