import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration22WorkerCore } from '../scripts/staging-generation-22-worker-core.mjs'

const projectRef = 'qdmvngjwkcsilzmqksme'
async function armed() {
  const scripts = new URL('../scripts/', import.meta.url)
  const source = (await readFile(new URL('staging-generation-22-worker-core.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_22_WORKER_CORE_ENABLED = false',
      'export const STAGING_GENERATION_22_WORKER_CORE_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`))
    .createStagingGeneration22WorkerCore
}
function input({ setupStatus = 'SETTINGS_AND_CONNECTIONS_VERIFIED',
  recoveryStatus = 'RECOVERY_VERIFIED' } = {}) {
  const calls = []
  const setup = { async stage({ signal }) {
    calls.push('setup'); assert.equal(signal.aborted, false)
    return { status: setupStatus, projectRef, generation: 22, operationCount: 22 }
  } }
  const recovery = { async recover({ signal }) {
    calls.push('recovery'); assert.equal(signal.aborted, false)
    return { status: recoveryStatus, projectRef, generation: 22 }
  } }
  return { setup, recovery, calls }
}

test('worker core is disabled and cannot call a host by default', () => {
  const fixture = input()
  assert.throws(() => createStagingGeneration22WorkerCore(fixture), /unavailable/)
  assert.deepEqual(fixture.calls, [])
})

test('only drained setup followed by confirmed retirement emits exact success terminal', async () => {
  const create = await armed(), fixture = input()
  const worker = create(fixture)
  const result = await worker.run({ signal: new AbortController().signal })
  assert.deepEqual(fixture.calls, ['setup', 'recovery'])
  assert.deepEqual(result, {
    schema: 'tll-staging-generation-22-worker-terminal/v1', status: 'DRAINED',
    projectRef, generation: 22, windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543',
    setupStatus: 'SETTINGS_AND_CONNECTIONS_VERIFIED', recoveryStatus: 'RECOVERY_VERIFIED',
  })
  await assert.rejects(worker.run({ signal: new AbortController().signal }), /unavailable/)
})

test('partial writes, unverified readback or connections never dispatch recovery', async () => {
  const create = await armed()
  for (const status of ['HOLD_RECONCILE', 'SETTINGS_STAGED_UNVERIFIED',
    'SETTINGS_STAGED_CONNECTIONS_UNVERIFIED']) {
    const fixture = input({ setupStatus: status })
    const result = await create(fixture).run({ signal: new AbortController().signal })
    assert.deepEqual(result, { status: 'SETUP_RECONCILIATION_REQUIRED' })
    assert.deepEqual(fixture.calls, ['setup'])
  }
})

test('uncertain retirement never emits success or replays retirement', async () => {
  const create = await armed(), fixture = input({ recoveryStatus: 'HOLD_RECONCILE' })
  const result = await create(fixture).run({ signal: new AbortController().signal })
  assert.deepEqual(result, { status: 'RECOVERY_RECONCILIATION_REQUIRED' })
  assert.deepEqual(fixture.calls, ['setup', 'recovery'])
})

test('aborted setup cannot start recovery even with a success-shaped result', async () => {
  const create = await armed(), fixture = input(), parent = new AbortController()
  fixture.setup.stage = async () => { fixture.calls.push('setup'); parent.abort()
    return { status: 'SETTINGS_AND_CONNECTIONS_VERIFIED', projectRef,
      generation: 22, operationCount: 22 } }
  const result = await create(fixture).run({ signal: parent.signal })
  assert.deepEqual(result, { status: 'SETUP_RECONCILIATION_REQUIRED' })
  assert.deepEqual(fixture.calls, ['setup'])
})
