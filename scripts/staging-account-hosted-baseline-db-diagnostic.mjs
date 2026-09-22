import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import {
  STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL,
  validateStagingAccountHostedBaselineDatabaseReceipt,
} from './staging-account-hosted-baseline-database.mjs'
import { createStagingWindowPhaseJournal, createTrackedHostedBaselineFetch } from './staging-account-hosted-baseline-session.mjs'

export const DB_DIAGNOSTIC_JOURNAL_PATH = resolve(import.meta.dirname, '../../implementation-state/staging/tll-hosted-baseline-v3-db-diagnostic.json')
export const DB_DIAGNOSTIC_DEADLINE_MS = 60_000
const TARGET = 'qdmvngjwkcsilzmqksme'
const ENDPOINT = `https://api.supabase.com/v1/projects/${TARGET}/database/query`
const MAX_BODY_BYTES = 1_048_576
const KNOWN_SQL_ERRORS = Object.freeze([...STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL.matchAll(/RAISE EXCEPTION '([^']+)'/g)]
  .map(match => Object.freeze({ text: match[1], code: `SQL_GUARD_${match[1].replace(/^Hosted baseline /, '').replace(/[^a-z0-9]+/gi, '_').toUpperCase()}` })))
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const fail = () => { throw Error('Staging database diagnostic unavailable') }

function safeSqlCodes (body) {
  if (!body || typeof body !== 'object') return []
  const values = [body.code, body.message, body.error, body.error?.code, body.error?.message, body.details]
    .filter(value => typeof value === 'string' && value.length <= 4096)
  const codes = []
  const state = values.find(value => /^[0-9A-Z]{5}$/.test(value))
  if (state) codes.push(`SQLSTATE_${state}`)
  const guard = KNOWN_SQL_ERRORS.find(item => values.some(value => value.includes(item.text)))
  if (guard) codes.push(guard.code)
  return codes
}

async function cancelResponse (response) {
  const body = response?.body
  if (!body) return
  try {
    if (typeof body.cancel === 'function') await body.cancel()
    else if (typeof body.getReader === 'function') {
      const reader = body.getReader()
      try { await reader.cancel() } finally { reader.releaseLock() }
    }
  } catch { fail() }
}

async function readBoundedJson (response, signal, maximum) {
  if (!response.body || typeof response.body.getReader !== 'function') return Object.freeze({ kind: 'BODY_UNAVAILABLE' })
  const reader = response.body.getReader(); const chunks = []; let size = 0; let cancel
  const aborted = new Promise(resolve => { cancel = () => resolve(true) })
  signal.addEventListener('abort', cancel, { once: true })
  let failed = false
  try {
    while (true) {
      const item = await Promise.race([reader.read(), aborted])
      if (item === true || signal.aborted) { failed = true; return Object.freeze({ kind: 'DEADLINE_ABORT' }) }
      if (!item || typeof item.done !== 'boolean') { failed = true; return Object.freeze({ kind: 'BODY_UNAVAILABLE' }) }
      if (item.done) break
      if (!(item.value instanceof Uint8Array)) { failed = true; return Object.freeze({ kind: 'BODY_UNAVAILABLE' }) }
      size += item.value.byteLength
      if (size > maximum) { item.value.fill(0); failed = true; return Object.freeze({ kind: 'BODY_OVERSIZE' }) }
      chunks.push(Buffer.from(item.value)); item.value.fill(0)
    }
    const joined = Buffer.concat(chunks, size)
    try { return Object.freeze({ kind: 'JSON', value: JSON.parse(joined.toString('utf8')) }) }
    catch { return Object.freeze({ kind: 'BODY_INVALID_JSON' }) }
    finally { joined.fill(0) }
  } catch { failed = true; return Object.freeze({ kind: signal.aborted ? 'DEADLINE_ABORT' : 'BODY_UNAVAILABLE' }) }
  finally {
    signal.removeEventListener('abort', cancel)
    if (failed) try { await reader.cancel() } catch { throw Error('Staging database diagnostic cleanup uncertain') }
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

async function observe (fetcher, credential, signal) {
  let response
  try {
    response = await fetcher(ENDPOINT, Object.freeze({ method: 'POST', redirect: 'error',
      headers: Object.freeze({ authorization: `Bearer ${credential.toString('utf8')}`, accept: 'application/json', 'content-type': 'application/json', 'accept-encoding': 'identity' }),
      body: JSON.stringify({ query: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL, read_only: true }), signal }))
  } catch { return Object.freeze({ status: 'HOLD', reasonCodes: [signal.aborted ? 'DEADLINE_ABORT' : 'TRANSPORT_UNAVAILABLE'] }) }
  if (signal.aborted) {
    await cancelResponse(response)
    return Object.freeze({ status: 'HOLD', reasonCodes: ['DEADLINE_ABORT'] })
  }
  const httpCode = Number.isInteger(response?.status) && response.status >= 100 && response.status <= 599 ? response.status : null
  const httpReason = `HTTP_${httpCode ?? 'UNKNOWN'}`
  const headers = response?.headers
  const length = headers?.get?.('content-length')
  const encoding = headers?.get?.('content-encoding')
  const transfer = headers?.get?.('transfer-encoding')
  if (response?.redirected === true || typeof response?.url === 'string' && response.url !== '' && response.url !== ENDPOINT) {
    await cancelResponse(response)
    return Object.freeze({ status: 'HOLD', reasonCodes: ['RESPONSE_TARGET_DRIFT'] })
  }
  if (encoding && encoding !== 'identity' || transfer || length != null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    await cancelResponse(response)
    return Object.freeze({ status: 'HOLD', reasonCodes: [httpReason, 'RESPONSE_FRAMING_UNAVAILABLE'] })
  }
  const body = await readBoundedJson(response, signal, httpCode === 201 ? MAX_BODY_BYTES : 16_384)
  if (body.kind !== 'JSON') return Object.freeze({ status: 'HOLD', reasonCodes: [httpReason, body.kind] })
  if (httpCode !== 201) return Object.freeze({ status: 'HOLD', reasonCodes: [httpReason, ...safeSqlCodes(body.value)] })
  try {
    const receipt = validateStagingAccountHostedBaselineDatabaseReceipt(body.value)
    return Object.freeze({ status: 'PASS', reasonCodes: [], receiptHash: receipt.receiptHash })
  } catch { return Object.freeze({ status: 'HOLD', reasonCodes: ['RECEIPT_MISMATCH'] }) }
}

export async function runStagingDatabaseDiagnostic ({ readCredential, fetch: fetcher,
  journal = createStagingWindowPhaseJournal({ path: DB_DIAGNOSTIC_JOURNAL_PATH }),
  setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now } = {}) {
  if (typeof readCredential !== 'function' || typeof fetcher !== 'function' || typeof journal?.read !== 'function'
    || typeof journal.claim !== 'function' || typeof journal.finish !== 'function' || typeof setTimer !== 'function'
    || typeof clearTimer !== 'function' || typeof now !== 'function') fail()
  try { if (journal.read()) return Object.freeze({ status: 'JOURNAL_UNAVAILABLE', target: TARGET }) }
  catch { return Object.freeze({ status: 'JOURNAL_UNAVAILABLE', target: TARGET }) }
  let credential
  try {
    credential = await readCredential()
    if (!Buffer.isBuffer(credential) || credential.length < 8 || credential.length > 4096 || credential.includes(0)
      || !/^[\x21-\x7e]+$/.test(credential.toString('utf8'))) fail()
  } catch { credential?.fill?.(0); return Object.freeze({ status: 'CREDENTIAL_UNAVAILABLE', target: TARGET }) }
  let intent
  try { intent = journal.claim() } catch { credential.fill(0); return Object.freeze({ status: 'JOURNAL_UNAVAILABLE', target: TARGET }) }
  const controller = new AbortController(); const timer = setTimer(() => controller.abort(), DB_DIAGNOSTIC_DEADLINE_MS)
  const tracker = createTrackedHostedBaselineFetch({ fetch: fetcher })
  let outcome
  try { outcome = await observe(tracker.fetch, credential, controller.signal) }
  catch { outcome = null }
  finally {
    clearTimer(timer); controller.abort()
    try { await tracker.settle() } catch { outcome = null }
    credential.fill(0)
  }
  if (!outcome) return Object.freeze({ status: 'RECONCILIATION_REQUIRED', target: TARGET })
  const core = Object.freeze({ status: outcome.status, reasonCodes: outcome.reasonCodes, receiptHash: outcome.receiptHash ?? null })
  const terminal = Object.freeze({ ...intent, state: 'OBSERVATION_RECORDED', updatedAt: new Date(now()).toISOString(), status: outcome.status,
    reasonCodes: outcome.reasonCodes, observationHash: outcome.receiptHash ?? hash(core) })
  try { journal.finish(intent, terminal) } catch { return Object.freeze({ status: 'JOURNAL_UNAVAILABLE', target: TARGET }) }
  return Object.freeze({ ...core, target: TARGET })
}
