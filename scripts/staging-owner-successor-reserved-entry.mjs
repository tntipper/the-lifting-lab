#!/usr/bin/env node
/** Reserved direct entry. No adapters, credential readers or fixture consumers are wired. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
export const STAGING_OWNER_SUCCESSOR_LIVE_ENABLED = false
export const SUCCESSOR_EXPIRY = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'
// A source switch or supplied approval object alone can never enable this package.
// Hosted binding, durable phase journal and secure credential handoff need separate review.
export async function runOwnerSuccessorLiveOnce() {
  return Object.freeze({ status: 'SUCCESSOR_EXECUTION_DISABLED', authorization: 'NONE' })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runOwnerSuccessorLiveOnce())}\n`)
  process.exitCode = 1
}
