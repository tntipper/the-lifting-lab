/**
 * Read-only, injected-only Vercel evidence binding for the staging baseline.
 *
 * This module has no credential discovery, launcher, environment access or
 * ambient network capability.  A later reviewed launcher must inject both the
 * narrow fetch primitive and a private token buffer.
 */
import { BROKER_SECRET_NAME } from './staging-provider-broker-rotation.mjs'
import { STAGING_BRANCH } from './staging-surface-activation-transport.mjs'
import {
  VERCEL_PROJECT,
  VERCEL_PROJECT_ID,
  VERCEL_SCOPE,
  VERCEL_TEAM_ID,
} from './staging-surface-activation-native-binding.mjs'

export const HOSTED_BASELINE_VERCEL_BINDING_ENABLED = false
export const HOSTED_BASELINE_VERCEL_ERROR = 'Staging hosted baseline Vercel binding unavailable'
export const HOSTED_BASELINE_VERCEL_TARGET = Object.freeze({
  projectId: VERCEL_PROJECT_ID,
  project: VERCEL_PROJECT,
  scope: VERCEL_SCOPE,
  teamId: VERCEL_TEAM_ID,
  githubOrg: 'tntipper',
  githubRepository: 'the-lifting-lab',
  githubFullName: 'tntipper/the-lifting-lab',
  githubProductionBranch: 'main',
  environment: 'preview',
  branch: STAGING_BRANCH,
})

const API = 'https://api.vercel.com'
const MAX_RESPONSE_BYTES = 64 * 1024
const MAX_ENVIRONMENTS = 4_096
const ENVIRONMENT_PAGE_LIMIT = 100
const SAFE_TEXT = /^[\x21-\x7e]{1,512}$/
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,255}$/
const ENV_TYPES = new Set(['encrypted', 'plain', 'secret', 'sensitive', 'system'])
const GITHUB_ORG = HOSTED_BASELINE_VERCEL_TARGET.githubOrg
const GITHUB_REPOSITORY = HOSTED_BASELINE_VERCEL_TARGET.githubRepository
const GITHUB_PRODUCTION_BRANCH = HOSTED_BASELINE_VERCEL_TARGET.githubProductionBranch
const PROJECT_URL = `${API}/v9/projects/${VERCEL_PROJECT_ID}?teamId=${VERCEL_TEAM_ID}`
// Vercel's documented endpoint is paginated. A fixed maximum page is the only
// page accepted here, and a non-terminal cursor fails rather than implying an
// absence from a partial inventory.
const ENVIRONMENT_URL = `${API}/v10/projects/${VERCEL_PROJECT_ID}/env?target=preview&gitBranch=codex%2Ftll-integration&limit=${ENVIRONMENT_PAGE_LIMIT}&teamId=${VERCEL_TEAM_ID}`
const discardedResponses = new WeakSet()

const unavailable = () => { throw new Error(HOSTED_BASELINE_VERCEL_ERROR) }
const safeString = value => typeof value === 'string' && SAFE_TEXT.test(value)

function validSignal (signal) {
  return signal && typeof signal === 'object' && typeof signal.aborted === 'boolean'
    && typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function'
}

function copyToken (value) {
  if (!Buffer.isBuffer(value) || value.length < 8 || value.length > 1024 || value.includes(0)) unavailable()
  const copy = Buffer.from(value)
  if (!safeString(copy.toString('utf8'))) { copy.fill(0); unavailable() }
  return copy
}

function discardBody (response) {
  if (!response || typeof response !== 'object' || discardedResponses.has(response)) return
  discardedResponses.add(response)
  try {
    const body = response.body
    if (!body) return
    if (typeof body.getReader === 'function') {
      const reader = body.getReader()
      try { Promise.resolve(reader.cancel()).catch(() => {}) } finally { try { reader.releaseLock() } catch {} }
      return
    }
    if (typeof body.cancel === 'function') Promise.resolve(body.cancel()).catch(() => {})
  } catch {}
}

function rejectResponse (response) {
  discardBody(response)
  unavailable()
}

function validateResponse (response, url) {
  try {
    if (!response || typeof response !== 'object' || response.status !== 200 || response.redirected === true
      || (typeof response.url === 'string' && response.url !== '' && response.url !== url)
      || !response.body || typeof response.body.getReader !== 'function') rejectResponse(response)
    const contentLength = response.headers?.get?.('content-length')
    if (contentLength !== null && contentLength !== undefined
      && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_RESPONSE_BYTES)) rejectResponse(response)
    const contentEncoding = response.headers?.get?.('content-encoding')
    if (contentEncoding !== null && contentEncoding !== undefined && contentEncoding !== '' && contentEncoding !== 'identity') rejectResponse(response)
  } catch { rejectResponse(response) }
}

async function parseBoundedJson (response, url, signal) {
  let reader
  const chunks = []
  let size = 0
  let bodyCancelled = false
  const cancelBody = () => {
    if (bodyCancelled) return
    bodyCancelled = true
    try { if (reader) Promise.resolve(reader.cancel()).catch(() => {}) } catch {}
  }
  let abort
  const aborted = new Promise(resolve => { abort = () => resolve('ABORTED') })
  try {
    validateResponse(response, url)
    reader = response.body.getReader()
    signal.addEventListener('abort', abort, { once: true })
    // A fetch implementation may resolve after cancellation. Listening alone is
    // insufficient because AbortSignal does not replay an already-fired event.
    if (signal.aborted) {
      cancelBody()
      unavailable()
    }
    while (true) {
      const pending = Promise.resolve().then(() => reader.read())
      // A reader can resolve after cancellation wins this race. Its bytes are
      // still ours to clean, even though they will never be parsed.
      void pending.then(item => {
        try {
          if (signal.aborted && item?.value instanceof Uint8Array) item.value.fill(0)
        } catch {}
      }, () => {}).catch(() => {})
      const item = await Promise.race([pending, aborted])
      if (item === 'ABORTED' || signal.aborted) {
        cancelBody()
        unavailable()
      }
      if (!item || typeof item.done !== 'boolean') unavailable()
      if (item.done) break
      if (!(item.value instanceof Uint8Array)) unavailable()
      size += item.value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        item.value.fill(0)
        cancelBody()
        unavailable()
      }
      const copy = Buffer.from(item.value)
      item.value.fill(0)
      chunks.push(copy)
    }
    const bytes = Buffer.concat(chunks, size)
    try { return JSON.parse(bytes.toString('utf8')) } finally { bytes.fill(0) }
  } catch {
    cancelBody()
    unavailable()
  } finally {
    try { signal.removeEventListener('abort', abort) } catch {}
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

function positiveInteger (value) {
  return Number.isSafeInteger(value) && value > 0
}

function projectReceipt (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.id !== VERCEL_PROJECT_ID || value.name !== VERCEL_PROJECT || value.accountId !== VERCEL_TEAM_ID
    || !value.link || typeof value.link !== 'object' || Array.isArray(value.link)) unavailable()
  const link = value.link
  if (link.type !== 'github' || !positiveInteger(link.repoId) || !positiveInteger(link.repoOwnerId)
    || link.org !== GITHUB_ORG || link.repo !== GITHUB_REPOSITORY || link.productionBranch !== GITHUB_PRODUCTION_BRANCH
    || typeof link.sourceless !== 'boolean') unavailable()
  return Object.freeze({
    target: HOSTED_BASELINE_VERCEL_TARGET,
    repository: Object.freeze({
      provider: 'github',
      repoId: link.repoId,
      org: link.org,
      repo: link.repo,
      ownerId: link.repoOwnerId,
      productionBranch: link.productionBranch,
      sourceless: link.sourceless,
    }),
  })
}

function exactPreviewTarget (value) {
  return value === 'preview' || (Array.isArray(value) && value.length === 1 && value[0] === 'preview')
}

function environmentReceipt (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.envs)
    || value.envs.length > MAX_ENVIRONMENTS) unavailable()
  // Vercel omits pagination when fewer records than the requested limit exist.
  // A full page without a cursor is ambiguous, so it cannot prove absence.
  if (Object.hasOwn(value, 'pagination')) {
    if (!value.pagination || typeof value.pagination !== 'object' || Array.isArray(value.pagination)
      || !Object.hasOwn(value.pagination, 'next') || value.pagination.next !== null) unavailable()
  } else if (value.envs.length >= ENVIRONMENT_PAGE_LIMIT) unavailable()
  let brokerSecretPresent = false
  for (const item of value.envs) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !ENV_NAME.test(item.key)
      || item.gitBranch !== STAGING_BRANCH || !exactPreviewTarget(item.target) || !ENV_TYPES.has(item.type)) unavailable()
    // Values, IDs, timestamps and other additive provider fields are intentionally
    // neither inspected nor returned. The only baseline evidence is presence.
    if (item.key === BROKER_SECRET_NAME) brokerSecretPresent = true
  }
  return Object.freeze({
    target: HOSTED_BASELINE_VERCEL_TARGET,
    environment: 'preview',
    branch: STAGING_BRANCH,
    brokerSecretPresent,
  })
}

/**
 * Return closed, read-only Vercel baseline operations. Every call accepts the
 * same caller-owned abort signal and can request only one fixed endpoint.
 */
export function createStagingAccountHostedBaselineVercelBinding ({ fetch: fetcher, vercelToken } = {}) {
  if (typeof fetcher !== 'function') unavailable()
  const token = copyToken(vercelToken)
  let disposed = false
  const read = async (url, signal) => {
    if (disposed || !validSignal(signal) || signal.aborted) unavailable()
    let abort
    const aborted = new Promise(resolve => { abort = () => resolve(true) })
    signal.addEventListener('abort', abort, { once: true })
    let pending
    let abandoned = false
    try {
      if (disposed || signal.aborted) unavailable()
      pending = Promise.resolve().then(() => fetcher(url, Object.freeze({
        method: 'GET',
        redirect: 'error',
        headers: Object.freeze({ accept: 'application/json', 'accept-encoding': 'identity', authorization: `Bearer ${token.toString('utf8')}` }),
        signal,
      })))
      pending.then(response => { if (abandoned || disposed || signal.aborted) discardBody(response) }, () => {})
      const response = await Promise.race([pending, aborted])
      if (response === true || disposed || signal.aborted) {
        abandoned = true
        pending.then(discardBody, () => {})
        unavailable()
      }
      return parseBoundedJson(response, url, signal)
    } catch { unavailable() } finally {
      try { signal.removeEventListener('abort', abort) } catch {}
    }
  }
  return Object.freeze({
    async readProject ({ signal } = {}) { return projectReceipt(await read(PROJECT_URL, signal)) },
    async readPreviewEnvironmentPresence ({ signal } = {}) { return environmentReceipt(await read(ENVIRONMENT_URL, signal)) },
    async readBaseline ({ signal } = {}) {
      const project = projectReceipt(await read(PROJECT_URL, signal))
      const environment = environmentReceipt(await read(ENVIRONMENT_URL, signal))
      return Object.freeze({ project, environment })
    },
    dispose () {
      // Composition owns teardown ordering and calls this after its single
      // observation; this reader only makes later calls unavailable.
      if (disposed) return
      disposed = true
      token.fill(0)
    },
  })
}
