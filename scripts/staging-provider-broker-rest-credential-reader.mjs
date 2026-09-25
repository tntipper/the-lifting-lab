/** Bounded, fixed-selector credential reader for a supervised staging worker. */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

export const STAGING_BROKER_REST_CREDENTIAL_READER_ENABLED = false
export const STAGING_BROKER_REST_KEYCHAIN_HELPER = resolve(import.meta.dirname, 'staging-provider-broker-rotation-keychain.py')
export const STAGING_BROKER_REST_PYTHON = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
const ROOT = resolve(import.meta.dirname, '..')
const LIMIT_MS = 15_000
const MAX_BYTES = 4_096
const unavailable = () => { throw Error('Staging broker rotation credential unavailable') }
const validSignal = signal => signal && typeof signal.aborted === 'boolean'
  && typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function'
const token = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= MAX_BYTES
  && !value.includes(0) && /^[\x21-\x7e]+$/.test(value.toString('utf8'))

/** One helper child remains in the supervised worker's process group. */
export function readStagingBrokerRotationCredential({ selector, signal, stopWorkerGroup,
  spawnProcess = spawn, scheduleTimeout = setTimeout, clearScheduledTimeout = clearTimeout } = {}) {
  if (!['supabase', 'vercel', 'vercel-bypass'].includes(selector) || !validSignal(signal)
    || signal.aborted || typeof stopWorkerGroup !== 'function' || typeof spawnProcess !== 'function'
    || typeof scheduleTimeout !== 'function' || typeof clearScheduledTimeout !== 'function') unavailable()
  return new Promise((resolveCredential, rejectCredential) => {
    let child
    try {
      child = spawnProcess(STAGING_BROKER_REST_PYTHON, ['-I', '-S', STAGING_BROKER_REST_KEYCHAIN_HELPER, selector], {
        cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'ignore'],
      })
      if (!child?.stdout || typeof child.once !== 'function' || typeof child.kill !== 'function') unavailable()
    } catch {
      try { child?.kill?.('SIGKILL') } catch {}
      rejectCredential(Error('Staging broker rotation credential unavailable')); return
    }
    const chunks = []
    let size = 0, settled = false, timer
    const wipe = () => { for (const chunk of chunks) chunk.fill(0); chunks.length = 0 }
    const finish = success => {
      if (settled) return
      settled = true
      try { clearScheduledTimeout(timer) } catch {}
      signal.removeEventListener('abort', abort)
      child.stdout.removeAllListeners('data')
      child.stdout.destroy()
      const value = success && size >= 8 && size <= MAX_BYTES ? Buffer.concat(chunks, size) : null
      wipe()
      if (token(value)) resolveCredential(value)
      else { value?.fill(0); rejectCredential(Error('Staging broker rotation credential unavailable')) }
    }
    const abort = () => {
      try { stopWorkerGroup() } catch {}
      try { child.kill('SIGKILL') } catch {}
      finish(false)
    }
    try { timer = scheduleTimeout(abort, LIMIT_MS) } catch { abort(); return }
    if (settled) return
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { abort(); return }
    child.stdout.on('data', chunk => {
      if (settled) { chunk.fill(0); return }
      size += chunk.length
      if (size > MAX_BYTES) { chunk.fill(0); abort(); return }
      chunks.push(chunk)
    })
    child.once('error', abort)
    child.once('close', code => finish(code === 0 && !signal.aborted))
  })
}

/** The caller receives ownership of all three buffers and must wipe them. */
export async function collectStagingBrokerRotationCredentials({ readCredential } = {}) {
  if (typeof readCredential !== 'function') unavailable()
  const owned = {}
  try {
    for (const [name, selector] of [['managementToken', 'supabase'], ['vercelToken', 'vercel'],
      ['protectionBypassToken', 'vercel-bypass']]) {
      const value = await readCredential(selector)
      if (!token(value)) { value?.fill?.(0); unavailable() }
      owned[name] = value
    }
    return owned
  } catch {
    for (const value of Object.values(owned)) value.fill(0)
    unavailable()
  }
}

export function readStagingBrokerRotationCredentials({ signal, stopWorkerGroup, spawnProcess,
  scheduleTimeout, clearScheduledTimeout } = {}) {
  if (!validSignal(signal) || signal.aborted) unavailable()
  return collectStagingBrokerRotationCredentials({ readCredential: selector => readStagingBrokerRotationCredential({
    selector, signal, stopWorkerGroup, spawnProcess, scheduleTimeout, clearScheduledTimeout,
  }) })
}
