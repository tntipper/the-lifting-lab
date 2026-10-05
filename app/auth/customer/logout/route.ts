import { guardedSupabaseFetch } from '@/lib/preview-mode'
import { stagingCustomerLogoutRoute } from '@/lib/server/staging-customer-route'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return stagingCustomerLogoutRoute(request, async () => {
    try {
      const cookieStore = await cookies()
      const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        global: { fetch: guardedSupabaseFetch },
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: values => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
        },
      })
      const { error } = await supabase.auth.signOut({ scope: 'global' })
      return error === null
    } catch { return false }
  })
}
