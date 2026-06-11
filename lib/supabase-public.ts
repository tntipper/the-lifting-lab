import { createClient } from '@supabase/supabase-js'

// Plain anon client for public, read-only server queries (no auth/cookies).
// Used by public API routes that read `active` products under RLS.
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
