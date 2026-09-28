/** Disabled, injected bridge for separate Gen23 setup and retirement records. */
import { ACTIVE_WINDOW_EXPIRES_AT,
  prepareStagingGeneration23CredentialSql,
  validateStagingGeneration23CredentialReceipt } from './staging-generation-23-credentials.mjs'
import { prepareStagingGeneration23RecoverySql,
  validateStagingGeneration23RecoveryReceipt } from './staging-generation-23-recovery.mjs'
import { prepareStagingGeneration23ControlShutdownSql,
  validateStagingGeneration23ControlShutdownReceipt } from './staging-generation-23-control-shutdown.mjs'

export const STAGING_GENERATION_23_DATABASE_HOST_ENABLED = true
const unavailable = () => { throw Error('Generation 23 database host unavailable') }

/** The future launcher must bind `post` to the fixed staging SQL API and supervise its process group. */
export function createStagingGeneration23DatabaseHost({ action, journal, post,
  now = Date.now, requestTimeoutMs = 35_000 } = {}) {
  if (!STAGING_GENERATION_23_DATABASE_HOST_ENABLED || !['SETUP', 'SHUTDOWN', 'RETIRE'].includes(action)
    || !journal || typeof journal.claim !== 'function' || typeof journal.dispatch !== 'function'
    || typeof journal.confirm !== 'function' || typeof journal.hold !== 'function'
    || typeof journal.read !== 'function' || typeof post !== 'function'
    || typeof now !== 'function' || !Number.isInteger(requestTimeoutMs)
    || requestTimeoutMs < 1 || requestTimeoutMs > 35_000) unavailable()
  let used = false
  return Object.freeze({
    async run({ expiresAt, deadlineAt, verifiers, signal } = {}) {
      const startedAt = now()
      if (used || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
        || !signal || signal.aborted || typeof signal.addEventListener !== 'function'
        || typeof signal.removeEventListener !== 'function'
        || !Number.isFinite(startedAt) || !Number.isFinite(Date.parse(deadlineAt))
        || startedAt >= Date.parse(deadlineAt)) unavailable()
      used = true
      let record, controller, timer, onAbort, forwardAbort
      try {
        record = journal.claim({ expiresAt, deadlineAt })
        const packet = action === 'SETUP'
          ? prepareStagingGeneration23CredentialSql({ expiresAt, verifiers, nowMs: now() })
          : action === 'SHUTDOWN'
            ? prepareStagingGeneration23ControlShutdownSql({ expiresAt })
            : prepareStagingGeneration23RecoverySql({ expiresAt })
        record = journal.dispatch(record)
        controller = new AbortController()
        forwardAbort = () => controller.abort()
        signal.addEventListener('abort', forwardAbort, { once: true })
        if (signal.aborted) controller.abort()
        timer = setTimeout(() => controller.abort(),
          Math.min(requestTimeoutMs, Math.max(1, Date.parse(deadlineAt) - now())))
        const aborted = new Promise((_, reject) => {
          onAbort = () => reject(Error('Generation 23 database request stopped'))
          controller.signal.addEventListener('abort', onAbort, { once: true })
        })
        void aborted.catch(() => {})
        const rows = await Promise.race([Promise.resolve().then(() => {
          if (controller.signal.aborted || now() >= Date.parse(deadlineAt)) unavailable()
          return post(packet, { action, signal: controller.signal })
        }), aborted])
        if (controller.signal.aborted || now() >= Date.parse(deadlineAt)) unavailable()
        const receipt = action === 'SETUP'
          ? validateStagingGeneration23CredentialReceipt(rows, { expiresAt, nowMs: now() })
          : action === 'SHUTDOWN'
            ? validateStagingGeneration23ControlShutdownReceipt(rows, { expiresAt })
            : validateStagingGeneration23RecoveryReceipt(rows, { expiresAt })
        record = journal.confirm(record, receipt.receiptSha256)
        return Object.freeze({ status: action === 'SETUP' ? 'SETUP_VERIFIED'
          : action === 'SHUTDOWN' ? 'SHUTDOWN_VERIFIED' : 'RETIREMENT_VERIFIED',
          receiptSha256: receipt.receiptSha256 })
      } catch {
        if (record && ['CLAIMED', 'DISPATCHED'].includes(record.state)) {
          try { record = journal.hold(record) } catch { return Object.freeze({ status: 'JOURNAL_UNCERTAIN' }) }
        }
        return Object.freeze({ status: 'HOLD_RECONCILE', action })
      } finally {
        if (timer) clearTimeout(timer)
        if (controller && onAbort) controller.signal.removeEventListener('abort', onAbort)
        if (forwardAbort) signal.removeEventListener('abort', forwardAbort)
      }
    },
  })
}
