/** One-use, secret-free local Keychain readiness receipt; never a provider intent. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CREDENTIAL_READINESS_PHASE_JOURNAL_ENABLED = false
export const DEFAULT_CREDENTIAL_READINESS_JOURNAL = fileURLToPath(
  new URL('../../implementation-state/staging/tll-provider-credential-readiness-v1.json', import.meta.url))
export const CREDENTIAL_READINESS_PHASES = Object.freeze(['LAUNCH_STARTED', 'READ_SUPABASE', 'READ_VERCEL', 'READ_BYPASS'])
export const CREDENTIAL_READINESS_WINDOW_DEADLINE_MS = 50_000
export const CREDENTIAL_READINESS_PHASE_DEADLINES_MS = Object.freeze({
  LAUNCH_STARTED: 10_000, READ_SUPABASE: 20_000, READ_VERCEL: 20_000, READ_BYPASS: 20_000,
})
const schema = 'tll-staging-provider-credential-readiness/v1'
const target = 'qdmvngjwkcsilzmqksme'
const categories = ['GUARD', 'TIMEOUT', 'COMMAND', 'FORMAT', 'OUTPUT', 'INTERNAL', 'DEADLINE']
const unavailable = () => { throw Error('Staging credential readiness journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const canonicalTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
const uuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
const valid = value => exact(value, ['schema', 'target', 'runId', 'sequence', 'phase', 'startedAt', 'updatedAt', 'deadlineAt', 'outcome', 'category'])
  && value.schema === schema && value.target === target && uuid(value.runId)
  && Number.isSafeInteger(value.sequence) && CREDENTIAL_READINESS_PHASES.includes(value.phase)
  && canonicalTime(value.startedAt) && canonicalTime(value.updatedAt) && canonicalTime(value.deadlineAt)
  && Date.parse(value.deadlineAt) === Date.parse(value.startedAt) + CREDENTIAL_READINESS_WINDOW_DEADLINE_MS
  && Date.parse(value.updatedAt) >= Date.parse(value.startedAt)
  && (value.outcome === null && value.category === null && value.sequence === CREDENTIAL_READINESS_PHASES.indexOf(value.phase)
    || value.outcome === 'PASS' && value.category === null && value.phase === 'READ_BYPASS' && value.sequence === 4
    || value.outcome === 'HOLD' && categories.includes(value.category)
      && value.sequence === CREDENTIAL_READINESS_PHASES.indexOf(value.phase) + 1)

export function assessCredentialReadinessPhase(record, nowMs = Date.now()) {
  if (!valid(record) || !Number.isFinite(nowMs)) unavailable()
  if (record.outcome !== null) return Object.freeze({ status: 'TERMINAL', phase: record.phase, outcome: record.outcome })
  const elapsedMs = nowMs - Date.parse(record.updatedAt)
  if (elapsedMs < 0) unavailable()
  const deadlineMs = CREDENTIAL_READINESS_PHASE_DEADLINES_MS[record.phase]
  const within = elapsedMs <= deadlineMs && nowMs <= Date.parse(record.deadlineAt)
  return Object.freeze({ status: within ? 'ACTIVE_WITHIN_PHASE_BOUND' : 'STALE_REQUIRES_RECONCILIATION',
    phase: record.phase, elapsedMs, deadlineMs, deadlineAt: record.deadlineAt })
}

function read(path, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 4_096) unavailable()
    const record = JSON.parse(fileSystem.readFileSync(path, 'utf8'))
    if (!valid(record)) unavailable()
    return Object.freeze(record)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    unavailable()
  }
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

function persist(path, record, fileSystem, exclusive = false) {
  const temporary = resolve(dirname(path), `.tll-provider-readiness.${record.runId}.tmp`)
  const destination = exclusive ? path : temporary
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`)
  let fd
  try {
    fileSystem.mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    fd = fileSystem.openSync(destination, 'wx', 0o600)
    writeAll(fd, bytes, fileSystem)
    fileSystem.fsyncSync(fd)
    fileSystem.closeSync(fd); fd = undefined
    if (!exclusive) fileSystem.renameSync(temporary, path)
    syncDirectory(path, fileSystem)
  } finally {
    if (fd !== undefined) fileSystem.closeSync(fd)
    bytes.fill(0)
  }
}

export function createCredentialReadinessPhaseJournal({ path = DEFAULT_CREDENTIAL_READINESS_JOURNAL,
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (typeof path !== 'string' || !path || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let ownedRunId
  const time = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  const currentFor = previous => {
    const current = read(path, fileSystem)
    if (!current || current.runId !== ownedRunId || current.outcome !== null || !previous
      || JSON.stringify(current) !== JSON.stringify(previous)) unavailable()
    return current
  }
  return Object.freeze({
    read: () => read(path, fileSystem),
    assess: (record, at = now()) => assessCredentialReadinessPhase(record, at),
    start() {
      if (read(path, fileSystem)) unavailable()
      const runId = makeRunId(), timestamp = time()
      if (!uuid(runId)) unavailable()
      const record = Object.freeze({ schema, target, runId, sequence: 0, phase: 'LAUNCH_STARTED',
        startedAt: timestamp, updatedAt: timestamp,
        deadlineAt: new Date(Date.parse(timestamp) + CREDENTIAL_READINESS_WINDOW_DEADLINE_MS).toISOString(),
        outcome: null, category: null })
      persist(path, record, fileSystem, true)
      ownedRunId = runId
      return record
    },
    record(previous, phase) {
      const current = currentFor(previous)
      if (assessCredentialReadinessPhase(current, now()).status !== 'ACTIVE_WITHIN_PHASE_BOUND') unavailable()
      if (CREDENTIAL_READINESS_PHASES.indexOf(phase) !== current.sequence + 1) unavailable()
      const next = Object.freeze({ ...current, sequence: current.sequence + 1, phase, updatedAt: time() })
      persist(path, next, fileSystem)
      return next
    },
    finish(previous, outcome, category = null) {
      const current = currentFor(previous)
      if (outcome === 'PASS' && assessCredentialReadinessPhase(current, now()).status !== 'ACTIVE_WITHIN_PHASE_BOUND') unavailable()
      if (!(outcome === 'PASS' && current.phase === 'READ_BYPASS' && category === null
        || outcome === 'HOLD' && categories.includes(category))) unavailable()
      const next = Object.freeze({ ...current, sequence: current.sequence + 1,
        updatedAt: time(), outcome, category })
      persist(path, next, fileSystem)
      ownedRunId = undefined
      return next
    },
  })
}
