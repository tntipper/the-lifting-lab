/** Secret-free one-use record for the fixed Gen22-retired read before Gen23. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PROJECT_REF } from './staging-generation-23-password-material.mjs'

export const STAGING_GENERATION_23_PREDECESSOR_JOURNAL_ENABLED = false
export const JOURNAL_PATH = resolve(import.meta.dirname,
  '../../implementation-state/staging/tll-generation-23-predecessor-read-v11.json')
const SCHEMA = 'tll-generation-23-predecessor-read/v1'
const QUERY_ID = 'tll-staging-generation-23-predecessor-check/v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const HASH = /^[0-9a-f]{64}$/
const unavailable = () => { throw new Error('Generation 23 predecessor journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value

function validate(value) {
  if (!exact(value, ['schema', 'projectRef', 'queryId', 'runId', 'state', 'startedAt',
    'updatedAt', 'outcome', 'receiptSha256']) || value.schema !== SCHEMA
    || value.projectRef !== PROJECT_REF || value.queryId !== QUERY_ID || !UUID.test(value.runId)
    || !iso(value.startedAt) || !iso(value.updatedAt)
    || Date.parse(value.updatedAt) < Date.parse(value.startedAt)) unavailable()
  if (value.state === 'CLAIMED' || value.state === 'DISPATCHED') {
    if (value.outcome !== null || value.receiptSha256 !== null) unavailable()
  } else if (value.state === 'FINISHED') {
    if (!['PASS_RETIRED', 'READ_UNAVAILABLE'].includes(value.outcome)
      || (value.outcome === 'PASS_RETIRED' ? !HASH.test(value.receiptSha256)
        : value.receiptSha256 !== null)) unavailable()
  } else unavailable()
  return Object.freeze(value)
}

function read(path, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
      || (stat.mode & 0o777) !== 0o600 || stat.size > 2048) unavailable()
    return validate(JSON.parse(fileSystem.readFileSync(path, 'utf8')))
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

function persist(path, value, fileSystem, first) {
  const directory = dirname(path)
  const temporary = first ? path : resolve(directory, `.tll-gen23-predecessor-${value.runId}-${value.state}.tmp`)
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
  let descriptor
  try {
    fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const parent = fileSystem.lstatSync(directory)
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777) !== 0o700) unavailable()
    descriptor = fileSystem.openSync(temporary, 'wx', 0o600)
    let offset = 0
    while (offset < bytes.length) {
      const count = fileSystem.writeSync(descriptor, bytes, offset, bytes.length - offset, null)
      if (!Number.isSafeInteger(count) || count < 1) unavailable()
      offset += count
    }
    fileSystem.fsyncSync(descriptor); fileSystem.closeSync(descriptor); descriptor = undefined
    if (!first) fileSystem.renameSync(temporary, path)
    const dir = fileSystem.openSync(directory, 'r')
    try { fileSystem.fsyncSync(dir) } finally { fileSystem.closeSync(dir) }
  } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
}

export function createStagingGeneration23PredecessorJournal({ path = JOURNAL_PATH,
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (typeof path !== 'string' || !path || typeof makeRunId !== 'function'
    || typeof now !== 'function') unavailable()
  let owned
  const timestamp = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  const current = (previous, state) => {
    const value = read(path, fileSystem)
    if (!value || value.state !== state || value.runId !== owned || previous?.runId !== owned
      || JSON.stringify(value) !== JSON.stringify(previous)) unavailable()
    return value
  }
  return Object.freeze({
    read: () => read(path, fileSystem),
    claim() {
      if (read(path, fileSystem)) unavailable()
      const time = timestamp()
      const record = validate({ schema: SCHEMA, projectRef: PROJECT_REF, queryId: QUERY_ID,
        runId: makeRunId(), state: 'CLAIMED', startedAt: time, updatedAt: time,
        outcome: null, receiptSha256: null })
      persist(path, record, fileSystem, true); owned = record.runId; return record
    },
    dispatch(claim) {
      const value = current(claim, 'CLAIMED')
      const next = validate({ ...value, state: 'DISPATCHED', updatedAt: timestamp() })
      persist(path, next, fileSystem, false); return next
    },
    finish(previous, outcome, receiptSha256 = null) {
      const value = current(previous, previous?.state)
      if (!['CLAIMED', 'DISPATCHED'].includes(value.state)
        || (outcome === 'PASS_RETIRED' && (value.state !== 'DISPATCHED' || !HASH.test(receiptSha256)))
        || (outcome === 'READ_UNAVAILABLE' && receiptSha256 !== null)
        || !['PASS_RETIRED', 'READ_UNAVAILABLE'].includes(outcome)) unavailable()
      const next = validate({ ...value, state: 'FINISHED', updatedAt: timestamp(), outcome, receiptSha256 })
      persist(path, next, fileSystem, false); owned = undefined; return next
    },
  })
}
