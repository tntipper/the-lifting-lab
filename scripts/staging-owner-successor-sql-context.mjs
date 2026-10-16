/** Fixed fresh-window SQL identity; no native execution or authority issuer. */
import { OWNER_SUCCESSOR_WINDOW_ID, OWNER_SUCCESSOR_TARGETS } from './staging-owner-successor-registration.mjs'
export const GENERATION = 23
export const PROJECT_REF = OWNER_SUCCESSOR_TARGETS.supabase
export const WINDOW_ID = OWNER_SUCCESSOR_WINDOW_ID
export const ACTIVE_WINDOW_STARTED_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'
export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'
const denied = () => { throw Error('Successor SQL window unavailable') }
const canonical = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(value)
  && Number.isSafeInteger(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value
export function assertOwnerSuccessorSqlWindow(expiresAt) {
  if (expiresAt !== ACTIVE_WINDOW_EXPIRES_AT || !canonical(ACTIVE_WINDOW_STARTED_AT) || !canonical(expiresAt)) denied()
  const start = Date.parse(ACTIVE_WINDOW_STARTED_AT), end = Date.parse(expiresAt)
  if (end - start < 45 * 60_000 || end - start > 60 * 60_000) denied()
}
export function assertOwnerSuccessorSetupClock(expiresAt, nowMs) {
  assertOwnerSuccessorSqlWindow(expiresAt)
  if (!Number.isSafeInteger(nowMs) || nowMs < Date.parse(ACTIVE_WINDOW_STARTED_AT)
    || nowMs >= Date.parse(expiresAt) - 15 * 60_000) denied()
}
