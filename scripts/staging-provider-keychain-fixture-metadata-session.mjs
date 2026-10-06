/** Injected one-shot coordinator; no Keychain, child process or filesystem action here. */
const nativeCategories = new Set([
  'DEFAULT_UNREADABLE', 'SEARCH_UNREADABLE', 'DEFAULT_PATH_MISMATCH',
  'SEARCH_PATH_MISMATCH', 'DIRECTORY_MISMATCH', 'MAIN_MISMATCH',
  'SIDECAR_MISMATCH', 'ENTRIES_MISMATCH', 'METADATA_MATCHED',
])
const fixed = (status, category) => Object.freeze({ status, category })
const fail = () => { throw Error('Fixture metadata session unavailable') }

export function classifyMetadataChild({ status, signal, error, stdout, stderr } = {}) {
  if (error) return fixed('UNCERTAIN', error.code === 'ETIMEDOUT' ? 'CHILD_TIMEOUT' : 'CHILD_SPAWN')
  if (signal) return fixed('UNCERTAIN', 'CHILD_SIGNAL')
  if (status !== 0) return fixed('UNCERTAIN', 'CHILD_EXIT')
  if (!Buffer.isBuffer(stdout) || !Buffer.isBuffer(stderr)
    || stderr.length !== 0 || stdout.length > 64) return fixed('UNCERTAIN', 'CHILD_OUTPUT')
  const match = /^([A-Z_]+)\n$/.exec(stdout.toString('utf8'))
  if (!match || !nativeCategories.has(match[1])) return fixed('UNCERTAIN', 'CHILD_OUTPUT')
  return fixed('OBSERVED', match[1])
}

export function runMetadataSession({ journal, identity, preflight, runNative,
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
    try { classified = classifyMetadataChild(result) }
    finally { result?.stdout?.fill?.(0); result?.stderr?.fill?.(0) }
    const category = !Number.isFinite(completedAt)
      || completedAt > Date.parse(record.deadlineAt) ? 'DEADLINE' : classified.category
    journal.finish(record, category)
    return fixed(category === 'METADATA_MATCHED' ? 'OBSERVED'
      : nativeCategories.has(category) ? 'OBSERVED' : 'UNCERTAIN', category)
  } catch {
    if (record) {
      try { journal.finish(record, dispatched ? 'CHILD_EXIT' : 'PREFLIGHT') }
      catch { /* preserve the last durable intent */ }
    }
    return fixed(dispatched ? 'UNCERTAIN' : 'HOLD', dispatched ? 'CHILD_EXIT' : 'PREFLIGHT')
  }
}
