/** One fixed disabled successor parent; existing supervisor owns the process group. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedBrokerRotationWorker, MAX_REVIEWED_EXTENDED_WORKER_MS } from './staging-provider-broker-rotation-process-control.mjs'
import { readOwnerSuccessorArmingSourceFixed } from './staging-owner-successor-source-proof.mjs'
import { prepareOwnerSuccessorSourceMetadata } from './staging-owner-successor-source-preparation.mjs'
import { ownerSuccessorSourceIdentity } from './staging-owner-successor-native-context.mjs'
import { ACTIVE_WINDOW_EXPIRES_AT } from './staging-owner-successor-sql-context.mjs'
import { OWNER_SUCCESSOR_CLEANUP_SUPERVISOR_PROOF, OWNER_SUCCESSOR_SUPERVISOR_PROOF, OWNER_SUCCESSOR_TERMINAL_SCHEMA, readOwnerSuccessorReviewHandoff } from './staging-owner-successor-worker-entry.mjs'
export const OWNER_SUCCESSOR_NATIVE_PROCESS_BINDING_ENABLED = false
const ROOT = resolve(import.meta.dirname, '..')
export const OWNER_SUCCESSOR_WORKER_PATH = fileURLToPath(new URL('./staging-owner-successor-worker-entry.mjs', import.meta.url))
const HOLD = Object.freeze({ status: 'HOLD_RECONCILE', authorization: 'NONE' })
const CLEANUP_WORKER_PATH = fileURLToPath(new URL('./staging-owner-successor-cleanup-worker-entry.mjs', import.meta.url))
let used = false, cleanupUsed = false
/** Receipt parser is pure, grants no authority, and requires the exact source/window admitted before spawn. */
function validateTerminal(bytes, expected, cleanup) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length > 1024) return HOLD
    const raw = bytes.toString('utf8')
    if (!raw.endsWith('\n') || raw.slice(0, -1).includes('\n')) return HOLD
    const value = JSON.parse(raw)
    if (raw !== `${JSON.stringify(value)}\n` || !value || Object.keys(value).sort().join('|') !== 'authorization|identity|provenance|schema|status'
      || value.schema !== OWNER_SUCCESSOR_TERMINAL_SCHEMA || value.authorization !== 'NONE'
      || value.provenance !== 'FIXED_NATIVE_PORTS' || JSON.stringify(value.identity) !== JSON.stringify(expected)
      || !(cleanup ? ['CLEANUP_SEQUENCE_PASS'] : ['STAGING_SEQUENCE_PASS', 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED']).includes(value.status)) return HOLD
    return Object.freeze({ status: value.status, authorization: 'NONE' })
  } catch { return HOLD }
}
export function validateOwnerSuccessorWorkerTerminal(bytes, expected) { return validateTerminal(bytes, expected, false) }
export function validateOwnerSuccessorCleanupTerminal(bytes, expected) { return validateTerminal(bytes, expected, true) }
/** No caller-selected process, environment, credential reader or source policy. */
async function runBoundedFixedWorker(cleanup) {
  if (!OWNER_SUCCESSOR_NATIVE_PROCESS_BINDING_ENABLED) return Object.freeze({ status: 'SUCCESSOR_EXECUTION_DISABLED', authorization: 'NONE' })
  if (cleanup ? cleanupUsed : used) return HOLD
  if (cleanup) cleanupUsed = true; else used = true
  let bytes, last = -Infinity
  const clock = () => {
    const at = Date.now()
    if (!Number.isSafeInteger(at) || at < last) throw Error('Successor parent clock unavailable')
    last = at; return at
  }
  try {
    const signal = new AbortController().signal
    await prepareOwnerSuccessorSourceMetadata({ signal })
    const handoff = readOwnerSuccessorReviewHandoff()
    const proof = await readOwnerSuccessorArmingSourceFixed({ handoff, signal, now: clock })
    const identity = ownerSuccessorSourceIdentity(proof, clock())
    const deadlineMs = Date.parse(ACTIVE_WINDOW_EXPIRES_AT) - clock() - 2000
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > MAX_REVIEWED_EXTENDED_WORKER_MS) return HOLD
    const result = await runBoundedBrokerRotationWorker({ executable: process.execPath,
      args: Object.freeze([cleanup ? CLEANUP_WORKER_PATH : OWNER_SUCCESSOR_WORKER_PATH]), cwd: ROOT,
      env: Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }), proof: cleanup ? OWNER_SUCCESSOR_CLEANUP_SUPERVISOR_PROOF : OWNER_SUCCESSOR_SUPERVISOR_PROOF,
      deadlineMs, deadlineCeilingMs: MAX_REVIEWED_EXTENDED_WORKER_MS, maxOutputBytes: 1024, strictGroupCleanup: true })
    bytes = result.output
    if (result.status !== 'EXITED' || result.code !== 0 || clock() >= Date.parse(ACTIVE_WINDOW_EXPIRES_AT)) return HOLD
    return validateTerminal(bytes, identity, cleanup)
  } catch { return HOLD } finally { bytes?.fill?.(0) }
}

export function runBoundedOwnerSuccessorWorker() { return runBoundedFixedWorker(false) }
export function runBoundedOwnerSuccessorCleanupWorker() { return runBoundedFixedWorker(true) }
