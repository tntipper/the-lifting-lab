/** Disabled, bounded two-token reader owned only by the supervised Gen22 child. */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

export const STAGING_GENERATION_22_KEYCHAIN_READER_ENABLED = false
export const GENERATION_22_KEYCHAIN_HELPER = resolve(import.meta.dirname, 'staging-generation-22-keychain.py')
export const GENERATION_22_PYTHON = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
const ROOT = resolve(import.meta.dirname, '..')
const LIMIT_MS = 15_000
const MAX_BYTES = 4_096
const unavailable = () => { throw new Error('Generation 22 credential unavailable') }
const validSignal = signal => signal && typeof signal.aborted === 'boolean'
  && typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function'
const validToken = (selector, value) => Buffer.isBuffer(value) &&
  (selector === 'supabase' ? /^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(value.toString('utf8'))
    : selector === 'vercel' && value.length >= 8 && value.length <= 1024
      && /^[\x21-\x7e]+$/.test(value.toString('utf8')))

export function readStagingGeneration22Credential({ selector, signal, stopWorkerGroup,
  spawnProcess = spawn, scheduleTimeout = setTimeout, clearScheduledTimeout = clearTimeout } = {}) {
  if (!STAGING_GENERATION_22_KEYCHAIN_READER_ENABLED || !['supabase', 'vercel'].includes(selector)
    || !validSignal(signal) || signal.aborted || typeof stopWorkerGroup !== 'function'
    || typeof spawnProcess !== 'function' || typeof scheduleTimeout !== 'function'
    || typeof clearScheduledTimeout !== 'function') unavailable()
  return new Promise((resolveCredential, rejectCredential) => {
    let child
    try {
      child = spawnProcess(GENERATION_22_PYTHON, ['-I', '-S', GENERATION_22_KEYCHAIN_HELPER, selector], {
        cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      if (!child?.stdout || typeof child.once !== 'function' || typeof child.kill !== 'function') unavailable()
    } catch {
      try { child?.kill?.('SIGKILL') } catch {}
      rejectCredential(Error('Generation 22 credential unavailable')); return
    }
    let settled = false, size = 0, timer
    const chunks = []
    const wipe = () => { for (const chunk of chunks) chunk.fill(0); chunks.length = 0 }
    const finish = success => {
      if (settled) return
      settled = true
      try { clearScheduledTimeout(timer) } catch {}
      signal.removeEventListener('abort', abort)
      child.stdout.removeAllListeners('data')
      child.stdout.removeListener('error', abort)
      child.stdout.destroy()
      const value = success && size <= MAX_BYTES ? Buffer.concat(chunks, size) : null
      wipe()
      if (validToken(selector, value)) resolveCredential(value)
      else { value?.fill(0); rejectCredential(Error('Generation 22 credential unavailable')) }
    }
    const abort = () => {
      try { stopWorkerGroup() } catch {}
      try { child.kill('SIGKILL') } catch {}
      finish(false)
    }
    try { timer = scheduleTimeout(abort, LIMIT_MS) } catch { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { abort(); return }
    child.stdout.on('data', chunk => {
      if (settled) { chunk.fill(0); return }
      if (!Buffer.isBuffer(chunk) || size + chunk.length > MAX_BYTES) {
        if (Buffer.isBuffer(chunk)) chunk.fill(0)
        abort(); return
      }
      size += chunk.length
      chunks.push(Buffer.from(chunk))
      chunk.fill(0)
    })
    child.stdout.once('error', abort)
    child.once('error', abort)
    child.once('close', code => finish(code === 0 && !signal.aborted))
  })
}

/** On a failed second read, the completed first token is erased. */
export async function collectStagingGeneration22Credentials({ readCredential } = {}) {
  if (!STAGING_GENERATION_22_KEYCHAIN_READER_ENABLED || typeof readCredential !== 'function') unavailable()
  const owned = {}
  try {
    for (const [name, selector] of [['managementToken', 'supabase'], ['vercelToken', 'vercel']]) {
      const value = await readCredential(selector)
      if (!validToken(selector, value)) { value?.fill?.(0); unavailable() }
      owned[name] = value
    }
    if (owned.managementToken === owned.vercelToken) unavailable()
    return owned
  } catch {
    for (const value of Object.values(owned)) value.fill(0)
    unavailable()
  }
}

export function readStagingGeneration22Credentials({ signal, stopWorkerGroup,
  spawnProcess, scheduleTimeout, clearScheduledTimeout } = {}) {
  if (!STAGING_GENERATION_22_KEYCHAIN_READER_ENABLED || !validSignal(signal) || signal.aborted) unavailable()
  return collectStagingGeneration22Credentials({ readCredential: selector => readStagingGeneration22Credential({
    selector, signal, stopWorkerGroup, spawnProcess, scheduleTimeout, clearScheduledTimeout,
  }) })
}
