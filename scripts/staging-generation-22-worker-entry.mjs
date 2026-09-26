#!/usr/bin/env node
/** Fixed Gen22 child entry; hosted worker assembly has not been connected. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptSupervisorPipe } from './staging-provider-broker-recovery-process-control.mjs'
import { GENERATION_22_WORKER_PROOF } from './staging-generation-22-process-binding.mjs'
import { WORKER_TERMINAL_SCHEMA } from './staging-generation-22-process-supervisor.mjs'
import { WINDOW_ID } from './staging-generation-22-credentials.mjs'
import { GENERATION, PROJECT_REF } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_22_WORKER_ENTRY_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 worker entry unavailable') }

export function acceptStagingGeneration22Supervisor() {
  if (!STAGING_GENERATION_22_WORKER_ENTRY_ENABLED) unavailable()
  return acceptSupervisorPipe({ proof: GENERATION_22_WORKER_PROOF })
}

const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/** Injected-only lifecycle. The fixed CLI remains unavailable until the host assembly is reviewed. */
export async function runStagingGeneration22Worker({ accept = acceptStagingGeneration22Supervisor,
  createWorker, write, signal } = {}) {
  if (!STAGING_GENERATION_22_WORKER_ENTRY_ENABLED || typeof accept !== 'function'
    || typeof createWorker !== 'function' || typeof write !== 'function'
    || !signal || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
  let release, dispose
  try {
    release = await accept()
    if (typeof release !== 'function' || signal.aborted) unavailable()
    // Construction is synchronous: all hosted effects belong to core.run().
    const assembly = createWorker()
    if (!exact(assembly, ['core', 'dispose']) || typeof assembly.core?.run !== 'function'
      || typeof assembly.dispose !== 'function') unavailable()
    dispose = assembly.dispose
    const terminal = await assembly.core.run({ signal })
    const finishDisposal = dispose
    dispose = undefined
    await finishDisposal()
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
    if (release) { try { release() } catch {} }
  }
}

if (import.meta.url.startsWith('file:') && process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // No credential reader or host is imported. A separate reviewed change must
  // connect the worker core and the supervisor-loss pipe before this can run.
  process.exitCode = 1
}
