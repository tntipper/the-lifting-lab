/** Fresh one-use record for retiring Gen22 roles after a partial setup, including after login expiry. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ACTIVE_WINDOW_EXPIRES_AT, WINDOW_ID } from './staging-generation-22-credentials.mjs'
import { GENERATION, PROJECT_REF } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_22_INCIDENT_JOURNAL_ENABLED = false
export const INCIDENT_DEADLINE = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'
export const INCIDENT_JOURNAL_PATH = resolve(import.meta.dirname,
  '../../implementation-state/staging/tll-generation-22-incident-retirement-v1.json')
const SCHEMA = 'tll-staging-generation-22-incident-retirement/v1'
const unavailable = () => { throw new Error('Generation 22 incident journal unavailable') }
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

function validate(record) {
  const keys = ['schema', 'projectRef', 'generation', 'windowId', 'originalExpiry',
    'incidentDeadline', 'runId', 'createdAt', 'updatedAt', 'state', 'receiptDigest']
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || Object.keys(record).sort().join('|') !== keys.sort().join('|')
    || record.schema !== SCHEMA || record.projectRef !== PROJECT_REF || record.generation !== GENERATION
    || record.windowId !== WINDOW_ID || record.originalExpiry !== ACTIVE_WINDOW_EXPIRES_AT
    || record.incidentDeadline !== INCIDENT_DEADLINE || !iso(record.originalExpiry)
    || !iso(record.incidentDeadline) || Date.parse(record.incidentDeadline) <= Date.parse(record.originalExpiry)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.runId)
    || !iso(record.createdAt) || !iso(record.updatedAt)
    || Date.parse(record.updatedAt) < Date.parse(record.createdAt)
    || !['CLAIMED', 'DISPATCHED', 'HOLD', 'FINISHED'].includes(record.state)
    || (record.state === 'FINISHED' ? !sha(record.receiptDigest) : record.receiptDigest !== null)) unavailable()
  return Object.freeze(record)
}

function read(path, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
      || (stat.mode & 0o777) !== 0o600 || stat.size > 4_096) unavailable()
    return validate(JSON.parse(fileSystem.readFileSync(path, 'utf8')))
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

function write(path, record, fileSystem, exclusive) {
  const directory = dirname(path)
  const temporary = exclusive ? path : resolve(directory, `.tll-gen22-incident-${record.runId}.tmp`)
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`)
  let fd
  try {
    fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const stat = fileSystem.lstatSync(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) unavailable()
    fd = fileSystem.openSync(temporary, 'wx', 0o600)
    let offset = 0
    while (offset < bytes.length) {
      const count = fileSystem.writeSync(fd, bytes, offset, bytes.length - offset, null)
      if (!Number.isInteger(count) || count <= 0) unavailable()
      offset += count
    }
    fileSystem.fsyncSync(fd); fileSystem.closeSync(fd); fd = undefined
    if (!exclusive) fileSystem.renameSync(temporary, path)
    const directoryFd = fileSystem.openSync(directory, 'r')
    try { fileSystem.fsyncSync(directoryFd) } finally { fileSystem.closeSync(directoryFd) }
  } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes.fill(0) }
}

export function createStagingGeneration22IncidentJournal({ path = INCIDENT_JOURNAL_PATH,
  fileSystem = fs, now = Date.now, makeRunId = randomUUID } = {}) {
  if (!STAGING_GENERATION_22_INCIDENT_JOURNAL_ENABLED || typeof path !== 'string'
    || !path || typeof now !== 'function' || typeof makeRunId !== 'function') unavailable()
  let owned
  const time = () => {
    const value = now()
    if (!Number.isFinite(value)) unavailable()
    return new Date(value).toISOString()
  }
  const withinDeadline = () => {
    const current = Date.parse(time())
    if (!iso(ACTIVE_WINDOW_EXPIRES_AT) || !iso(INCIDENT_DEADLINE)
      || Date.parse(INCIDENT_DEADLINE) <= Date.parse(ACTIVE_WINDOW_EXPIRES_AT)
      || current >= Date.parse(INCIDENT_DEADLINE)
      || Date.parse(INCIDENT_DEADLINE) - current > 3_600_000) unavailable()
  }
  const update = (previous, changes) => {
    if (!owned || previous?.runId !== owned
      || JSON.stringify(read(path, fileSystem)) !== JSON.stringify(previous)) unavailable()
    const next = validate({ ...previous, ...changes, updatedAt: time() })
    write(path, next, fileSystem, false)
    return next
  }
  return Object.freeze({
    read: () => read(path, fileSystem),
    claim() {
      withinDeadline()
      if (read(path, fileSystem)) unavailable()
      const createdAt = time()
      const record = validate({ schema: SCHEMA, projectRef: PROJECT_REF, generation: GENERATION,
        windowId: WINDOW_ID, originalExpiry: ACTIVE_WINDOW_EXPIRES_AT,
        incidentDeadline: INCIDENT_DEADLINE, runId: makeRunId(), createdAt,
        updatedAt: createdAt, state: 'CLAIMED', receiptDigest: null })
      write(path, record, fileSystem, true)
      owned = record.runId
      return record
    },
    dispatch(previous) {
      withinDeadline()
      if (previous?.state !== 'CLAIMED') unavailable()
      return update(previous, { state: 'DISPATCHED' })
    },
    confirm(previous, receiptDigest) {
      if (previous?.state !== 'DISPATCHED' || !sha(receiptDigest)) unavailable()
      const result = update(previous, { state: 'FINISHED', receiptDigest })
      owned = undefined
      return result
    },
    hold(previous) {
      if (!['CLAIMED', 'DISPATCHED'].includes(previous?.state)) unavailable()
      const result = update(previous, { state: 'HOLD' })
      owned = undefined
      return result
    },
  })
}
