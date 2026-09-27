/** Disabled parent binding for the one fixed Generation 23 whole-process worker. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedBrokerRotationWorker, MAX_REVIEWED_EXTENDED_WORKER_MS } from './staging-provider-broker-rotation-process-control.mjs'

export const STAGING_GENERATION_23_PROCESS_BINDING_ENABLED = false
export const GENERATION_23_WHOLE_WORKER_PROOF = 'TLL_STAGING_GENERATION_23_WHOLE_SUPERVISOR_V1'
export const GENERATION_23_WHOLE_WORKER_PATH = fileURLToPath(
  new URL('./staging-generation-23-worker-entry.mjs', import.meta.url))
export const GENERATION_23_WHOLE_WORKER_ARGS = Object.freeze([GENERATION_23_WHOLE_WORKER_PATH])
// The child receives an earlier cancellation signal. The parent sends a
// process-group kill at 59m58s; its 2s close grace fits within one hour.
export const GENERATION_23_WHOLE_WORKER_DEADLINE_MS = MAX_REVIEWED_EXTENDED_WORKER_MS
const ROOT = resolve(import.meta.dirname, '..')
const unavailable = () => { throw Error('Generation 23 whole-process binding unavailable') }
let used = false

/** One fixed detached child; the generic parent owns its deadline and process group. */
export async function runBoundedStagingGeneration23WholeWorker({
  deadlineMs = GENERATION_23_WHOLE_WORKER_DEADLINE_MS, spawnProcess,
} = {}) {
  if (!STAGING_GENERATION_23_PROCESS_BINDING_ENABLED
    || !Number.isSafeInteger(deadlineMs) || deadlineMs < 1
    || deadlineMs > GENERATION_23_WHOLE_WORKER_DEADLINE_MS
    || (!spawnProcess && deadlineMs !== GENERATION_23_WHOLE_WORKER_DEADLINE_MS)
    || used) unavailable()
  used = true
  const result = await runBoundedBrokerRotationWorker({ executable: process.execPath,
    args: GENERATION_23_WHOLE_WORKER_ARGS, cwd: ROOT,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, proof: GENERATION_23_WHOLE_WORKER_PROOF,
    deadlineMs, deadlineCeilingMs: GENERATION_23_WHOLE_WORKER_DEADLINE_MS,
    maxOutputBytes: 1024, strictGroupCleanup: true,
    ...(spawnProcess ? { spawnProcess } : {}) })
  if (result.status !== 'EXITED' || result.code !== 0) {
    result.output?.fill(0)
    return Object.freeze({ status: 'RECONCILIATION_REQUIRED' })
  }
  const bytes = result.output
  try {
    const raw = bytes.toString('utf8').trim()
    const terminal = JSON.parse(raw)
    if (raw !== JSON.stringify(terminal) || !terminal || typeof terminal !== 'object'
      || Array.isArray(terminal) || Object.keys(terminal).sort().join('|') !== 'generation|schema|status'
      || terminal.schema !== 'tll-staging-generation-23-whole-worker-terminal/v1'
      || terminal.status !== 'PASS_PARTIAL_LOCAL_COMPOSITE' || terminal.generation !== 23) unavailable()
    return Object.freeze({ status: 'VERIFIED_LOCAL_WHOLE_PROCESS' })
  } catch { return Object.freeze({ status: 'RECONCILIATION_REQUIRED' }) }
  finally { bytes.fill(0) }
}
