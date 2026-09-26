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
    readCredentials() { calls++ }, createWorker() { calls++ }, write() { calls++ },
    signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 0)
})

test('worker reads tokens only after proof and erases them before publishing its terminal', async () => {
  const run = await armed(), order = [], output = []
  const managementToken = Buffer.from('synthetic-supabase-token')
  const vercelToken = Buffer.from('synthetic-vercel-token')
  const result = await run({ signal: new AbortController().signal,
    accept() { order.push('proof'); return () => order.push('release') },
    readCredentials() { order.push('credentials'); return { managementToken, vercelToken } },
    createWorker(credentials) {
      order.push('construct')
      assert.equal(credentials.managementToken, managementToken)
      assert.equal(credentials.vercelToken, vercelToken)
      return { core: { run() {
      order.push('run'); return terminal
    } }, dispose() { order.push('dispose') } } },
    write(value) {
      assert.equal(managementToken.every(byte => byte === 0), true)
      assert.equal(vercelToken.every(byte => byte === 0), true)
      order.push('write'); output.push(value)
    },
  })
  assert.equal(result, true)
  assert.deepEqual(order, ['proof', 'credentials', 'construct', 'run', 'dispose', 'write', 'release'])
  assert.deepEqual(output, [`${JSON.stringify(terminal)}\n`])
})

test('worker never publishes success after cleanup, result or output failure', async () => {
  const run = await armed()
  for (const failure of ['result', 'dispose', 'write']) {
    const output = [], order = []
    const managementToken = Buffer.from('synthetic-supabase-token')
    const vercelToken = Buffer.from('synthetic-vercel-token')
    const result = await run({ signal: new AbortController().signal,
      accept() { return () => order.push('release') },
      readCredentials() { return { managementToken, vercelToken } },
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
    assert.equal(managementToken.every(byte => byte === 0), true)
    assert.equal(vercelToken.every(byte => byte === 0), true)
    assert.deepEqual(output, [])
    assert.deepEqual(order, failure === 'write'
      ? ['dispose', 'write', 'release'] : ['dispose', 'release'])
  }
})

test('invalid or failed credential read stops before worker construction and erases returned buffers', async () => {
  const run = await armed()
  for (const readCredentials of [
    () => { throw Error('synthetic Keychain failure') },
    () => ({ managementToken: Buffer.from('synthetic-supabase-token'),
      vercelToken: Buffer.from('synthetic-vercel-token'), extra: Buffer.from('extra-secret') }),
  ]) {
    let constructed = false, written = false, released = false
    let returned
    const result = await run({ signal: new AbortController().signal,
      accept() { return () => { released = true } },
      readCredentials() { returned = readCredentials(); return returned },
      createWorker() { constructed = true }, write() { written = true },
    })
    assert.equal(result, false)
    assert.equal(constructed, false)
    assert.equal(written, false)
    assert.equal(released, true)
    if (returned) for (const value of Object.values(returned)) {
      assert.equal(value.every(byte => byte === 0), true)
    }
  }
})

test('supervisor failure prevents credential access; assembly failure erases both tokens', async () => {
  const run = await armed()
  let reads = 0
  assert.equal(await run({ signal: new AbortController().signal,
    accept() { throw Error('supervisor lost') },
    readCredentials() { reads++ }, createWorker() {}, write() {},
  }), false)
  assert.equal(reads, 0)
  const managementToken = Buffer.from('synthetic-supabase-token')
  const vercelToken = Buffer.from('synthetic-vercel-token')
  let released = false, written = false
  assert.equal(await run({ signal: new AbortController().signal,
    accept() { return () => { released = true } },
    readCredentials() { return { managementToken, vercelToken } },
    createWorker() { throw Error('synthetic assembly failure') },
    write() { written = true },
  }), false)
  assert.equal(managementToken.every(byte => byte === 0), true)
  assert.equal(vercelToken.every(byte => byte === 0), true)
  assert.equal(released, true)
  assert.equal(written, false)
})
