/** Secret-free, one-use intent journal for a future fixed staging-branch push. No Git transport. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'

export const PREVIEW_GIT_PUBLISH_JOURNAL_PATH = resolve(import.meta.dirname, '../../implementation-state/staging/tll-preview-git-publish-v1.json')
const SCHEMA = 'tll-preview-git-publish/v1'
const BRANCH = 'codex/tll-integration'
const PHASES = ['PREPARED', 'DISPATCH_RECORDED']
const OUTCOMES = ['ABORTED_BEFORE_PUSH', 'REMOTE_SELECTED', 'REMOTE_NOT_SELECTED', 'REMOTE_UNAVAILABLE']
const unavailable = () => { throw new Error('Preview Git publish journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const fullSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
function validate(value) {
  if (!exact(value, ['schema', 'branch', 'runId', 'selectedCommit', 'predecessorCommit', 'manifestSha256',
    'sequence', 'phase', 'startedAt', 'updatedAt', 'outcome'])
    || value.schema !== SCHEMA || value.branch !== BRANCH || !uuid(value.runId)
    || !fullSha(value.selectedCommit) || !fullSha(value.predecessorCommit)
    || value.selectedCommit === value.predecessorCommit || !digest(value.manifestSha256)
    || !PHASES.includes(value.phase) || !(value.outcome === null || OUTCOMES.includes(value.outcome))
    || (value.outcome === 'ABORTED_BEFORE_PUSH' && value.phase !== 'PREPARED')
    || (value.outcome && value.outcome !== 'ABORTED_BEFORE_PUSH' && value.phase !== 'DISPATCH_RECORDED')
    || value.sequence !== PHASES.indexOf(value.phase) + (value.outcome === null ? 0 : 1)
    || !iso(value.startedAt) || !iso(value.updatedAt)
    || Date.parse(value.updatedAt) < Date.parse(value.startedAt)) unavailable()
  return Object.freeze(value)
}
function read(path, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 4096) unavailable()
    return validate(JSON.parse(fileSystem.readFileSync(path, 'utf8')))
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}
function privateDirectory(path, fileSystem) {
  fileSystem.mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const stat = fileSystem.lstatSync(dirname(path))
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || (stat.mode & 0o077) !== 0) unavailable()
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
  const directory = fileSystem.openSync(dirname(path), 'r')
  try { fileSystem.fsyncSync(directory) } finally { fileSystem.closeSync(directory) }
}
function writeNew(path, value, fileSystem) {
  const bytes = Buffer.from(JSON.stringify(value) + '\n'); let fd
  try {
    privateDirectory(path, fileSystem)
    fd = fileSystem.openSync(path, 'wx', 0o600)
    writeAll(fd, bytes, fileSystem); fileSystem.fsyncSync(fd)
    fileSystem.closeSync(fd); fd = undefined; syncDirectory(path, fileSystem)
  } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes.fill(0) }
}
function replace(path, value, runId, fileSystem) {
  const temporary = resolve(dirname(path), `.tll-preview-git-publish-${runId}.tmp`)
  const bytes = Buffer.from(JSON.stringify(value) + '\n'); let fd
  try {
    privateDirectory(path, fileSystem)
    fd = fileSystem.openSync(temporary, 'wx', 0o600)
    writeAll(fd, bytes, fileSystem); fileSystem.fsyncSync(fd)
    fileSystem.closeSync(fd); fd = undefined
    fileSystem.renameSync(temporary, path); syncDirectory(path, fileSystem)
  } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes.fill(0) }
}
export function createPreviewGitPublishJournal({ path = PREVIEW_GIT_PUBLISH_JOURNAL_PATH,
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (typeof path !== 'string' || !path || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let owned, latest, dispatchAttempted = false, finishAttempted = false
  const timestamp = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  const current = previous => {
    const value = read(path, fileSystem)
    if (!previous || !value || previous.runId !== owned || value.runId !== owned || value.outcome !== null
      || JSON.stringify(previous) !== JSON.stringify(latest)
      || JSON.stringify(value) !== JSON.stringify(latest)) unavailable()
    return value
  }
  return Object.freeze({
    read: () => read(path, fileSystem),
    start({ selectedCommit, predecessorCommit, manifestSha256 } = {}) {
      if (latest || dispatchAttempted || finishAttempted || read(path, fileSystem)) unavailable()
      const runId = makeRunId(), time = timestamp()
      const record = validate({ schema: SCHEMA, branch: BRANCH, runId, selectedCommit, predecessorCommit,
        manifestSha256, sequence: 0, phase: 'PREPARED', startedAt: time, updatedAt: time, outcome: null })
      writeNew(path, record, fileSystem); owned = runId; latest = record; return record
    },
    recordDispatch(previous) {
      const value = current(previous)
      if (value.phase !== 'PREPARED' || dispatchAttempted) unavailable()
      const next = validate({ ...value, sequence: 1, phase: 'DISPATCH_RECORDED', updatedAt: timestamp() })
      dispatchAttempted = true
      replace(path, next, owned, fileSystem); latest = next; return next
    },
    finish(previous, outcome) {
      const value = current(previous)
      if (!OUTCOMES.includes(outcome) || finishAttempted) unavailable()
      const next = validate({ ...value, sequence: value.sequence + 1, updatedAt: timestamp(), outcome })
      finishAttempted = true
      replace(path, next, owned, fileSystem); latest = next; owned = undefined; return next
    },
  })
}
