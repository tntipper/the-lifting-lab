#!/usr/bin/env node
/** Disabled Gen23 child entry. Hosted operations and Keychain bindings remain absent. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptSupervisorPipe } from './staging-provider-broker-recovery-process-control.mjs'
import { GENERATION_23_WHOLE_WORKER_PROOF } from './staging-generation-23-process-binding.mjs'

export const STAGING_GENERATION_23_WORKER_ENTRY_ENABLED = false
export const STAGING_GENERATION_23_WORKER_CLI_ARMED = false
export const GENERATION_23_WHOLE_WORKER_TERMINAL_SCHEMA = 'tll-staging-generation-23-whole-worker-terminal/v1'
export const GENERATION_23_ORDERLY_ABORT_MS = 58 * 60 * 1000
const unavailable = () => { throw Error('Generation 23 whole worker unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const printable = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 1024
  && /^[\x21-\x7e]+$/.test(value.toString('utf8'))
const erase = credentials => {
  if (!credentials || typeof credentials !== 'object') return
  for (const value of Object.values(credentials)) if (Buffer.isBuffer(value)) value.fill(0)
}

/** Injected-only seam. The fixed CLI does not yet connect a credential reader or hosted assembly. */
export async function runStagingGeneration23WholeWorker({
  accept = () => acceptSupervisorPipe({ proof: GENERATION_23_WHOLE_WORKER_PROOF }),
  readCredentials, createWorker, write, signal, deadlineMs = GENERATION_23_ORDERLY_ABORT_MS,
} = {}) {
  if (!STAGING_GENERATION_23_WORKER_ENTRY_ENABLED || typeof accept !== 'function'
    || typeof readCredentials !== 'function' || typeof createWorker !== 'function'
    || typeof write !== 'function' || !signal
    || signal.aborted || typeof signal.addEventListener !== 'function'
    || !Number.isSafeInteger(deadlineMs) || deadlineMs < 1
    || deadlineMs > GENERATION_23_ORDERLY_ABORT_MS) unavailable()
  let release, deadlineTimer, credentials, assembly
  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()
  signal.addEventListener('abort', onExternalAbort, { once: true })
  deadlineTimer = setTimeout(() => controller.abort(), deadlineMs)
  try {
    release = await accept()
    if (typeof release !== 'function' || controller.signal.aborted) unavailable()
    credentials = await readCredentials({ signal: controller.signal })
    if (controller.signal.aborted || !exact(credentials, ['managementToken', 'vercelToken', 'previewBypass'])
      || !Buffer.isBuffer(credentials.managementToken)
      || !/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(credentials.managementToken.toString('utf8'))
      || !printable(credentials.vercelToken) || !printable(credentials.previewBypass)
      || credentials.managementToken === credentials.vercelToken
      || credentials.managementToken === credentials.previewBypass
      || credentials.vercelToken === credentials.previewBypass
      || credentials.managementToken.equals(credentials.vercelToken)
      || credentials.managementToken.equals(credentials.previewBypass)
      || credentials.vercelToken.equals(credentials.previewBypass)) unavailable()
    assembly = createWorker(credentials)
    if (!exact(assembly, ['core', 'dispose']) || typeof assembly.core?.run !== 'function'
      || typeof assembly.dispose !== 'function' || controller.signal.aborted) unavailable()
    const result = await assembly.core.run({ signal: controller.signal })
    const finishedAssembly = assembly
    assembly = undefined
    await finishedAssembly.dispose()
    erase(credentials)
    credentials = undefined
    if (controller.signal.aborted || !result || typeof result !== 'object' || Array.isArray(result)
      || Object.keys(result).sort().join('|') !== 'status'
      || result.status !== 'PASS_PARTIAL_LOCAL_COMPOSITE') unavailable()
    await write(`${JSON.stringify({ schema: GENERATION_23_WHOLE_WORKER_TERMINAL_SCHEMA,
      status: result.status, generation: 23 })}\n`)
    return true
  } catch { return false }
  finally {
    clearTimeout(deadlineTimer)
    signal.removeEventListener('abort', onExternalAbort)
    if (assembly) { try { await assembly.dispose() } catch {} }
    erase(credentials)
    if (release) { try { release() } catch {} }
  }
}

if (import.meta.url.startsWith('file:') && process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // There is intentionally no default operations assembly. A future arming diff
  // must add it and be reviewed as one connected hosted package.
  if (!STAGING_GENERATION_23_WORKER_CLI_ARMED || process.argv.length !== 2) process.exitCode = 1
  else process.exitCode = 1
}
