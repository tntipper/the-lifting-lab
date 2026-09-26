/**
 * The single cancellation boundary for disabled staging bindings.
 *
 * It has no host capability: callers provide a single operation and receive a
 * success receipt only when that operation settles before the fixed deadline.
 * Once aborted, this executor deliberately waits for the operation to settle.
 * An operation that ignores cancellation therefore remains pending rather than
 * allowing a compensating mutation to race an unknown in-flight mutation.
 */
export const STAGING_BOUND_EXECUTOR_DEADLINE_MS = 30_000
export const STAGING_BOUNDED_EXECUTOR_ERROR = 'Staging bounded executor unavailable'

const unavailable = () => new Error(STAGING_BOUNDED_EXECUTOR_ERROR)
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key))
const defaultMonotonicNow = globalThis.performance.now.bind(globalThis.performance)

function validSignal (signal) {
  return signal && typeof signal === 'object' && typeof signal.aborted === 'boolean'
    && typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function'
}

/**
 * Create the narrow `execute(operation)` port consumed by native adapters.
 * Timer and clock injection exist solely for deterministic tests. The timeout
 * itself is a module constant and cannot be selected by an adapter caller.
 */
export function createStagingBoundedExecutor (options = {}) {
  if (!exactKeys(options, ['scheduleTimeout', 'clearScheduledTimeout', 'now'])
    && !exactKeys(options, [])) throw unavailable()

  if ((Object.hasOwn(options, 'scheduleTimeout') && typeof options.scheduleTimeout !== 'function')
    || (Object.hasOwn(options, 'clearScheduledTimeout') && typeof options.clearScheduledTimeout !== 'function')
    || (Object.hasOwn(options, 'now') && typeof options.now !== 'function')) throw unavailable()
  const scheduleTimeout = options.scheduleTimeout ?? setTimeout
  const clearScheduledTimeout = options.clearScheduledTimeout ?? clearTimeout
  const now = options.now ?? defaultMonotonicNow
  if (typeof scheduleTimeout !== 'function' || typeof clearScheduledTimeout !== 'function' || typeof now !== 'function') throw unavailable()

  return Object.freeze(async function execute (operation) {
    if (typeof operation !== 'function') throw unavailable()
    let startedAt
    try { startedAt = now() } catch { throw unavailable() }
    if (!Number.isFinite(startedAt)) throw unavailable()

    const controller = new AbortController()
    if (!validSignal(controller.signal)) throw unavailable()
    let aborted = false
    let timer
    let lastObservedAt = startedAt
    const abortOnce = () => {
      if (aborted) return
      aborted = true
      controller.abort()
    }
    const deadlineReached = () => {
      let observedAt
      try { observedAt = now() } catch { return true }
      if (!Number.isFinite(observedAt) || observedAt < lastObservedAt) return true
      lastObservedAt = observedAt
      return observedAt - startedAt >= STAGING_BOUND_EXECUTOR_DEADLINE_MS
    }
    try {
      timer = scheduleTimeout(() => {
        abortOnce()
      }, STAGING_BOUND_EXECUTOR_DEADLINE_MS)
    } catch {
      throw unavailable()
    }

    try {
      // Deferring invocation prevents a synchronously-fired test timer from
      // starting a mutation after its cancellation boundary has already closed.
      const value = await Promise.resolve().then(() => {
        if (controller.signal.aborted || deadlineReached()) {
          abortOnce()
          throw unavailable()
        }
        return operation(controller.signal)
      })
      if (aborted || deadlineReached()) {
        abortOnce()
        throw unavailable()
      }
      return Object.freeze({ status: 'COMPLETED', value })
    } catch {
      throw unavailable()
    } finally {
      try { clearScheduledTimeout(timer) } catch {}
    }
  })
}
