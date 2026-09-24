/** Injected-only local credential readiness; no network or provider action. */
import { CREDENTIAL_READINESS_WINDOW_DEADLINE_MS } from './staging-provider-credential-readiness-phase-journal.mjs'
export const CREDENTIAL_READINESS_SESSION_ENABLED = false
export const CREDENTIAL_READINESS_DEADLINE_MS = CREDENTIAL_READINESS_WINDOW_DEADLINE_MS
export const CREDENTIAL_READINESS_CHILD_TIMEOUT_MS = 15_000
const finalizationReserveMs = 1_000
const selectors = Object.freeze([
  ['supabase', 'READ_SUPABASE'], ['vercel', 'READ_VERCEL'], ['vercel-bypass', 'READ_BYPASS'],
])
const categories = new Set(['GUARD', 'TIMEOUT', 'COMMAND', 'FORMAT', 'OUTPUT', 'INTERNAL', 'DEADLINE'])
const fixed = (status, category = null, elapsedSeconds = null) => Object.freeze({ status, category, elapsedSeconds })
const validBuffer = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 4_096
  && !value.includes(0) && [...value].every(byte => byte >= 33 && byte <= 126)

export function runCredentialReadinessSession({ readCredential, phaseJournal, now = Date.now } = {}) {
  if (typeof readCredential !== 'function' || typeof now !== 'function' || !phaseJournal
    || ['read', 'start', 'record', 'finish', 'assess'].some(name => typeof phaseJournal[name] !== 'function')) return fixed('HOLD', 'INTERNAL')
  let record, started
  try {
    if (phaseJournal.read()) return fixed('HOLD', 'GUARD')
    record = phaseJournal.start()
    started = Date.parse(record.startedAt)
    if (!Number.isFinite(started) || !Number.isFinite(Date.parse(record.deadlineAt))) throw Error('unavailable')
    for (const [selector, phase] of selectors) {
      const before = now()
      if (!Number.isFinite(before) || before < started || before - started > CREDENTIAL_READINESS_DEADLINE_MS
        || phaseJournal.assess(record, before).status !== 'ACTIVE_WITHIN_PHASE_BOUND') {
        record = phaseJournal.finish(record, 'HOLD', 'DEADLINE')
        return fixed('HOLD', 'DEADLINE')
      }
      record = phaseJournal.record(record, phase)
      const beforeRead = now()
      const phaseAssessment = phaseJournal.assess(record, beforeRead)
      const remainingMs = Math.min(Date.parse(record.deadlineAt),
        Date.parse(record.updatedAt) + phaseAssessment.deadlineMs) - beforeRead
      if (!Number.isFinite(beforeRead) || beforeRead < before
        || !Number.isFinite(remainingMs)
        || remainingMs < CREDENTIAL_READINESS_CHILD_TIMEOUT_MS + finalizationReserveMs
        || phaseAssessment.status !== 'ACTIVE_WITHIN_PHASE_BOUND') {
        record = phaseJournal.finish(record, 'HOLD', 'DEADLINE')
        return fixed('HOLD', 'DEADLINE')
      }
      let result
      try {
        result = readCredential(selector)
        const after = now()
        const category = !Number.isFinite(after) || after < before || after - started > CREDENTIAL_READINESS_DEADLINE_MS - finalizationReserveMs
          || phaseJournal.assess(record, after).status !== 'ACTIVE_WITHIN_PHASE_BOUND'
          ? 'DEADLINE' : result?.status === 'HOLD' && categories.has(result.category) ? result.category
            : result?.status === 'PASS' && validBuffer(result.value) ? null : 'FORMAT'
        if (category) {
          record = phaseJournal.finish(record, 'HOLD', category)
          return fixed('HOLD', category, Number.isFinite(after) ? Math.ceil((after - started) / 1_000) : null)
        }
      } finally { result?.value?.fill?.(0) }
    }
    const completed = now()
    if (!Number.isFinite(completed) || completed < started
      || completed - started > CREDENTIAL_READINESS_DEADLINE_MS - finalizationReserveMs
      || phaseJournal.assess(record, completed).status !== 'ACTIVE_WITHIN_PHASE_BOUND') {
      record = phaseJournal.finish(record, 'HOLD', 'DEADLINE')
      return fixed('HOLD', 'DEADLINE')
    }
    record = phaseJournal.finish(record, 'PASS')
    return fixed('PASS', null, Math.ceil((completed - started) / 1_000))
  } catch {
    try { if (record?.outcome === null) phaseJournal.finish(record, 'HOLD', 'INTERNAL') } catch { /* terminal uncertainty stays held */ }
    return fixed('HOLD', 'INTERNAL')
  }
}
