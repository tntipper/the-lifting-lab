import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runStagingGeneration22Worker } from '../scripts/staging-generation-22-worker-entry.mjs'
import { WORKER_TERMINAL_SCHEMA } from '../scripts/staging-generation-22-process-supervisor.mjs'
import { WINDOW_ID } from '../scripts/staging-generation-22-credentials.mjs'
import { GENERATION, PROJECT_REF } from '../scripts/staging-generation-22-material.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const terminal = Object.freeze({ schema: WORKER_TERMINAL_SCHEMA, status: 'DRAINED',
  projectRef: PROJECT_REF, generation: GENERATION, windowId: WINDOW_ID,
  setupStatus: 'SETTINGS_AND_CONNECTIONS_VERIFIED', recoveryStatus: 'RECOVERY_VERIFIED' })

async function armed() {
  const source = (await readFile(new URL('staging-generation-22-worker-entry.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_22_WORKER_ENTRY_ENABLED = false',
      'export const STAGING_GENERATION_22_WORKER_ENTRY_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`))
    .runStagingGeneration22Worker
}

test('worker lifecycle is disabled before supervisor proof or construction', async () => {
  let calls = 0
  await assert.rejects(runStagingGeneration22Worker({ accept() { calls++ },
    createWorker() { calls++ }, write() { calls++ }, signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 0)
})

test('worker publishes its exact terminal only after cleanup and releases supervisor last', async () => {
  const run = await armed(), order = [], output = []
  const result = await run({ signal: new AbortController().signal,
    accept() { order.push('proof'); return () => order.push('release') },
    createWorker() { order.push('construct'); return { core: { run() {
      order.push('run'); return terminal
    } }, dispose() { order.push('dispose') } } },
    write(value) { order.push('write'); output.push(value) },
  })
  assert.equal(result, true)
  assert.deepEqual(order, ['proof', 'construct', 'run', 'dispose', 'write', 'release'])
  assert.deepEqual(output, [`${JSON.stringify(terminal)}\n`])
})

test('worker never publishes success after cleanup, result or output failure', async () => {
  const run = await armed()
  for (const failure of ['result', 'dispose', 'write']) {
    const output = [], order = []
    const result = await run({ signal: new AbortController().signal,
      accept() { return () => order.push('release') },
      createWorker() { return { core: { run() {
        return failure === 'result' ? { ...terminal, status: 'HOLD' } : terminal
      } }, dispose() {
        order.push('dispose')
        if (failure === 'dispose') throw Error('cleanup failed')
      } } },
      write(value) {
        order.push('write')
        if (failure === 'write') throw Error('output failed')
        output.push(value)
      },
    })
    assert.equal(result, false)
    assert.deepEqual(output, [])
    assert.deepEqual(order, failure === 'write'
      ? ['dispose', 'write', 'release'] : ['dispose', 'release'])
  }
})
