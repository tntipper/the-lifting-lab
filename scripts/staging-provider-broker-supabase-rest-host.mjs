/** Disabled, injected-only Supabase Management host for one staging secret. */
import { BROKER_SECRET_NAME, STAGING_PROVIDER_TARGET } from './staging-provider-broker-rotation.mjs'
import {
  HOSTED_BASELINE_SUPABASE_ENDPOINTS,
  createStagingAccountHostedBaselineSupabaseBinding,
} from './staging-account-hosted-baseline-supabase.mjs'

export const STAGING_BROKER_SUPABASE_REST_HOST_ENABLED = false
const unavailable = () => { throw new Error('Staging broker Supabase REST host unavailable') }
const URL = HOSTED_BASELINE_SUPABASE_ENDPOINTS.secrets
const MATERIAL = /^[\x21-\x7e]{32,512}$/
const MAX_RESPONSE_BYTES = 64 * 1024

function exactTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)
    || Object.keys(target).sort().join('|') !== Object.keys(STAGING_PROVIDER_TARGET).sort().join('|')) unavailable()
  for (const [key, value] of Object.entries(STAGING_PROVIDER_TARGET)) if (target[key] !== value) unavailable()
}

function validSignal(signal) {
  return signal && typeof signal.aborted === 'boolean' && typeof signal.addEventListener === 'function'
    && typeof signal.removeEventListener === 'function' && !signal.aborted
}

function abortRace(pending, signal) {
  if (signal.aborted) return Promise.reject(new Error('aborted'))
  let abort
  const interrupted = new Promise((_, reject) => { abort = () => reject(new Error('aborted')) })
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  return Promise.race([pending, interrupted]).finally(() => signal.removeEventListener('abort', abort))
}

function discard(response) {
  try { Promise.resolve(response?.body?.cancel?.()).catch(() => {}) } catch {}
}

async function responseReceipt(response, status, signal) {
  if (!response || response.status !== status || response.redirected === true
    || (response.url && response.url !== URL)) unavailable()
  const length = response.headers?.get?.('content-length')
  const encoding = response.headers?.get?.('content-encoding')
  if (length != null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)
    || encoding != null && encoding !== '' && encoding !== 'identity') unavailable()
  // The official API specifies the success status without a response content
  // schema. Accept an empty body or the documentation's empty JSON object.
  if (!response.body) return
  if (typeof response.body.getReader !== 'function') unavailable()
  const reader = response.body.getReader()
  const chunks = []
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
      size += item.value.byteLength
      if (size > MAX_RESPONSE_BYTES) unavailable()
      chunks.push(Buffer.from(item.value))
      item.value.fill(0)
    }
    const bytes = Buffer.concat(chunks, size)
    try {
      if (size > 0) {
        const value = JSON.parse(bytes.toString('utf8'))
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 0) unavailable()
      }
    } finally { bytes.fill(0) }
  } finally {
    try { Promise.resolve(reader.cancel()).catch(() => {}) } catch {}
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

async function uncertain(stopWorkerGroup) {
  try { stopWorkerGroup() } catch {}
  return new Promise(() => {})
}

export function createStagingProviderBrokerSupabaseRestHost({ fetch: fetcher, managementToken, stopWorkerGroup } = {}) {
  if (typeof fetcher !== 'function' || typeof stopWorkerGroup !== 'function'
    || !Buffer.isBuffer(managementToken) || managementToken.length < 8 || managementToken.length > 4096
    || !/^[\x21-\x7e]+$/.test(managementToken.toString('utf8'))) unavailable()
  const token = Buffer.from(managementToken)
  const reader = createStagingAccountHostedBaselineSupabaseBinding({ fetch: fetcher, managementToken: token })
  let disposed = false
  let stageDispatched = false
  let stageAcknowledged = false
  let removeDispatched = false

  const mutate = async (method, body, status, signal) => {
    if (disposed || !validSignal(signal)) unavailable()
    let response
    try {
      // This dispatch is synchronous. Cancellation cannot slip between the
      // final signal check and a queued later write.
      const pending = Promise.resolve(fetcher(URL, Object.freeze({ method, redirect: 'error',
        headers: Object.freeze({ authorization: `Bearer ${token.toString('utf8')}`, accept: 'application/json',
          'content-type': 'application/json', 'accept-encoding': 'identity' }), body, signal })))
      void pending.then(late => { if (signal.aborted) discard(late) }, () => {})
      response = await abortRace(pending, signal)
      if (signal.aborted || disposed) return uncertain(stopWorkerGroup)
      await responseReceipt(response, status, signal)
      if (signal.aborted || disposed) return uncertain(stopWorkerGroup)
    } catch {
      discard(response)
      return uncertain(stopWorkerGroup)
    }
  }

  return Object.freeze({
    async readNames(target, { signal } = {}) {
      exactTarget(target)
      if (disposed || !validSignal(signal)) unavailable()
      const names = await reader.readEdgeSecretNames({ signal })
      return Object.freeze(names.includes(BROKER_SECRET_NAME) ? [BROKER_SECRET_NAME] : [])
    },
    async stage(target, name, material, { signal } = {}) {
      exactTarget(target)
      if (name !== BROKER_SECRET_NAME || disposed || stageDispatched || !validSignal(signal)
        || !Buffer.isBuffer(material) || !MATERIAL.test(material.toString('utf8'))) unavailable()
      const body = JSON.stringify([{ name: BROKER_SECRET_NAME, value: material.toString('utf8') }])
      stageDispatched = true
      await mutate('POST', body, 201, signal)
      if (signal.aborted || disposed) return uncertain(stopWorkerGroup)
      stageAcknowledged = true
      return Object.freeze({ status: 'STAGED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME })
    },
    async remove(target, name, { signal } = {}) {
      exactTarget(target)
      if (name !== BROKER_SECRET_NAME || disposed || !stageAcknowledged || removeDispatched || !validSignal(signal)) unavailable()
      removeDispatched = true
      await mutate('DELETE', JSON.stringify([BROKER_SECRET_NAME]), 200, signal)
      if (signal.aborted || disposed) return uncertain(stopWorkerGroup)
      return Object.freeze({ status: 'REMOVED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME })
    },
    dispose() {
      if (disposed) return
      disposed = true
      token.fill(0)
      reader.dispose()
    },
  })
}
