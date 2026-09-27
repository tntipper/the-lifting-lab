/** Separate, one-use, secret-free dispatch records for Gen23 database changes. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PROJECT_REF } from './staging-generation-23-password-material.mjs'

export const STAGING_GENERATION_23_DATABASE_JOURNAL_ENABLED = false
const ACTIONS = Object.freeze(['SETUP', 'ACTIVATE', 'SHUTDOWN', 'RETIRE'])
const SCHEMA = 'tll-generation-23-database-dispatch/v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const HASH = /^[a-f0-9]{64}$/
const unavailable = () => { throw Error('Generation 23 database journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
const defaultPath = action => resolve(import.meta.dirname,
  `../../implementation-state/staging/tll-generation-23-database-${action.toLowerCase()}-v6.json`)

function validate(record, action) {
  if (!exact(record, ['schema', 'projectRef', 'action', 'runId', 'expiresAt',
    'deadlineAt', 'createdAt', 'updatedAt', 'state', 'receiptDigest'])
    || record.schema !== SCHEMA || record.projectRef !== PROJECT_REF
    || record.action !== action || !UUID.test(record.runId)
    || ![record.expiresAt, record.deadlineAt, record.createdAt, record.updatedAt].every(iso)
    || Date.parse(record.updatedAt) < Date.parse(record.createdAt)
    || Date.parse(record.deadlineAt) <= Date.parse(record.createdAt)
    || Date.parse(record.deadlineAt) > Date.parse(record.expiresAt) + 3_600_000
    || (['SETUP', 'ACTIVATE'].includes(action)
      && Date.parse(record.deadlineAt) > Date.parse(record.expiresAt))
    || !['CLAIMED', 'DISPATCHED', 'HOLD', 'FINISHED'].includes(record.state)
    || (record.state === 'FINISHED' ? !HASH.test(record.receiptDigest) : record.receiptDigest !== null)) unavailable()
  return Object.freeze(record)
}

function read(path, fileSystem, action) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
      || (stat.mode & 0o777) !== 0o600 || stat.size > 4096) unavailable()
    return validate(JSON.parse(fileSystem.readFileSync(path, 'utf8')), action)
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

function persist(path, record, fileSystem, first) {
  const directory = dirname(path)
  const temporary = first ? path : resolve(directory,
    `.tll-gen23-database-${record.runId}-${record.state}.tmp`)
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`)
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

export function createStagingGeneration23DatabaseJournal({ action, path, fileSystem = fs,
  makeRunId = randomUUID, now = Date.now } = {}) {
  if (!STAGING_GENERATION_23_DATABASE_JOURNAL_ENABLED || !ACTIONS.includes(action)
    || (path !== undefined && (typeof path !== 'string' || !path))
    || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  path ??= defaultPath(action)
  let owned
  const timestamp = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  const update = (previous, change) => {
    if (!owned || previous?.runId !== owned
      || JSON.stringify(read(path, fileSystem, action)) !== JSON.stringify(previous)) unavailable()
    const next = validate({ ...previous, ...change, updatedAt: timestamp() }, action)
    persist(path, next, fileSystem, false)
    if (['HOLD', 'FINISHED'].includes(next.state)) owned = undefined
    return next
  }
  return Object.freeze({
    read: () => read(path, fileSystem, action),
    claim({ expiresAt, deadlineAt }) {
      if (read(path, fileSystem, action) || !iso(expiresAt) || !iso(deadlineAt)) unavailable()
      const createdAt = timestamp()
      const record = validate({ schema: SCHEMA, projectRef: PROJECT_REF, action,
        runId: makeRunId(), expiresAt, deadlineAt, createdAt, updatedAt: createdAt,
        state: 'CLAIMED', receiptDigest: null }, action)
      persist(path, record, fileSystem, true); owned = record.runId; return record
    },
    dispatch(previous) {
      if (previous?.state !== 'CLAIMED' || Date.parse(previous.deadlineAt) <= now()) unavailable()
      return update(previous, { state: 'DISPATCHED' })
    },
    confirm(previous, receiptDigest) {
      if (previous?.state !== 'DISPATCHED' || !HASH.test(receiptDigest)
        || Date.parse(previous.deadlineAt) <= now()) unavailable()
      return update(previous, { state: 'FINISHED', receiptDigest })
    },
    hold(previous) {
      if (!['CLAIMED', 'DISPATCHED'].includes(previous?.state)) unavailable()
      return update(previous, { state: 'HOLD' })
    },
  })
}
