import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { collectStagingBrokerRotationCredentials, readStagingBrokerRotationCredential,
  readStagingBrokerRotationCredentials, STAGING_BROKER_REST_CREDENTIAL_READER_ENABLED,
  STAGING_BROKER_REST_KEYCHAIN_HELPER, STAGING_BROKER_REST_PYTHON } from '../scripts/staging-provider-broker-rest-credential-reader.mjs'

function childWith({ output = 'fixture-token', code = 0, stall = false } = {}) {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.kills = 0
  child.kill = () => { child.kills++; child.emit('close', null); return true }
  if (!stall) queueMicrotask(() => { child.stdout.write(Buffer.from(output)); child.stdout.end(); child.emit('close', code) })
  return child
}

test('fixed helper, interpreter, selectors and minimal child environment return three owned buffers', async () => {
  assert.equal(STAGING_BROKER_REST_CREDENTIAL_READER_ENABLED, false)
  const signal = new AbortController().signal, seen = []
  const credentials = await readStagingBrokerRotationCredentials({ signal, stopWorkerGroup() { throw Error('must not stop') },
    spawnProcess(executable, args, options) {
      assert.equal(executable, STAGING_BROKER_REST_PYTHON)
      assert.deepEqual(args.slice(0, 3), ['-I', '-S', STAGING_BROKER_REST_KEYCHAIN_HELPER])
      assert.deepEqual(options.env, { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' })
      assert.deepEqual(options.stdio, ['ignore', 'pipe', 'ignore'])
      seen.push(args[3]); return childWith({ output: `fixture-${args[3]}` })
    } })
  assert.deepEqual(seen, ['supabase', 'vercel', 'vercel-bypass'])
  assert.deepEqual(Object.keys(credentials), ['managementToken', 'vercelToken', 'protectionBypassToken'])
  assert.ok(Object.values(credentials).every(Buffer.isBuffer))
  for (const value of Object.values(credentials)) value.fill(0)
})

test('failed second selector wipes the first completed credential', async () => {
  const first = Buffer.from('fixture-first-token')
  let calls = 0
  await assert.rejects(collectStagingBrokerRotationCredentials({ readCredential: async () => {
    calls++
    if (calls === 1) return first
    throw Error('second read failed')
  } }))
  assert.equal(calls, 2)
  assert.ok(first.every(byte => byte === 0))
})

test('timeout stops worker group and kills the helper without returning a credential', async () => {
  const child = childWith({ stall: true })
  let stopped = 0
  await assert.rejects(readStagingBrokerRotationCredential({ selector: 'supabase',
    signal: new AbortController().signal, stopWorkerGroup() { stopped++ }, spawnProcess: () => child,
    scheduleTimeout: setImmediate, clearScheduledTimeout: clearImmediate }))
  assert.equal(stopped, 1)
  assert.equal(child.kills, 1)
})

test('unknown selector and already-aborted signal refuse before process creation', async () => {
  let spawned = 0
  const spawnProcess = () => { spawned++; return childWith() }
  assert.throws(() => readStagingBrokerRotationCredential({ selector: 'other',
    signal: new AbortController().signal, stopWorkerGroup() {}, spawnProcess }))
  const controller = new AbortController(); controller.abort()
  assert.throws(() => readStagingBrokerRotationCredential({ selector: 'supabase',
    signal: controller.signal, stopWorkerGroup() {}, spawnProcess }))
  assert.equal(spawned, 0)
})

test('abort after a helper starts stops the group and drops partial output', async () => {
  const controller = new AbortController(), child = childWith({ stall: true })
  let stopped = 0
  const pending = readStagingBrokerRotationCredential({ selector: 'supabase', signal: controller.signal,
    stopWorkerGroup() { stopped++ }, spawnProcess: () => child })
  const partial = Buffer.from('partial-secret')
  child.stdout.write(partial)
  controller.abort()
  await assert.rejects(pending)
  assert.equal(stopped, 1)
  assert.equal(child.kills, 1)
  assert.ok(partial.every(byte => byte === 0))
})

test('a malformed spawned child is killed before refusing the read', async () => {
  const child = { kills: 0, kill() { this.kills++ } }
  await assert.rejects(readStagingBrokerRotationCredential({ selector: 'supabase',
    signal: new AbortController().signal, stopWorkerGroup() {}, spawnProcess: () => child }))
  assert.equal(child.kills, 1)
})
