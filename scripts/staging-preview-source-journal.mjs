/** Secret-free, one-use phase journal for the fixed Vercel Preview read. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'

export const PREVIEW_SOURCE_JOURNAL_PATH = resolve(import.meta.dirname, '../../implementation-state/staging/tll-preview-source-read-v1.json')
const SCHEMA = 'tll-preview-source-read/v1'
const PROJECT = 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4'
const PHASES = ['LAUNCH_STARTED', 'PROJECT_READ', 'SOURCE_READ']
const OUTCOMES = ['OBSERVED', 'READ_UNAVAILABLE', 'RECONCILIATION_REQUIRED']
const unavailable = () => { throw new Error('Preview source journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
function validate (value) {
  if (!exact(value, ['schema', 'projectId', 'runId', 'sequence', 'phase', 'startedAt', 'updatedAt', 'outcome'])
    || value.schema !== SCHEMA || value.projectId !== PROJECT || !uuid(value.runId)
    || !PHASES.includes(value.phase) || !(value.outcome === null || OUTCOMES.includes(value.outcome))
    || !Number.isSafeInteger(value.sequence) || value.sequence !== PHASES.indexOf(value.phase) + (value.outcome === null ? 0 : 1)
    || typeof value.startedAt !== 'string' || typeof value.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.updatedAt))
    || new Date(Date.parse(value.startedAt)).toISOString() !== value.startedAt
    || new Date(Date.parse(value.updatedAt)).toISOString() !== value.updatedAt
    || Date.parse(value.updatedAt) < Date.parse(value.startedAt)) unavailable()
  return Object.freeze(value)
}
function read (path, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 4096) unavailable()
    return validate(JSON.parse(fileSystem.readFileSync(path, 'utf8')))
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}
function writeAll (fd, bytes, fileSystem) {
  let offset = 0
  while (offset < bytes.length) {
    const count = fileSystem.writeSync(fd, bytes, offset, bytes.length - offset, null)
    if (!Number.isSafeInteger(count) || count < 1 || count > bytes.length - offset) unavailable()
    offset += count
  }
}
function syncDirectory (path, fileSystem) {
  const directory = fileSystem.openSync(dirname(path), 'r')
  try { fileSystem.fsyncSync(directory) } finally { fileSystem.closeSync(directory) }
}
function writeNew (path, value, fileSystem) {
  const bytes = Buffer.from(JSON.stringify(value) + '\n'); let fd
  try {
    fileSystem.mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    fd = fileSystem.openSync(path, 'wx', 0o600)
    writeAll(fd, bytes, fileSystem); fileSystem.fsyncSync(fd)
    fileSystem.closeSync(fd); fd = undefined; syncDirectory(path, fileSystem)
  } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes.fill(0) }
}
function replace (path, value, runId, fileSystem) {
  const temporary = resolve(dirname(path), `.tll-preview-source-${runId}.tmp`)
  const bytes = Buffer.from(JSON.stringify(value) + '\n'); let fd
  try {
    fd = fileSystem.openSync(temporary, 'wx', 0o600)
    writeAll(fd, bytes, fileSystem); fileSystem.fsyncSync(fd)
    fileSystem.closeSync(fd); fd = undefined
    fileSystem.renameSync(temporary, path); syncDirectory(path, fileSystem)
  } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes.fill(0) }
}
export function createPreviewSourceReadJournal ({ path = PREVIEW_SOURCE_JOURNAL_PATH,
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (typeof path !== 'string' || !path || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let owned
  const timestamp = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  const current = previous => {
    const value = read(path, fileSystem)
    if (!previous || !value || previous.runId !== owned || value.runId !== owned || value.outcome !== null
      || JSON.stringify(previous) !== JSON.stringify(value)) unavailable()
    return value
  }
  return Object.freeze({
    read: () => read(path, fileSystem),
    start () {
      if (read(path, fileSystem)) unavailable()
      const runId = makeRunId(), time = timestamp()
      const record = validate({ schema: SCHEMA, projectId: PROJECT, runId, sequence: 0,
        phase: 'LAUNCH_STARTED', startedAt: time, updatedAt: time, outcome: null })
      writeNew(path, record, fileSystem); owned = runId; return record
    },
    record (previous, phase) {
      const value = current(previous), index = PHASES.indexOf(phase)
      if (index !== PHASES.indexOf(value.phase) + 1) unavailable()
      const next = validate({ ...value, sequence: value.sequence + 1, phase, updatedAt: timestamp() })
      replace(path, next, owned, fileSystem); return next
    },
    finish (previous, outcome) {
      const value = current(previous)
      if (!OUTCOMES.includes(outcome)) unavailable()
      const next = validate({ ...value, sequence: value.sequence + 1, updatedAt: timestamp(), outcome })
      replace(path, next, owned, fileSystem); owned = undefined; return next
    },
  })
}
