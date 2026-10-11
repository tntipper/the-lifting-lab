/** Fixed cleanup-only child. The original whole-route record remains held. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runFixedOwnerSuccessorCleanupWorker } from './staging-owner-successor-worker-entry.mjs'
export const OWNER_SUCCESSOR_CLEANUP_WORKER_ENABLED = false
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = OWNER_SUCCESSOR_CLEANUP_WORKER_ENABLED && process.argv.length === 2
    ? await runFixedOwnerSuccessorCleanupWorker() : Object.freeze({ status: 'HOLD_RECONCILE', authorization: 'NONE' })
  if (result.status !== 'CLEANUP_SEQUENCE_PASS') process.exitCode = 1
}
