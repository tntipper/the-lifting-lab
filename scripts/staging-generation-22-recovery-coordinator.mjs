/** Disabled, one-use sequence for exact active proof, retirement and retired proof. */
import { ACTIVE_WINDOW_EXPIRES_AT, WINDOW_ID } from './staging-generation-22-credentials.mjs'
import { RECOVERY_WINDOW_EXPIRES_AT } from './staging-generation-22-recovery-journal.mjs'
import { GENERATION, PROJECT_REF } from './staging-generation-22-material.mjs'
import { QUERY_ID as ACTIVE_QUERY_ID } from './staging-generation-22-active-check.mjs'
import { QUERY_ID as RETIRED_QUERY_ID } from './staging-generation-22-retired-check.mjs'

export const STAGING_GENERATION_22_RECOVERY_COORDINATOR_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 recovery coordinator unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

function checkReadProof(proof, status, queryId) {
  if (!exact(proof, ['status', 'projectRef', 'queryId', 'receiptSha256'])
    || proof.status !== status || proof.projectRef !== PROJECT_REF
    || proof.queryId !== queryId || !digest(proof.receiptSha256)) unavailable()
}

export function createStagingGeneration22RecoveryCoordinator({ journal, active, recovery, retired,
  now = Date.now, timeoutMs = 120_000 } = {}) {
  if (!STAGING_GENERATION_22_RECOVERY_COORDINATOR_ENABLED
    || !journal || ['read', 'dispatch', 'capability', 'confirm', 'hold']
      .some(method => typeof journal[method] !== 'function')
    || typeof active?.prove !== 'function' || typeof recovery?.retire !== 'function'
    || typeof retired?.prove !== 'function' || typeof now !== 'function'
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) unavailable()
  let used = false
  return Object.freeze({
    async recover({ signal } = {}) {
      if (used || !signal || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
      used = true
      const startedAt = now(), deadline = Date.parse(RECOVERY_WINDOW_EXPIRES_AT)
      if (!Number.isFinite(startedAt) || !Number.isFinite(deadline)
        || deadline <= startedAt || deadline <= Date.parse(ACTIVE_WINDOW_EXPIRES_AT)
        || deadline > Date.parse(ACTIVE_WINDOW_EXPIRES_AT) + 3_600_000) unavailable()
      const controller = new AbortController()
      const forwardAbort = () => controller.abort()
      signal.addEventListener('abort', forwardAbort, { once: true })
      if (signal.aborted) controller.abort()
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, deadline - startedAt))
      let onAbort, state
      const aborted = new Promise((_, reject) => {
        onAbort = () => reject(new Error('Generation 22 recovery expired'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
      })
      void aborted.catch(() => {})
      const run = operation => Promise.race([Promise.resolve().then(() => {
        const current = now()
        if (controller.signal.aborted || !Number.isFinite(current) || current >= deadline) unavailable()
        return operation()
      }), aborted])
      try {
        state = journal.read()
        if (!exact(state, ['schema', 'projectRef', 'generation', 'windowId', 'expiresAt',
          'recoveryExpiresAt', 'runId', 'createdAt', 'updatedAt', 'state', 'receiptDigest'])
          || state.schema !== 'tll-staging-generation-22-recovery-dispatch/v1'
          || state.projectRef !== PROJECT_REF || state.generation !== GENERATION
          || state.windowId !== WINDOW_ID || state.expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
          || state.recoveryExpiresAt !== RECOVERY_WINDOW_EXPIRES_AT
          || state.state !== 'CLAIMED' || state.receiptDigest !== null) unavailable()
        const activeProof = await run(() => active.prove({ expiresAt: ACTIVE_WINDOW_EXPIRES_AT,
          signal: controller.signal }))
        checkReadProof(activeProof, 'PASS_ACTIVE', ACTIVE_QUERY_ID)
        state = journal.dispatch(state)
        const capability = journal.capability(state)
        const result = await run(() => recovery.retire({ capability, expiresAt: ACTIVE_WINDOW_EXPIRES_AT,
          signal: controller.signal }))
        if (!exact(result, ['status', 'projectRef', 'generation', 'windowId', 'receiptSha256'])
          || result.status !== 'PASS_RETIRED' || result.projectRef !== PROJECT_REF
          || result.generation !== GENERATION || result.windowId !== WINDOW_ID
          || !digest(result.receiptSha256)) unavailable()
        state = journal.confirm(state, result.receiptSha256)
        if (state.state !== 'FINISHED') unavailable()
        try {
          const retiredProof = await run(() => retired.prove({ expiresAt: ACTIVE_WINDOW_EXPIRES_AT,
            signal: controller.signal }))
          checkReadProof(retiredProof, 'PASS_RETIRED', RETIRED_QUERY_ID)
          return Object.freeze({ status: 'RECOVERY_VERIFIED', projectRef: PROJECT_REF,
            generation: GENERATION })
        } catch { return Object.freeze({ status: 'RETIREMENT_UNVERIFIED', projectRef: PROJECT_REF,
          generation: GENERATION }) }
      } catch {
        let held = false
        if (state && ['CLAIMED', 'DISPATCHED'].includes(state.state)) {
          try { held = journal.hold(state)?.state === 'HOLD' } catch {}
        }
        return Object.freeze({ status: held ? 'HOLD_RECONCILE' : 'JOURNAL_UNCERTAIN',
          projectRef: PROJECT_REF, generation: GENERATION })
      } finally {
        controller.abort(); clearTimeout(timer)
        signal.removeEventListener('abort', forwardAbort)
        controller.signal.removeEventListener('abort', onAbort)
      }
    },
  })
}
