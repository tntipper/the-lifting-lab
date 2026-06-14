import { createClient } from '@supabase/supabase-js'

// Service-role client. SERVER-ONLY — bypasses RLS. Never import into a
// 'use client' component. Used for authoritative point awards (writing the
// ledger, which users cannot write directly) and other privileged reads.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
