/** Disabled fixed-project Vercel port for one checkout setting transition. */
import { HOSTED_BASELINE_VERCEL_TARGET } from './staging-account-hosted-baseline-vercel.mjs'
import { CHECKOUT_SETTING_NAME } from './staging-generation-23-checkout-setting.mjs'

export const STAGING_GENERATION_23_CHECKOUT_SETTING_PORT_ENABLED = true
const unavailable = () => { throw Error('Generation 23 checkout setting port unavailable') }
const ID = /^[A-Za-z0-9_-]{4,128}$/
const MAX_RESPONSE_BYTES = 16_384
const preview = value => value === 'preview'
  || (Array.isArray(value) && value.length === 1 && value[0] === 'preview')
const validToken = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 1024
  && /^[\x21-\x7e]+$/.test(value.toString('utf8'))
const validTarget = value => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === 'branch|classification|environment|id|name'
  && value.name === CHECKOUT_SETTING_NAME && ID.test(value.id)
  && value.branch === HOSTED_BASELINE_VERCEL_TARGET.branch
  && value.environment === 'preview' && value.classification === 'config'

function observation(payload, target, expected, decryptedRead) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || payload.id !== target.id || payload.key !== target.name
    || payload.gitBranch !== target.branch || !preview(payload.target)
    || payload.type !== 'encrypted' || payload.visibility !== 'config'
    || (decryptedRead && (payload.decrypted !== true || !['true', 'false'].includes(payload.value)))) unavailable()
  // Vercel may return ciphertext or a masked value from PATCH for an encrypted
  // setting. This is only an acknowledgement; the following decrypted GET
  // proves the actual boolean value before the transition is marked verified.
  return Object.freeze({ ...target, enabled: decryptedRead ? payload.value === 'true' : expected })
}

function raceAbort(pending, signal) {
  if (signal.aborted) return Promise.reject(Error('aborted'))
  let onAbort
  const aborted = new Promise((_, reject) => { onAbort = () => reject(Error('aborted')) })
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  return Promise.race([pending, aborted]).finally(() => signal.removeEventListener('abort', onAbort))
}

async function request({ fetcher, token, target, method, value, signal, timeoutMs }) {
  const url = `https://api.vercel.com/${method === 'GET' ? 'v1' : 'v9'}/projects/${HOSTED_BASELINE_VERCEL_TARGET.projectId}/env/${target.id}?teamId=${HOSTED_BASELINE_VERCEL_TARGET.teamId}`
  const controller = new AbortController()
  const forward = () => controller.abort()
  signal.addEventListener('abort', forward, { once: true })
  const timeout = setTimeout(forward, timeoutMs)
  let response, reader
  try {
    if (signal.aborted) unavailable()
    const pending = Promise.resolve().then(() => {
      if (controller.signal.aborted) unavailable()
      return fetcher(url, { method, redirect: 'error', headers: {
        authorization: `Bearer ${token.toString('utf8')}`, accept: 'application/json',
        'accept-encoding': 'identity', ...(method === 'PATCH' ? { 'content-type': 'application/json' } : {}),
      }, ...(method === 'PATCH' ? { body: JSON.stringify({ value: String(value) }) } : {}),
      signal: controller.signal })
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
    if (length != null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)
      || encoding != null && encoding !== '' && encoding !== 'identity') unavailable()
    if (!response.body?.getReader) unavailable()
    reader = response.body.getReader()
    const chunks = []
    let size = 0
    try {
      while (true) {
        const next = reader.read()
        void next.then(item => { if (controller.signal.aborted) item?.value?.fill?.(0) }, () => {})
        const item = await raceAbort(next, controller.signal)
        if (controller.signal.aborted || !item || typeof item.done !== 'boolean') unavailable()
        if (item.done) break
        if (!(item.value instanceof Uint8Array) || size + item.value.byteLength > MAX_RESPONSE_BYTES) {
          item.value?.fill?.(0); unavailable()
        }
        size += item.value.byteLength
        chunks.push(Buffer.from(item.value))
        item.value.fill(0)
      }
      const bytes = Buffer.concat(chunks, size)
      try { return JSON.parse(bytes.toString('utf8')) } finally { bytes.fill(0) }
    } finally { for (const chunk of chunks) chunk.fill(0) }
  } finally {
    controller.abort(); clearTimeout(timeout); signal.removeEventListener('abort', forward)
    try { Promise.resolve(reader?.cancel()).catch(() => {}) } catch { /* abort and discard */ }
    try { reader?.releaseLock() } catch { /* abort and discard */ }
    try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}) } catch { /* abort and discard */ }
  }
}

/** Each instance permits pre-read, one PATCH and post-read, in that order. */
export function createStagingGeneration23CheckoutSettingPort({ fetch: fetcher, token,
  target, timeoutMs = 20_000 } = {}) {
  if (!STAGING_GENERATION_23_CHECKOUT_SETTING_PORT_ENABLED || typeof fetcher !== 'function'
    || !validToken(token) || !validTarget(target) || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1 || timeoutMs > 20_000) unavailable()
  const owned = Buffer.from(token)
  let phase = 0, disposed = false
  const requireCall = (selected, signal) => {
    if (disposed || selected !== target || !signal || signal.aborted
      || typeof signal.addEventListener !== 'function') unavailable()
  }
  return Object.freeze({
    async read(selected, { signal } = {}) {
      requireCall(selected, signal)
      if (phase !== 0 && phase !== 2) unavailable()
      const before = phase === 0
      phase = before ? 1 : 3
      const payload = await request({ fetcher, token: owned, target, method: 'GET', signal, timeoutMs })
      return observation(payload, target, undefined, true)
    },
    async write(selected, enabled, { signal } = {}) {
      requireCall(selected, signal)
      if (phase !== 1 || typeof enabled !== 'boolean') unavailable()
      phase = 2
      const payload = await request({ fetcher, token: owned, target, method: 'PATCH', value: enabled, signal, timeoutMs })
      return observation(payload, target, enabled, false)
    },
    dispose() { if (disposed) return; disposed = true; owned.fill(0) },
  })
}
