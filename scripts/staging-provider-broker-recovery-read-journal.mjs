/** Secret-free, one-use receipt for a future read-only staging recovery attempt. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROVIDER_IDENTIFIER, STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'
import { PREVIEW_READINESS_TARGET } from './staging-provider-preview-readiness-session.mjs'
import { BROKER_RECOVERY_EXPECTED_SOURCE } from './staging-provider-broker-recovery-collection.mjs'

export const BROKER_RECOVERY_READ_JOURNAL_ENABLED = false
export const BROKER_RECOVERY_READ_JOURNAL_PATH = fileURLToPath(new URL('../../implementation-state/staging/tll-provider-broker-recovery-read-v1.jsonl', import.meta.url))
export const BROKER_RECOVERY_READ_JOURNAL_DEADLINE_MS = 60_000
const SCHEMA = 'tll-staging-provider-broker-recovery-read/v1'
const TERMINAL = new Set(['SAFE_HELD_CONFIGURATION_OBSERVED', 'CONFIGURATION_CONSISTENT_SECRET_UNPROVEN',
  'RECONCILIATION_REQUIRED', 'READ_UNAVAILABLE', 'PREVIEW_IDENTITY_CHANGED'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const unavailable = () => { throw Error('Staging broker recovery read journal unavailable') }
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value

function parentReady(path, fileSystem) {
  const stat = fileSystem.lstatSync(dirname(path))
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || (stat.mode & 0o777) !== 0o700) unavailable()
}
function syncParent(path, fileSystem) {
  const fd = fileSystem.openSync(dirname(path), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
  try { fileSystem.fsyncSync(fd) } finally { fileSystem.closeSync(fd) }
}
function writeAll(fd, bytes, fileSystem) {
  let offset = 0
  while (offset < bytes.length) {
    const written = fileSystem.writeSync(fd, bytes, offset, bytes.length - offset, null)
    if (!Number.isSafeInteger(written) || written < 1 || written > bytes.length - offset) unavailable()
    offset += written
  }
}
function validIntent(value) {
  return exact(value, ['schema', 'runId', 'phaseRunId', 'projectRef', 'providerIdentifier', 'deploymentId',
    'immutableUrl', 'sourceCommit', 'startedAt', 'deadlineMs'])
    && value.schema === SCHEMA && UUID.test(value.runId) && UUID.test(value.phaseRunId)
    && value.projectRef === STAGING_PROJECT_REF && value.providerIdentifier === PROVIDER_IDENTIFIER
    && value.deploymentId === PREVIEW_READINESS_TARGET.deploymentId
    && value.immutableUrl === PREVIEW_READINESS_TARGET.immutableUrl
    && value.sourceCommit === BROKER_RECOVERY_EXPECTED_SOURCE && iso(value.startedAt)
    && value.deadlineMs === BROKER_RECOVERY_READ_JOURNAL_DEADLINE_MS
}
function validTerminal(value, intent) {
  return exact(value, ['runId', 'status', 'endedAt']) && value.runId === intent.runId
    && TERMINAL.has(value.status) && iso(value.endedAt)
    && Date.parse(value.endedAt) >= Date.parse(intent.startedAt)
}
function readExisting(path, fileSystem) {
  let fd, bytes
  try {
    parentReady(path, fileSystem)
    fd = fileSystem.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
    const stat = fileSystem.fstatSync(fd)
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid()
      || (stat.mode & 0o777) !== 0o600 || stat.size < 1 || stat.size > 2048) unavailable()
    bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const count = fileSystem.readSync(fd, bytes, offset, bytes.length - offset, null)
      if (!Number.isSafeInteger(count) || count < 1 || count > bytes.length - offset) unavailable()
      offset += count
    }
    if (fileSystem.fstatSync(fd).size !== stat.size) unavailable()
    const content = bytes.toString('utf8')
    if (!content.endsWith('\n')) unavailable()
    const lines = content.slice(0, -1).split('\n')
    if (lines.length < 1 || lines.length > 2) unavailable()
    const intent = JSON.parse(lines[0])
    if (!validIntent(intent)) unavailable()
    const terminal = lines.length === 2 ? JSON.parse(lines[1]) : null
    if (terminal !== null && !validTerminal(terminal, intent)) unavailable()
    return Object.freeze({ intent: Object.freeze(intent), terminal: terminal === null ? null : Object.freeze(terminal) })
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    unavailable()
  } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes?.fill(0) }
}
function verifyNamedRecord(path, fd, intent, terminal, fileSystem) {
  const held = fileSystem.fstatSync(fd), named = fileSystem.lstatSync(path)
  const current = readExisting(path, fileSystem)
  if (!held.isFile() || held.nlink !== 1 || held.uid !== process.getuid()
    || (held.mode & 0o777) !== 0o600 || held.dev !== named.dev || held.ino !== named.ino
    || !current || JSON.stringify(current.intent) !== JSON.stringify(intent)
    || JSON.stringify(current.terminal) !== JSON.stringify(terminal)) unavailable()
}

/** A claimed file stays consumed even if finish fails or the process stops. */
export function createBrokerRecoveryReadJournal({ path = BROKER_RECOVERY_READ_JOURNAL_PATH,
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (!isAbsolute(path) || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let fd, owned
  const close = () => { if (fd !== undefined) { fileSystem.closeSync(fd); fd = undefined }; owned = undefined }
  return Object.freeze({
    read: () => readExisting(path, fileSystem),
    claim({ phaseRunId } = {}) {
      if (fd !== undefined || !UUID.test(phaseRunId)) unavailable()
      fileSystem.mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
      parentReady(path, fileSystem)
      const runId = makeRunId(), startedAt = new Date(now()).toISOString()
      const intent = { schema: SCHEMA, runId, phaseRunId, projectRef: STAGING_PROJECT_REF,
        providerIdentifier: PROVIDER_IDENTIFIER, deploymentId: PREVIEW_READINESS_TARGET.deploymentId,
        immutableUrl: PREVIEW_READINESS_TARGET.immutableUrl, sourceCommit: BROKER_RECOVERY_EXPECTED_SOURCE,
        startedAt, deadlineMs: BROKER_RECOVERY_READ_JOURNAL_DEADLINE_MS }
      if (!validIntent(intent)) unavailable()
      let bytes
      try {
        fd = fileSystem.openSync(path, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL
          | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600)
        bytes = Buffer.from(`${JSON.stringify(intent)}\n`)
        writeAll(fd, bytes, fileSystem)
        fileSystem.fsyncSync(fd); syncParent(path, fileSystem)
        verifyNamedRecord(path, fd, intent, null, fileSystem)
        owned = Object.freeze(intent)
        return owned
      } catch { close(); unavailable() } finally { bytes?.fill(0) }
    },
    assertClaim(intent) {
      if (fd === undefined || intent !== owned) unavailable()
      verifyNamedRecord(path, fd, owned, null, fileSystem)
    },
    finish(intent, status) {
      if (fd === undefined || intent !== owned || !TERMINAL.has(status)) unavailable()
      const endedAt = new Date(now()).toISOString()
      const terminal = { runId: owned.runId, status, endedAt }
      if (!validTerminal(terminal, owned)) unavailable()
      verifyNamedRecord(path, fd, owned, null, fileSystem)
      if (Date.parse(endedAt) - Date.parse(owned.startedAt) > BROKER_RECOVERY_READ_JOURNAL_DEADLINE_MS) unavailable()
      const bytes = Buffer.from(`${JSON.stringify(terminal)}\n`)
      try {
        writeAll(fd, bytes, fileSystem)
        fileSystem.fsyncSync(fd); syncParent(path, fileSystem)
        verifyNamedRecord(path, fd, owned, terminal, fileSystem)
        return Object.freeze(terminal)
      } finally { bytes.fill(0); close() }
    },
    close,
  })
}
