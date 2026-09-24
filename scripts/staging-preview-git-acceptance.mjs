/** Pure, injected-evidence gate for the first Git-triggered staging Preview. */
import { assessStagingPreviewSourceReadback } from './staging-account-hosted-baseline-surface.mjs'
import { STAGING_ALIAS, STAGING_BRANCH, STAGING_PROJECT_REF, STAGING_SURFACE_TARGET } from './staging-surface-activation-transport.mjs'
import { VERCEL_PROJECT, VERCEL_PROJECT_ID, VERCEL_SCOPE, VERCEL_TEAM_ID } from './staging-surface-activation-native-binding.mjs'

export const STAGING_PREVIEW_GIT_ACCEPTANCE_ENABLED = false
const HOLD = Object.freeze({ status: 'SOURCE_ACCEPTANCE_HOLD' })
const sameTarget = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Reflect.ownKeys(value).length !== Object.keys(STAGING_SURFACE_TARGET).length) return false
  return Object.entries(STAGING_SURFACE_TARGET).every(([key, expected]) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.value === expected
  })
}
const sourceAccepted = value => value?.status === 'SOURCE_COMMIT_AND_GIT_MANIFEST_MATCH'

/**
 * All inputs must come from independently bounded, reviewed read ports. This
 * function performs no I/O and cannot create a deployment or enable sign-in.
 */
export function assessStagingPreviewGitAcceptance ({ selectedSource, project, gitBefore, before, surface, after, gitAfter } = {}) {
  try {
    if (!selectedSource || typeof selectedSource !== 'object' || Array.isArray(selectedSource)
      || Reflect.ownKeys(selectedSource).length !== 2) return HOLD
    const selectedCommit = Object.getOwnPropertyDescriptor(selectedSource, 'sourceCommit')?.value
    const selectedManifest = Object.getOwnPropertyDescriptor(selectedSource, 'manifestSha256')?.value
    if (typeof selectedCommit !== 'string' || !/^[a-f0-9]{40}$/.test(selectedCommit)
      || typeof selectedManifest !== 'string' || !/^[a-f0-9]{64}$/.test(selectedManifest)) return HOLD
    const first = assessStagingPreviewSourceReadback({ project, deployment: before, sourceProof: gitBefore })
    const last = assessStagingPreviewSourceReadback({ project, deployment: after, sourceProof: gitAfter })
    if (!sourceAccepted(first) || !sourceAccepted(last)
      || first.sourceCommit !== selectedCommit
      || first.gitManifestSha256 !== selectedManifest
      || project.target.environment !== 'preview' || project.target.branch !== STAGING_BRANCH
      || project.target.project !== VERCEL_PROJECT || project.target.scope !== VERCEL_SCOPE
      || project.repository.org !== 'tntipper' || project.repository.repo !== 'the-lifting-lab'
      || project.repository.productionBranch !== 'main'
      || before.alias !== STAGING_ALIAS || after.alias !== STAGING_ALIAS
      || first.deploymentId !== last.deploymentId || first.immutableUrl !== last.immutableUrl
      || first.sourceCommit !== last.sourceCommit || first.gitManifestSha256 !== last.gitManifestSha256
      || first.applicationManifestSha256 !== last.applicationManifestSha256) return HOLD

    const observed = surface?.deployment, state = surface?.surface
    if (!observed || observed.projectId !== VERCEL_PROJECT_ID || observed.project !== VERCEL_PROJECT
      || observed.teamId !== VERCEL_TEAM_ID || observed.scope !== VERCEL_SCOPE
      || observed.branch !== STAGING_BRANCH || observed.alias !== STAGING_ALIAS
      || observed.deploymentId !== first.deploymentId || observed.immutableUrl !== first.immutableUrl
      || observed.gitProvider !== 'github' || observed.repositoryId !== '1264363509'
      || observed.gitSourceCommit !== first.sourceCommit
      || observed.applicationManifestSha256 !== first.applicationManifestSha256
      || !state || !state.flags || !state.edge
      || !sameTarget(state.flags.target)
      || !sameTarget(state.edge.target)
      || state.edge.functionName !== 'customer-subject-broker' || state.edge.enabled !== false
      || ['privateCustomer', 'privateCart', 'publicCustomer', 'publicCart'].some(key => state.flags[key] !== false)) return HOLD

    return Object.freeze({ status: 'SOURCE_PROVEN_RUNTIME_HELD', projectRef: STAGING_PROJECT_REF,
      projectId: VERCEL_PROJECT_ID, repositoryId: '1264363509', branch: STAGING_BRANCH,
      deploymentId: first.deploymentId, immutableUrl: first.immutableUrl,
      sourceCommit: first.sourceCommit, gitManifestSha256: first.gitManifestSha256 })
  } catch { return HOLD }
}
