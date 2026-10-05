/** Disabled, injected-only one-use POST boundary for a protected staging Preview. */
import { buildStagingPreviewDeploymentRequest } from './staging-surface-preview-deployment-request.mjs'

export const STAGING_PREVIEW_DEPLOYMENT_POST_ENABLED = false
const unavailable = () => { throw new Error('Staging Preview deployment POST unavailable') }
const MAX_BYTES = 64 * 1024
const validSignal = signal => signal && typeof signal.aborted === 'boolean'
  && typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function' && !signal.aborted

function discard(response) {
  try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}) } catch {}
}

function abortRace(pending, signal) {
  if (signal.aborted) return Promise.reject(new Error('aborted'))
  let abort
  const interrupted = new Promise((_, reject) => { abort = () => reject(new Error('aborted')) })
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  return Promise.race([pending, interrupted]).finally(() => signal.removeEventListener('abort', abort))
}

async function readBounded(response, url, signal) {
  if (!response || response.status !== 200 || response.redirected === true
    || (response.url && response.url !== url) || !response.body?.getReader) unavailable()
  const length = response.headers?.get?.('content-length')
  if (length != null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) unavailable()
  const encoding = response.headers?.get?.('content-encoding')
  if (encoding != null && encoding !== '' && encoding !== 'identity') unavailable()
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      const pending = Promise.resolve().then(() => reader.read())
      void pending.then(item => { if (signal.aborted && item?.value instanceof Uint8Array) item.value.fill(0) }, () => {})
      const item = await abortRace(pending, signal)
      if (signal.aborted) unavailable()
      if (!item || typeof item.done !== 'boolean') unavailable()
      if (item.done) break
      if (!(item.value instanceof Uint8Array)) unavailable()
      size += item.value.byteLength
      if (size > MAX_BYTES) { item.value.fill(0); unavailable() }
      chunks.push(Buffer.from(item.value)); item.value.fill(0)
    }
    const bytes = Buffer.concat(chunks, size)
    try { return JSON.parse(bytes.toString('utf8')) } finally { bytes.fill(0) }
  } finally {
    try { await reader.cancel() } catch {}
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

async function uncertain(stopWorkerGroup) {
  try { stopWorkerGroup() } catch {}
  return new Promise(() => {})
}

/**
 * A successful POST only proves Vercel accepted an ID; callers must separately
 * prove source, project, immutable URL, alias, TLS and runtime state.
 */
export function createStagingPreviewDeploymentPost({ fetch: fetcher, vercelToken, readPinnedRepository,
  journal, stopWorkerGroup } = {}) {
  if (typeof fetcher !== 'function' || typeof readPinnedRepository !== 'function' || typeof stopWorkerGroup !== 'function'
    || typeof journal?.dispatch !== 'function' || typeof journal?.accepted !== 'function'
    || !Buffer.isBuffer(vercelToken) || vercelToken.length < 8 || vercelToken.length > 1024
    || !/^[\x21-\x7e]+$/.test(vercelToken.toString('utf8'))) unavailable()
  const token = Buffer.from(vercelToken)
  let dispatched = false, disposed = false
  return Object.freeze({
    async submit(input, { signal, claim } = {}) {
      if (disposed || dispatched || !validSignal(signal)) unavailable()
      const request = buildStagingPreviewDeploymentRequest(input)
      if (!claim || claim.phase !== 'CLAIMED' || claim.branch !== input.branch
        || claim.sourceCommit !== input.sourceCommit || claim.manifestSha256 !== input.manifestSha256
        || claim.publicCustomer !== input.publicCustomer || claim.publicCart !== input.publicCart) unavailable()
      let link
      try { link = await readPinnedRepository(signal) } catch { unavailable() }
      if (!link || link.repoId !== 1264363509 || link.org !== 'tntipper' || link.repo !== 'the-lifting-lab'
        || disposed || !validSignal(signal)) unavailable()
      const options = Object.freeze({ method: request.method, redirect: 'error',
        headers: Object.freeze({ authorization: `Bearer ${token.toString('utf8')}`, accept: 'application/json',
          'accept-encoding': 'identity', 'content-type': 'application/json' }),
        body: JSON.stringify(request.body), signal })
      // The durable marker must reach disk before any network POST. A failed
      // marker leaves the operation pre-dispatch and cannot send anything.
      const dispatchRecord = journal.dispatch(claim)
      // After this point an acknowledgement can be lost. Stop the supervised
      // worker and leave its one-use journal for read-only reconciliation.
      dispatched = true
      let response
      try {
        const pending = Promise.resolve().then(() => fetcher(request.url, options))
        void pending.then(late => { if (signal.aborted || disposed) discard(late) }, () => {})
        response = await abortRace(pending, signal)
        if (disposed || signal.aborted) return uncertain(stopWorkerGroup)
        const value = await readBounded(response, request.url, signal)
        if (disposed || signal.aborted || !value || typeof value !== 'object' || Array.isArray(value)
          || !/^dpl_[A-Za-z0-9]+$/.test(value.id ?? '')
          || !['QUEUED', 'INITIALIZING', 'BUILDING', 'READY'].includes(value.readyState)
          || (value.target !== undefined && value.target !== null)) return uncertain(stopWorkerGroup)
        const acceptedRecord = journal.accepted(dispatchRecord, value.id)
        return Object.freeze({ status: 'ACCEPTED_UNVERIFIED', deploymentId: value.id, journal: acceptedRecord })
      } catch { discard(response); return uncertain(stopWorkerGroup) }
    },
    dispose() { if (!disposed) { disposed = true; token.fill(0) } },
  })
}
