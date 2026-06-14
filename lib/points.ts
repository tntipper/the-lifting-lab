import type { SupabaseClient } from '@supabase/supabase-js'

// The seven configurable earning actions (mirrors points_config.action_type).
export type PointsAction =
  | 'signup'
  | 'review'
  | 'favourite'
  | 'build_stack'
  | 'share'
  | 'daily_login'
  | 'referral'

// Award points via the SECURITY DEFINER award_points() SQL function, called
// with the user's own (cookie-bound) session — no service key needed. The DB
// enforces per-action limits/cooldowns and tags the active season, so this is
// idempotent: a capped/duplicate call awards 0. Never throws — a points
// failure must never break the underlying user action.
export async function awardPoints(
  supabase: SupabaseClient,
  action: PointsAction,
  refId: string | null = null,
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('award_points', {
      p_action: action,
      p_ref_id: refId,
    })
    if (error) {
      console.error(`[points] award ${action} failed:`, error.message)
      return 0
    }
    return typeof data === 'number' ? data : 0
  } catch (e) {
    console.error(`[points] award ${action} threw:`, e)
    return 0
  }
}

// Resolve a pending referral: awards the referrer (set on profiles.referred_by
// at signup) their points exactly once. Returns points awarded to the referrer.
export async function claimReferral(supabase: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('claim_referral')
    if (error) {
      console.error('[points] claim_referral failed:', error.message)
      return 0
    }
    return typeof data === 'number' ? data : 0
  } catch (e) {
    console.error('[points] claim_referral threw:', e)
    return 0
  }
}
