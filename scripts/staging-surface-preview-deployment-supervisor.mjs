/** Disabled whole-worker limit for one protected staging Preview build. */
import { runBoundedBrokerRotationWorker } from './staging-provider-broker-rotation-process-control.mjs'

export const STAGING_PREVIEW_DEPLOYMENT_SUPERVISOR_ENABLED = false
export const STAGING_PREVIEW_DEPLOYMENT_WORKER_DEADLINE_MS = 240_000
const unavailable = () => { throw new Error('Staging Preview deployment supervisor unavailable') }

/** Reuse the proven detached process-group supervisor; never retry its result. */
export async function runBoundedStagingPreviewDeploymentWorker({ executable, args, cwd, env, proof,
  deadlineMs = STAGING_PREVIEW_DEPLOYMENT_WORKER_DEADLINE_MS, spawnProcess } = {}) {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1
    || deadlineMs > STAGING_PREVIEW_DEPLOYMENT_WORKER_DEADLINE_MS) unavailable()
  const result = await runBoundedBrokerRotationWorker({ executable, args, cwd, env, proof,
    deadlineMs, maxOutputBytes: 1024, ...(spawnProcess ? { spawnProcess } : {}) })
  if (result.status !== 'EXITED' || result.code !== 0) {
    result.output?.fill(0)
    return Object.freeze({ status: 'RECONCILIATION_REQUIRED', output: null })
  }
  return Object.freeze({ status: 'EXITED', output: result.output })
}
