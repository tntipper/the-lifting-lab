#!/usr/bin/env node
/** Fixed Gen22 child entry; the completed hosted path remains disabled. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptSupervisorPipe } from './staging-provider-broker-recovery-process-control.mjs'
import { GENERATION_22_WORKER_PROOF } from './staging-generation-22-process-binding.mjs'
import { WORKER_TERMINAL_SCHEMA } from './staging-generation-22-process-supervisor.mjs'
import { WINDOW_ID } from './staging-generation-22-credentials.mjs'
import { GENERATION, PROJECT_REF } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_22_WORKER_ENTRY_ENABLED = false
export const STAGING_GENERATION_22_WORKER_CLI_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 worker entry unavailable') }

export function acceptStagingGeneration22Supervisor() {
  if (!STAGING_GENERATION_22_WORKER_ENTRY_ENABLED) unavailable()
  return acceptSupervisorPipe({ proof: GENERATION_22_WORKER_PROOF })
}

const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/** Injected-only lifecycle. The fixed CLI remains unavailable until the host assembly is reviewed. */
export async function runStagingGeneration22Worker({ accept = acceptStagingGeneration22Supervisor,
  readCredentials, createWorker, write, signal } = {}) {
  if (!STAGING_GENERATION_22_WORKER_ENTRY_ENABLED || typeof accept !== 'function'
    || typeof readCredentials !== 'function' || typeof createWorker !== 'function'
    || typeof write !== 'function'
    || !signal || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
  let release, dispose, credentials
  const eraseCredentials = () => {
    if (!credentials || typeof credentials !== 'object') return
    for (const value of Object.values(credentials)) if (Buffer.isBuffer(value)) value.fill(0)
    credentials = undefined
  }
  try {
    release = await accept()
    if (typeof release !== 'function' || signal.aborted) unavailable()
    credentials = await readCredentials({ signal })
    if (signal.aborted || !exact(credentials, ['managementToken', 'vercelToken'])
      || !Buffer.isBuffer(credentials.managementToken) || !Buffer.isBuffer(credentials.vercelToken)
      || credentials.managementToken.length < 8 || credentials.vercelToken.length < 8
      || credentials.managementToken === credentials.vercelToken) unavailable()
    // Construction is synchronous: all hosted effects belong to core.run().
    const assembly = createWorker(credentials)
    if (!exact(assembly, ['core', 'dispose']) || typeof assembly.core?.run !== 'function'
      || typeof assembly.dispose !== 'function') unavailable()
    dispose = assembly.dispose
    const terminal = await assembly.core.run({ signal })
    const finishDisposal = dispose
    dispose = undefined
    await finishDisposal()
    eraseCredentials()
    if (signal.aborted || !exact(terminal, ['schema', 'status', 'projectRef', 'generation',
      'windowId', 'setupStatus', 'recoveryStatus'])
      || terminal.schema !== WORKER_TERMINAL_SCHEMA || terminal.status !== 'DRAINED'
      || terminal.projectRef !== PROJECT_REF || terminal.generation !== GENERATION
      || terminal.windowId !== WINDOW_ID
      || terminal.setupStatus !== 'SETTINGS_AND_CONNECTIONS_VERIFIED'
      || terminal.recoveryStatus !== 'RECOVERY_VERIFIED') unavailable()
    await write(`${JSON.stringify(terminal)}\n`)
    return true
  } catch { return false }
  finally {
    if (dispose) { try { await dispose() } catch {} }
    eraseCredentials()
    if (release) { try { release() } catch {} }
  }
}

if (import.meta.url.startsWith('file:') && process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!STAGING_GENERATION_22_WORKER_CLI_ENABLED) process.exitCode = 1
  else {
    const controller = new AbortController()
    const abort = () => controller.abort()
    process.once('SIGINT', abort)
    process.once('SIGTERM', abort)
    try {
      const [{ readStagingGeneration22Credentials },
        { createStagingGeneration22WorkerAssembly }] = await Promise.all([
        import('./staging-generation-22-keychain-reader.mjs'),
        import('./staging-generation-22-worker-assembly.mjs'),
      ])
      const passed = await runStagingGeneration22Worker({
        signal: controller.signal,
        readCredentials: ({ signal }) => readStagingGeneration22Credentials({ signal,
          stopWorkerGroup: () => process.kill(-process.pid, 'SIGKILL') }),
        createWorker: createStagingGeneration22WorkerAssembly,
        write: value => new Promise((resolveWrite, rejectWrite) => {
          process.stdout.write(value, error => error ? rejectWrite(error) : resolveWrite())
        }),
      })
      process.exitCode = passed ? 0 : 1
    } catch { process.exitCode = 1 }
    finally {
      process.removeListener('SIGINT', abort)
      process.removeListener('SIGTERM', abort)
    }
  }
}
