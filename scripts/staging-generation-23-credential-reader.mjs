/** Disabled, exact three-selector Keychain reader for the supervised Gen23 child. */
import { spawn } from 'node:child_process'

export const STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED = true
export const GENERATION_23_SECURITY = '/usr/bin/security'
const SELECTORS = Object.freeze({
  supabase: Object.freeze(['Supabase CLI', 'supabase']),
  vercel: Object.freeze(['TLL Hosted Baseline Vercel API', 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4']),
  bypass: Object.freeze(['TLL Hosted Baseline Preview Bypass', 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4']),
})
const LIMIT_MS = 15_000
const MAX_BYTES = 4_096
const unavailable = () => { throw Error('Generation 23 credential unavailable') }
const validSignal = signal => signal && typeof signal.aborted === 'boolean'
  && typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function'
const valid = (selector, value) => Buffer.isBuffer(value)
  && (selector === 'supabase' ? /^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(value.toString('utf8'))
    : value.length >= 8 && value.length <= 1024 && /^[\x21-\x7e]+$/.test(value.toString('utf8')))

export function readStagingGeneration23Credential({ selector, signal, stopWorkerGroup,
  spawnProcess = spawn, scheduleTimeout = setTimeout, clearScheduledTimeout = clearTimeout } = {}) {
  if (!STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED || !Object.hasOwn(SELECTORS, selector)
    || !validSignal(signal) || signal.aborted || typeof stopWorkerGroup !== 'function'
    || typeof spawnProcess !== 'function' || typeof scheduleTimeout !== 'function'
    || typeof clearScheduledTimeout !== 'function') unavailable()
  const [service, account] = SELECTORS[selector]
  return new Promise((resolveCredential, rejectCredential) => {
    let child
    try {
      child = spawnProcess(GENERATION_23_SECURITY,
        ['find-generic-password', '-w', '-s', service, '-a', account],
        { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'ignore'] })
      if (!child?.stdout || typeof child.once !== 'function' || typeof child.kill !== 'function') unavailable()
    } catch {
      try { child?.kill?.('SIGKILL') } catch {}
      rejectCredential(Error('Generation 23 credential unavailable')); return
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
      const output = success && size <= MAX_BYTES ? Buffer.concat(chunks, size) : null
      wipe()
      const length = output?.length ?? 0
      const withoutLineBreak = length > 0 && output[length - 1] === 10
        ? output.subarray(0, length > 1 && output[length - 2] === 13 ? length - 2 : length - 1) : output
      const value = withoutLineBreak ? Buffer.from(withoutLineBreak) : null
      output?.fill(0)
      if (valid(selector, value)) resolveCredential(value)
      else { value?.fill(0); rejectCredential(Error('Generation 23 credential unavailable')) }
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
      if (settled) { chunk?.fill?.(0); return }
      if (!Buffer.isBuffer(chunk) || size + chunk.length > MAX_BYTES) {
        chunk?.fill?.(0); abort(); return
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

/** A failed later selector erases all earlier credential buffers. */
export async function collectStagingGeneration23Credentials({ readCredential } = {}) {
  if (!STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED || typeof readCredential !== 'function') unavailable()
  const owned = {}
  try {
    for (const [name, selector] of [['managementToken', 'supabase'], ['vercelToken', 'vercel'],
      ['previewBypass', 'bypass']]) {
      const value = await readCredential(selector)
      if (!valid(selector, value)) { value?.fill?.(0); unavailable() }
      owned[name] = value
    }
    const values = Object.values(owned)
    if (new Set(values).size !== 3 || values[0].equals(values[1])
      || values[0].equals(values[2]) || values[1].equals(values[2])) unavailable()
    return owned
  } catch {
    for (const value of Object.values(owned)) value.fill(0)
    unavailable()
  }
}

export function readStagingGeneration23Credentials({ signal, stopWorkerGroup,
  spawnProcess, scheduleTimeout, clearScheduledTimeout } = {}) {
  if (!STAGING_GENERATION_23_CREDENTIAL_READER_ENABLED || !validSignal(signal) || signal.aborted
    || typeof stopWorkerGroup !== 'function') unavailable()
  return collectStagingGeneration23Credentials({ readCredential: selector => readStagingGeneration23Credential({
    selector, signal, stopWorkerGroup, spawnProcess, scheduleTimeout, clearScheduledTimeout,
  }) })
}
