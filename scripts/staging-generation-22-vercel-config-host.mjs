/** Disabled, injected-only Vercel host for four OFF staging Preview controls. */
import { HOSTED_BASELINE_VERCEL_TARGET } from './staging-account-hosted-baseline-vercel.mjs'
import { ACTIVE_WINDOW_EXPIRES_AT } from './staging-generation-22-credentials.mjs'
import { consumeStagingGeneration22OperationCapability } from './staging-generation-22-journal.mjs'
import { DISABLED_VERCEL_CONFIGURATION } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_22_VERCEL_CONFIG_HOST_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 Vercel config host unavailable') }
const API_URL = `https://api.vercel.com/v10/projects/${HOSTED_BASELINE_VERCEL_TARGET.projectId}/env?teamId=${HOSTED_BASELINE_VERCEL_TARGET.teamId}`
const MAX_RESPONSE_BYTES = 65_536
const ID = /^[A-Za-z0-9_-]{4,128}$/
function responseCreated(value, name) {
  const created = value?.created
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !Array.isArray(value.failed) || value.failed.length !== 0
    || !created || typeof created !== 'object' || Array.isArray(created)
    || !ID.test(created.id) || created.key !== name
    || created.gitBranch !== HOSTED_BASELINE_VERCEL_TARGET.branch
    || !(created.target === 'preview' || (Array.isArray(created.target)
      && created.target.length === 1 && created.target[0] === 'preview'))
    || created.type !== 'encrypted' || created.visibility !== 'config') unavailable()
  return Object.freeze({ status: 'STAGED', name, id: created.id, branch: HOSTED_BASELINE_VERCEL_TARGET.branch,
    target: 'preview', classification: 'config' })
}

function abortRace(pending, signal) {
  if (signal.aborted) return Promise.reject(new Error('aborted'))
  let onAbort
  const aborted = new Promise((_, reject) => { onAbort = () => reject(new Error('aborted')) })
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  return Promise.race([pending, aborted]).finally(() => signal.removeEventListener('abort', onAbort))
}

async function boundedJson(response, signal) {
  if (!response?.body?.getReader) unavailable()
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      if (signal.aborted) unavailable()
      const pending = Promise.resolve().then(() => reader.read())
      void pending.then(item => {
        try { if (signal.aborted && item?.value instanceof Uint8Array) item.value.fill(0) } catch {}
      }, () => {})
      const item = await abortRace(pending, signal)
      if (signal.aborted || !item || typeof item.done !== 'boolean') unavailable()
      if (item.done) break
      if (!(item.value instanceof Uint8Array) || size + item.value.byteLength > MAX_RESPONSE_BYTES) unavailable()
      size += item.value.byteLength
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

export function createStagingGeneration22VercelConfigHost({ fetch: fetcher, token, now = Date.now,
  requestTimeoutMs = 20_000 } = {}) {
  if (!STAGING_GENERATION_22_VERCEL_CONFIG_HOST_ENABLED || typeof fetcher !== 'function'
    || !Buffer.isBuffer(token) || token.length < 8 || token.length > 1024
    || !/^[\x21-\x7e]+$/.test(token.toString('utf8')) || typeof now !== 'function'
    || !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 20_000) unavailable()
  const ownedToken = Buffer.from(token), dispatched = new Set()
  let disposed = false
  return Object.freeze({
    async stageDisabled({ name, value, capability, signal } = {}) {
      if (disposed || !Object.hasOwn(DISABLED_VERCEL_CONFIGURATION, name) || dispatched.has(name)
        || value !== DISABLED_VERCEL_CONFIGURATION[name] || !signal || signal.aborted
        || typeof signal.addEventListener !== 'function'
        || now() >= Date.parse(ACTIVE_WINDOW_EXPIRES_AT)) unavailable()
      const body = JSON.stringify({ key: name, value, type: 'encrypted', visibility: 'config',
        target: ['preview'], gitBranch: HOSTED_BASELINE_VERCEL_TARGET.branch })
      consumeStagingGeneration22OperationCapability(capability, `VERCEL_DISABLED:${name}`)
      dispatched.add(name)
      const controller = new AbortController()
      const forwardAbort = () => controller.abort()
      signal.addEventListener('abort', forwardAbort, { once: true })
      const timeout = setTimeout(() => controller.abort(),
        Math.min(requestTimeoutMs, Math.max(1, Date.parse(ACTIVE_WINDOW_EXPIRES_AT) - now())))
      let onAbort, response
      const aborted = new Promise((_, reject) => {
        onAbort = () => reject(new Error('Vercel request aborted'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
      })
      try {
        if (signal.aborted || now() >= Date.parse(ACTIVE_WINDOW_EXPIRES_AT)) unavailable()
        const pendingFetch = Promise.resolve().then(() => {
          if (controller.signal.aborted) unavailable()
          return fetcher(API_URL,
            { method: 'POST', redirect: 'error', headers: { authorization: `Bearer ${ownedToken.toString('utf8')}`,
              accept: 'application/json', 'content-type': 'application/json', 'accept-encoding': 'identity' },
              body, signal: controller.signal })
        })
        void pendingFetch.then(late => {
          if (controller.signal.aborted) { try { Promise.resolve(late?.body?.cancel?.()).catch(() => {}) } catch {} }
        }, () => {})
        response = await Promise.race([pendingFetch, aborted])
        if (controller.signal.aborted || !response || response.status !== 201 || response.redirected === true
          || (response.url && response.url !== API_URL)) unavailable()
        const length = response.headers?.get?.('content-length')
        const encoding = response.headers?.get?.('content-encoding')
        if (length != null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)
          || (encoding != null && encoding !== '' && encoding !== 'identity')) unavailable()
        const payload = await Promise.race([boundedJson(response, controller.signal), aborted])
        if (controller.signal.aborted || now() >= Date.parse(ACTIVE_WINDOW_EXPIRES_AT)) unavailable()
        return responseCreated(payload, name)
      } catch { unavailable() }
      finally {
        clearTimeout(timeout)
        signal.removeEventListener('abort', forwardAbort)
        controller.signal.removeEventListener('abort', onAbort)
        if (controller.signal.aborted) { try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}) } catch {} }
      }
    },
    dispose() { if (disposed) return; disposed = true; ownedToken.fill(0) },
  })
}
