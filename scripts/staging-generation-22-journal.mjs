/** Secret-free, one-use record for a future reviewed Generation 22 setup. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ACTIVE_WINDOW_EXPIRES_AT, WINDOW_ID } from './staging-generation-22-credentials.mjs'
import { DISABLED_VERCEL_CONFIGURATION, GENERATION, MISSING_VERCEL_SECRET_NAMES,
  PROJECT_REF } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_22_JOURNAL_ENABLED = false
export const JOURNAL_PATH = resolve(import.meta.dirname,
  '../../implementation-state/staging/tll-generation-22-dispatch-v1.json')
export const OPERATION_IDS = Object.freeze([
  'DATABASE_CREDENTIALS',
  ...MISSING_VERCEL_SECRET_NAMES.map(name => `VERCEL_SECRET:${name}`),
  'SUPABASE_EDGE:TLL_STAGING_BROKER_DATABASE_PASSWORD',
  ...Object.keys(DISABLED_VERCEL_CONFIGURATION).sort().map(name => `VERCEL_DISABLED:${name}`),
])
const SCHEMA = 'tll-staging-generation-22-dispatch/v1'
const unavailable = () => { throw new Error('Generation 22 journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

function validate(record) {
  if (!exact(record, ['schema', 'projectRef', 'generation', 'windowId', 'expiresAt', 'runId',
    'createdAt', 'updatedAt', 'state', 'nextIndex', 'pending', 'receiptDigests'])
    || record.schema !== SCHEMA || record.projectRef !== PROJECT_REF || record.generation !== GENERATION
    || record.windowId !== WINDOW_ID || record.expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.runId)
    || !iso(record.createdAt) || !iso(record.updatedAt)
    || Date.parse(record.updatedAt) < Date.parse(record.createdAt)
    || !Number.isInteger(record.nextIndex) || record.nextIndex < 0 || record.nextIndex > OPERATION_IDS.length
    || !Array.isArray(record.receiptDigests) || record.receiptDigests.length !== record.nextIndex
    || record.receiptDigests.some(value => !digest(value))) unavailable()
  if (record.state === 'CLAIMED' || record.state === 'READY') {
    if (record.pending !== null || (record.state === 'CLAIMED' && record.nextIndex !== 0)
      || (record.state === 'READY' && (record.nextIndex === 0 || record.nextIndex >= OPERATION_IDS.length))) unavailable()
  } else if (record.state === 'DISPATCHED' || record.state === 'HOLD') {
    if (record.pending !== null && record.pending !== OPERATION_IDS[record.nextIndex]) unavailable()
    if (record.state === 'DISPATCHED' && record.pending === null) unavailable()
  } else if (record.state === 'FINISHED') {
    if (record.nextIndex !== OPERATION_IDS.length || record.pending !== null) unavailable()
  } else unavailable()
  return Object.freeze(record)
}

function read(path, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
      || (stat.mode & 0o777) !== 0o600 || stat.size > 8_192) unavailable()
    return validate(JSON.parse(fileSystem.readFileSync(path, 'utf8')))
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

function write(path, record, fileSystem, exclusive) {
  const directory = dirname(path)
  const temporary = exclusive ? path : resolve(directory, `.tll-generation-22-${record.runId}-${record.nextIndex}.tmp`)
  const bytes = Buffer.from(JSON.stringify(record) + '\n'); let descriptor
  try {
    fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const stat = fileSystem.lstatSync(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) unavailable()
    descriptor = fileSystem.openSync(temporary, 'wx', 0o600)
    let offset = 0
    while (offset < bytes.length) {
      const n = fileSystem.writeSync(descriptor, bytes, offset, bytes.length - offset, null)
      if (!Number.isInteger(n) || n <= 0) unavailable()
      offset += n
    }
    fileSystem.fsyncSync(descriptor); fileSystem.closeSync(descriptor); descriptor = undefined
    if (!exclusive) fileSystem.renameSync(temporary, path)
    const dir = fileSystem.openSync(directory, 'r')
    try { fileSystem.fsyncSync(dir) } finally { fileSystem.closeSync(dir) }
  } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
}

export function createStagingGeneration22Journal({ path = JOURNAL_PATH, fileSystem = fs,
  makeRunId = randomUUID, now = Date.now } = {}) {
  if (!STAGING_GENERATION_22_JOURNAL_ENABLED || typeof path !== 'string' || !path
    || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let owned
  const time = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  const update = (previous, changed) => {
    if (!owned || previous.runId !== owned
      || JSON.stringify(read(path, fileSystem)) !== JSON.stringify(previous)) unavailable()
    const next = validate({ ...previous, ...changed, updatedAt: time() })
    write(path, next, fileSystem, false)
    return next
  }
  return Object.freeze({
    read: () => read(path, fileSystem),
    claim() {
      if (ACTIVE_WINDOW_EXPIRES_AT === 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'
        || !iso(ACTIVE_WINDOW_EXPIRES_AT) || Date.parse(ACTIVE_WINDOW_EXPIRES_AT) <= now()
        || read(path, fileSystem)) unavailable()
      const createdAt = time()
      const record = validate({ schema: SCHEMA, projectRef: PROJECT_REF, generation: GENERATION,
        windowId: WINDOW_ID, expiresAt: ACTIVE_WINDOW_EXPIRES_AT, runId: makeRunId(),
        createdAt, updatedAt: createdAt, state: 'CLAIMED', nextIndex: 0, pending: null, receiptDigests: [] })
      write(path, record, fileSystem, true); owned = record.runId; return record
    },
    dispatch(previous, operationId) {
      if (!previous || !['CLAIMED', 'READY'].includes(previous.state)
        || operationId !== OPERATION_IDS[previous.nextIndex]
        || Date.parse(ACTIVE_WINDOW_EXPIRES_AT) <= now()) unavailable()
      return update(previous, { state: 'DISPATCHED', pending: operationId })
    },
    confirm(previous, receiptSha256) {
      if (previous?.state !== 'DISPATCHED' || !digest(receiptSha256)) unavailable()
      const nextIndex = previous.nextIndex + 1
      const next = update(previous, { state: nextIndex === OPERATION_IDS.length ? 'FINISHED' : 'READY',
        nextIndex, pending: null, receiptDigests: [...previous.receiptDigests, receiptSha256] })
      if (next.state === 'FINISHED') owned = undefined
      return next
    },
    hold(previous) {
      if (!previous || !['CLAIMED', 'READY', 'DISPATCHED'].includes(previous.state)) unavailable()
      const next = update(previous, { state: 'HOLD' }); owned = undefined; return next
    },
  })
}
