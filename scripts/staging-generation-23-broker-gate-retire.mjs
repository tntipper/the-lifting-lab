/** One-use staging-only removal of the temporary broker diagnostic gate. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { EDGE_READINESS_WINDOW_NAME, PROJECT_REF } from './staging-generation-23-password-material.mjs'

export const STAGING_GENERATION_23_BROKER_GATE_RETIRE_ENABLED = false
export const JOURNAL_PATH = resolve(import.meta.dirname,
  '../../implementation-state/staging/tll-generation-23-broker-gate-retire-v16.json')
const URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`
const unavailable = () => { throw Error('Generation 23 broker gate retirement unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function read(path) {
  try {
    const stat = fs.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600
      || stat.size > 1024) unavailable()
    const value = JSON.parse(fs.readFileSync(path, 'utf8'))
    if (!exact(value, ['schema', 'projectRef', 'name', 'runId', 'state'])
      || value.schema !== 'tll-gen23-broker-gate-retire/v1' || value.projectRef !== PROJECT_REF
      || value.name !== EDGE_READINESS_WINDOW_NAME
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.runId)
      || !['DISPATCHED', 'VERIFIED', 'HOLD'].includes(value.state)) unavailable()
    return value
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

function persist(path, value, initial) {
  const directory = dirname(path), bytes = Buffer.from(`${JSON.stringify(value)}\n`)
  const temporary = initial ? path : `${path}.${value.runId}.tmp`
  let handle
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const parent = fs.lstatSync(directory)
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777) !== 0o700) unavailable()
    handle = fs.openSync(temporary, 'wx', 0o600)
    let offset = 0
    while (offset < bytes.length) {
      const size = fs.writeSync(handle, bytes, offset, bytes.length - offset)
      if (!Number.isSafeInteger(size) || size < 1) unavailable()
      offset += size
    }
    fs.fsyncSync(handle); fs.closeSync(handle); handle = undefined
    if (!initial) fs.renameSync(temporary, path)
    const dir = fs.openSync(directory, 'r')
    try { fs.fsyncSync(dir) } finally { fs.closeSync(dir) }
  } finally { if (handle !== undefined) fs.closeSync(handle); bytes.fill(0) }
}

function bounded(promise, signal) {
  if (signal.aborted) return Promise.reject(Error('Broker gate retirement timed out'))
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(Error('Broker gate retirement timed out')) }
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(promise).then(value => { signal.removeEventListener('abort', abort); resolve(value) },
      error => { signal.removeEventListener('abort', abort); reject(error) })
  })
}

async function boundedReply(response, signal) {
  const length = response.headers?.get?.('content-length')
  const encoding = response.headers?.get?.('content-encoding')
  if (length != null && (!/^\d+$/.test(length) || Number(length) > 256)
    || encoding != null && encoding !== '' && encoding !== 'identity') unavailable()
  // The official API documents HTTP 200 with {}, but an empty response body
  // has also accompanied a successful deletion. The subsequent names read,
  // not response text, is the proof that this exact setting is absent.
  if (!response.body) return
  if (typeof response.body.getReader !== 'function') unavailable()
  const reader = response.body.getReader()
  let bytes = Buffer.alloc(0)
  try {
    while (true) {
      const chunk = await bounded(reader.read(), signal)
      if (signal.aborted || !chunk || typeof chunk.done !== 'boolean') unavailable()
      if (chunk.done) break
      if (!(chunk.value instanceof Uint8Array) || bytes.length + chunk.value.length > 256) unavailable()
      const next = Buffer.concat([bytes, chunk.value]); bytes.fill(0); chunk.value.fill?.(0); bytes = next
    }
  } finally { bytes.fill(0); try { void reader.cancel().catch(() => {}) } catch {}; try { reader.releaseLock() } catch {} }
}

export function createStagingGeneration23BrokerGateRetire({ token, fetch: fetcher, readNames,
  path = JOURNAL_PATH, makeRunId = randomUUID } = {}) {
  if (!STAGING_GENERATION_23_BROKER_GATE_RETIRE_ENABLED || !Buffer.isBuffer(token)
    || !/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(token.toString('utf8'))
    || typeof fetcher !== 'function' || typeof readNames !== 'function'
    || typeof path !== 'string' || typeof makeRunId !== 'function' || read(path)) unavailable()
  const owned = Buffer.from(token)
  let used = false, disposed = false
  const dispose = () => { if (!disposed) { disposed = true; owned.fill(0) } }
  return Object.freeze({
    async retire({ signal } = {}) {
      if (used || disposed || !signal || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
      used = true
      const runId = makeRunId(), record = { schema: 'tll-gen23-broker-gate-retire/v1', projectRef: PROJECT_REF,
        name: EDGE_READINESS_WINDOW_NAME, runId, state: 'DISPATCHED' }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(runId)) unavailable()
      persist(path, record, true)
      const controller = new AbortController(), abort = () => controller.abort()
      signal.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(abort, 20_000)
      let verified = false
      try {
        const response = await bounded(fetcher(URL, Object.freeze({ method: 'DELETE', redirect: 'error',
          headers: Object.freeze({ authorization: `Bearer ${owned.toString('utf8')}`, accept: 'application/json',
            'content-type': 'application/json', 'accept-encoding': 'identity' }),
          body: JSON.stringify([EDGE_READINESS_WINDOW_NAME]), signal: controller.signal })), controller.signal)
        if (controller.signal.aborted || response?.status !== 200 || response.redirected === true
          || response.url && response.url !== URL) unavailable()
        await boundedReply(response, controller.signal)
        const names = await bounded(readNames({ signal: controller.signal }), controller.signal)
        if (controller.signal.aborted || !Array.isArray(names) || names.includes(EDGE_READINESS_WINDOW_NAME)) unavailable()
        persist(path, { ...record, state: 'VERIFIED' }, false)
        verified = true
        return Object.freeze({ status: 'BROKER_GATE_RETIRED_VERIFIED' })
      } catch { unavailable() } finally {
        if (!verified) try { persist(path, { ...record, state: 'HOLD' }, false) } catch {}
        clearTimeout(timer); signal.removeEventListener('abort', abort); controller.abort(); dispose()
      }
    },
    dispose,
  })
}
