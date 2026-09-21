import test from 'node:test'
import assert from 'node:assert/strict'
import { POOLER_CONVERGENCE_MS } from '../scripts/staging-generation-6-connection-verifier.mjs'
import {
  classifyZeroSessionsFailure,
  verifyGeneration16ZeroSessions,
  verifyGeneration16ZeroSessionsAfterPoolerDrain,
} from '../scripts/staging-generation-16-database-transport.mjs'
import { PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-16-credentials.mjs'

const token = 'sbp_' + 'a'.repeat(40)
const receipt = Object.freeze({
  status: 'ZERO_SESSIONS',
  projectRef: PROJECT_REF,
  windowId: WINDOW_ID,
  controlsEnabled: false,
})

test('classifyZeroSessionsFailure maps secret-free message classes', () => {
  assert.equal(classifyZeroSessionsFailure(Error('Generation 16 runtime sessions remain')), 'runtime_sessions_remain')
  assert.equal(classifyZeroSessionsFailure(Error('Generation 16 control enabled during zero-session proof')), 'control_enabled')
  assert.equal(classifyZeroSessionsFailure(Error('Generation-16 zero-session receipt mismatch')), 'receipt_mismatch')
  assert.equal(classifyZeroSessionsFailure(Error('Generation-16 database transport unavailable')), 'unavailable')
})

test('happy path still requires ZERO_SESSIONS receipt after initial pooler drain', async () => {
  const pauses = []
  let posts = 0
  const value = await verifyGeneration16ZeroSessionsAfterPoolerDrain({
    token,
    convergenceMs: 7,
    pause: async ms => { pauses.push(ms) },
    post: async () => {
      posts += 1
      return [{ tll_generation_16_zero_sessions: receipt }]
    },
  })
  assert.deepEqual(value, receipt)
  assert.deepEqual(pauses, [7])
  assert.equal(posts, 1)
  assert.equal(POOLER_CONVERGENCE_MS, 16_000)
})

test('transient runtime_sessions_remain retries with bounded pooler drain then passes', async () => {
  const pauses = []
  let posts = 0
  const value = await verifyGeneration16ZeroSessionsAfterPoolerDrain({
    token,
    maxAttempts: 3,
    convergenceMs: 11,
    pause: async ms => { pauses.push(ms) },
    post: async () => {
      posts += 1
      if (posts < 3) throw new Error('Generation 16 runtime sessions remain')
      return [{ tll_generation_16_zero_sessions: receipt }]
    },
  })
  assert.deepEqual(value, receipt)
  assert.deepEqual(pauses, [11, 11, 11])
  assert.equal(posts, 3)
})

test('exhausted runtime_sessions_remain still surfaces failureStep zero_sessions', async () => {
  const pauses = []
  await assert.rejects(
    () => verifyGeneration16ZeroSessionsAfterPoolerDrain({
      token,
      maxAttempts: 2,
      convergenceMs: 5,
      pause: async ms => { pauses.push(ms) },
      post: async () => { throw new Error('Generation 16 runtime sessions remain') },
    }),
    error => {
      assert.equal(error.failureStep, 'zero_sessions')
      assert.equal(error.failureReason, 'runtime_sessions_remain')
      assert.match(error.message, /zero-session verification unavailable/)
      return true
    },
  )
  assert.deepEqual(pauses, [5, 5])
})

test('permanent control_enabled fails immediately with failureStep zero_sessions', async () => {
  const pauses = []
  let posts = 0
  await assert.rejects(
    () => verifyGeneration16ZeroSessionsAfterPoolerDrain({
      token,
      maxAttempts: 3,
      convergenceMs: 9,
      pause: async ms => { pauses.push(ms) },
      post: async () => {
        posts += 1
        throw new Error('Generation 16 control enabled during zero-session proof')
      },
    }),
    error => {
      assert.equal(error.failureStep, 'zero_sessions')
      assert.equal(error.failureReason, 'control_enabled')
      return true
    },
  )
  assert.equal(posts, 1)
  assert.deepEqual(pauses, [9])
})

test('direct zero-session proof still demands exact ZERO_SESSIONS receipt', async () => {
  await assert.rejects(
    () => verifyGeneration16ZeroSessions({
      token,
      post: async () => [{ tll_generation_16_zero_sessions: { ...receipt, status: 'NOT_ZERO' } }],
    }),
    /receipt mismatch/,
  )
})
