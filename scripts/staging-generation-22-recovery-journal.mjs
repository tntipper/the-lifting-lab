/** Separate one-use, secret-free record for retiring Generation 22 roles. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ACTIVE_WINDOW_EXPIRES_AT, WINDOW_ID } from './staging-generation-22-credentials.mjs'
import { GENERATION, PROJECT_REF } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_22_RECOVERY_JOURNAL_ENABLED = false
export const RECOVERY_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'
export const RECOVERY_JOURNAL_PATH = resolve(import.meta.dirname,
  '../../implementation-state/staging/tll-generation-22-recovery-dispatch-v1.json')
const SCHEMA = 'tll-staging-generation-22-recovery-dispatch/v1'
const capabilities = new WeakMap()
const unavailable = () => { throw new Error('Generation 22 recovery journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

function validate(record) {
  if (!exact(record, ['schema', 'projectRef', 'generation', 'windowId', 'expiresAt', 'recoveryExpiresAt',
    'runId', 'createdAt', 'updatedAt', 'state', 'receiptDigest'])
    || record.schema !== SCHEMA || record.projectRef !== PROJECT_REF || record.generation !== GENERATION
    || record.windowId !== WINDOW_ID || record.expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
    || record.recoveryExpiresAt !== RECOVERY_WINDOW_EXPIRES_AT
    || !iso(record.recoveryExpiresAt)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.runId)
    || !iso(record.createdAt) || !iso(record.updatedAt)
    || Date.parse(record.updatedAt) < Date.parse(record.createdAt)
    || !['CLAIMED', 'DISPATCHED', 'HOLD', 'FINISHED'].includes(record.state)
    || (record.state === 'FINISHED' ? !digest(record.receiptDigest) : record.receiptDigest !== null)) unavailable()
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
  const temporary = exclusive ? path : resolve(directory, `.tll-generation-22-recovery-${record.runId}.tmp`)
  const bytes = Buffer.from(JSON.stringify(record) + '\n')
  let descriptor
  try {
    fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const stat = fileSystem.lstatSync(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) unavailable()
    descriptor = fileSystem.openSync(temporary, 'wx', 0o600)
    let offset = 0
    while (offset < bytes.length) {
      const count = fileSystem.writeSync(descriptor, bytes, offset, bytes.length - offset, null)
      if (!Number.isInteger(count) || count <= 0) unavailable()
      offset += count
    }
    fileSystem.fsyncSync(descriptor); fileSystem.closeSync(descriptor); descriptor = undefined
    if (!exclusive) fileSystem.renameSync(temporary, path)
    const dir = fileSystem.openSync(directory, 'r')
    try { fileSystem.fsyncSync(dir) } finally { fileSystem.closeSync(dir) }
  } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
}

/** A capability exists only for the owning process after a durable dispatch. */
export function consumeStagingGeneration22RecoveryCapability(capability) {
  const held = capabilities.get(capability)
  const currentTime = held?.now()
  if (!capability || !held || held.operation !== 'RECOVERY_DISPATCH'
    || !Number.isFinite(currentTime) || currentTime >= Date.parse(held.record.recoveryExpiresAt)
    || JSON.stringify(read(held.path, held.fileSystem)) !== JSON.stringify(held.record)) unavailable()
  capabilities.delete(capability)
}

export function createStagingGeneration22RecoveryJournal({ path = RECOVERY_JOURNAL_PATH,
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (!STAGING_GENERATION_22_RECOVERY_JOURNAL_ENABLED || typeof path !== 'string' || !path
    || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let owned, issued = false
  const time = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  const withinRecoveryWindow = () => {
    if (!iso(ACTIVE_WINDOW_EXPIRES_AT) || !iso(RECOVERY_WINDOW_EXPIRES_AT)
      || Date.parse(RECOVERY_WINDOW_EXPIRES_AT) <= Date.parse(ACTIVE_WINDOW_EXPIRES_AT)
      || Date.parse(RECOVERY_WINDOW_EXPIRES_AT) > Date.parse(ACTIVE_WINDOW_EXPIRES_AT) + 3_600_000
      || Date.parse(time()) >= Date.parse(RECOVERY_WINDOW_EXPIRES_AT)) unavailable()
  }
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
      withinRecoveryWindow()
      if (Date.parse(time()) >= Date.parse(ACTIVE_WINDOW_EXPIRES_AT)
        || read(path, fileSystem)) unavailable()
      const createdAt = time()
      const record = validate({ schema: SCHEMA, projectRef: PROJECT_REF, generation: GENERATION,
        windowId: WINDOW_ID, expiresAt: ACTIVE_WINDOW_EXPIRES_AT,
        recoveryExpiresAt: RECOVERY_WINDOW_EXPIRES_AT, runId: makeRunId(),
        createdAt, updatedAt: createdAt, state: 'CLAIMED', receiptDigest: null })
      write(path, record, fileSystem, true); owned = record.runId; return record
    },
    dispatch(previous) {
      withinRecoveryWindow()
      if (previous?.state !== 'CLAIMED') unavailable()
      return update(previous, { state: 'DISPATCHED' })
    },
    capability(previous) {
      withinRecoveryWindow()
      if (issued || previous?.state !== 'DISPATCHED' || previous.runId !== owned
        || JSON.stringify(read(path, fileSystem)) !== JSON.stringify(previous)) unavailable()
      const capability = Object.freeze({})
      capabilities.set(capability, { operation: 'RECOVERY_DISPATCH', path, fileSystem, now, record: previous })
      issued = true
      return capability
    },
    confirm(previous, receiptDigest) {
      if (previous?.state !== 'DISPATCHED' || !digest(receiptDigest)) unavailable()
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
