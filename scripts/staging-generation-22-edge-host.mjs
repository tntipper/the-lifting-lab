/** Disabled, injected-only host for one staging Edge Function database password. */
import { ACTIVE_WINDOW_EXPIRES_AT } from './staging-generation-22-credentials.mjs'
import { consumeStagingGeneration22OperationCapability } from './staging-generation-22-journal.mjs'
import { MISSING_SUPABASE_SECRET_NAMES, PROJECT_REF } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_22_EDGE_HOST_ENABLED = false
const unavailable = () => { throw new Error('Generation 22 Edge host unavailable') }
const NAME = MISSING_SUPABASE_SECRET_NAMES[0]
const URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`
const PASSWORD = /^[A-Za-z0-9_-]{64}$/
const MAX_RESPONSE_BYTES = 65_536

function abortRace(pending, signal) {
  if (signal.aborted) return Promise.reject(new Error('aborted'))
  let onAbort
  const aborted = new Promise((_, reject) => { onAbort = () => reject(new Error('aborted')) })
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  return Promise.race([pending, aborted]).finally(() => signal.removeEventListener('abort', onAbort))
}

async function emptySuccess(response, signal) {
  if (!response?.body) return
  if (typeof response.body.getReader !== 'function') unavailable()
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
      if (!(item.value instanceof Uint8Array)) unavailable()
      if (size + item.value.byteLength > MAX_RESPONSE_BYTES) { item.value.fill(0); unavailable() }
      size += item.value.byteLength
      chunks.push(Buffer.from(item.value))
      item.value.fill(0)
    }
    const bytes = Buffer.concat(chunks, size)
    try {
      if (size && (bytes.toString('utf8').trim() !== '{}')) unavailable()
    } finally { bytes.fill(0) }
  } finally {
    try { Promise.resolve(reader.cancel()).catch(() => {}) } catch {}
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

export function createStagingGeneration22EdgeHost({ fetch: fetcher, token, now = Date.now,
  requestTimeoutMs = 20_000 } = {}) {
  if (!STAGING_GENERATION_22_EDGE_HOST_ENABLED || typeof fetcher !== 'function'
    || !Buffer.isBuffer(token) || token.length < 8 || token.length > 4096
    || !/^[\x21-\x7e]+$/.test(token.toString('utf8')) || typeof now !== 'function'
    || !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 20_000) unavailable()
  const ownedToken = Buffer.from(token)
  let disposed = false, dispatched = false
  return Object.freeze({
    async stageSecret({ name, value, capability, signal } = {}) {
      if (disposed || dispatched || name !== NAME || typeof value !== 'string' || !PASSWORD.test(value)
        || !signal || signal.aborted || typeof signal.addEventListener !== 'function'
        || now() >= Date.parse(ACTIVE_WINDOW_EXPIRES_AT)) unavailable()
      const body = JSON.stringify([{ name, value }])
      consumeStagingGeneration22OperationCapability(capability, `SUPABASE_EDGE:${NAME}`)
      dispatched = true
      const controller = new AbortController()
      const forwardAbort = () => controller.abort()
      signal.addEventListener('abort', forwardAbort, { once: true })
      const timeout = setTimeout(() => controller.abort(),
        Math.min(requestTimeoutMs, Math.max(1, Date.parse(ACTIVE_WINDOW_EXPIRES_AT) - now())))
      let onAbort, response
      const aborted = new Promise((_, reject) => {
        onAbort = () => reject(new Error('Edge request aborted'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
      })
      try {
        if (signal.aborted || now() >= Date.parse(ACTIVE_WINDOW_EXPIRES_AT)) unavailable()
        const pendingFetch = Promise.resolve().then(() => {
          if (controller.signal.aborted) unavailable()
          return fetcher(URL, { method: 'POST', redirect: 'error',
            headers: { authorization: `Bearer ${ownedToken.toString('utf8')}`, accept: 'application/json',
              'content-type': 'application/json', 'accept-encoding': 'identity' }, body, signal: controller.signal })
        })
        void pendingFetch.then(late => {
          if (controller.signal.aborted) { try { Promise.resolve(late?.body?.cancel?.()).catch(() => {}) } catch {} }
        }, () => {})
        response = await Promise.race([pendingFetch, aborted])
        if (controller.signal.aborted || !response || response.status !== 201 || response.redirected === true
          || (response.url && response.url !== URL)) unavailable()
        const length = response.headers?.get?.('content-length')
        const encoding = response.headers?.get?.('content-encoding')
        if (length != null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)
          || (encoding != null && encoding !== '' && encoding !== 'identity')) unavailable()
        await Promise.race([emptySuccess(response, controller.signal), aborted])
        if (controller.signal.aborted || now() >= Date.parse(ACTIVE_WINDOW_EXPIRES_AT)) unavailable()
        return Object.freeze({ status: 'STAGED', name, projectRef: PROJECT_REF })
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
