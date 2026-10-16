import { isIsolatedEnvironment } from '../preview-mode'

/** Public build-time opt-in. Hosted staging always owns its separate cart. */
export function liveCartEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TLL_LIVE_CART === 'enabled' && !isIsolatedEnvironment()
}
