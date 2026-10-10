/** Disabled, one-use Gen23 wrapper for the existing exact control-activation SQL. */
import { ACTIVE_WINDOW_EXPIRES_AT, WINDOW_ID } from './staging-owner-successor-sql-context.mjs'
import { PROJECT_REF } from './staging-owner-successor-password-material.mjs'

export const OWNER_SUCCESSOR_NATIVE_CONTROL_ENABLE_HOST_ENABLED = false
const unavailable = () => { throw Error('Generation 23 control enable unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/** `execute` must be the fixed staging activation adapter inside the supervised child. */
export function createOwnerSuccessorControlEnableHost({ journal, execute,
  now = Date.now } = {}) {
  if (!OWNER_SUCCESSOR_NATIVE_CONTROL_ENABLE_HOST_ENABLED
    || !journal || ['claim', 'dispatch', 'confirm', 'hold', 'read']
      .some(name => typeof journal[name] !== 'function')
    || typeof execute !== 'function' || typeof now !== 'function') unavailable()
  let used = false
  return Object.freeze({
    async run({ expiresAt, deadlineAt, signal } = {}) {
      const at = now()
      if (used || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
        || !Number.isSafeInteger(at) || !Number.isFinite(Date.parse(deadlineAt))
        || at >= Date.parse(deadlineAt) || Date.parse(deadlineAt) > Date.parse(expiresAt)
        || !signal || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
      used = true
      let record
      try {
        record = journal.claim({ expiresAt, deadlineAt })
        record = journal.dispatch(record)
        const result = await execute({ context: Object.freeze({ generation: 23,
          windowId: WINDOW_ID, expiresAt }), signal })
        if (signal.aborted || !Number.isSafeInteger(now()) || now() < at || now() >= Date.parse(deadlineAt)
          || !exact(result, ['status', 'target', 'generation', 'windowId', 'receiptHash'])
          || result.status !== 'CONTROLS_ENABLED' || result.target !== PROJECT_REF
          || result.generation !== 23 || result.windowId !== WINDOW_ID
          || !/^[a-f0-9]{64}$/.test(result.receiptHash)) unavailable()
        record = journal.confirm(record, result.receiptHash)
        return Object.freeze({ status: 'CONTROL_ACTIVATION_VERIFIED',
          receiptSha256: result.receiptHash })
      } catch {
        if (record && ['CLAIMED', 'DISPATCHED'].includes(record.state)) {
          try { journal.hold(record) } catch { return Object.freeze({ status: 'JOURNAL_UNCERTAIN' }) }
        }
        return Object.freeze({ status: 'HOLD_RECONCILE', action: 'ACTIVATE' })
      }
    },
  })
}
