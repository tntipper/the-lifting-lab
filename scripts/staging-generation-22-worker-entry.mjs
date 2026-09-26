#!/usr/bin/env node
/** Fixed Gen22 child entry; hosted worker assembly has not been connected. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptSupervisorPipe } from './staging-provider-broker-recovery-process-control.mjs'
import { GENERATION_22_WORKER_PROOF } from './staging-generation-22-process-binding.mjs'

export const STAGING_GENERATION_22_WORKER_ENTRY_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 worker entry unavailable') }

export function acceptStagingGeneration22Supervisor() {
  if (!STAGING_GENERATION_22_WORKER_ENTRY_ENABLED) unavailable()
  return acceptSupervisorPipe({ proof: GENERATION_22_WORKER_PROOF })
}

if (import.meta.url.startsWith('file:') && process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // No credential reader or host is imported. A separate reviewed change must
  // connect the worker core and the supervisor-loss pipe before this can run.
  process.exitCode = 1
}
