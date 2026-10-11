/** Durable, single-attempt record for a future protected staging Preview. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStagingPreviewDeploymentRequest } from './staging-surface-preview-deployment-request.mjs'

export const STAGING_PREVIEW_DEPLOYMENT_JOURNAL_ENABLED = false
export const DEFAULT_PREVIEW_DEPLOYMENT_JOURNAL = fileURLToPath(new URL('../../implementation-state/staging/tll-preview-deployment-v1.json', import.meta.url))
const SCHEMA = 'tll-staging-preview-deployment/v1'
const unavailable = () => { throw new Error('Staging Preview deployment journal unavailable') }
const idPattern = /^dpl_[A-Za-z0-9]+$/
const runPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const phases = new Set(['CLAIMED', 'POST_DISPATCH', 'POST_ACK', 'VERIFIED', 'HOLD_PRE_DISPATCH'])
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function validRecord(value) {
  if (!exact(value, ['schema', 'runId', 'phase', 'sequence', 'branch', 'sourceCommit', 'manifestSha256',
    'publicCustomer', 'publicCart', 'deploymentId', 'createdAt', 'updatedAt'])
    || value.schema !== SCHEMA || !runPattern.test(value.runId ?? '') || !phases.has(value.phase)
    || value.branch !== 'codex/tll-integration' || !/^[a-f0-9]{40}$/.test(value.sourceCommit ?? '')
    || !/^[a-f0-9]{64}$/.test(value.manifestSha256 ?? '')
    || typeof value.publicCustomer !== 'boolean' || value.publicCart !== value.publicCustomer
    || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || value.sequence > 3
    || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') return false
  const created = Date.parse(value.createdAt), updated = Date.parse(value.updatedAt)
  if (!Number.isFinite(created) || !Number.isFinite(updated) || updated < created
    || new Date(created).toISOString() !== value.createdAt || new Date(updated).toISOString() !== value.updatedAt) return false
  const expectedSequence = { CLAIMED: 0, POST_DISPATCH: 1, POST_ACK: 2, VERIFIED: 3, HOLD_PRE_DISPATCH: 1 }[value.phase]
  return value.sequence === expectedSequence
    && (value.phase === 'POST_ACK' || value.phase === 'VERIFIED' ? idPattern.test(value.deploymentId ?? '') : value.deploymentId === null)
}

function readRecord(path, fileSystem) {
  let fd, bytes
  try {
    fd = fileSystem.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
    const stat = fileSystem.fstatSync(fd)
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size < 1 || stat.size > 4096) unavailable()
    bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const count = fileSystem.readSync(fd, bytes, offset, bytes.length - offset, null)
      if (!Number.isSafeInteger(count) || count < 1 || count > bytes.length - offset) unavailable()
      offset += count
    }
    const named = fileSystem.lstatSync(path), after = fileSystem.fstatSync(fd)
    if (!named.isFile() || named.isSymbolicLink() || named.dev !== stat.dev || named.ino !== stat.ino
      || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) unavailable()
    const value = JSON.parse(bytes.toString('utf8'))
    if (!validRecord(value)) unavailable()
    return Object.freeze(value)
  } catch (error) { if (error?.code === 'ENOENT' && fd === undefined) return null; unavailable() }
  finally { bytes?.fill(0); if (fd !== undefined) fileSystem.closeSync(fd) }
}

function syncDirectory(path, fileSystem) {
  const fd = fileSystem.openSync(dirname(path), 'r')
  try { fileSystem.fsyncSync(fd) } finally { fileSystem.closeSync(fd) }
}
function writeAll(fd, bytes, fileSystem) {
  let offset = 0
  while (offset < bytes.length) {
    const count = fileSystem.writeSync(fd, bytes, offset, bytes.length - offset, null)
    if (!Number.isSafeInteger(count) || count < 1 || count > bytes.length - offset) unavailable()
    offset += count
  }
}
function replace(path, record, fileSystem) {
  const temporary = resolve(dirname(path), `.tll-preview-deployment.${record.runId}.tmp`)
  const bytes = Buffer.from(JSON.stringify(record) + '\n')
  let fd
  try {
    fd = fileSystem.openSync(temporary, 'wx', 0o600)
    writeAll(fd, bytes, fileSystem); fileSystem.fsyncSync(fd)
    fileSystem.closeSync(fd); fd = undefined
    fileSystem.renameSync(temporary, path); syncDirectory(path, fileSystem)
  } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes.fill(0) }
}

export function createStagingPreviewDeploymentJournal({ path = DEFAULT_PREVIEW_DEPLOYMENT_JOURNAL,
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (typeof path !== 'string' || !path || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let ownedRunId
  const timestamp = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  const currentFor = previous => {
    const current = readRecord(path, fileSystem)
    if (!previous || !current || previous.runId !== ownedRunId || current.runId !== ownedRunId
      || JSON.stringify(previous) !== JSON.stringify(current)) unavailable()
    return current
  }
  const transition = (previous, from, to, deploymentId = null) => {
    const current = currentFor(previous)
    if (current.phase !== from) unavailable()
    const at = timestamp()
    if (Date.parse(at) < Date.parse(current.updatedAt)) unavailable()
    const next = Object.freeze({ ...current, phase: to, sequence: current.sequence + 1, deploymentId, updatedAt: at })
    if (!validRecord(next)) unavailable()
    replace(path, next, fileSystem)
    if (to === 'VERIFIED' || to === 'HOLD_PRE_DISPATCH') ownedRunId = undefined
    return next
  }
  return Object.freeze({
    read: () => readRecord(path, fileSystem),
    claim(input) {
      buildStagingPreviewDeploymentRequest(input)
      const directory = dirname(path)
      fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 })
      const dirStat = fileSystem.lstatSync(directory)
      if (!dirStat.isDirectory() || dirStat.isSymbolicLink() || (dirStat.mode & 0o777) !== 0o700
        || readRecord(path, fileSystem)) unavailable()
      const runId = makeRunId(), at = timestamp()
      if (!runPattern.test(runId)) unavailable()
      const record = Object.freeze({ schema: SCHEMA, runId, phase: 'CLAIMED', sequence: 0,
        branch: input.branch, sourceCommit: input.sourceCommit, manifestSha256: input.manifestSha256,
        publicCustomer: input.publicCustomer, publicCart: input.publicCart, deploymentId: null,
        createdAt: at, updatedAt: at })
      const bytes = Buffer.from(JSON.stringify(record) + '\n')
      let fd
      try {
        fd = fileSystem.openSync(path, 'wx', 0o600)
        writeAll(fd, bytes, fileSystem); fileSystem.fsyncSync(fd)
        fileSystem.closeSync(fd); fd = undefined
        syncDirectory(path, fileSystem); ownedRunId = runId
        return record
      } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes.fill(0) }
    },
    dispatch: record => transition(record, 'CLAIMED', 'POST_DISPATCH'),
    accepted: (record, deploymentId) => transition(record, 'POST_DISPATCH', 'POST_ACK', deploymentId),
    verified: record => transition(record, 'POST_ACK', 'VERIFIED', record.deploymentId),
    holdBeforeDispatch: record => transition(record, 'CLAIMED', 'HOLD_PRE_DISPATCH'),
  })
}
