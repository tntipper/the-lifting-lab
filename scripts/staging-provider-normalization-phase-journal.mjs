/** Secret-free, one-use phase monitor for the future staging provider launcher. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROVIDER_IDENTIFIER, STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'

export const PROVIDER_NORMALIZATION_PHASE_JOURNAL_ENABLED = false
export const DEFAULT_PROVIDER_NORMALIZATION_PHASE_JOURNAL = fileURLToPath(new URL('../../implementation-state/staging/tll-provider-normalization-phase-v1.json', import.meta.url))
export const PROVIDER_NORMALIZATION_PHASE_DEADLINES_MS = Object.freeze({
  LAUNCH_STARTED: 15_000, PREFLIGHT: 45_000, PROVIDER_PREREAD: 30_000,
  INTENT_RECORDED: 10_000, UPDATE_DISPATCH: 30_000, UPDATE_ACKNOWLEDGED: 10_000, POSTREAD: 45_000,
})
const SCHEMA = 'tll-staging-provider-normalization-phase/v1'
const phases = Object.keys(PROVIDER_NORMALIZATION_PHASE_DEADLINES_MS)
const terminal = ['VERIFIED', 'STOPPED_BEFORE_UPDATE', 'RECONCILIATION_REQUIRED']
const unavailable = () => { throw new Error('Staging provider normalization phase journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const canonicalTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
const validUuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
const validRecord = value => {
  if (!exact(value, ['schema', 'projectRef', 'providerIdentifier', 'runId', 'sequence', 'phase', 'startedAt', 'updatedAt', 'outcome'])
    || value.schema !== SCHEMA || value.projectRef !== STAGING_PROJECT_REF || value.providerIdentifier !== PROVIDER_IDENTIFIER
    || !validUuid(value.runId) || !Number.isSafeInteger(value.sequence) || !phases.includes(value.phase)
    || !canonicalTime(value.startedAt) || !canonicalTime(value.updatedAt)
    || Date.parse(value.updatedAt) < Date.parse(value.startedAt)
    || !(value.outcome === null || terminal.includes(value.outcome))) return false
  const index = phases.indexOf(value.phase)
  return value.sequence === index + (value.outcome === null ? 0 : 1)
    && (value.outcome !== 'VERIFIED' || value.phase === 'POSTREAD')
    && (value.outcome !== 'STOPPED_BEFORE_UPDATE' || index < phases.indexOf('INTENT_RECORDED'))
}

function writeAll(fd, bytes, fileSystem) {
  let offset = 0
  while (offset < bytes.length) {
    const written = fileSystem.writeSync(fd, bytes, offset, bytes.length - offset, null)
    if (!Number.isSafeInteger(written) || written < 1 || written > bytes.length - offset) unavailable()
    offset += written
  }
}

function syncDirectory(path, fileSystem) {
  const fd = fileSystem.openSync(dirname(path), 'r')
  try { fileSystem.fsyncSync(fd) } finally { fileSystem.closeSync(fd) }
}

function readRecord(path, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 8_192) unavailable()
    const value = JSON.parse(fileSystem.readFileSync(path, 'utf8'))
    if (!validRecord(value)) unavailable()
    return Object.freeze(value)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    unavailable()
  }
}

function replace(path, next, runId, fileSystem) {
  const temporary = resolve(dirname(path), `.tll-provider-normalization-phase.${runId}.tmp`)
  const bytes = Buffer.from(JSON.stringify(next) + '\n')
  let fd
  try {
    fd = fileSystem.openSync(temporary, 'wx', 0o600)
    writeAll(fd, bytes, fileSystem); fileSystem.fsyncSync(fd)
    fileSystem.closeSync(fd); fd = undefined
    fileSystem.renameSync(temporary, path)
    syncDirectory(path, fileSystem)
  } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes.fill(0) }
}

/** This phase record observes progress; it never authorizes provider dispatch. */
export function createProviderNormalizationPhaseJournal({ path = DEFAULT_PROVIDER_NORMALIZATION_PHASE_JOURNAL,
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (typeof path !== 'string' || !path || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let ownedRunId
  const time = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  const currentFor = previous => {
    if (!previous || previous.runId !== ownedRunId || previous.outcome !== null) unavailable()
    const current = readRecord(path, fileSystem)
    if (!current || current.runId !== ownedRunId || current.sequence !== previous.sequence
      || current.phase !== previous.phase || current.outcome !== null
      || JSON.stringify(current) !== JSON.stringify(previous)) unavailable()
    return current
  }
  const advanceTime = (current, allowStale = false) => {
    const timestamp = time()
    const elapsedMs = Date.parse(timestamp) - Date.parse(current.updatedAt)
    if (elapsedMs < 0 || (!allowStale && elapsedMs > PROVIDER_NORMALIZATION_PHASE_DEADLINES_MS[current.phase])) unavailable()
    return timestamp
  }
  return Object.freeze({
    read: () => readRecord(path, fileSystem),
    start() {
      if (readRecord(path, fileSystem)) unavailable()
      const runId = makeRunId(), timestamp = time()
      if (!validUuid(runId)) unavailable()
      const record = Object.freeze({ schema: SCHEMA, projectRef: STAGING_PROJECT_REF,
        providerIdentifier: PROVIDER_IDENTIFIER, runId, sequence: 0, phase: 'LAUNCH_STARTED',
        startedAt: timestamp, updatedAt: timestamp, outcome: null })
      const bytes = Buffer.from(JSON.stringify(record) + '\n')
      let fd
      try {
        fileSystem.mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
        fd = fileSystem.openSync(path, 'wx', 0o600)
        writeAll(fd, bytes, fileSystem); fileSystem.fsyncSync(fd)
        fileSystem.closeSync(fd); fd = undefined
        syncDirectory(path, fileSystem)
        ownedRunId = runId
        return record
      } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes.fill(0) }
    },
    record(previous, phase) {
      const current = currentFor(previous)
      if (!phases.includes(phase) || phases.indexOf(phase) !== phases.indexOf(current.phase) + 1) unavailable()
      const next = Object.freeze({ ...current, sequence: current.sequence + 1, phase, updatedAt: advanceTime(current) })
      replace(path, next, ownedRunId, fileSystem)
      return next
    },
    finish(previous, outcome) {
      const current = currentFor(previous)
      if (!terminal.includes(outcome)
        || (outcome === 'VERIFIED' && current.phase !== 'POSTREAD')
        || (outcome === 'STOPPED_BEFORE_UPDATE' && phases.indexOf(current.phase) >= phases.indexOf('INTENT_RECORDED'))) unavailable()
      const next = Object.freeze({ ...current, sequence: current.sequence + 1,
        updatedAt: advanceTime(current, outcome === 'RECONCILIATION_REQUIRED'), outcome })
      replace(path, next, ownedRunId, fileSystem)
      ownedRunId = undefined
      return next
    },
  })
}

export function assessProviderNormalizationPhase(record, nowMs = Date.now()) {
  if (!validRecord(record) || !Number.isFinite(nowMs)) unavailable()
  if (record.outcome !== null) {
    return Object.freeze({ status: 'TERMINAL', phase: record.phase, outcome: record.outcome })
  }
  const elapsedMs = nowMs - Date.parse(record.updatedAt)
  if (elapsedMs < 0) unavailable()
  const deadlineMs = PROVIDER_NORMALIZATION_PHASE_DEADLINES_MS[record.phase]
  return Object.freeze({ status: elapsedMs <= deadlineMs ? 'ACTIVE_WITHIN_PHASE_BOUND' : 'STALE_REQUIRES_RECONCILIATION',
    phase: record.phase, elapsedMs, deadlineMs })
}
