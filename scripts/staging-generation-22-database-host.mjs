/** Injected-only bridge from the one-use Gen22 journal to exact staging SQL. */
import { consumeStagingGeneration22DatabaseCapability } from './staging-generation-22-journal.mjs'
import { ACTIVE_WINDOW_EXPIRES_AT, prepareStagingGeneration22CredentialSql,
  validateStagingGeneration22CredentialReceipt } from './staging-generation-22-credentials.mjs'

export const STAGING_GENERATION_22_DATABASE_HOST_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 database host unavailable') }

/** `post` must honour the supplied signal; the later launcher must supervise it. */
export function createStagingGeneration22DatabaseHost({ post, now = Date.now, requestTimeoutMs = 35_000 } = {}) {
  if (!STAGING_GENERATION_22_DATABASE_HOST_ENABLED || typeof post !== 'function'
    || typeof now !== 'function' || !Number.isInteger(requestTimeoutMs)
    || requestTimeoutMs < 1 || requestTimeoutMs > 35_000) unavailable()
  let dispatched = false
  return Object.freeze({
    async install({ capability, verifiers, expiresAt } = {}) {
      if (dispatched || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT) unavailable()
      const packet = prepareStagingGeneration22CredentialSql({ expiresAt, verifiers, nowMs: now() })
      if (now() >= Date.parse(expiresAt)) unavailable()
      consumeStagingGeneration22DatabaseCapability(capability)
      dispatched = true
      // A transport error or invalid result is an uncertain external outcome.
      // The caller must HOLD the journal and reconcile; this host never retries.
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(),
        Math.min(requestTimeoutMs, Math.max(1, Date.parse(expiresAt) - now())))
      let onAbort
      const aborted = new Promise((_, reject) => {
        onAbort = () => reject(new Error('Generation 22 database request expired'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
      })
      try {
        const rows = await Promise.race([Promise.resolve().then(() => post(packet, { signal: controller.signal })), aborted])
        if (controller.signal.aborted || now() >= Date.parse(expiresAt)) unavailable()
        return validateStagingGeneration22CredentialReceipt(rows, { expiresAt, nowMs: now() })
      } catch { unavailable() }
      finally { clearTimeout(timeout); controller.signal.removeEventListener('abort', onAbort) }
    },
  })
}
