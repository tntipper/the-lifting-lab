import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createStagingBoundedExecutor,
  STAGING_BOUND_EXECUTOR_DEADLINE_MS,
  STAGING_BOUNDED_EXECUTOR_ERROR,
} from '../scripts/staging-bounded-executor.mjs'

function timers () {
  const entries = []
  const cleared = []
  return {
    scheduleTimeout (callback, milliseconds) {
      const timer = { callback, milliseconds, fired: false }
      entries.push(timer)
      return timer
    },
    clearScheduledTimeout (timer) { cleared.push(timer) },
    fire () {
      assert.equal(entries.length, 1)
      const timer = entries[0]
      if (!timer.fired) { timer.fired = true; timer.callback() }
    },
    entries, cleared,
  }
}

function deferred () {
  let resolve, reject
  return { promise: new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise }), resolve, reject }
}

test('returns the exact completed receipt when the operation settles before the fixed deadline', async () => {
  const clock = timers()
  const execute = createStagingBoundedExecutor({ scheduleTimeout: clock.scheduleTimeout, clearScheduledTimeout: clock.clearScheduledTimeout, now: () => 10 })
  const result = await execute(async signal => {
    assert.equal(signal.aborted, false)
    return Object.freeze({ receipt: 'safe' })
  })
  assert.deepEqual(result, { status: 'COMPLETED', value: { receipt: 'safe' } })
  assert.equal(Object.isFrozen(result), true)
  assert.equal(clock.entries[0].milliseconds, STAGING_BOUND_EXECUTOR_DEADLINE_MS)
  assert.deepEqual(clock.cleared, [clock.entries[0]])
})

test('rejects invalid operations and timer or clock options before a host operation can start', async () => {
  for (const options of [null, { deadline: 1 }, { scheduleTimeout: () => 1 }, { scheduleTimeout: null, clearScheduledTimeout: () => {}, now: () => 1 }]) {
    assert.throws(() => createStagingBoundedExecutor(options), new RegExp(STAGING_BOUNDED_EXECUTOR_ERROR))
  }
  const execute = createStagingBoundedExecutor({ scheduleTimeout: () => 'timer', clearScheduledTimeout: () => {}, now: () => 1 })
  await assert.rejects(() => execute(), new RegExp(STAGING_BOUNDED_EXECUTOR_ERROR))
  await assert.rejects(() => execute('not-an-operation'), new RegExp(STAGING_BOUNDED_EXECUTOR_ERROR))
  const badClock = createStagingBoundedExecutor({ scheduleTimeout: () => 'timer', clearScheduledTimeout: () => {}, now: () => Number.NaN })
  await assert.rejects(() => badClock(async () => { throw Error('must not start') }), new RegExp(STAGING_BOUNDED_EXECUTOR_ERROR))
})

test('aborts exactly once and waits for an aborted operation to settle before rejecting', async () => {
  const clock = timers(), wait = deferred()
  const execute = createStagingBoundedExecutor({ scheduleTimeout: clock.scheduleTimeout, clearScheduledTimeout: clock.clearScheduledTimeout, now: () => 1 })
  let aborts = 0, started = false
  const pending = execute(signal => new Promise(resolve => {
    started = true
    signal.addEventListener('abort', () => { aborts += 1; wait.promise.then(resolve) }, { once: true })
  }))
  await Promise.resolve()
  assert.equal(started, true)
  clock.fire(); clock.fire()
  assert.equal(aborts, 1)
  let settled = false
  pending.finally(() => { settled = true }).catch(() => {})
  await Promise.resolve()
  assert.equal(settled, false)
  wait.resolve('late')
  await assert.rejects(() => pending, new RegExp(STAGING_BOUNDED_EXECUTOR_ERROR))
  assert.deepEqual(clock.cleared, [clock.entries[0]])
})

test('a late resolution never becomes a completed receipt and a rejection is redacted', async () => {
  const clock = timers(), late = deferred()
  const execute = createStagingBoundedExecutor({ scheduleTimeout: clock.scheduleTimeout, clearScheduledTimeout: clock.clearScheduledTimeout, now: () => 1 })
  const pending = execute(() => late.promise)
  await Promise.resolve()
  clock.fire()
  late.resolve({ private: 'must-not-escape' })
  await assert.rejects(() => pending, error => error.message === STAGING_BOUNDED_EXECUTOR_ERROR)

  const rejectionClock = timers()
  const rejectExecute = createStagingBoundedExecutor({ scheduleTimeout: rejectionClock.scheduleTimeout, clearScheduledTimeout: rejectionClock.clearScheduledTimeout, now: () => 1 })
  await assert.rejects(() => rejectExecute(async () => { throw Error('raw host diagnostic: credential') }), error =>
    error.message === STAGING_BOUNDED_EXECUTOR_ERROR && !/credential|diagnostic/i.test(error.message))
})

test('a delayed timer cannot permit success once the monotonic deadline has elapsed', async () => {
  const clock = timers()
  let observedAt = 0, aborts = 0
  const execute = createStagingBoundedExecutor({
    scheduleTimeout: clock.scheduleTimeout, clearScheduledTimeout: clock.clearScheduledTimeout,
    now: () => observedAt,
  })
  await assert.rejects(() => execute(signal => {
    signal.addEventListener('abort', () => { aborts += 1 }, { once: true })
    observedAt = STAGING_BOUND_EXECUTOR_DEADLINE_MS + 1
    return { private: 'late value' }
  }), new RegExp(STAGING_BOUNDED_EXECUTOR_ERROR))
  assert.equal(aborts, 1)
  assert.equal(clock.entries[0].fired, false)
  assert.deepEqual(clock.cleared, [clock.entries[0]])
})

test('clock failure, nonfinite values and backward movement fail closed before host work starts', async () => {
  for (const now of [
    () => Number.POSITIVE_INFINITY,
    (() => { let calls = 0; return () => { calls += 1; if (calls === 1) return 10; throw Error('private clock error') } })(),
    (() => { let calls = 0; return () => (calls++ === 0 ? 10 : 9) })(),
  ]) {
    const clock = timers(), execute = createStagingBoundedExecutor({
      scheduleTimeout: clock.scheduleTimeout, clearScheduledTimeout: clock.clearScheduledTimeout, now,
    })
    let started = 0
    await assert.rejects(() => execute(async () => { started += 1 }), new RegExp(STAGING_BOUNDED_EXECUTOR_ERROR))
    assert.equal(started, 0)
    if (clock.entries.length === 1) assert.deepEqual(clock.cleared, [clock.entries[0]])
  }
})

test('a synchronously-fired timer prevents the operation from starting, and source has no ambient host capability', async () => {
  let clears = 0, started = 0
  const execute = createStagingBoundedExecutor({
    scheduleTimeout: callback => { callback(); return 'timer' },
    clearScheduledTimeout: () => { clears += 1 }, now: () => 1,
  })
  await assert.rejects(() => execute(async () => { started += 1 }), new RegExp(STAGING_BOUNDED_EXECUTOR_ERROR))
  assert.equal(started, 0)
  assert.equal(clears, 1)

  const source = readFileSync('scripts/staging-bounded-executor.mjs', 'utf8')
  assert.doesNotMatch(source, /child_process|spawn\(|exec\(|process\.|https?\.|fetch\(|keychain|credential/i)
  assert.doesNotMatch(source, /Date\.now/)
  assert.match(source, /performance\.now\.bind\(globalThis\.performance\)/)
  assert.match(source, /STAGING_BOUND_EXECUTOR_DEADLINE_MS = 30_000/)
})
