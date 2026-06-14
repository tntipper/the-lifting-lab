import type { SupabaseClient, User } from '@supabase/supabase-js'
import { awardPoints, utcDayKey } from './points'
import { createAdminClient } from './supabase-admin'

export type AvatarType = 'standard' | 'premium' | 'custom_photo'

export type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_type: AvatarType
  avatar_id: string | null
  avatar_url: string | null
  total_points: number
  points_spent: number
  referral_code: string | null
  referred_by: string | null
  created_at: string
}

// Points available to spend = all-time earned minus lifetime spent.
export function availablePoints(p: Pick<Profile, 'total_points' | 'points_spent'>): number {
  return Math.max(0, (p.total_points ?? 0) - (p.points_spent ?? 0))
}

// Ensure the signed-in user has a profile, then apply idempotent engagement
// awards (signup once, daily login once/day) and resolve a pending referral.
// Call this from authenticated server entry points (dashboard, settings).
// Returns the up-to-date profile.
export async function syncSession(
  supabase: SupabaseClient,
  user: User
): Promise<Profile | null> {
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  // Fallback create if the auth trigger hasn't run for this user.
  if (!profile) {
    const admin = createAdminClient()
    await admin
      .from('profiles')
      .insert({
        id: user.id,
        username: 'lifter_' + user.id.replace(/-/g, '').slice(0, 8),
      })
      .then(() => undefined)
    const reread = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    profile = reread.data
  }

  // Referral: a ref_code captured at signup is resolved to the referrer once.
  const refCode = (user.user_metadata as Record<string, unknown> | undefined)?.ref_code
  if (profile && !profile.referred_by && typeof refCode === 'string' && refCode) {
    const admin = createAdminClient()
    const { data: referrer } = await admin
      .from('profiles')
      .select('id')
      .eq('referral_code', refCode)
      .neq('id', user.id)
      .maybeSingle()
    if (referrer) {
      await admin.from('profiles').update({ referred_by: referrer.id }).eq('id', user.id)
      await awardPoints(referrer.id, 'referral', user.id, 'referral:' + user.id)
      profile.referred_by = referrer.id
    }
  }

  // Idempotent engagement awards.
  await awardPoints(user.id, 'signup', null, 'signup')
  await awardPoints(user.id, 'daily_login', null, 'daily_login:' + utcDayKey())

  const { data: fresh } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  return (fresh ?? profile) as Profile | null
}
