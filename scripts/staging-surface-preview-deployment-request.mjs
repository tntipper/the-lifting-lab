/**
 * Pure request contract for a future, separately approved staging Preview.
 * This module has no transport, token reader, launcher or arming path.
 */
import { VERCEL_PROJECT, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } from './staging-surface-activation-native-binding.mjs'
import { STAGING_BRANCH } from './staging-surface-activation-transport.mjs'

export const STAGING_PREVIEW_DEPLOYMENT_REQUEST_ENABLED = false
export const STAGING_GITHUB_REPOSITORY_ID = 1264363509
export const STAGING_GITHUB_ORG = 'tntipper'
export const STAGING_GITHUB_REPO = 'the-lifting-lab'
export const STAGING_PREVIEW_DEPLOYMENT_REQUEST_ERROR = 'Staging Preview deployment request unavailable'

const unavailable = () => { throw new Error(STAGING_PREVIEW_DEPLOYMENT_REQUEST_ERROR) }
const inputKeys = Object.freeze(['branch', 'sourceCommit', 'manifestSha256', 'publicCustomer', 'publicCart'])
function exactData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) unavailable()
  let descriptors
  try { descriptors = Object.getOwnPropertyDescriptors(input) } catch { unavailable() }
  if (Reflect.ownKeys(descriptors).length !== inputKeys.length
    || inputKeys.some(key => !Object.hasOwn(descriptors, key)
      || !Object.hasOwn(descriptors[key], 'value') || descriptors[key].enumerable !== true)) unavailable()
  return Object.freeze(Object.fromEntries(inputKeys.map(key => [key, descriptors[key].value])))
}

/** Construct the exact proposed POST body; the caller cannot select Production. */
export function buildStagingPreviewDeploymentRequest(input) {
  const values = exactData(input)
  if (values.branch !== STAGING_BRANCH || typeof values.sourceCommit !== 'string'
    || !/^[a-f0-9]{40}$/.test(values.sourceCommit)
    || typeof values.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(values.manifestSha256)
    || values.publicCustomer !== false || values.publicCart !== false) unavailable()
  const gitSource = Object.freeze({ type: 'github', org: STAGING_GITHUB_ORG,
    repo: STAGING_GITHUB_REPO, ref: STAGING_BRANCH, sha: values.sourceCommit })
  const meta = Object.freeze({ githubCommitRef: STAGING_BRANCH, githubCommitSha: values.sourceCommit,
    tllManifestSha256: values.manifestSha256 })
  const body = Object.freeze({ name: VERCEL_PROJECT, project: VERCEL_PROJECT_ID, gitSource, meta })
  return Object.freeze({ method: 'POST', url: `https://api.vercel.com/v13/deployments?teamId=${VERCEL_TEAM_ID}`, body })
}
