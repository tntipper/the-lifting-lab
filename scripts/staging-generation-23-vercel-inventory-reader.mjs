/** Disabled one-read Vercel inventory: return only five staging password IDs. */
import { HOSTED_BASELINE_VERCEL_TARGET } from './staging-account-hosted-baseline-vercel.mjs'
import { selectStagingGeneration23VercelPasswordTargets } from './staging-generation-23-vercel-targets.mjs'

export const STAGING_GENERATION_23_VERCEL_INVENTORY_READER_ENABLED = false
const URL = `https://api.vercel.com/v10/projects/${HOSTED_BASELINE_VERCEL_TARGET.projectId}/env?limit=100&teamId=${HOSTED_BASELINE_VERCEL_TARGET.teamId}`
const MAX_RESPONSE_BYTES = 65_536
const unavailable = () => { throw new Error('Generation 23 Vercel inventory unavailable') }

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
      if (!(item.value instanceof Uint8Array)) unavailable()
      if (size + item.value.byteLength > MAX_RESPONSE_BYTES) { item.value.fill(0); unavailable() }
      size += item.value.byteLength
      chunks.push(Buffer.from(item.value)); item.value.fill(0)
    }
    const bytes = Buffer.concat(chunks, size)
    try { return JSON.parse(bytes.toString('utf8')) } finally { bytes.fill(0) }
  } finally {
    try { Promise.resolve(reader.cancel()).catch(() => {}) } catch {}
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

export function createStagingGeneration23VercelInventoryReader({ fetch: fetcher, token,
  requestTimeoutMs = 20_000 } = {}) {
  if (!STAGING_GENERATION_23_VERCEL_INVENTORY_READER_ENABLED || typeof fetcher !== 'function'
    || !Buffer.isBuffer(token) || token.length < 8 || token.length > 1024
    || !/^[\x21-\x7e]+$/.test(token.toString('utf8'))
    || !Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 20_000) unavailable()
  const ownedToken = Buffer.from(token)
  let used = false, disposed = false
  return Object.freeze({
    async readTargets({ signal } = {}) {
      if (used || disposed || !signal || signal.aborted
        || typeof signal.addEventListener !== 'function') unavailable()
      used = true
      const controller = new AbortController()
      const forwardAbort = () => controller.abort()
      signal.addEventListener('abort', forwardAbort, { once: true })
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
      let response
      try {
        const pending = Promise.resolve().then(() => {
          if (controller.signal.aborted) unavailable()
          return fetcher(URL, { method: 'GET', redirect: 'error',
            headers: { authorization: `Bearer ${ownedToken.toString('utf8')}`,
              accept: 'application/json', 'accept-encoding': 'identity' },
            signal: controller.signal })
        })
        void pending.then(late => {
          if (controller.signal.aborted) { try { Promise.resolve(late?.body?.cancel?.()).catch(() => {}) } catch {} }
        }, () => {})
        response = await abortRace(pending, controller.signal)
        if (controller.signal.aborted || !response || response.status !== 200
          || response.redirected === true || (response.url && response.url !== URL)
          || !/^application\/json(?:;|$)/i.test(String(response.headers?.get?.('content-type') ?? ''))) unavailable()
        const length = response.headers?.get?.('content-length')
        const encoding = response.headers?.get?.('content-encoding')
        if (length != null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)
          || (encoding != null && encoding !== '' && encoding !== 'identity')) unavailable()
        const raw = await abortRace(boundedJson(response, controller.signal), controller.signal)
        if (controller.signal.aborted) unavailable()
        return selectStagingGeneration23VercelPasswordTargets(raw)
      } catch { unavailable() }
      finally {
        controller.abort(); clearTimeout(timer)
        signal.removeEventListener('abort', forwardAbort)
        if (controller.signal.aborted) { try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}) } catch {} }
      }
    },
    dispose() { if (disposed) return; disposed = true; ownedToken.fill(0) },
  })
}
