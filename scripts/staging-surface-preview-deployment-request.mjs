/**
 * Pure request contract for a future, separately approved staging Preview.
 * This module has no transport, token reader, launcher or arming path.
 */
import { VERCEL_PROJECT, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } from './staging-surface-activation-native-binding.mjs'
import { STAGING_BRANCH } from './staging-surface-activation-transport.mjs'

export const STAGING_PREVIEW_DEPLOYMENT_REQUEST_ENABLED = false
export const STAGING_GITHUB_REPOSITORY_ID = 1264363509
export const STAGING_PREVIEW_DEPLOYMENT_REQUEST_ERROR = 'Staging Preview deployment request unavailable'

const unavailable = () => { throw new Error(STAGING_PREVIEW_DEPLOYMENT_REQUEST_ERROR) }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/** Construct the exact proposed POST body; the caller cannot select Production. */
export function buildStagingPreviewDeploymentRequest(input) {
  if (!exact(input, ['branch', 'sourceCommit', 'manifestSha256', 'publicCustomer', 'publicCart'])
    || input.branch !== STAGING_BRANCH || !/^[a-f0-9]{40}$/.test(input.sourceCommit)
    || !/^[a-f0-9]{64}$/.test(input.manifestSha256)
    || input.publicCustomer !== false || input.publicCart !== false) unavailable()
  const gitSource = Object.freeze({ type: 'github', repoId: STAGING_GITHUB_REPOSITORY_ID,
    ref: STAGING_BRANCH, sha: input.sourceCommit })
  const meta = Object.freeze({ githubCommitRef: STAGING_BRANCH, githubCommitSha: input.sourceCommit,
    tllManifestSha256: input.manifestSha256 })
  const body = Object.freeze({ name: VERCEL_PROJECT, project: VERCEL_PROJECT_ID, gitSource, meta })
  return Object.freeze({ method: 'POST', url: `https://api.vercel.com/v13/deployments?teamId=${VERCEL_TEAM_ID}`, body })
}
