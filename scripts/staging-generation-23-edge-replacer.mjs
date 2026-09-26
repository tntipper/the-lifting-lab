/** Disabled, injected-only replacement of the staging broker Edge password. */
import { EDGE_PASSWORD_NAME, PROJECT_REF } from './staging-generation-23-password-material.mjs'

export const STAGING_GENERATION_23_EDGE_REPLACER_ENABLED = false
const URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`
const MAX_RESPONSE_BYTES = 65_536
const unavailable = () => { throw new Error('Generation 23 Edge replacement unavailable') }
const discard = response => { try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}) } catch {} }

function raceAbort(pending, signal) {
  if (signal.aborted) return Promise.reject(Error('aborted'))
  let onAbort
  const aborted = new Promise((_, reject) => { onAbort = () => reject(Error('aborted')) })
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  return Promise.race([pending, aborted]).finally(() => signal.removeEventListener('abort', onAbort))
}

async function emptySuccess(response, signal) {
  if (!response?.body) return
  if (!response.body.getReader) unavailable()
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      const pending = Promise.resolve().then(() => reader.read())
      void pending.then(item => {
        if (signal.aborted && item?.value instanceof Uint8Array) item.value.fill(0)
      }, () => {})
      const item = await raceAbort(pending, signal)
      if (signal.aborted || !item || typeof item.done !== 'boolean') unavailable()
      if (item.done) break
      if (!(item.value instanceof Uint8Array) || size + item.value.byteLength > MAX_RESPONSE_BYTES) {
        item.value?.fill?.(0); unavailable()
      }
      size += item.value.byteLength
      chunks.push(Buffer.from(item.value)); item.value.fill(0)
    }
    const bytes = Buffer.concat(chunks, size)
    try { if (size && bytes.toString('utf8').trim() !== '{}') unavailable() }
    finally { bytes.fill(0) }
  } finally {
    try { Promise.resolve(reader.cancel()).catch(() => {}) } catch {}
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

/** Caller must durably dispatch the Edge operation before stageSecret(). */
export function createStagingGeneration23EdgeReplacer({ fetch: fetcher, token, expiresAt,
  now = Date.now, timeoutMs = 20_000 } = {}) {
  if (!STAGING_GENERATION_23_EDGE_REPLACER_ENABLED || typeof fetcher !== 'function'
    || !Buffer.isBuffer(token) || token.length < 8 || token.length > 4096
    || !/^[\x21-\x7e]+$/.test(token.toString('utf8')) || typeof now !== 'function'
    || typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))
    || Date.parse(expiresAt) <= now() || Date.parse(expiresAt) - now() > 3_600_000
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20_000) unavailable()
  const ownedToken = Buffer.from(token)
  let used = false, disposed = false
  return Object.freeze({
    async stageSecret({ name, value, signal } = {}) {
      if (used || disposed || name !== EDGE_PASSWORD_NAME || typeof value !== 'string'
        || !/^[A-Za-z0-9_-]{64}$/.test(value) || !signal || signal.aborted
        || typeof signal.addEventListener !== 'function' || now() >= Date.parse(expiresAt)) unavailable()
      used = true
      const body = Buffer.from(JSON.stringify([{ name, value }]))
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(abort, Math.min(timeoutMs, Math.max(1, Date.parse(expiresAt) - now())))
      let response
      try {
        const pending = Promise.resolve().then(() => {
          if (controller.signal.aborted || now() >= Date.parse(expiresAt)) unavailable()
          return fetcher(URL, { method: 'POST', redirect: 'error',
            headers: { authorization: `Bearer ${ownedToken.toString('utf8')}`,
              accept: 'application/json', 'accept-encoding': 'identity',
              'content-type': 'application/json' }, body, signal: controller.signal })
        })
        void pending.then(late => { if (controller.signal.aborted) discard(late) }, () => {})
        response = await raceAbort(pending, controller.signal)
        if (controller.signal.aborted || response?.status !== 201 || response.redirected === true
          || (response.url && response.url !== URL)) unavailable()
        const length = response.headers?.get?.('content-length')
        const encoding = response.headers?.get?.('content-encoding')
        if (length != null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)
          || (encoding != null && encoding !== '' && encoding !== 'identity')) unavailable()
        await raceAbort(emptySuccess(response, controller.signal), controller.signal)
        if (controller.signal.aborted || now() >= Date.parse(expiresAt)) unavailable()
        return Object.freeze({ status: 'STAGED', name, projectRef: PROJECT_REF })
      } catch { unavailable() }
      finally {
        controller.abort(); clearTimeout(timer); signal.removeEventListener('abort', abort)
        discard(response); body.fill(0)
      }
    },
    dispose() { if (disposed) return; disposed = true; ownedToken.fill(0) },
  })
}
