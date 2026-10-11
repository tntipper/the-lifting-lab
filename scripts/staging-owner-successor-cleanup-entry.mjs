/** Separate fixed, disabled cleanup-only supervisor entry. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedOwnerSuccessorCleanupWorker } from './staging-owner-successor-process-binding.mjs'
export const OWNER_SUCCESSOR_CLEANUP_ENTRY_ENABLED = false
export function runOwnerSuccessorCleanupOnce() {
  if (!OWNER_SUCCESSOR_CLEANUP_ENTRY_ENABLED) return Promise.resolve(Object.freeze({ status: 'SUCCESSOR_EXECUTION_DISABLED', authorization: 'NONE' }))
  return runBoundedOwnerSuccessorCleanupWorker()
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = process.argv.length === 2 ? await runOwnerSuccessorCleanupOnce() : Object.freeze({ status: 'HOLD_RECONCILE', authorization: 'NONE' })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status !== 'CLEANUP_SEQUENCE_PASS') process.exitCode = 1
}
