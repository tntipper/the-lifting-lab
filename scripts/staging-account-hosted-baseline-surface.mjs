/**
 * Read-only, injected-only surface evidence for the staging baseline.
 *
 * There is deliberately no launcher, credential discovery, CLI, or default
 * transport here. A separately reviewed launcher may inject one fetch
 * primitive and a private Vercel token for exactly one observation.
 */
import {
  PRODUCTION_PROJECT_REF,
  STAGING_ALIAS,
  STAGING_BRANCH,
  STAGING_PROJECT_REF,
  STAGING_SURFACE_TARGET,
} from './staging-surface-activation-transport.mjs'
import { STAGING_EDGE_FUNCTION } from './staging-surface-activation-native-adapter.mjs'
import {
  VERCEL_PROJECT,
  VERCEL_PROJECT_ID,
  VERCEL_SCOPE,
  VERCEL_TEAM_ID,
} from './staging-surface-activation-native-binding.mjs'

export const HOSTED_BASELINE_SURFACE_BINDING_ENABLED = false
export const HOSTED_BASELINE_SURFACE_ERROR = 'Staging hosted baseline surface binding unavailable'
export const PREVIEW_SOURCE_READBACK_ENABLED = false
export const HOSTED_BASELINE_SURFACE_TARGET = Object.freeze({
  projectRef: STAGING_PROJECT_REF,
  productionProjectRef: PRODUCTION_PROJECT_REF,
  projectId: VERCEL_PROJECT_ID,
  project: VERCEL_PROJECT,
  teamId: VERCEL_TEAM_ID,
  scope: VERCEL_SCOPE,
  branch: STAGING_BRANCH,
  alias: STAGING_ALIAS,
  edgeFunction: STAGING_EDGE_FUNCTION,
})

const API = 'https://api.vercel.com'
const MAX_RESPONSE_BYTES = 64 * 1024
const ALIAS_HOST = 'the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app'
const ALIAS_URL = `${API}/v4/aliases/${ALIAS_HOST}?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}`
const DEPLOYMENT_URL = id => `${API}/v13/deployments/${id}?withGitRepoInfo=true&teamId=${VERCEL_TEAM_ID}`
const EDGE_URL = `https://${STAGING_PROJECT_REF}.supabase.co/functions/v1/tll-broker-token`
const unavailable = () => { throw new Error(HOSTED_BASELINE_SURFACE_ERROR) }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const isDeploymentId = value => typeof value === 'string' && /^dpl_[A-Za-z0-9]+$/.test(value)
const isSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const isManifest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const isImmutableUrl = value => typeof value === 'string' && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value)
const canonicalRepositoryId = value => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  if (typeof value === 'string' && /^[1-9][0-9]{0,255}$/.test(value)) return value
  unavailable()
}

function validSignal (signal) {
  return signal && typeof signal === 'object' && typeof signal.aborted === 'boolean'
    && typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function'
}

function copyToken (value) {
  if (!Buffer.isBuffer(value) || value.length < 8 || value.length > 1024 || value.includes(0)) unavailable()
  const copy = Buffer.from(value)
  if (!/^[\x21-\x7e]{8,1024}$/.test(copy.toString('utf8'))) { copy.fill(0); unavailable() }
  return copy
}

function cancelResponse (response) {
  try {
    const reader = response?.body?.getReader?.()
    if (!reader) return
    try { Promise.resolve(reader.cancel()).catch(() => {}) } finally { try { reader.releaseLock() } catch {} }
  } catch {}
}

function checkResponse (response, url, statuses) {
  if (!response || typeof response !== 'object' || !statuses.includes(response.status) || response.redirected === true
    || (typeof response.url === 'string' && response.url !== '' && response.url !== url)
    || !response.body || typeof response.body.getReader !== 'function') {
    cancelResponse(response); unavailable()
  }
  const length = response.headers?.get?.('content-length')
  const encoding = response.headers?.get?.('content-encoding')
  if ((length !== null && length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES))
    || (encoding !== null && encoding !== undefined && encoding !== '' && encoding !== 'identity')) {
    cancelResponse(response); unavailable()
  }
}

async function parseJson (response, url, statuses, signal) {
  let reader, chunks = [], size = 0, cancelled = false
  const cancel = () => {
    if (cancelled) return
    cancelled = true
    try { if (reader) Promise.resolve(reader.cancel()).catch(() => {}) } catch {}
    cancelResponse(response)
  }
  let abort
  const aborted = new Promise(resolve => { abort = () => resolve('ABORTED') })
  try {
    checkResponse(response, url, statuses)
    reader = response.body.getReader()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { cancel(); unavailable() }
    while (true) {
      const pending = Promise.resolve().then(() => reader.read())
      // A read can resolve after the abort race is won. Its byte buffer still
      // belongs to us, so wipe it before leaving the bounded observer.
      pending.then(item => {
        if (signal.aborted && item?.value instanceof Uint8Array) item.value.fill(0)
      }, () => {})
      const item = await Promise.race([pending, aborted])
      if (item === 'ABORTED' || signal.aborted) {
        if (item?.value instanceof Uint8Array) item.value.fill(0)
        cancel(); unavailable()
      }
      if (!item || typeof item.done !== 'boolean') unavailable()
      if (item.done) break
      if (!(item.value instanceof Uint8Array)) unavailable()
      size += item.value.byteLength
      if (size > MAX_RESPONSE_BYTES) { item.value.fill(0); cancel(); unavailable() }
      const copy = Buffer.from(item.value); item.value.fill(0); chunks.push(copy)
    }
    const bytes = Buffer.concat(chunks, size)
    try { return JSON.parse(bytes.toString('utf8')) } finally { bytes.fill(0) }
  } catch {
    cancel(); unavailable()
  } finally {
    try { signal.removeEventListener('abort', abort) } catch {}
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

function aliasReceipt (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.alias !== ALIAS_HOST
    || value.projectId !== VERCEL_PROJECT_ID || !isDeploymentId(value.deploymentId)
    || !value.deployment || typeof value.deployment !== 'object' || Array.isArray(value.deployment)
    || value.deployment.id !== value.deploymentId || !isImmutableUrl(`https://${value.deployment.url ?? ''}`)) unavailable()
  return Object.freeze({ deploymentId: value.deploymentId, immutableUrl: `https://${value.deployment.url}` })
}

function deploymentReceipt (value, expectedId) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.id !== expectedId
    || value.projectId !== VERCEL_PROJECT_ID || value.ownerId !== VERCEL_TEAM_ID || value.readyState !== 'READY'
    || value.target !== null || !isImmutableUrl(`https://${value.url ?? ''}`)
    || !value.gitSource || typeof value.gitSource !== 'object' || Array.isArray(value.gitSource)
    || value.gitSource.type !== 'github' || !isSha(value.gitSource.sha) || value.gitSource.ref !== STAGING_BRANCH) unavailable()
  const repositoryId = canonicalRepositoryId(value.gitSource.repoId)
  // This is TLL application evidence, not a Vercel API field. The existing
  // transport/binding consumer contract is documented in docs/ops/staging-account-activation.md,
  // but no concrete deployment-metadata writer is currently present. Its absence
  // is therefore returned as null for the core/composer to classify as HOLD.
  // If TLL metadata is present, malformed data fails closed.
  let applicationManifestSha256 = null
  if (Object.hasOwn(value, 'meta')) {
    if (!value.meta || typeof value.meta !== 'object' || Array.isArray(value.meta)) unavailable()
    if (Object.hasOwn(value.meta, 'tllManifestSha256')) {
      if (!isManifest(value.meta.tllManifestSha256)) unavailable()
      applicationManifestSha256 = value.meta.tllManifestSha256
    }
  }
  return Object.freeze({ deploymentId: expectedId, immutableUrl: `https://${value.url}`,
    gitProvider: 'github', repositoryId, gitSourceCommit: value.gitSource.sha,
    applicationManifestSha256 })
}

function readinessReceipt (value, deployment) {
  if (!exact(value, ['deploymentId', 'immutableUrl', 'projectRef', 'branch', 'privateCustomer', 'privateCart', 'publicCustomer', 'publicCart'])
    || value.deploymentId !== deployment.deploymentId || value.immutableUrl !== deployment.immutableUrl
    || value.projectRef !== STAGING_PROJECT_REF || value.projectRef === PRODUCTION_PROJECT_REF || value.branch !== STAGING_BRANCH
    || [value.privateCustomer, value.privateCart, value.publicCustomer, value.publicCart].some(item => typeof item !== 'boolean')) unavailable()
  return Object.freeze({ target: STAGING_SURFACE_TARGET, privateCustomer: value.privateCustomer, privateCart: value.privateCart,
    publicCustomer: value.publicCustomer, publicCart: value.publicCart })
}

function edgeReceipt (response, value) {
  if (response.status === 503 && exact(value, ['error']) && value.error === 'temporarily_unavailable') {
    return Object.freeze({ target: STAGING_SURFACE_TARGET, functionName: STAGING_EDGE_FUNCTION, enabled: false })
  }
  if (response.status === 401 && exact(value, ['error']) && value.error === 'invalid_client') {
    return Object.freeze({ target: STAGING_SURFACE_TARGET, functionName: STAGING_EDGE_FUNCTION, enabled: true })
  }
  unavailable()
}

/**
 * Vercel-only source evidence. This shares the established bounded alias and
 * deployment parsers but cannot call the protected application or Supabase.
 */
export function createStagingPreviewSourceReadbackBinding ({ fetch: fetcher, vercelToken } = {}) {
  if (typeof fetcher !== 'function') unavailable()
  const token = copyToken(vercelToken)
  let consumed = false; let disposed = false; let active
  const read = async (url, signal) => {
    let abort
    const aborted = new Promise(resolve => { abort = () => resolve('ABORTED') })
    signal.addEventListener('abort', abort, { once: true })
    let pending
    try {
      pending = Promise.resolve().then(() => {
        if (disposed || signal.aborted) unavailable()
        return fetcher(url, Object.freeze({ method: 'GET', redirect: 'error',
          headers: Object.freeze({ accept: 'application/json', 'accept-encoding': 'identity',
            authorization: `Bearer ${token.toString('utf8')}` }), signal }))
      })
      pending.then(response => { if (disposed || signal.aborted) cancelResponse(response) }, () => {})
      const response = await Promise.race([pending, aborted])
      if (response === 'ABORTED' || disposed || signal.aborted) { pending.then(cancelResponse, () => {}); unavailable() }
      return await parseJson(response, url, [200], signal)
    } catch { unavailable() } finally { signal.removeEventListener('abort', abort) }
  }
  return Object.freeze({
    async readSource ({ signal } = {}) {
      if (consumed || disposed || !validSignal(signal) || signal.aborted) unavailable()
      consumed = true
      const controller = new AbortController()
      active = controller
      const abort = () => controller.abort()
      signal.addEventListener('abort', abort, { once: true })
      try {
        if (disposed || signal.aborted) unavailable()
        const alias = aliasReceipt(await read(ALIAS_URL, controller.signal))
        if (disposed || controller.signal.aborted) unavailable()
        const deployment = deploymentReceipt(await read(DEPLOYMENT_URL(alias.deploymentId), controller.signal), alias.deploymentId)
        if (disposed || controller.signal.aborted) unavailable()
        if (deployment.immutableUrl !== alias.immutableUrl) unavailable()
        return Object.freeze({ projectId: VERCEL_PROJECT_ID, teamId: VERCEL_TEAM_ID,
          branch: STAGING_BRANCH, alias: STAGING_ALIAS, ...deployment })
      } finally { signal.removeEventListener('abort', abort); active = undefined; disposed = true; token.fill(0) }
    },
    dispose () { disposed = true; active?.abort(); token.fill(0) },
  })
}

/** Classify Vercel Git identity against a separately proven immutable Git manifest. */
export function assessStagingPreviewSourceReadback ({ project, deployment, sourceProof } = {}) {
  const expectedRepoId = 1264363509
  if (!project || project.target?.projectId !== VERCEL_PROJECT_ID || project.target?.teamId !== VERCEL_TEAM_ID
    || project.repository?.provider !== 'github' || project.repository?.repoId !== expectedRepoId
    || deployment?.projectId !== VERCEL_PROJECT_ID || deployment?.teamId !== VERCEL_TEAM_ID
    || deployment?.repositoryId !== String(expectedRepoId) || deployment?.branch !== STAGING_BRANCH
    || deployment?.gitProvider !== 'github' || !isSha(deployment?.gitSourceCommit)
    || !isDeploymentId(deployment?.deploymentId) || !isImmutableUrl(deployment?.immutableUrl)) unavailable()
  const base = { deploymentId: deployment.deploymentId, immutableUrl: deployment.immutableUrl,
    sourceCommit: deployment.gitSourceCommit, applicationManifestSha256: deployment.applicationManifestSha256 }
  if (sourceProof?.status !== 'SOURCE_PROOF_VERIFIED' || !isSha(sourceProof.sourceCommit)
    || !isManifest(sourceProof.manifestSha256)) return Object.freeze({ status: 'CURRENT_SOURCE_UNPROVEN', ...base })
  if (sourceProof.sourceCommit !== deployment.gitSourceCommit) {
    return Object.freeze({ status: 'CURRENT_SOURCE_NOT_DEPLOYED', ...base })
  }
  if (deployment.applicationManifestSha256 !== null
    && sourceProof.manifestSha256 !== deployment.applicationManifestSha256) {
    return Object.freeze({ status: 'SOURCE_METADATA_CONFLICT', ...base })
  }
  // Git source provenance is not a byte-for-byte attestation of Vercel's build.
  // A separate deployment-bound runtime and stable-alias check is still required.
  return Object.freeze({ status: 'SOURCE_COMMIT_AND_GIT_MANIFEST_MATCH', ...base,
    gitManifestSha256: sourceProof.manifestSha256 })
}

/**
 * Reads the pinned surface in exactly one ordered pass. It accepts no caller
 * URL, target, deployment, request headers, or credential callback.
 */
export function createStagingAccountHostedBaselineSurfaceBinding ({ fetch: fetcher, vercelToken, protectionBypassToken } = {}) {
  if (typeof fetcher !== 'function') unavailable()
  const token = copyToken(vercelToken)
  let bypass
  try { bypass = copyToken(protectionBypassToken) } catch { token.fill(0); unavailable() }
  let consumed = false; let disposed = false
  const read = async (url, options, statuses, signal) => {
    if (!validSignal(signal) || signal.aborted) unavailable()
    let abort
    const aborted = new Promise(resolve => { abort = () => resolve('ABORTED') })
    signal.addEventListener('abort', abort, { once: true })
    let response
    try {
      const pending = Promise.resolve().then(() => fetcher(url, options))
      // A transport that settles after cancellation must not leave its response
      // body locked or readable after this one-shot observer has returned.
      pending.then(value => { if (signal.aborted) cancelResponse(value) }, () => {})
      response = await Promise.race([pending, aborted])
      if (response === 'ABORTED' || signal.aborted) { cancelResponse(response); unavailable() }
    } catch { unavailable() } finally {
      try { signal.removeEventListener('abort', abort) } catch {}
    }
    const value = await parseJson(response, url, statuses, signal)
    return Object.freeze({ response, value })
  }
  const vercelHeaders = () => Object.freeze({ accept: 'application/json', 'accept-encoding': 'identity', authorization: `Bearer ${token.toString('utf8')}` })
  return Object.freeze({
    async readBaseline ({ signal } = {}) {
      if (consumed || disposed || !validSignal(signal) || signal.aborted) unavailable()
      consumed = true
      try {
        const aliasResponse = await read(ALIAS_URL, Object.freeze({ method: 'GET', redirect: 'error', headers: vercelHeaders(), signal }), [200], signal)
        const alias = aliasReceipt(aliasResponse.value)
        const deploymentResponse = await read(DEPLOYMENT_URL(alias.deploymentId), Object.freeze({ method: 'GET', redirect: 'error', headers: vercelHeaders(), signal }), [200], signal)
        const deployment = deploymentReceipt(deploymentResponse.value, alias.deploymentId)
        if (deployment.immutableUrl !== alias.immutableUrl) unavailable()
        const readyUrl = `${deployment.immutableUrl}/api/staging/readiness`
        const readinessResponse = await read(readyUrl, Object.freeze({ method: 'GET', redirect: 'error', headers: Object.freeze({ accept: 'application/json', 'accept-encoding': 'identity', 'x-tll-deployment-id': deployment.deploymentId, 'x-vercel-protection-bypass': bypass.toString('utf8') }), signal }), [200], signal)
        const flags = readinessReceipt(readinessResponse.value, deployment)
        const edgeResponse = await read(EDGE_URL, Object.freeze({ method: 'POST', redirect: 'error', headers: Object.freeze({ accept: 'application/json', 'accept-encoding': 'identity' }), signal }), [401, 503], signal)
        const edge = edgeReceipt(edgeResponse.response, edgeResponse.value)
        return Object.freeze({ surface: Object.freeze({ edge, flags }), deployment: Object.freeze({
          projectId: VERCEL_PROJECT_ID, project: VERCEL_PROJECT, teamId: VERCEL_TEAM_ID, scope: VERCEL_SCOPE,
          branch: STAGING_BRANCH, alias: STAGING_ALIAS, ...deployment,
        }) })
      } finally { disposed = true; token.fill(0); bypass.fill(0) }
    },
    dispose () { disposed = true; token.fill(0); bypass.fill(0) },
  })
}
