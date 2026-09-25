/** Credential-free proof that the new Preview and fixed alias deny public reads. */
import { STAGING_ALIAS } from './staging-surface-activation-transport.mjs'

export const STAGING_PREVIEW_PROTECTION_PROBE_ENABLED = false
const unavailable = () => { throw new Error('Staging Preview protection proof unavailable') }
const MAX_BYTES = 8192
const validSignal = signal => signal && typeof signal.aborted === 'boolean'
  && typeof signal.addEventListener === 'function' && !signal.aborted

async function protectedChallenge(fetcher, root, signal) {
  const url = `${root}/api/staging/readiness`
  const response = await fetcher(url, { method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
    headers: { accept: 'application/json', 'accept-encoding': 'identity' }, signal })
  if (!validSignal(signal) || response?.status !== 401 || response.redirected === true
    || (response.url && response.url !== url)
    || !/^application\/json(?:;|$)/i.test(response.headers?.get?.('content-type') ?? '')
    || response.headers?.get?.('server') !== 'Vercel'
    || !response.body?.getReader) unavailable()
  const advertised = response.headers.get('content-length')
  if (advertised !== null && (!/^\d+$/.test(advertised) || Number(advertised) > MAX_BYTES)) unavailable()
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      const item = await reader.read()
      if (!validSignal(signal) || !item || typeof item.done !== 'boolean') unavailable()
      if (item.done) break
      if (!(item.value instanceof Uint8Array)) unavailable()
      size += item.value.byteLength
      if (size > MAX_BYTES) { item.value.fill(0); unavailable() }
      chunks.push(Buffer.from(item.value)); item.value.fill(0)
    }
    const bytes = Buffer.concat(chunks, size)
    let value
    try { value = JSON.parse(bytes.toString('utf8')) } catch { unavailable() }
    finally { bytes.fill(0) }
    let callback
    try { callback = new URL(value?.protection?.vercel_auth_callback) } catch { unavailable() }
    if (value?.error?.message !== 'Protected deployment' || value.error.code !== '401'
      || callback.origin !== 'https://vercel.com' || callback.pathname !== '/sso-api'
      || callback.searchParams.get('url') !== url || !callback.searchParams.get('nonce')) unavailable()
  } finally {
    try { await reader.cancel() } catch {}
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

export function createStagingPreviewProtectionProbe({ fetch: fetcher } = {}) {
  if (typeof fetcher !== 'function') unavailable()
  let used = false
  return Object.freeze({
    async verify({ immutableUrl, signal } = {}) {
      if (used || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(immutableUrl ?? '')
        || immutableUrl === STAGING_ALIAS || !validSignal(signal)) unavailable()
      used = true
      await protectedChallenge(fetcher, immutableUrl, signal)
      await protectedChallenge(fetcher, STAGING_ALIAS, signal)
      return Object.freeze({ status: 'PUBLIC_ACCESS_DENIED', immutableUrl, alias: STAGING_ALIAS })
    },
  })
}
