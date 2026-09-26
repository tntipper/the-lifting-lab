/** Injected one-shot coordinator; no Keychain, child process or filesystem action here. */
import { observedSearchDomainCategory } from './staging-provider-keychain-search-domain-journal.mjs'
const fixed = (status, category) => Object.freeze({ status, category })
const fail = () => { throw Error('Search-domain session unavailable') }

export function classifySearchDomainChild({ status, signal, error, stdout, stderr } = {}) {
  if (error) return fixed('UNCERTAIN', error.code === 'ETIMEDOUT' ? 'CHILD_TIMEOUT' : 'CHILD_SPAWN')
  if (signal) return fixed('UNCERTAIN', 'CHILD_SIGNAL')
  if (status !== 0) return fixed('UNCERTAIN', 'CHILD_EXIT')
  if (!Buffer.isBuffer(stdout) || !Buffer.isBuffer(stderr)
    || stderr.length !== 0 || stdout.length > 192) return fixed('UNCERTAIN', 'CHILD_OUTPUT')
  const match = /^([^\r\n]+)\n$/.exec(stdout.toString('utf8'))
  if (!match || !observedSearchDomainCategory(match[1])) return fixed('UNCERTAIN', 'CHILD_OUTPUT')
  return fixed('OBSERVED', match[1])
}

export function runSearchDomainSession({ journal, identity, preflight, runNative,
  now = Date.now } = {}) {
  if (!journal || ['read', 'start', 'dispatch', 'finish'].some(name => typeof journal[name] !== 'function')
    || typeof preflight !== 'function' || typeof runNative !== 'function'
    || typeof now !== 'function') fail()
  if (journal.read()) return fixed('HOLD', 'PREFLIGHT')
  let record, dispatched = false
  try {
    if (preflight() !== true) return fixed('HOLD', 'PREFLIGHT')
    record = journal.start(identity)
    if (preflight() !== true) {
      journal.finish(record, 'PREFLIGHT')
      return fixed('HOLD', 'PREFLIGHT')
    }
    record = journal.dispatch(record)
    dispatched = true
    const result = runNative()
    const completedAt = now()
    let classified
    try { classified = classifySearchDomainChild(result) }
    finally { result?.stdout?.fill?.(0); result?.stderr?.fill?.(0) }
    const category = !Number.isFinite(completedAt)
      || completedAt > Date.parse(record.deadlineAt) ? 'DEADLINE' : classified.category
    journal.finish(record, category)
    return fixed(observedSearchDomainCategory(category) ? 'OBSERVED' : 'UNCERTAIN', category)
  } catch {
    if (record) {
      try { journal.finish(record, dispatched ? 'CHILD_EXIT' : 'PREFLIGHT') }
      catch { /* preserve the last durable intent */ }
    }
    return fixed(dispatched ? 'UNCERTAIN' : 'HOLD', dispatched ? 'CHILD_EXIT' : 'PREFLIGHT')
  }
}
