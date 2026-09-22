/**
 * Closed, disabled Supabase evidence binding for the hosted staging baseline.
 *
 * The caller supplies the one fetch primitive and one private Management API
 * token. This module cannot discover credentials, choose a target, or issue a
 * request other than the three fixed read-only observations below.
 */
import {
  PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL,
  validateStagingAccountHostedBaselineDatabaseReceipt,
} from './staging-account-hosted-baseline-database.mjs'
import {
  createOfficialStagingProviderClient,
} from './staging-provider-broker-native-binding.mjs'
import {
  projectOfficialProviderSchema,
  STAGING_AUTH_URL,
} from './staging-provider-broker-native-adapter.mjs'
import { PROVIDER_IDENTIFIER, STAGING_PROVIDER_TARGET } from './staging-provider-broker-rotation.mjs'

export const HOSTED_BASELINE_SUPABASE_BINDING_ENABLED = false
export const HOSTED_BASELINE_SUPABASE_ERROR = 'Staging hosted baseline Supabase binding unavailable'
export const HOSTED_BASELINE_SUPABASE_TARGET = PROJECT_REF
export const HOSTED_BASELINE_SUPABASE_ENDPOINTS = Object.freeze({
  database: `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  secrets: `https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`,
  apiKeys: `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`,
})
const PROVIDER_URL = `https://${PROJECT_REF}.supabase.co/auth/v1/admin/custom-providers/${PROVIDER_IDENTIFIER}`

const MAX_RESPONSE_BYTES = 1024 * 1024
const MAX_SECRETS = 4096
const MAX_API_KEYS = 128
const SAFE_SECRET_NAME = /^[A-Z][A-Z0-9_]{0,255}$/
const discardedResponses = new WeakSet()
const unavailable = () => { throw new Error(HOSTED_BASELINE_SUPABASE_ERROR) }

function signalLike (signal) {
  return signal && typeof signal === 'object' && typeof signal.aborted === 'boolean'
    && typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function'
}

function copyManagementToken (value) {
  if (!Buffer.isBuffer(value) || value.length < 8 || value.length > 4096 || value.includes(0)) unavailable()
  const copy = Buffer.from(value)
  if (!/^[\x21-\x7e]{8,4096}$/.test(copy.toString('utf8'))) { copy.fill(0); unavailable() }
  return copy
}

function discardBody (response) {
  if (!response || typeof response !== 'object' || !response.body) return
  if (discardedResponses.has(response)) return
  discardedResponses.add(response)
  try {
    if (typeof response.body.getReader === 'function') {
      const reader = response.body.getReader()
      try { Promise.resolve(reader.cancel()).catch(() => {}) } finally { try { reader.releaseLock() } catch {} }
    } else if (typeof response.body.cancel === 'function') Promise.resolve(response.body.cancel()).catch(() => {})
  } catch {}
}

function rejectResponse (response) { discardBody(response); unavailable() }

function validateResponse (response, url, status) {
  if (!response || typeof response !== 'object' || response.status !== status || response.redirected === true
    || (typeof response.url === 'string' && response.url !== '' && response.url !== url)
    || !response.body || typeof response.body.getReader !== 'function') rejectResponse(response)
  const length = response.headers?.get?.('content-length')
  const encoding = response.headers?.get?.('content-encoding')
  const transferEncoding = response.headers?.get?.('transfer-encoding')
  if ((length !== null && length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES))
    || (encoding !== null && encoding !== undefined && encoding !== '' && encoding !== 'identity')
    || (transferEncoding !== null && transferEncoding !== undefined && transferEncoding !== '')) rejectResponse(response)
}

async function parseBoundedJson (response, url, signal, status) {
  validateResponse(response, url, status)
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  let cancelled = false
  const cancel = () => {
    if (cancelled) return
    cancelled = true
    try { Promise.resolve(reader.cancel()).catch(() => {}) } catch {}
  }
  let abort
  const aborted = new Promise(resolve => { abort = () => resolve(true) })
  signal.addEventListener('abort', abort, { once: true })
  try {
    if (signal.aborted) { cancel(); unavailable() }
    while (true) {
      const item = await Promise.race([reader.read(), aborted])
      if (item === true || signal.aborted) { cancel(); unavailable() }
      if (!item || typeof item.done !== 'boolean') unavailable()
      if (item.done) break
      if (!(item.value instanceof Uint8Array)) unavailable()
      size += item.value.byteLength
      if (size > MAX_RESPONSE_BYTES) { item.value.fill(0); cancel(); unavailable() }
      const copy = Buffer.from(item.value)
      item.value.fill(0)
      chunks.push(copy)
    }
    const bytes = Buffer.concat(chunks, size)
    try { return JSON.parse(bytes.toString('utf8')) } finally { bytes.fill(0) }
  } catch {
    cancel()
    unavailable()
  } finally {
    try { signal.removeEventListener('abort', abort) } catch {}
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

async function fixedFetch (fetcher, url, options, signal) {
  if (!signalLike(signal) || signal.aborted) unavailable()
  let abort
  const aborted = new Promise(resolve => { abort = () => resolve(true) })
  signal.addEventListener('abort', abort, { once: true })
  let pending
  let abandoned = false
  try {
    if (signal.aborted) unavailable()
    pending = Promise.resolve(fetcher(url, options))
    pending.then(response => { if (abandoned) discardBody(response) }, () => {})
    const response = await Promise.race([pending, aborted])
    if (response === true || signal.aborted) {
      abandoned = true
      // The abort and response promises can settle in the same turn. Attach a
      // second idempotent cleanup observer after setting the flag so a body
      // that won the fetch promise but lost the race is still cancelled.
      pending.then(discardBody, () => {})
      unavailable()
    }
    return response
  } catch { unavailable() } finally { try { signal.removeEventListener('abort', abort) } catch {} }
}

function secretNames (value) {
  if (!Array.isArray(value) || value.length > MAX_SECRETS) unavailable()
  const names = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !SAFE_SECRET_NAME.test(item.name)) unavailable()
    names.push(item.name)
  }
  if (new Set(names).size !== names.length) unavailable()
  return Object.freeze(names)
}

function takeLegacyServiceRole (value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_API_KEYS) unavailable()
  try {
    const matches = []
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.name !== 'string') unavailable()
      // The API can omit or null unrelated key fields. Only the selected,
      // legacy service_role record is required to have a usable api_key.
      if (item.type !== undefined && item.type !== null && typeof item.type !== 'string') unavailable()
      if (item.api_key !== undefined && item.api_key !== null && typeof item.api_key !== 'string') unavailable()
      if (item.name === 'service_role' && item.type === 'legacy') matches.push(item)
    }
    if (matches.length !== 1 || typeof matches[0].api_key !== 'string' || matches[0].api_key.length < 8 || matches[0].api_key.length > 24_576 || /[\x00-\x1f\x7f]/.test(matches[0].api_key)) unavailable()
    return Buffer.from(matches[0].api_key, 'utf8')
  } finally {
    for (const item of value) if (item && typeof item === 'object' && Object.hasOwn(item, 'api_key')) {
      try { item.api_key = '' } catch {}
    }
  }
}

function providerData (result) {
  if (!result || typeof result !== 'object' || Object.keys(result).sort().join('|') !== 'data|error' || result.error !== null
    || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) unavailable()
  projectOfficialProviderSchema(result.data)
  return Object.freeze({ ...result.data })
}

/**
 * Supply a fixed, minimal surface: a database receipt, secret names only, and
 * the documented custom-provider read. The Management token is copied once
 * and the caller retains ownership of its original Buffer. Temporary Buffer
 * copies are wiped; an SDK necessarily retains decoded JavaScript strings for
 * its request lifetime, so the later launcher must bound that lifetime and
 * dispose this binding immediately after its one observation.
 */
export function createStagingAccountHostedBaselineSupabaseBinding ({ fetch: fetcher, managementToken, createProviderClient = createOfficialStagingProviderClient } = {}) {
  if (PROJECT_REF === PRODUCTION_PROJECT_REF || PROJECT_REF !== STAGING_PROVIDER_TARGET.projectRef
    || typeof fetcher !== 'function' || typeof createProviderClient !== 'function') unavailable()
  const token = copyManagementToken(managementToken)
  let disposed = false
  const request = async (url, { method = 'GET', body, signal } = {}) => {
    if (disposed || !signalLike(signal) || signal.aborted || !Object.values(HOSTED_BASELINE_SUPABASE_ENDPOINTS).includes(url)
      || !['GET', 'POST'].includes(method) || (method === 'POST') !== (body !== undefined)) unavailable()
    let response
    try {
      response = await fixedFetch(fetcher, url, Object.freeze({
        method,
        redirect: 'error',
        headers: Object.freeze({ authorization: `Bearer ${token.toString('utf8')}`, accept: 'application/json', 'content-type': 'application/json', 'accept-encoding': 'identity' }),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
      }), signal)
    } catch { unavailable() }
    return parseBoundedJson(response, url, signal, method === 'POST' ? 201 : 200)
  }
  const readDatabase = async ({ signal } = {}) => {
    const rows = await request(HOSTED_BASELINE_SUPABASE_ENDPOINTS.database, { method: 'POST', body: Object.freeze({ query: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL, read_only: true }), signal })
    return validateStagingAccountHostedBaselineDatabaseReceipt(rows)
  }
  const readEdgeSecretNames = async ({ signal } = {}) => secretNames(await request(HOSTED_BASELINE_SUPABASE_ENDPOINTS.secrets, { signal }))
  const readProvider = async ({ signal } = {}) => {
    const keys = await request(HOSTED_BASELINE_SUPABASE_ENDPOINTS.apiKeys, { signal })
    const projectSecret = takeLegacyServiceRole(keys)
    let client
    try {
      if (!signalLike(signal) || signal.aborted) unavailable()
      const providerFetch = async (url, options = {}) => {
        if (url !== PROVIDER_URL || !options || typeof options !== 'object' || options.method !== 'GET' || options.redirect !== 'error'
          || options.body !== undefined || options.signal !== signal) unavailable()
        const headers = new Headers(options.headers)
        headers.set('accept-encoding', 'identity')
        const response = await fixedFetch(fetcher, PROVIDER_URL, Object.freeze({ ...options, headers }), signal)
        const raw = await parseBoundedJson(response, PROVIDER_URL, signal, 200)
        const bytes = Buffer.from(JSON.stringify(raw), 'utf8')
        try { return new Response(bytes, { status: 200, headers: { 'content-type': 'application/json', 'content-encoding': 'identity', 'content-length': String(bytes.length) } }) } finally { bytes.fill(0) }
      }
      client = createProviderClient(Object.freeze({ target: STAGING_PROVIDER_TARGET, authUrl: STAGING_AUTH_URL, projectSecret, signal, fetcher: providerFetch }))
      if (!client || !client.auth?.admin?.customProviders || typeof client.auth.admin.customProviders.getProvider !== 'function') unavailable()
      const result = await client.auth.admin.customProviders.getProvider(PROVIDER_IDENTIFIER)
      return providerData(result)
    } catch { unavailable() } finally { projectSecret.fill(0) }
  }
  return Object.freeze({
    target: HOSTED_BASELINE_SUPABASE_TARGET,
    nativeEnabled: HOSTED_BASELINE_SUPABASE_BINDING_ENABLED,
    readDatabase,
    readEdgeSecretNames,
    readProvider,
    dispose () { disposed = true; token.fill(0) },
  })
}
