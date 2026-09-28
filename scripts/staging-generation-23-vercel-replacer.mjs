/** One disabled, injected PATCH of an existing branch-only staging password Secret. */
import { HOSTED_BASELINE_VERCEL_TARGET } from './staging-account-hosted-baseline-vercel.mjs'
import { VERCEL_PASSWORD_NAMES } from './staging-generation-23-password-material.mjs'
import { validateStagingGeneration23VercelPatchReceipt } from './staging-generation-23-vercel-targets.mjs'

export const STAGING_GENERATION_23_VERCEL_REPLACER_ENABLED = true
const MAX_RESPONSE_BYTES = 65_536
const unavailable = () => { throw new Error('Generation 23 Vercel replacement unavailable') }
const validToken = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 1024
  && /^[\x21-\x7e]+$/.test(value.toString('utf8'))
const validTarget = value => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === 'branch|classification|id|name|target'
  && VERCEL_PASSWORD_NAMES.includes(value.name) && /^[A-Za-z0-9_-]{4,128}$/.test(value.id)
  && value.branch === HOSTED_BASELINE_VERCEL_TARGET.branch && value.target === 'preview'
  && value.classification === 'sensitive'
const discard = response => { try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}) } catch {} }

function raceAbort(pending, signal) {
  if (signal.aborted) return Promise.reject(Error('aborted'))
  let onAbort
  const aborted = new Promise((_, reject) => { onAbort = () => reject(Error('aborted')) })
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  return Promise.race([pending, aborted]).finally(() => signal.removeEventListener('abort', onAbort))
}

async function readBounded(response, signal) {
  if (!response?.body?.getReader) unavailable()
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
    try { return JSON.parse(bytes.toString('utf8')) } finally { bytes.fill(0) }
  } finally {
    try { Promise.resolve(reader.cancel()).catch(() => {}) } catch {}
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

/** Caller must durably record dispatch before invoking replace(). */
export function createStagingGeneration23VercelReplacer({ fetch: fetcher, token,
  timeoutMs = 20_000 } = {}) {
  if (!STAGING_GENERATION_23_VERCEL_REPLACER_ENABLED || typeof fetcher !== 'function'
    || !validToken(token) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20_000) unavailable()
  const ownedToken = Buffer.from(token)
  let used = false, disposed = false
  return Object.freeze({
    async replace(selected, password, { signal } = {}) {
      if (used || disposed || !validTarget(selected) || typeof password !== 'string'
        || !/^[A-Za-z0-9_-]{64}$/.test(password) || !signal || signal.aborted
        || typeof signal.addEventListener !== 'function') unavailable()
      used = true
      const url = `https://api.vercel.com/v9/projects/${HOSTED_BASELINE_VERCEL_TARGET.projectId}/env/${selected.id}?teamId=${HOSTED_BASELINE_VERCEL_TARGET.teamId}`
      const body = Buffer.from(JSON.stringify({ value: password }))
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(abort, timeoutMs)
      let response
      try {
        const pending = Promise.resolve().then(() => {
          if (controller.signal.aborted) unavailable()
          return fetcher(url, { method: 'PATCH', redirect: 'error',
            headers: { authorization: `Bearer ${ownedToken.toString('utf8')}`,
              accept: 'application/json', 'accept-encoding': 'identity',
              'content-type': 'application/json' }, body, signal: controller.signal })
        })
        void pending.then(late => { if (controller.signal.aborted) discard(late) }, () => {})
        response = await raceAbort(pending, controller.signal)
        if (controller.signal.aborted || response?.status !== 200 || response.redirected === true
          || (response.url && response.url !== url)
          || !/^application\/json(?:;|$)/i.test(String(response.headers?.get?.('content-type') ?? ''))) unavailable()
        const length = response.headers?.get?.('content-length')
        const encoding = response.headers?.get?.('content-encoding')
        if (length != null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)
          || (encoding != null && encoding !== '' && encoding !== 'identity')) unavailable()
        const value = await raceAbort(readBounded(response, controller.signal), controller.signal)
        if (controller.signal.aborted) unavailable()
        return validateStagingGeneration23VercelPatchReceipt(value, selected)
      } catch { unavailable() }
      finally {
        controller.abort(); clearTimeout(timer); signal.removeEventListener('abort', abort)
        discard(response); body.fill(0)
      }
    },
    dispose() { if (disposed) return; disposed = true; ownedToken.fill(0) },
  })
}
