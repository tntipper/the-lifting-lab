/** Disabled, injected-only Vercel host for the staging broker secret. */
import {
  BROKER_SECRET_NAME,
  STAGING_PROVIDER_TARGET,
} from './staging-provider-broker-rotation.mjs'
import {
  HOSTED_BASELINE_VERCEL_TARGET,
  createStagingAccountHostedBaselineVercelBinding,
} from './staging-account-hosted-baseline-vercel.mjs'

export const STAGING_BROKER_VERCEL_REST_HOST_ENABLED = false
const unavailable = () => { throw new Error('Staging broker Vercel REST host unavailable') }
const MAX_RESPONSE_BYTES = 64 * 1024
const BASE = `https://api.vercel.com`
const CREATE_URL = `${BASE}/v10/projects/${HOSTED_BASELINE_VERCEL_TARGET.projectId}/env?teamId=${HOSTED_BASELINE_VERCEL_TARGET.teamId}`
const DELETE_BASE = `${BASE}/v9/projects/${HOSTED_BASELINE_VERCEL_TARGET.projectId}/env/`
const DELETE_QUERY = `?teamId=${HOSTED_BASELINE_VERCEL_TARGET.teamId}`
const ENV_ID = /^[A-Za-z0-9_-]{4,128}$/
const MATERIAL = /^[\x21-\x7e]{32,512}$/

function exactTarget (target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)
    || Object.keys(target).sort().join('|') !== Object.keys(STAGING_PROVIDER_TARGET).sort().join('|')) unavailable()
  for (const [key, value] of Object.entries(STAGING_PROVIDER_TARGET)) if (target[key] !== value) unavailable()
}

function validSignal (signal) {
  return signal && typeof signal.aborted === 'boolean' && typeof signal.addEventListener === 'function'
    && typeof signal.removeEventListener === 'function' && !signal.aborted
}

function discard (response) {
  try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}) } catch {}
}

function safeResponse (response, url, status) {
  if (!response || response.status !== status || response.redirected === true
    || (response.url && response.url !== url) || !response.body?.getReader) unavailable()
  const length = response.headers?.get?.('content-length')
  if (length != null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) unavailable()
  const encoding = response.headers?.get?.('content-encoding')
  if (encoding != null && encoding !== '' && encoding !== 'identity') unavailable()
}

async function boundedJson (response, signal) {
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      if (signal.aborted) unavailable()
      const pending = Promise.resolve().then(() => reader.read())
      void pending.then(item => {
        try { if (signal.aborted && item?.value instanceof Uint8Array) item.value.fill(0) } catch {}
      }, () => {})
      const item = await abortRace(pending, signal)
      if (signal.aborted) unavailable()
      if (!item || typeof item.done !== 'boolean') unavailable()
      if (item.done) break
      if (!(item.value instanceof Uint8Array)) unavailable()
      size += item.value.byteLength
      if (size > MAX_RESPONSE_BYTES) unavailable()
      chunks.push(Buffer.from(item.value))
      item.value.fill(0)
    }
    const bytes = Buffer.concat(chunks, size)
    try { return JSON.parse(bytes.toString('utf8')) } finally { bytes.fill(0) }
  } finally {
    try { Promise.resolve(reader.cancel()).catch(() => {}) } catch {}
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

function abortRace (pending, signal) {
  if (signal.aborted) return Promise.reject(new Error('aborted'))
  let abort
  const interrupted = new Promise((_, reject) => { abort = () => reject(new Error('aborted')) })
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  return Promise.race([pending, interrupted]).finally(() => signal.removeEventListener('abort', abort))
}

function createdId (value) {
  const created = value?.created
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.failed)
    || value.failed.length !== 0 || !created || typeof created !== 'object' || Array.isArray(created)
    || !ENV_ID.test(created.id) || created.key !== BROKER_SECRET_NAME
    || created.gitBranch !== STAGING_PROVIDER_TARGET.branch
    || !(created.target === 'preview' || (Array.isArray(created.target) && created.target.length === 1 && created.target[0] === 'preview'))
    || created.type !== 'sensitive' || created.visibility !== 'secret') unavailable()
  return created.id
}

function removedId (value, expected) {
  const item = Array.isArray(value) && value.length === 1 ? value[0] : value
  if (!item || typeof item !== 'object' || Array.isArray(item)
    || item.id !== expected || item.key !== BROKER_SECRET_NAME
    || item.gitBranch !== STAGING_PROVIDER_TARGET.branch
    || !(item.target === 'preview' || (Array.isArray(item.target)
      && item.target.length === 1 && item.target[0] === 'preview'))) unavailable()
}

/**
 * The worker stopper must synchronously kill the whole supervised group.
 * A returned or throwing test stopper still leaves this promise unsettled,
 * preventing the rotation coordinator from starting automatic cleanup.
 */
async function uncertain (stopWorkerGroup) {
  try { stopWorkerGroup() } catch {}
  return new Promise(() => {})
}

export function createStagingProviderBrokerVercelRestHost({ fetch: fetcher, vercelToken, stopWorkerGroup } = {}) {
  if (typeof fetcher !== 'function' || typeof stopWorkerGroup !== 'function'
    || !Buffer.isBuffer(vercelToken) || vercelToken.length < 8 || vercelToken.length > 1024
    || !/^[\x21-\x7e]+$/.test(vercelToken.toString('utf8'))) unavailable()
  const token = Buffer.from(vercelToken)
  const reader = createStagingAccountHostedBaselineVercelBinding({ fetch: fetcher, vercelToken: token })
  let disposed = false
  let id = null
  let dispatched = false
  let removalDispatched = false

  const mutate = async (url, options, expectedStatus) => {
    // Everything capable of a local validation error is constructed before dispatch.
    if (disposed || !validSignal(options.signal)) unavailable()
    let response
    try {
      dispatched = true
      const pending = Promise.resolve(fetcher(url, options))
      void pending.then(late => { if (options.signal.aborted) discard(late) }, () => {})
      response = await abortRace(pending, options.signal)
      if (options.signal.aborted || disposed) return uncertain(stopWorkerGroup)
      safeResponse(response, url, expectedStatus)
      const value = await boundedJson(response, options.signal)
      if (options.signal.aborted || disposed) return uncertain(stopWorkerGroup)
      return value
    } catch {
      discard(response)
      return uncertain(stopWorkerGroup)
    }
  }

  return Object.freeze({
    async readNames(target, { signal } = {}) {
      exactTarget(target)
      if (disposed || !validSignal(signal)) unavailable()
      const receipt = await reader.readPreviewEnvironmentPresence({ signal })
      if (receipt.target !== HOSTED_BASELINE_VERCEL_TARGET || receipt.branch !== STAGING_PROVIDER_TARGET.branch) unavailable()
      return Object.freeze(receipt.brokerSecretPresent ? [BROKER_SECRET_NAME] : [])
    },
    async stage(target, name, material, { signal } = {}) {
      exactTarget(target)
      if (name !== BROKER_SECRET_NAME || disposed || dispatched || !validSignal(signal)
        || !Buffer.isBuffer(material) || !MATERIAL.test(material.toString('utf8'))) unavailable()
      const body = JSON.stringify({ key: BROKER_SECRET_NAME, value: material.toString('utf8'),
        type: 'sensitive', visibility: 'secret', target: ['preview'], gitBranch: STAGING_PROVIDER_TARGET.branch })
      const payload = await mutate(CREATE_URL, Object.freeze({ method: 'POST', redirect: 'error',
        headers: Object.freeze({ authorization: `Bearer ${token.toString('utf8')}`, accept: 'application/json',
          'accept-encoding': 'identity', 'content-type': 'application/json' }), body, signal }), 201)
      try { id = createdId(payload) } catch { return uncertain(stopWorkerGroup) }
      if (signal.aborted || disposed) return uncertain(stopWorkerGroup)
      return Object.freeze({ status: 'STAGED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME })
    },
    async remove(target, name, { signal } = {}) {
      exactTarget(target)
      if (name !== BROKER_SECRET_NAME || disposed || !id || removalDispatched || !validSignal(signal)) unavailable()
      removalDispatched = true
      const url = `${DELETE_BASE}${id}${DELETE_QUERY}`
      const deleted = await mutate(url, Object.freeze({ method: 'DELETE', redirect: 'error',
        headers: Object.freeze({ authorization: `Bearer ${token.toString('utf8')}`,
          accept: 'application/json', 'accept-encoding': 'identity' }), signal }), 200)
      try { removedId(deleted, id) } catch { return uncertain(stopWorkerGroup) }
      if (signal.aborted || disposed) return uncertain(stopWorkerGroup)
      id = null
      return Object.freeze({ status: 'REMOVED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME })
    },
    dispose() {
      if (disposed) return
      disposed = true
      token.fill(0)
      reader.dispose()
    },
  })
}
