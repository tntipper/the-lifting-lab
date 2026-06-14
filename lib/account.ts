import type { SupabaseClient, User } from '@supabase/supabase-js'
import { awardPoints, claimReferral } from './points'

export type AvatarType = 'standard' | 'premium' | 'seasonal' | 'custom_photo'

export type Profile = {
  id: string
  username: string
  display_name: string | null
  avatar_type: AvatarType
  avatar_id: string
  avatar_url: string | null
  total_points: number
  points_spent: number
  referral_code: string
  referred_by: string | null
  created_at: string
}

// Points available to spend = all-time earned minus lifetime spent.
export function availablePoints(p: Pick<Profile, 'total_points' | 'points_spent'>): number {
  return Math.max(0, (p.total_points ?? 0) - (p.points_spent ?? 0))
}

// Ensure the signed-in user has a profile, then apply idempotent engagement
// awards (signup once, daily login once/day) and resolve a pending referral.
// All writes go through SECURITY DEFINER SQL functions using the user's own
// session — no service key. Call from authenticated server entry points
// (dashboard, settings). Returns the up-to-date profile.
export async function syncSession(
  supabase: SupabaseClient,
  user: User,
): Promise<Profile | null> {
  // Guarantee a profile row exists (covers signup-trigger lag).
  await supabase.rpc('ensure_profile').then(undefined, () => undefined)

  // Idempotent engagement awards + referral resolution.
  await awardPoints(supabase, 'signup')
  await awardPoints(supabase, 'daily_login')
  await claimReferral(supabase)

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  return (data as Profile | null) ?? null
}
