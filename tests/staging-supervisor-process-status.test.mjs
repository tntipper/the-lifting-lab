import test from 'node:test'
import assert from 'node:assert/strict'
import { processRunning } from './fixtures/process-status.mjs'
const error = code => Object.assign(Error('synthetic probe'), { code })
test('inspection denial cannot turn a live worker into proof of successful cleanup', () => {
  assert.throws(() => processRunning(1234, { probe() {}, inspect() { throw error('EPERM') } }), { code: 'EPERM' })
  assert.throws(() => processRunning(1234, { probe() { throw error('EPERM') }, inspect() {} }), { code: 'EPERM' })
})
test('confirmed absence and zombies are stopped; alive states remain alive', () => {
  assert.equal(processRunning(1234, { probe() { throw error('ESRCH') }, inspect() { throw Error('must not run') } }), false)
  assert.equal(processRunning(1234, { probe() {}, inspect: () => 'Z' }), false)
  assert.equal(processRunning(1234, { probe() {}, inspect: () => 'S' }), true)
  let calls = 0
  assert.equal(processRunning(1234, { probe() { if (++calls > 1) throw error('ESRCH') }, inspect() { throw error('CHILD_EXIT') } }), false)
})
