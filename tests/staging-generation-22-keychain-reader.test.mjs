import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PassThrough } from 'node:stream'
import { readStagingGeneration22Credential,
  STAGING_GENERATION_22_KEYCHAIN_READER_ENABLED,
  GENERATION_22_KEYCHAIN_HELPER, GENERATION_22_PYTHON } from '../scripts/staging-generation-22-keychain-reader.mjs'
import { WORKER_TERMINAL_SCHEMA } from '../scripts/staging-generation-22-process-supervisor.mjs'
import { WINDOW_ID } from '../scripts/staging-generation-22-credentials.mjs'
import { GENERATION, PROJECT_REF } from '../scripts/staging-generation-22-material.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
const supabase = `sbp_${'a'.repeat(40)}`
const vercel = 'fixture-vercel-token'
async function isolatedPythonHelper(t, securitySource) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-gen22-keychain-python-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const securityPath = join(directory, 'synthetic-security')
  const helperPath = join(directory, 'staging-generation-22-keychain.py')
  writeFileSync(securityPath, securitySource, { mode: 0o700 })
  chmodSync(securityPath, 0o700)
  const source = await readFile(GENERATION_22_KEYCHAIN_HELPER, 'utf8')
  assert.equal(source.includes('GENERATION_22_KEYCHAIN_ENABLED = False'), true)
  assert.equal(source.includes('"/usr/bin/security"'), true)
  writeFileSync(helperPath, source
    .replace('GENERATION_22_KEYCHAIN_ENABLED = False', 'GENERATION_22_KEYCHAIN_ENABLED = True')
    .replace('"/usr/bin/security"', JSON.stringify(securityPath)), { mode: 0o600 })
  return helperPath
}
async function armed() {
  const source = (await readFile(new URL('staging-generation-22-keychain-reader.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_22_KEYCHAIN_READER_ENABLED = false',
      'export const STAGING_GENERATION_22_KEYCHAIN_READER_ENABLED = true')
    .replace("resolve(import.meta.dirname, 'staging-generation-22-keychain.py')",
      JSON.stringify(GENERATION_22_KEYCHAIN_HELPER))
    .replace("resolve(import.meta.dirname, '..')", JSON.stringify(root))
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
async function armedEntry() {
  const source = (await readFile(new URL('staging-generation-22-worker-entry.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_22_WORKER_ENTRY_ENABLED = false',
      'export const STAGING_GENERATION_22_WORKER_ENTRY_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`))
    .runStagingGeneration22Worker
}
function childWith({ output, code = 0, stall = false } = {}) {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.kills = 0
  child.kill = () => { child.kills++; child.emit('close', null); return true }
  if (!stall) queueMicrotask(() => {
    child.stdout.write(Buffer.from(output)); child.stdout.end(); child.emit('close', code)
  })
  return child
}

test('both live gates reject before reading Keychain or spawning a helper', async () => {
  assert.equal(STAGING_GENERATION_22_KEYCHAIN_READER_ENABLED, false)
  let spawned = 0
  assert.throws(() => readStagingGeneration22Credential({ selector: 'supabase',
    signal: new AbortController().signal, stopWorkerGroup() {}, spawnProcess() { spawned++ } }), /unavailable/)
  assert.equal(spawned, 0)
  for (const selector of ['supabase', 'vercel']) {
    assert.throws(() => execFileSync(GENERATION_22_PYTHON,
      ['-I', '-S', GENERATION_22_KEYCHAIN_HELPER, selector], { stdio: 'ignore', timeout: 2_000 }))
  }
})

test('isolated Python helper selects only the two exact Keychain items without opening Keychain', async t => {
  const helper = await isolatedPythonHelper(t, `#!/bin/sh
if [ "$1" != find-generic-password ] || [ "$2" != -w ] || [ "$3" != -s ] || [ "$5" != -a ]; then exit 9; fi
if [ "$4" = 'Supabase CLI' ] && [ "$6" = supabase ]; then printf '%s' '${supabase}'; exit 0; fi
if [ "$4" = 'TLL Hosted Baseline Vercel API' ] && [ "$6" = prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4 ]; then printf '%s' '${vercel}'; exit 0; fi
exit 9
`)
  for (const [selector, expected] of [['supabase', supabase], ['vercel', vercel]]) {
    const output = execFileSync(GENERATION_22_PYTHON, ['-I', '-S', helper, selector], {
      encoding: 'utf8', timeout: 3_000,
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    })
    assert.equal(output, expected)
  }
  assert.throws(() => execFileSync(GENERATION_22_PYTHON, ['-I', '-S', helper, 'other'], {
    stdio: 'pipe', timeout: 3_000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
  }))
})

test('isolated Python helper never returns malformed or failed command output', async t => {
  const malformed = await isolatedPythonHelper(t, '#!/bin/sh\nprintf bad\n')
  assert.throws(() => execFileSync(GENERATION_22_PYTHON, ['-I', '-S', malformed, 'supabase'], {
    stdio: 'pipe', timeout: 3_000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
  }), error => error.status === 1 && error.stdout.length === 0 && error.stderr.length === 0)
  const failed = await isolatedPythonHelper(t, '#!/bin/sh\nexit 7\n')
  assert.throws(() => execFileSync(GENERATION_22_PYTHON, ['-I', '-S', failed, 'vercel'], {
    stdio: 'pipe', timeout: 3_000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
  }), error => error.status === 1 && error.stdout.length === 0 && error.stderr.length === 0)
})

test('reader uses two fixed selectors, a minimal environment and returns owned buffers', async () => {
  const { readStagingGeneration22Credentials } = await armed()
  const seen = []
  const credentials = await readStagingGeneration22Credentials({ signal: new AbortController().signal,
    stopWorkerGroup() { throw Error('must not stop') },
    spawnProcess(executable, args, options) {
      assert.equal(executable, GENERATION_22_PYTHON)
      assert.deepEqual(args.slice(0, 3), ['-I', '-S', GENERATION_22_KEYCHAIN_HELPER])
      assert.deepEqual(options, { cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
        stdio: ['ignore', 'pipe', 'ignore'] })
      seen.push(args[3])
      return childWith({ output: args[3] === 'supabase' ? supabase : vercel })
    },
  })
  assert.deepEqual(seen, ['supabase', 'vercel'])
  assert.deepEqual(Object.keys(credentials), ['managementToken', 'vercelToken'])
  assert.equal(credentials.managementToken.toString(), supabase)
  assert.equal(credentials.vercelToken.toString(), vercel)
  for (const value of Object.values(credentials)) value.fill(0)
})

test('failed second read erases the first completed token', async () => {
  const { collectStagingGeneration22Credentials } = await armed()
  const first = Buffer.from(supabase)
  let calls = 0
  await assert.rejects(collectStagingGeneration22Credentials({ readCredential() {
    calls++
    if (calls === 1) return first
    throw Error('second read unavailable')
  } }), /unavailable/)
  assert.equal(calls, 2)
  assert.equal(first.every(byte => byte === 0), true)
})

test('blocked helper times out, kills the group and returns no token', async () => {
  const { readStagingGeneration22Credential: read } = await armed()
  const child = childWith({ stall: true })
  let stops = 0
  await assert.rejects(read({ selector: 'supabase', signal: new AbortController().signal,
    stopWorkerGroup() { stops++ }, spawnProcess: () => child,
    scheduleTimeout: setImmediate, clearScheduledTimeout: clearImmediate }), /unavailable/)
  assert.equal(stops, 1)
  assert.equal(child.kills, 1)
})

test('helper output error stops the group and cannot return partial credentials', async () => {
  const { readStagingGeneration22Credential: read } = await armed()
  const child = childWith({ stall: true }), partial = Buffer.from('partial-secret')
  let stops = 0
  const pending = read({ selector: 'supabase', signal: new AbortController().signal,
    stopWorkerGroup() { stops++ }, spawnProcess: () => child })
  child.stdout.write(partial)
  child.stdout.emit('error', Error('synthetic pipe error'))
  await assert.rejects(pending, /unavailable/)
  assert.equal(stops, 1)
  assert.equal(child.kills, 1)
  assert.equal(partial.every(byte => byte === 0), true)
})

test('invalid selector, token and already-aborted signal cannot advance', async () => {
  const { readStagingGeneration22Credential: read } = await armed()
  let spawned = 0
  const spawnProcess = () => { spawned++; return childWith({ output: 'invalid-token' }) }
  assert.throws(() => read({ selector: 'other', signal: new AbortController().signal,
    stopWorkerGroup() {}, spawnProcess }), /unavailable/)
  const controller = new AbortController(); controller.abort()
  assert.throws(() => read({ selector: 'supabase', signal: controller.signal,
    stopWorkerGroup() {}, spawnProcess }), /unavailable/)
  assert.equal(spawned, 0)
  await assert.rejects(read({ selector: 'supabase', signal: new AbortController().signal,
    stopWorkerGroup() {}, spawnProcess }), /unavailable/)
  assert.equal(spawned, 1)
})

test('simulated Keychain pair flows through supervised child and is erased before output', async () => {
  const { readStagingGeneration22Credentials } = await armed()
  const run = await armedEntry(), order = [], owned = []
  const result = await run({ signal: new AbortController().signal,
    accept() { order.push('supervisor'); return () => order.push('release') },
    readCredentials({ signal }) {
      return readStagingGeneration22Credentials({ signal, stopWorkerGroup() { throw Error('unexpected stop') },
        spawnProcess(_executable, args) {
          order.push(args[3]); return childWith({ output: args[3] === 'supabase' ? supabase : vercel })
        } })
    },
    createWorker(credentials) {
      owned.push(credentials.managementToken, credentials.vercelToken)
      return { core: { run() { order.push('run'); return {
        schema: WORKER_TERMINAL_SCHEMA, status: 'DRAINED', projectRef: PROJECT_REF,
        generation: GENERATION, windowId: WINDOW_ID,
        setupStatus: 'SETTINGS_AND_CONNECTIONS_VERIFIED', recoveryStatus: 'RECOVERY_VERIFIED',
      } } }, dispose() { order.push('dispose') } }
    },
    write() {
      assert.equal(owned.every(value => value.every(byte => byte === 0)), true)
      order.push('write')
    },
  })
  assert.equal(result, true)
  assert.deepEqual(order, ['supervisor', 'supabase', 'vercel', 'run', 'dispose', 'write', 'release'])
})
