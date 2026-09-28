import test from 'node:test'
import assert from 'node:assert/strict'
import { POOLER_CONVERGENCE_MS } from '../scripts/staging-generation-6-connection-verifier.mjs'
import {
  classifyZeroSessionsFailure,
  extractAllowListedSqlExceptionMessage,
  postManagementQuery,
  verifyGeneration20ZeroSessions,
  verifyGeneration20ZeroSessionsAfterPoolerDrain,
  ZERO_SESSIONS_DRAIN_CONVERGENCE_MS,
  ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS,
  ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS_CAP,
  ZERO_SESSIONS_DRAIN_CONVERGENCE_MS_CAP,
} from '../scripts/staging-generation-20-database-transport.mjs'
import { PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-20-credentials.mjs'

const token = 'sbp_' + 'a'.repeat(40)
const receipt = Object.freeze({
  status: 'ZERO_SESSIONS',
  projectRef: PROJECT_REF,
  windowId: WINDOW_ID,
  controlsEnabled: false,
})

test('classifyZeroSessionsFailure maps secret-free message classes', () => {
  assert.equal(classifyZeroSessionsFailure(Error('Generation 20 runtime sessions remain')), 'runtime_sessions_remain')
  assert.equal(classifyZeroSessionsFailure(Error('Generation 20 control enabled during zero-session proof')), 'control_enabled')
  assert.equal(classifyZeroSessionsFailure(Error('Generation-20 zero-session receipt mismatch')), 'receipt_mismatch')
  assert.equal(classifyZeroSessionsFailure(Error('Generation-20 database transport unavailable')), 'unavailable')
})

test('classifyZeroSessionsFailure walks cause chain for allow-listed SQL phrases', () => {
  const wrapped = Error('Generation-20 database transport unavailable')
  wrapped.cause = Error('ERROR: Generation 20 runtime sessions remain')
  assert.equal(classifyZeroSessionsFailure(wrapped), 'runtime_sessions_remain')
})

test('extractAllowListedSqlExceptionMessage promotes only allow-listed Management API phrases', () => {
  assert.equal(
    extractAllowListedSqlExceptionMessage(JSON.stringify({ message: 'ERROR: Generation 20 runtime sessions remain\nDETAIL: x' })),
    'Generation 20 runtime sessions remain',
  )
  assert.equal(
    extractAllowListedSqlExceptionMessage(JSON.stringify({ error: 'Generation 20 control enabled during zero-session proof' })),
    'Generation 20 control enabled during zero-session proof',
  )
  assert.equal(extractAllowListedSqlExceptionMessage(JSON.stringify({ message: 'permission denied for table secrets' })), undefined)
  assert.equal(extractAllowListedSqlExceptionMessage('not-json but runtime sessions remain here'), 'Generation 20 runtime sessions remain')
  assert.equal(
    extractAllowListedSqlExceptionMessage(JSON.stringify({ message: 'ERROR: Generation 20 entry predecessor marker mismatch: tll_customer_runtime' })),
    'Generation 20 entry predecessor marker mismatch',
  )
  assert.equal(
    extractAllowListedSqlExceptionMessage(JSON.stringify({ message: 'ERROR: Generation 20 entry predecessor mismatch' })),
    'Generation 20 entry predecessor mismatch',
  )
})

test('postManagementQuery preserves allow-listed SQL RAISE text from non-201 JSON bodies', async () => {
  const request = (_options, onResponse) => {
    const listeners = new Map()
    const response = {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      on(event, handler) {
        listeners.set(event, handler)
        return response
      },
      destroy() {},
    }
    queueMicrotask(() => {
      onResponse(response)
      listeners.get('data')?.(Buffer.from(JSON.stringify({ message: 'ERROR: Generation 20 runtime sessions remain' })))
      listeners.get('end')?.()
    })
    return {
      on() { return this },
      end() {},
      destroy() {},
    }
  }
  await assert.rejects(
    () => postManagementQuery(token, 'SELECT 1', { request }),
    error => {
      assert.match(error.message, /runtime sessions remain/i)
      assert.equal(error.managementStatusCode, 400)
      assert.equal(classifyZeroSessionsFailure(error), 'runtime_sessions_remain')
      return true
    },
  )
})

test('drain defaults are Gen-18-ready longer wait and more attempts (bounded)', () => {
  assert.equal(POOLER_CONVERGENCE_MS, 16_000)
  assert.equal(ZERO_SESSIONS_DRAIN_CONVERGENCE_MS, 30_000)
  assert.equal(ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS, 5)
  assert.equal(ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS_CAP, 8)
  assert.equal(ZERO_SESSIONS_DRAIN_CONVERGENCE_MS_CAP, 90_000)
  assert.ok(ZERO_SESSIONS_DRAIN_CONVERGENCE_MS > POOLER_CONVERGENCE_MS)
  assert.ok(ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS > 3)
  assert.ok(ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS <= ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS_CAP)
  assert.ok(ZERO_SESSIONS_DRAIN_CONVERGENCE_MS <= ZERO_SESSIONS_DRAIN_CONVERGENCE_MS_CAP)
})

test('happy path still requires ZERO_SESSIONS receipt after initial pooler drain', async () => {
  const pauses = []
  let posts = 0
  const value = await verifyGeneration20ZeroSessionsAfterPoolerDrain({
    token,
    convergenceMs: 7,
    pause: async ms => { pauses.push(ms) },
    post: async () => {
      posts += 1
      return [{ tll_generation_20_zero_sessions: receipt }]
    },
  })
  assert.deepEqual(value, receipt)
  assert.deepEqual(pauses, [7])
  assert.equal(posts, 1)
})

test('transient runtime_sessions_remain retries with bounded pooler drain then passes', async () => {
  const pauses = []
  let posts = 0
  const value = await verifyGeneration20ZeroSessionsAfterPoolerDrain({
    token,
    maxAttempts: 3,
    convergenceMs: 11,
    pause: async ms => { pauses.push(ms) },
    post: async () => {
      posts += 1
      if (posts < 3) throw new Error('Generation 20 runtime sessions remain')
      return [{ tll_generation_20_zero_sessions: receipt }]
    },
  })
  assert.deepEqual(value, receipt)
  assert.deepEqual(pauses, [11, 11, 11])
  assert.equal(posts, 3)
})

test('exhausted runtime_sessions_remain still surfaces failureStep zero_sessions and zeroSessionsAttempts', async () => {
  const pauses = []
  await assert.rejects(
    () => verifyGeneration20ZeroSessionsAfterPoolerDrain({
      token,
      maxAttempts: 2,
      convergenceMs: 5,
      pause: async ms => { pauses.push(ms) },
      post: async () => { throw new Error('Generation 20 runtime sessions remain') },
    }),
    error => {
      assert.equal(error.failureStep, 'zero_sessions')
      assert.equal(error.failureReason, 'runtime_sessions_remain')
      assert.equal(error.zeroSessionsAttempts, 2)
      assert.match(error.message, /zero-session verification unavailable/)
      return true
    },
  )
  assert.deepEqual(pauses, [5, 5])
})

test('permanent control_enabled fails immediately with failureStep zero_sessions and attempt count', async () => {
  const pauses = []
  let posts = 0
  await assert.rejects(
    () => verifyGeneration20ZeroSessionsAfterPoolerDrain({
      token,
      maxAttempts: 3,
      convergenceMs: 9,
      pause: async ms => { pauses.push(ms) },
      post: async () => {
        posts += 1
        throw new Error('Generation 20 control enabled during zero-session proof')
      },
    }),
    error => {
      assert.equal(error.failureStep, 'zero_sessions')
      assert.equal(error.failureReason, 'control_enabled')
      assert.equal(error.zeroSessionsAttempts, 1)
      return true
    },
  )
  assert.equal(posts, 1)
  assert.deepEqual(pauses, [9])
})

test('direct zero-session proof still demands exact ZERO_SESSIONS receipt', async () => {
  await assert.rejects(
    () => verifyGeneration20ZeroSessions({
      token,
      post: async () => [{ tll_generation_20_zero_sessions: { ...receipt, status: 'NOT_ZERO' } }],
    }),
    /receipt mismatch/,
  )
})
