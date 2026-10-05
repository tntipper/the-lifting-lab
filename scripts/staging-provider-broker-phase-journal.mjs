/** Secret-free progress record for a future one-run staging broker rotation. No live entry point. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROVIDER_IDENTIFIER, STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'

export const BROKER_PHASE_JOURNAL_ENABLED = false
export const DEFAULT_BROKER_PHASE_JOURNAL = fileURLToPath(new URL('../../implementation-state/staging/tll-provider-broker-phase-v1.json', import.meta.url))
export const BROKER_PHASE_DEADLINES_MS = Object.freeze({
  LAUNCH_STARTED: 60_000, PREFLIGHT: 45_000, PROVIDER_PREREAD: 30_000, INTENT_RECORDED: 10_000,
  VERCEL_STAGE_DISPATCH: 660_000, VERCEL_STAGE_ACK: 10_000,
  SUPABASE_STAGE_DISPATCH: 40_000, SUPABASE_STAGE_ACK: 10_000,
  PROVIDER_UPDATE_DISPATCH: 30_000, PROVIDER_UPDATE_ACK: 10_000,
  PROVIDER_POSTREAD: 45_000, HOST_NAMES_READBACK: 10_000,
  VERCEL_REMOVE_DISPATCH: 660_000, VERCEL_REMOVE_ACK: 10_000,
  SUPABASE_REMOVE_DISPATCH: 70_000, SUPABASE_REMOVE_ACK: 10_000,
  REMOVAL_READBACK: 10_000,
})
const transitions = Object.freeze({
  LAUNCH_STARTED: ['PREFLIGHT'], PREFLIGHT: ['PROVIDER_PREREAD'], PROVIDER_PREREAD: ['INTENT_RECORDED'],
  INTENT_RECORDED: ['VERCEL_STAGE_DISPATCH'],
  VERCEL_STAGE_DISPATCH: ['VERCEL_STAGE_ACK', 'VERCEL_REMOVE_DISPATCH'],
  VERCEL_STAGE_ACK: ['SUPABASE_STAGE_DISPATCH', 'VERCEL_REMOVE_DISPATCH'],
  SUPABASE_STAGE_DISPATCH: ['SUPABASE_STAGE_ACK', 'VERCEL_REMOVE_DISPATCH'],
  SUPABASE_STAGE_ACK: ['PROVIDER_UPDATE_DISPATCH', 'VERCEL_REMOVE_DISPATCH'],
  PROVIDER_UPDATE_DISPATCH: ['PROVIDER_UPDATE_ACK'], PROVIDER_UPDATE_ACK: ['PROVIDER_POSTREAD'],
  PROVIDER_POSTREAD: ['HOST_NAMES_READBACK'], HOST_NAMES_READBACK: [],
  VERCEL_REMOVE_DISPATCH: ['VERCEL_REMOVE_ACK', 'SUPABASE_REMOVE_DISPATCH', 'REMOVAL_READBACK'],
  VERCEL_REMOVE_ACK: ['SUPABASE_REMOVE_DISPATCH', 'REMOVAL_READBACK'],
  SUPABASE_REMOVE_DISPATCH: ['SUPABASE_REMOVE_ACK', 'REMOVAL_READBACK'],
  SUPABASE_REMOVE_ACK: ['REMOVAL_READBACK'], REMOVAL_READBACK: [],
})
const SCHEMA = 'tll-staging-provider-broker-phase/v1'
const outcomes = ['VERIFIED', 'STOPPED_BEFORE_UPDATE', 'RECONCILIATION_REQUIRED']
const unavailable = () => { throw Error('Staging provider broker phase journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const canonicalTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
const validUuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
const has = (history, phase) => history.some(event => event.phase === phase)

function validRecord(value) {
  if (!exact(value, ['schema', 'projectRef', 'providerIdentifier', 'runId', 'sequence', 'phase', 'history', 'outcome'])
    || value.schema !== SCHEMA || value.projectRef !== STAGING_PROJECT_REF || value.providerIdentifier !== PROVIDER_IDENTIFIER
    || !validUuid(value.runId) || !Array.isArray(value.history) || value.history.length < 1 || value.history.length > 17
    || !outcomes.includes(value.outcome) && value.outcome !== null
    || !Number.isSafeInteger(value.sequence)
    || value.sequence !== value.history.length - 1 + (value.outcome === null ? 0 : 1)) return false
  for (let index = 0; index < value.history.length; index++) {
    const event = value.history[index]
    if (!exact(event, ['phase', 'at']) || !Object.hasOwn(BROKER_PHASE_DEADLINES_MS, event.phase)
      || !canonicalTime(event.at) || index === 0 && event.phase !== 'LAUNCH_STARTED') return false
    if (index > 0) {
      const prior = value.history[index - 1]
      if (!transitions[prior.phase].includes(event.phase) || Date.parse(event.at) < Date.parse(prior.at)
        || Date.parse(event.at) - Date.parse(prior.at) > BROKER_PHASE_DEADLINES_MS[prior.phase]) return false
    }
  }
  const history = value.history, last = history.at(-1).phase
  if (value.phase !== last || value.outcome === 'VERIFIED' && (last !== 'HOST_NAMES_READBACK'
    || !has(history, 'PROVIDER_UPDATE_DISPATCH') || !has(history, 'PROVIDER_UPDATE_ACK'))) return false
  if (value.outcome === 'STOPPED_BEFORE_UPDATE') {
    if (has(history, 'PROVIDER_UPDATE_DISPATCH')) return false
    const staged = has(history, 'VERCEL_STAGE_DISPATCH') || has(history, 'SUPABASE_STAGE_DISPATCH')
    if (staged && (last !== 'REMOVAL_READBACK'
      || has(history, 'VERCEL_STAGE_DISPATCH') && !has(history, 'VERCEL_REMOVE_ACK')
      || has(history, 'SUPABASE_STAGE_DISPATCH') && !has(history, 'SUPABASE_REMOVE_ACK'))) return false
    if (!staged && !['LAUNCH_STARTED', 'PREFLIGHT', 'PROVIDER_PREREAD'].includes(last)) return false
  }
  return true
}

function writeAll(fd, bytes, fileSystem) {
  let offset = 0
  while (offset < bytes.length) {
    const count = fileSystem.writeSync(fd, bytes, offset, bytes.length - offset, null)
    if (!Number.isSafeInteger(count) || count < 1 || count > bytes.length - offset) unavailable()
    offset += count
  }
}
function syncDirectory(path, fileSystem) {
  const fd = fileSystem.openSync(dirname(path), 'r')
  try { fileSystem.fsyncSync(fd) } finally { fileSystem.closeSync(fd) }
}
function readRecord(path, fileSystem) {
  let fd, bytes
  try {
    fd = fileSystem.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
    const stat = fileSystem.fstatSync(fd)
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size < 1 || stat.size > 8_192) unavailable()
    bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const count = fileSystem.readSync(fd, bytes, offset, bytes.length - offset, null)
      if (!Number.isSafeInteger(count) || count < 1 || count > bytes.length - offset) unavailable()
      offset += count
    }
    const extra = Buffer.alloc(1)
    if (fileSystem.readSync(fd, extra, 0, 1, null) !== 0) unavailable()
    const after = fileSystem.fstatSync(fd), named = fileSystem.lstatSync(path)
    if (!named.isFile() || named.isSymbolicLink() || named.dev !== stat.dev || named.ino !== stat.ino
      || after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size
      || after.mtimeMs !== stat.mtimeMs || (after.mode & 0o777) !== 0o600) unavailable()
    const value = JSON.parse(bytes.toString('utf8'))
    if (!validRecord(value)) unavailable()
    return Object.freeze(value)
  } catch (error) { if (error?.code === 'ENOENT' && fd === undefined) return null; unavailable() }
  finally { bytes?.fill(0); if (fd !== undefined) fileSystem.closeSync(fd) }
}
function replace(path, next, runId, fileSystem) {
  const temporary = resolve(dirname(path), `.tll-provider-broker-phase.${runId}.tmp`)
  const bytes = Buffer.from(JSON.stringify(next) + '\n'); let fd
  try {
    fd = fileSystem.openSync(temporary, 'wx', 0o600)
    writeAll(fd, bytes, fileSystem); fileSystem.fsyncSync(fd)
    fileSystem.closeSync(fd); fd = undefined
    fileSystem.renameSync(temporary, path); syncDirectory(path, fileSystem)
  } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes.fill(0) }
}

/** This journal observes a run; it cannot dispatch any provider or secret-host operation. */
export function createBrokerPhaseJournal({ path = DEFAULT_BROKER_PHASE_JOURNAL, fileSystem = fs,
  makeRunId = randomUUID, now = Date.now } = {}) {
  if (typeof path !== 'string' || !path || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let ownedRunId
  const time = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  const currentFor = previous => {
    const current = readRecord(path, fileSystem)
    if (!previous || !current || previous.runId !== ownedRunId || current.runId !== ownedRunId
      || previous.outcome !== null || current.outcome !== null || JSON.stringify(previous) !== JSON.stringify(current)) unavailable()
    return current
  }
  const elapsed = current => {
    const at = time(), ms = Date.parse(at) - Date.parse(current.history.at(-1).at)
    if (ms < 0) unavailable()
    return { at, ms }
  }
  return Object.freeze({
    read: () => readRecord(path, fileSystem),
    start() {
      if (readRecord(path, fileSystem)) unavailable()
      const runId = makeRunId(), at = time()
      if (!validUuid(runId)) unavailable()
      const record = Object.freeze({ schema: SCHEMA, projectRef: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER,
        runId, sequence: 0, phase: 'LAUNCH_STARTED', history: [{ phase: 'LAUNCH_STARTED', at }], outcome: null })
      const bytes = Buffer.from(JSON.stringify(record) + '\n'); let fd
      try {
        fileSystem.mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
        fd = fileSystem.openSync(path, 'wx', 0o600)
        writeAll(fd, bytes, fileSystem); fileSystem.fsyncSync(fd)
        fileSystem.closeSync(fd); fd = undefined; syncDirectory(path, fileSystem)
        ownedRunId = runId; return record
      } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes.fill(0) }
    },
    record(previous, phase) {
      const current = currentFor(previous), prior = current.phase, clock = elapsed(current)
      if (!transitions[prior].includes(phase) || clock.ms > BROKER_PHASE_DEADLINES_MS[prior]) unavailable()
      const next = Object.freeze({ ...current, sequence: current.sequence + 1, phase,
        history: [...current.history, { phase, at: clock.at }] })
      replace(path, next, ownedRunId, fileSystem); return next
    },
    finish(previous, outcome) {
      const current = currentFor(previous), clock = elapsed(current)
      if (!outcomes.includes(outcome) || outcome !== 'RECONCILIATION_REQUIRED'
        && clock.ms > BROKER_PHASE_DEADLINES_MS[current.phase]) unavailable()
      const next = Object.freeze({ ...current, sequence: current.sequence + 1, outcome })
      if (!validRecord(next)) unavailable()
      replace(path, next, ownedRunId, fileSystem); ownedRunId = undefined; return next
    },
  })
}

export function assessBrokerPhase(record, nowMs = Date.now()) {
  if (!validRecord(record) || !Number.isFinite(nowMs)) unavailable()
  if (record.outcome !== null) return Object.freeze({ status: 'TERMINAL', phase: record.phase, outcome: record.outcome })
  const elapsedMs = nowMs - Date.parse(record.history.at(-1).at)
  if (elapsedMs < 0) unavailable()
  const deadlineMs = BROKER_PHASE_DEADLINES_MS[record.phase]
  return Object.freeze({ status: elapsedMs <= deadlineMs ? 'ACTIVE_WITHIN_PHASE_BOUND' : 'STALE_REQUIRES_RECONCILIATION',
    phase: record.phase, elapsedMs, deadlineMs })
}
