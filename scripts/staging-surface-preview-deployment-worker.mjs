/** Disabled, injected-only owner of a single staging Preview build attempt. */
import { buildStagingPreviewDeploymentRequest } from './staging-surface-preview-deployment-request.mjs'
import { createStagingSurfaceNativeBinding } from './staging-surface-activation-native-binding.mjs'
import { createStagingAccountHostedBaselineSurfaceBinding } from './staging-account-hosted-baseline-surface.mjs'
import { createStagingPreviewDeploymentPost } from './staging-surface-preview-deployment-post.mjs'
import { createStagingPreviewDeploymentVerifier } from './staging-surface-preview-deployment-verifier.mjs'
import { createStagingPreviewProtectionProbe } from './staging-surface-preview-protection-probe.mjs'

export const STAGING_PREVIEW_DEPLOYMENT_WORKER_ENABLED = false
const unavailable = () => { throw new Error('Staging Preview deployment worker unavailable') }
const pendingStop = stopWorkerGroup => { try { stopWorkerGroup() } catch {}; return new Promise(() => {}) }
const wipe = value => {
  if (!value || typeof value !== 'object') return
  for (const item of Object.values(value)) if (Buffer.isBuffer(item)) item.fill(0)
}
const validCredentials = value => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === 'protectionBypassToken|vercelToken'
  && Buffer.isBuffer(value.vercelToken) && Buffer.isBuffer(value.protectionBypassToken)

function pause(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('aborted')); return }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, milliseconds)
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('aborted')) }
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** The caller must run this inside the detached whole-worker supervisor. */
export async function runStagingPreviewDeploymentWorker({ input, journal, acquireCredentials,
  fetch: fetcher, runCli, stopWorkerGroup, signal, now = Date.now,
  createBinding = createStagingSurfaceNativeBinding,
  createPost = createStagingPreviewDeploymentPost,
  createVerifier = createStagingPreviewDeploymentVerifier,
  createProtectedBinding = createStagingAccountHostedBaselineSurfaceBinding } = {}) {
  if (typeof journal?.claim !== 'function' || typeof journal?.read !== 'function'
    || typeof journal?.holdBeforeDispatch !== 'function' || typeof acquireCredentials !== 'function'
    || typeof fetcher !== 'function' || typeof runCli !== 'function' || typeof stopWorkerGroup !== 'function'
    || !signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function'
    || signal.aborted || typeof now !== 'function' || [createBinding, createPost, createVerifier, createProtectedBinding]
      .some(value => typeof value !== 'function')) unavailable()
  buildStagingPreviewDeploymentRequest(input)
  // Claim first: a failed credential read cannot silently start the same run again.
  const claim = journal.claim(input)
  let credentials, postHost
  try {
    credentials = await acquireCredentials()
    if (!validCredentials(credentials) || signal.aborted) unavailable()
    const binding = createBinding({ runCli, fetch: fetcher, vercelToken: credentials.vercelToken })
    postHost = createPost({ fetch: fetcher, vercelToken: credentials.vercelToken,
      readPinnedRepository: binding.readPinnedRepository, journal, stopWorkerGroup })
    const verifier = createVerifier({ postHost, journal, binding, pause, now, stopWorkerGroup,
      protectionProbe: createStagingPreviewProtectionProbe({ fetch: fetcher }),
      createProtectedReader: expectedDeployment => createProtectedBinding({ fetch: fetcher,
        vercelToken: credentials.vercelToken, protectionBypassToken: credentials.protectionBypassToken,
        expectedDeployment }) })
    const result = await verifier.verify(input, { signal, priorClaim: claim })
    const finalRecord = journal.read()
    if (result?.status !== 'PROTECTED_PREVIEW_VERIFIED' || finalRecord?.phase !== 'VERIFIED'
      || result.deploymentId !== finalRecord.deploymentId || result.sourceCommit !== input.sourceCommit
      || result.manifestSha256 !== input.manifestSha256 || result.customerEnabled !== input.publicCustomer
      || result.cartEnabled !== input.publicCart) unavailable()
    return result
  } catch (error) {
    try {
      if (journal.read()?.phase !== 'CLAIMED') return pendingStop(stopWorkerGroup)
      journal.holdBeforeDispatch(claim)
    } catch { return pendingStop(stopWorkerGroup) }
    throw error
  } finally { postHost?.dispose(); wipe(credentials) }
}
