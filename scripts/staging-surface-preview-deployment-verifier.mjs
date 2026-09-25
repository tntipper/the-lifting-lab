/** Injected-only, one-use proof of a newly built protected staging Preview. */
import {
  STAGING_ALIAS, STAGING_BRANCH, STAGING_SURFACE_TARGET,
} from './staging-surface-activation-transport.mjs'
import { VERCEL_PROJECT_ID, VERCEL_TEAM_ID } from './staging-surface-activation-native-binding.mjs'
import { buildStagingPreviewDeploymentRequest } from './staging-surface-preview-deployment-request.mjs'

export const STAGING_PREVIEW_DEPLOYMENT_VERIFIER_ENABLED = false
export const PREVIEW_BUILD_POLL_LIMIT = 90
export const PREVIEW_BUILD_POLL_INTERVAL_MS = 2000
export const PREVIEW_BUILD_DEADLINE_MS = 180000
const unavailable = () => { throw new Error('Staging Preview deployment verification unavailable') }
const validId = value => typeof value === 'string' && /^dpl_[A-Za-z0-9]+$/.test(value)
const validSignal = signal => signal && typeof signal.aborted === 'boolean'
  && typeof signal.addEventListener === 'function' && !signal.aborted

async function uncertain(stopWorkerGroup) {
  try { stopWorkerGroup() } catch {}
  return new Promise(() => {})
}

function verifyProtectedResult(value, identity, input) {
  const deployment = value?.deployment, surface = value?.surface
  const enabled = input.publicCustomer
  if (!deployment || deployment.projectId !== VERCEL_PROJECT_ID || deployment.teamId !== VERCEL_TEAM_ID
    || deployment.branch !== STAGING_BRANCH || deployment.alias !== STAGING_ALIAS
    || deployment.deploymentId !== identity.deploymentId || deployment.immutableUrl !== identity.immutableUrl
    || deployment.gitProvider !== 'github' || deployment.repositoryId !== '1264363509'
    || deployment.gitSourceCommit !== input.sourceCommit
    || deployment.applicationManifestSha256 !== input.manifestSha256
    || surface?.edge?.enabled !== enabled
    || surface?.flags?.target !== STAGING_SURFACE_TARGET
    || surface.flags.privateCustomer !== enabled || surface.flags.privateCart !== enabled
    || surface.flags.publicCustomer !== enabled || surface.flags.publicCart !== enabled) unavailable()
}

/**
 * The caller must place the one-use POST host under a durable journal and
 * supplies the fixed native read binding,
 * an observer factory that uses the protected Preview bypass, and a bounded
 * supervisor. This module has no credentials, launcher or ambient network.
 */
export function createStagingPreviewDeploymentVerifier({ postHost, binding, createProtectedReader,
  pause, now = Date.now, stopWorkerGroup } = {}) {
  if (typeof postHost?.submit !== 'function' || typeof postHost?.dispose !== 'function'
    || typeof binding?.readDeploymentState !== 'function'
    || typeof binding?.readDeployment !== 'function' || typeof createProtectedReader !== 'function'
    || typeof pause !== 'function' || typeof now !== 'function' || typeof stopWorkerGroup !== 'function') unavailable()
  let consumed = false
  return Object.freeze({
    async verify(input, { signal } = {}) {
      if (consumed || !validSignal(signal)) unavailable()
      buildStagingPreviewDeploymentRequest(input)
      consumed = true
      const started = now()
      if (!Number.isFinite(started)) unavailable()
      // A rejected preflight is still pre-POST. After an accepted ID, every
      // uncertain outcome must stop the worker so a parent can reconcile it.
      let accepted
      try { accepted = await postHost.submit(input, { signal }) }
      catch (error) { postHost.dispose(); throw error }
      if (!accepted || accepted.status !== 'ACCEPTED_UNVERIFIED' || !validId(accepted.deploymentId)) {
        return uncertain(stopWorkerGroup)
      }
      let reader
      try {
        let ready = false
        for (let attempt = 0; attempt < PREVIEW_BUILD_POLL_LIMIT; attempt++) {
          const observed = now()
          if (!validSignal(signal) || !Number.isFinite(observed) || observed < started
            || observed - started > PREVIEW_BUILD_DEADLINE_MS) unavailable()
          const state = await binding.readDeploymentState(STAGING_SURFACE_TARGET, accepted.deploymentId, { signal })
          if (state?.deploymentId !== accepted.deploymentId) unavailable()
          if (state.readyState === 'READY') { ready = true; break }
          if (!['QUEUED', 'INITIALIZING', 'BUILDING'].includes(state.readyState)) unavailable()
          if (attempt === PREVIEW_BUILD_POLL_LIMIT - 1) unavailable()
          await pause(PREVIEW_BUILD_POLL_INTERVAL_MS, signal)
        }
        const afterBuild = now()
        if (!ready || !validSignal(signal) || !Number.isFinite(afterBuild)
          || afterBuild < started || afterBuild - started > PREVIEW_BUILD_DEADLINE_MS) unavailable()
        const identity = await binding.readDeployment(STAGING_SURFACE_TARGET, accepted.deploymentId, { signal })
        const created = Date.parse(identity?.createdAt ?? '')
        if (identity?.deploymentId !== accepted.deploymentId || identity.ready !== true
          || identity.sourceCommit !== input.sourceCommit || identity.manifestSha256 !== input.manifestSha256
          || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(identity.immutableUrl ?? '')
          || !Number.isFinite(created) || created < started - 60000 || created > now() + 60000) unavailable()
        reader = createProtectedReader(Object.freeze({ deploymentId: identity.deploymentId,
          immutableUrl: identity.immutableUrl, gitSourceCommit: identity.sourceCommit }))
        if (typeof reader?.readBaseline !== 'function' || typeof reader?.dispose !== 'function') unavailable()
        const protectedResult = await reader.readBaseline({ signal })
        const afterProof = now()
        if (!validSignal(signal) || !Number.isFinite(afterProof)
          || afterProof < started || afterProof - started > PREVIEW_BUILD_DEADLINE_MS) unavailable()
        verifyProtectedResult(protectedResult, identity, input)
        postHost.dispose()
        return Object.freeze({ status: 'PROTECTED_PREVIEW_VERIFIED', deploymentId: identity.deploymentId,
          immutableUrl: identity.immutableUrl, sourceCommit: input.sourceCommit,
          manifestSha256: input.manifestSha256, customerEnabled: input.publicCustomer,
          cartEnabled: input.publicCart })
      } catch { return uncertain(stopWorkerGroup) } finally { reader?.dispose() }
    },
  })
}
