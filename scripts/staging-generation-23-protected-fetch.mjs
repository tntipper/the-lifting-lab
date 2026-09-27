/**
 * Disabled transport for the small set of protected Preview readiness reads.
 *
 * It deliberately knows no Vercel API, Supabase, Shopify, or production URL.
 * A reviewed caller supplies the immutable Preview URL obtained from the build
 * receipt.  The fixed branch alias is imported rather than accepted from the
 * caller, so neither a redirect nor a substituted hostname can receive the
 * Preview bypass.
 */
import { STAGING_ALIAS } from './staging-surface-activation-transport.mjs'

export const STAGING_GENERATION_23_PROTECTED_FETCH_ENABLED = false
export const STAGING_GENERATION_23_PROTECTED_READINESS_PATHS = Object.freeze([
  '/api/staging/readiness',
  '/api/staging/checkout-readiness',
  '/api/staging/variant-readiness',
])

const unavailable = () => { throw Error('Generation 23 protected Preview fetch unavailable') }
const MAX_RESPONSE_BYTES = 64 * 1024
const safeToken = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 1024
  && /^[\x21-\x7e]+$/.test(value.toString('utf8'))
const exactImmutable = value => typeof value === 'string'
  && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value) && value !== STAGING_ALIAS
const validSignal = value => value && typeof value === 'object' && typeof value.aborted === 'boolean'
  && typeof value.addEventListener === 'function' && typeof value.removeEventListener === 'function'
const cancelResponse = response => {
  try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}) } catch { /* ignore discarded reads */ }
}

async function copyBoundedBody (response, signal) {
  if (!response.body) return null
  if (typeof response.body.getReader !== 'function') unavailable()
  const length = response.headers?.get?.('content-length')
  const encoding = response.headers?.get?.('content-encoding')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)
    || encoding !== null && encoding !== '' && encoding !== 'identity') unavailable()
  const reader = response.body.getReader(), chunks = []
  let size = 0; let aborted = false
  const onAbort = () => { aborted = true; try { void reader.cancel() } catch {} }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    while (true) {
      const item = await reader.read()
      if (aborted || signal.aborted || !item || typeof item.done !== 'boolean') unavailable()
      if (item.done) break
      if (!(item.value instanceof Uint8Array) || size + item.value.byteLength > MAX_RESPONSE_BYTES) {
        item.value?.fill?.(0); unavailable()
      }
      const copy = Buffer.from(item.value)
      item.value.fill(0); chunks.push(copy); size += copy.byteLength
    }
    return Buffer.concat(chunks, size)
  } catch { unavailable() } finally {
    signal.removeEventListener('abort', onAbort)
    if (aborted || signal.aborted) cancelResponse(response)
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

function approvedUrl (value, immutableUrl) {
  let url
  try { url = new URL(value) } catch { unavailable() }
  const permittedOrigins = new Set([immutableUrl, STAGING_ALIAS])
  if (!permittedOrigins.has(url.origin) || !STAGING_GENERATION_23_PROTECTED_READINESS_PATHS.includes(url.pathname)
    || url.search || url.hash || url.username || url.password || url.port) unavailable()
  return url
}

function safeHeaders (headers, bypass) {
  const requested = new Headers(headers ?? {})
  const deploymentId = requested.get('x-tll-deployment-id')
  if (deploymentId !== null && !/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) unavailable()
  const result = new Headers({ accept: 'application/json', 'accept-encoding': 'identity',
    'x-vercel-protection-bypass': bypass.toString('utf8') })
  if (deploymentId !== null) result.set('x-tll-deployment-id', deploymentId)
  return result
}

/**
 * Returns an injected fetch-compatible function that permits only up to three
 * GET/HEAD readiness reads against the immutable Preview and its fixed alias.
 * Replies are fully copied before the internal request is cancelled, so a
 * caller cannot accidentally parse a body attached to the bypass-bearing
 * request. The caller owns parsing and the higher-level one-use journal.
 */
export function createStagingGeneration23ProtectedFetch ({ fetch: fetcher, bypass, immutableUrl,
  timeoutMs = 10_000, maxReads = 3 } = {}) {
  if (!STAGING_GENERATION_23_PROTECTED_FETCH_ENABLED || typeof fetcher !== 'function'
    || !safeToken(bypass) || !exactImmutable(immutableUrl) || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1 || timeoutMs > 10_000 || !Number.isSafeInteger(maxReads) || maxReads < 1 || maxReads > 3) unavailable()
  const owned = Buffer.from(bypass)
  let reads = 0; let disposed = false
  const retire = () => { if (!disposed) { disposed = true; owned.fill(0) } }
  return Object.freeze({
    async fetch (value, options = {}) {
      if (disposed || reads >= maxReads || !options || typeof options !== 'object'
        || !validSignal(options.signal) || options.signal.aborted || options.body !== undefined
        || !['GET', 'HEAD'].includes(options.method ?? 'GET')) unavailable()
      const url = approvedUrl(value, immutableUrl)
      reads += 1
      const controller = new AbortController()
      let interrupted = false
      const forward = () => { interrupted = true; controller.abort() }
      options.signal.addEventListener('abort', forward, { once: true })
      const timer = setTimeout(forward, timeoutMs)
      let pending
      try {
        pending = Promise.resolve().then(() => fetcher(url.href, Object.freeze({ method: options.method ?? 'GET',
          redirect: 'error', cache: 'no-store', credentials: 'omit', headers: safeHeaders(options.headers, owned),
          signal: controller.signal })))
        void pending.then(response => { if (controller.signal.aborted) cancelResponse(response) }, () => {})
        const response = await Promise.race([
          pending,
          new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })),
        ])
        if (controller.signal.aborted || !response || response.redirected === true
          || typeof response.url === 'string' && response.url !== '' && response.url !== url.href) {
          cancelResponse(response); unavailable()
        }
        const body = await copyBoundedBody(response, controller.signal)
        if (controller.signal.aborted) unavailable()
        return new Response(body, { status: response.status, statusText: response.statusText,
          headers: new Headers(response.headers) })
      } catch { retire(); unavailable() } finally {
        if (interrupted) retire()
        controller.abort(); clearTimeout(timer); options.signal.removeEventListener('abort', forward)
      }
    },
    dispose: retire,
  })
}
