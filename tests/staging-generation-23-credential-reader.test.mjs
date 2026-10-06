import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { readStagingGeneration23Credential,
  STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED } from '../scripts/staging-generation-23-credential-reader.mjs'

const token = `sbp_${'a'.repeat(40)}`
async function armed() {
  const source = await readFile(new URL('../scripts/staging-generation-23-credential-reader.mjs', import.meta.url), 'utf8')
  assert.match(source, /STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED = false/)
  return import(`data:text/javascript;base64,${Buffer.from(source.replace(
    'STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED = false',
    'STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED = true')).toString('base64')}`)
}
function fakeSpawn(value, { exit = 0 } = {}) {
  const calls = []
  const spawnProcess = (program, args, options) => {
    calls.push({ program, args, options })
    const child = new EventEmitter(), stdout = new EventEmitter()
    stdout.destroy = () => {}
    child.stdout = stdout
    child.kill = () => { child.killed = true }
    queueMicrotask(() => {
      stdout.emit('data', Buffer.from(value))
      child.emit('close', exit)
    })
    return child
  }
  return { calls, spawnProcess }
}

test('ordinary Gen23 reader is OFF before any Keychain process', async () => {
  assert.equal(STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED, false)
  let called = false
  assert.throws(() => readStagingGeneration23Credential({ selector: 'supabase',
    signal: new AbortController().signal, stopWorkerGroup() {}, spawnProcess() { called = true } }), /unavailable/)
  assert.equal(called, false)
})

test('armed reader invokes only fixed macOS selectors and strips one line ending', async () => {
  const { readStagingGeneration23Credential: read } = await armed()
  const f = fakeSpawn(`${token}\n`)
  const value = await read({ selector: 'supabase', signal: new AbortController().signal,
    stopWorkerGroup() { throw Error('must not stop') }, spawnProcess: f.spawnProcess })
  assert.equal(value.toString(), token)
  assert.deepEqual(f.calls, [{ program: '/usr/bin/security',
    args: ['find-generic-password', '-w', '-s', 'Supabase CLI', '-a', 'supabase'],
    options: { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'ignore'] } }])
  value.fill(0)
})

test('three reads return distinct owned buffers and erase earlier reads on later failure', async () => {
  const { collectStagingGeneration23Credentials: collect } = await armed()
  const seen = []
  const result = await collect({ readCredential: async selector => {
    const value = Buffer.from(selector === 'supabase' ? token : selector === 'vercel' ? 'vercel-token' : 'preview-bypass')
    seen.push(value); return value
  } })
  assert.deepEqual(Object.keys(result), ['managementToken', 'vercelToken', 'previewBypass'])
  for (const value of Object.values(result)) value.fill(0)
  assert.equal(seen.every(value => value.every(byte => byte === 0)), true)
  const partial = []
  await assert.rejects(collect({ readCredential: async selector => {
    if (selector === 'bypass') throw Error('missing')
    const value = Buffer.from(selector === 'supabase' ? token : 'vercel-token')
    partial.push(value); return value
  } }), /unavailable/)
  assert.equal(partial.every(value => value.every(byte => byte === 0)), true)
})

test('oversized output or timeout stops the worker group without returning credentials', async () => {
  const { readStagingGeneration23Credential: read } = await armed()
  let stops = 0
  const large = fakeSpawn('x'.repeat(4097))
  await assert.rejects(read({ selector: 'vercel', signal: new AbortController().signal,
    stopWorkerGroup() { stops++ }, spawnProcess: large.spawnProcess }), /unavailable/)
  assert.equal(stops, 1)
  const timed = new EventEmitter(), stdout = new EventEmitter()
  stdout.destroy = () => {}; timed.stdout = stdout; timed.kill = () => { timed.killed = true }
  await assert.rejects(read({ selector: 'bypass', signal: new AbortController().signal,
    stopWorkerGroup() { stops++ }, spawnProcess: () => timed,
    scheduleTimeout(callback, ms) { assert.equal(ms, 15_000); queueMicrotask(callback); return 1 },
    clearScheduledTimeout() {} }), /unavailable/)
  assert.equal(stops, 2); assert.equal(timed.killed, true)
})

test('an inexact selector or credential cannot be reused as another selector', async () => {
  const { readStagingGeneration23Credential: read,
    collectStagingGeneration23Credentials: collect } = await armed()
  assert.throws(() => read({ selector: 'production', signal: new AbortController().signal,
    stopWorkerGroup() {}, spawnProcess() { throw Error('must not run') } }), /unavailable/)
  const same = Buffer.from('same-token')
  await assert.rejects(collect({ readCredential: async selector => selector === 'supabase'
    ? Buffer.from(token) : same }), /unavailable/)
  assert.equal(same.every(byte => byte === 0), true)
})
