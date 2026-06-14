import { createAdminClient } from './supabase-admin'

// The seven configurable earning actions (mirrors points_config.action_type).
export type PointsAction =
  | 'signup'
  | 'review'
  | 'favourite'
  | 'build_stack'
  | 'share'
  | 'daily_login'
  | 'referral'

// Award points authoritatively via the SECURITY DEFINER SQL function.
// Idempotent: the (user_id, dedupe_key) unique index means a repeated call with
// the same dedupeKey awards nothing. Returns points actually awarded (0 if dup
// / no active season / no config). Never throws — point awards must not break
// the underlying user action.
export async function awardPoints(
  userId: string,
  action: PointsAction,
  ref: string | null,
  dedupeKey: string
): Promise<number> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('award_points', {
      p_user: userId,
      p_action: action,
      p_ref: ref,
      p_dedupe: dedupeKey,
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

// Today's UTC calendar day — used as the daily_login dedupe bucket.
export function utcDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}
