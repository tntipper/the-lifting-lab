#!/usr/bin/env node
/** Disabled Gen23 child entry. Its future hosted assembly is deliberately absent. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptSupervisorPipe } from './staging-provider-broker-recovery-process-control.mjs'
import { GENERATION_23_WHOLE_WORKER_PROOF } from './staging-generation-23-process-binding.mjs'

export const STAGING_GENERATION_23_WORKER_ENTRY_ENABLED = false
export const STAGING_GENERATION_23_WORKER_CLI_ARMED = false
export const GENERATION_23_WHOLE_WORKER_TERMINAL_SCHEMA = 'tll-staging-generation-23-whole-worker-terminal/v1'
const unavailable = () => { throw Error('Generation 23 whole worker unavailable') }

/** Injected-only seam for local process tests; no credential or hosted adapter is imported. */
export async function runStagingGeneration23WholeWorker({
  accept = () => acceptSupervisorPipe({ proof: GENERATION_23_WHOLE_WORKER_PROOF }),
  runOperations, write, signal,
} = {}) {
  if (!STAGING_GENERATION_23_WORKER_ENTRY_ENABLED || typeof accept !== 'function'
    || typeof runOperations !== 'function' || typeof write !== 'function' || !signal
    || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
  let release
  try {
    release = await accept()
    if (typeof release !== 'function' || signal.aborted) unavailable()
    const result = await runOperations({ signal })
    if (signal.aborted || !result || typeof result !== 'object' || Array.isArray(result)
      || Object.keys(result).sort().join('|') !== 'status'
      || result.status !== 'PASS_PARTIAL_LOCAL_COMPOSITE') unavailable()
    await write(`${JSON.stringify({ schema: GENERATION_23_WHOLE_WORKER_TERMINAL_SCHEMA,
      status: result.status, generation: 23 })}\n`)
    return true
  } catch { return false }
  finally { if (release) { try { release() } catch {} } }
}

if (import.meta.url.startsWith('file:') && process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // There is intentionally no default operations assembly. A future arming diff
  // must add it and be reviewed as one connected hosted package.
  if (!STAGING_GENERATION_23_WORKER_CLI_ARMED || process.argv.length !== 2) process.exitCode = 1
  else process.exitCode = 1
}
