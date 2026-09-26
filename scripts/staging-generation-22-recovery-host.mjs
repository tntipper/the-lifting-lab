/** Disabled bridge from the separate recovery journal to exact staging role retirement. */
import { ACTIVE_WINDOW_EXPIRES_AT } from './staging-generation-22-credentials.mjs'
import { RECOVERY_WINDOW_EXPIRES_AT,
  consumeStagingGeneration22RecoveryCapability } from './staging-generation-22-recovery-journal.mjs'
import { prepareStagingGeneration22RecoverySql,
  validateStagingGeneration22RecoveryReceipt } from './staging-generation-22-recovery.mjs'

export const STAGING_GENERATION_22_RECOVERY_HOST_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 recovery host unavailable') }

/** A transport error leaves an uncertain outcome; the owning journal must HOLD. */
export function createStagingGeneration22RecoveryHost({ post, now = Date.now,
  requestTimeoutMs = 35_000 } = {}) {
  if (!STAGING_GENERATION_22_RECOVERY_HOST_ENABLED || typeof post !== 'function'
    || typeof now !== 'function' || !Number.isInteger(requestTimeoutMs)
    || requestTimeoutMs < 1 || requestTimeoutMs > 35_000) unavailable()
  let dispatched = false
  return Object.freeze({
    async retire({ capability, expiresAt } = {}) {
      const startedAt = now()
      if (dispatched || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
        || !Number.isFinite(startedAt) || startedAt >= Date.parse(RECOVERY_WINDOW_EXPIRES_AT)) unavailable()
      const packet = prepareStagingGeneration22RecoverySql({ expiresAt })
      consumeStagingGeneration22RecoveryCapability(capability)
      dispatched = true
      const controller = new AbortController()
      const remaining = Date.parse(RECOVERY_WINDOW_EXPIRES_AT) - startedAt
      const timeout = setTimeout(() => controller.abort(),
        Math.min(requestTimeoutMs, Math.max(1, remaining)))
      let onAbort
      const aborted = new Promise((_, reject) => {
        onAbort = () => reject(new Error('Generation 22 recovery request expired'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
      })
      try {
        const rows = await Promise.race([Promise.resolve().then(() => {
          const sendAt = now()
          if (controller.signal.aborted || !Number.isFinite(sendAt)
            || sendAt >= Date.parse(RECOVERY_WINDOW_EXPIRES_AT)) unavailable()
          return post(packet, { signal: controller.signal })
        }), aborted])
        const completedAt = now()
        if (controller.signal.aborted || !Number.isFinite(completedAt)
          || completedAt >= Date.parse(RECOVERY_WINDOW_EXPIRES_AT)) unavailable()
        return validateStagingGeneration22RecoveryReceipt(rows, { expiresAt })
      } catch { unavailable() }
      finally { clearTimeout(timeout); controller.signal.removeEventListener('abort', onAbort) }
    },
  })
}
