#!/usr/bin/env node
/** Reserved direct entry. Fixed supervisor owns the child; source and credential admission stay gated. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedOwnerSuccessorWorker } from './staging-owner-successor-process-binding.mjs'
export const STAGING_OWNER_SUCCESSOR_LIVE_ENABLED = false
export const SUCCESSOR_EXPIRY = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'
// A source switch or supplied approval object alone can never enable this package.
// Authenticated hosted preflight and owner execution still require separate approval.
export async function runOwnerSuccessorLiveOnce() {
  if (!STAGING_OWNER_SUCCESSOR_LIVE_ENABLED) return Object.freeze({ status: 'SUCCESSOR_EXECUTION_DISABLED', authorization: 'NONE' })
  return runBoundedOwnerSuccessorWorker()
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = process.argv.length === 2 ? await runOwnerSuccessorLiveOnce()
    : Object.freeze({ status: 'HOLD_RECONCILE', authorization: 'NONE' })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (!['STAGING_SEQUENCE_PASS', 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED'].includes(result.status)) process.exitCode = 1
}
