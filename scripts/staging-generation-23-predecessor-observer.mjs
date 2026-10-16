/** Injected-only, one-use read of the exact retired Gen22 staging state. */
import { PROJECT_REF } from './staging-generation-23-password-material.mjs'
import { QUERY_ID } from './staging-generation-23-predecessor-check.mjs'

export const STAGING_GENERATION_23_PREDECESSOR_OBSERVER_ENABLED = false
const unavailable = () => { throw new Error('Generation 23 predecessor observer unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const fixed = status => Object.freeze({ status, projectRef: PROJECT_REF })

export function createStagingGeneration23PredecessorObserver({ readToken, post, validate, journal,
  now = Date.now, timeoutMs = 55_000 } = {}) {
  if (!STAGING_GENERATION_23_PREDECESSOR_OBSERVER_ENABLED
    || typeof readToken !== 'function' || typeof post !== 'function' || typeof validate !== 'function'
    || !journal || ['read', 'claim', 'dispatch', 'finish'].some(name => typeof journal[name] !== 'function')
    || typeof now !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 55_000) unavailable()
  let used = false
  return Object.freeze({
    async observe({ signal } = {}) {
      if (used || !signal || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
      used = true
      try { if (journal.read()) return fixed('REPLAY_REJECTED') }
      catch { return fixed('RECONCILIATION_REQUIRED') }
      let record, token
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal.addEventListener('abort', abort, { once: true })
      const startedAt = now(), deadline = startedAt + timeoutMs
      const timer = setTimeout(abort, timeoutMs)
      const check = () => {
        const current = now()
        if (controller.signal.aborted || !Number.isFinite(startedAt) || !Number.isFinite(deadline)
          || !Number.isFinite(current) || current >= deadline) unavailable()
      }
      try {
        check()
        record = journal.claim()
        token = await readToken({ signal: controller.signal })
        check()
        if (!Buffer.isBuffer(token) || !/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(token.toString('utf8'))) unavailable()
        record = journal.dispatch(record)
        const rows = await post({ token, signal: controller.signal })
        check()
        const proof = validate(rows)
        if (!exact(proof, ['status', 'projectRef', 'queryId', 'receiptSha256'])
          || proof.status !== 'PASS_RETIRED' || proof.projectRef !== PROJECT_REF
          || proof.queryId !== QUERY_ID || !/^[a-f0-9]{64}$/.test(proof.receiptSha256)) unavailable()
        record = journal.finish(record, 'PASS_RETIRED', proof.receiptSha256)
        return fixed('PASS_RETIRED')
      } catch {
        try {
          if (record?.state === 'CLAIMED' || record?.state === 'DISPATCHED') {
            record = journal.finish(record, 'READ_UNAVAILABLE')
            return fixed('READ_UNAVAILABLE')
          }
          return fixed(journal.read() ? 'RECONCILIATION_REQUIRED' : 'READ_UNAVAILABLE')
        } catch { return fixed('RECONCILIATION_REQUIRED') }
      } finally {
        controller.abort(); clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        token?.fill?.(0)
      }
    },
  })
}
