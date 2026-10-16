/** Disabled single-read proof of the fifth switch on one protected immutable Preview. */
import { STAGING_BRANCH, STAGING_PROJECT_REF, STAGING_ALIAS } from './staging-surface-activation-transport.mjs'

export const STAGING_GENERATION_23_CHECKOUT_READINESS_READER_ENABLED = false
const unavailable = () => { throw Error('Generation 23 checkout readiness unavailable') }
const MAX_BYTES = 4096
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const validToken = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 1024
  && /^[\x21-\x7e]+$/.test(value.toString('utf8'))

function raceAbort(pending, signal) {
  if (signal.aborted) return Promise.reject(Error('aborted'))
  let onAbort
  const aborted = new Promise((_, reject) => { onAbort = () => reject(Error('aborted')) })
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  return Promise.race([pending, aborted]).finally(() => signal.removeEventListener('abort', onAbort))
}

/** The caller must separately prove Vercel login protection and alias identity. */
export function createStagingGeneration23CheckoutReadinessReader({ fetch: fetcher, bypass,
  deploymentId, immutableUrl, timeoutMs = 10_000 } = {}) {
  if (!STAGING_GENERATION_23_CHECKOUT_READINESS_READER_ENABLED || typeof fetcher !== 'function'
    || !validToken(bypass) || !/^dpl_[A-Za-z0-9]+$/.test(deploymentId ?? '')
    || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(immutableUrl ?? '')
    || immutableUrl === STAGING_ALIAS || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1 || timeoutMs > 10_000) unavailable()
  const owned = Buffer.from(bypass)
  const url = `${immutableUrl}/api/staging/checkout-readiness`
  let used = false, disposed = false
  return Object.freeze({
    async read({ expected, signal } = {}) {
      if (used || disposed || typeof expected !== 'boolean' || !signal || signal.aborted
        || typeof signal.addEventListener !== 'function') unavailable()
      used = true
      const controller = new AbortController(), forward = () => controller.abort()
      signal.addEventListener('abort', forward, { once: true })
      const timer = setTimeout(forward, timeoutMs)
      let response, reader
      try {
        const pending = Promise.resolve().then(() => {
          if (controller.signal.aborted) unavailable()
          return fetcher(url, { method: 'GET', redirect: 'error', cache: 'no-store',
            headers: { accept: 'application/json', 'accept-encoding': 'identity',
              'x-tll-deployment-id': deploymentId,
              'x-vercel-protection-bypass': owned.toString('utf8') }, signal: controller.signal })
        })
        void pending.then(late => {
          if (controller.signal.aborted) Promise.resolve(late?.body?.cancel?.()).catch(() => {})
        }, () => {})
        response = await raceAbort(pending, controller.signal)
        if (controller.signal.aborted || response?.status !== 200 || response.redirected === true
          || response.url && response.url !== url
          || !/^application\/json(?:;|$)/i.test(String(response.headers?.get?.('content-type') ?? ''))) unavailable()
        const length = response.headers?.get?.('content-length')
        const encoding = response.headers?.get?.('content-encoding')
        if (length != null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)
          || encoding != null && encoding !== '' && encoding !== 'identity') unavailable()
        if (!response.body?.getReader) unavailable()
        reader = response.body.getReader()
        const chunks = []
        let size = 0
        try {
          while (true) {
            const pendingRead = reader.read()
            void pendingRead.then(item => { if (controller.signal.aborted) item?.value?.fill?.(0) }, () => {})
            const item = await raceAbort(pendingRead, controller.signal)
            if (controller.signal.aborted || !item || typeof item.done !== 'boolean') unavailable()
            if (item.done) break
            if (!(item.value instanceof Uint8Array) || size + item.value.byteLength > MAX_BYTES) {
              item.value?.fill?.(0); unavailable()
            }
            size += item.value.byteLength; chunks.push(Buffer.from(item.value)); item.value.fill(0)
          }
          const bytes = Buffer.concat(chunks, size)
          let value
          try { value = JSON.parse(bytes.toString('utf8')) } finally { bytes.fill(0) }
          if (!exact(value, ['deploymentId', 'immutableUrl', 'projectRef', 'branch', 'checkoutHandoffEnabled'])
            || value.deploymentId !== deploymentId || value.immutableUrl !== immutableUrl
            || value.projectRef !== STAGING_PROJECT_REF || value.branch !== STAGING_BRANCH
            || value.checkoutHandoffEnabled !== expected) unavailable()
          return Object.freeze({ status: 'CHECKOUT_RUNTIME_VERIFIED', deploymentId, immutableUrl,
            checkoutHandoffEnabled: expected })
        } finally { for (const chunk of chunks) chunk.fill(0) }
      } finally {
        controller.abort(); clearTimeout(timer); signal.removeEventListener('abort', forward)
        try { Promise.resolve(reader?.cancel()).catch(() => {}) } catch { /* discard */ }
        try { reader?.releaseLock() } catch { /* discard */ }
        try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}) } catch { /* discard */ }
      }
    },
    dispose() { if (disposed) return; disposed = true; owned.fill(0) },
  })
}
