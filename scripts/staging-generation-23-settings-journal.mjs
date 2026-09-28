/** One-use, secret-free record for the six existing staging password settings. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PROJECT_REF, VERCEL_PASSWORD_NAMES, EDGE_PASSWORD_NAME, EDGE_READINESS_WINDOW_NAME } from './staging-generation-23-password-material.mjs'
import { HOSTED_BASELINE_VERCEL_TARGET } from './staging-account-hosted-baseline-vercel.mjs'

export const STAGING_GENERATION_23_SETTINGS_JOURNAL_ENABLED = false
export const JOURNAL_PATH = resolve(import.meta.dirname,
  '../../implementation-state/staging/tll-generation-23-settings-v18.json')
export const OPERATION_IDS = Object.freeze([
  ...VERCEL_PASSWORD_NAMES.map(name => `VERCEL_PATCH:${name}`), `SUPABASE_EDGE:${EDGE_PASSWORD_NAME}`,
  `SUPABASE_EDGE:${EDGE_READINESS_WINDOW_NAME}`,
])
const SCHEMA = 'tll-generation-23-settings/v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const HASH = /^[a-f0-9]{64}$/
const ID = /^[A-Za-z0-9_-]{4,128}$/
const unavailable = () => { throw new Error('Generation 23 settings journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value

function validTargets(targets) {
  return Array.isArray(targets) && targets.length === VERCEL_PASSWORD_NAMES.length
    && targets.every((target, index) => exact(target, ['name', 'id', 'branch', 'target', 'classification'])
      && target.name === VERCEL_PASSWORD_NAMES[index] && ID.test(target.id)
      && target.branch === HOSTED_BASELINE_VERCEL_TARGET.branch
      && target.target === 'preview' && target.classification === 'sensitive')
    && new Set(targets.map(target => target.id)).size === targets.length
}

function validate(record) {
  if (!exact(record, ['schema', 'projectRef', 'runId', 'expiresAt', 'createdAt', 'updatedAt',
    'targets', 'state', 'nextIndex', 'pending', 'receiptDigests'])
    || record.schema !== SCHEMA || record.projectRef !== PROJECT_REF || !UUID.test(record.runId)
    || !iso(record.expiresAt) || !iso(record.createdAt) || !iso(record.updatedAt)
    || Date.parse(record.updatedAt) < Date.parse(record.createdAt)
    || Date.parse(record.expiresAt) <= Date.parse(record.createdAt)
    || Date.parse(record.expiresAt) - Date.parse(record.createdAt) > 3_600_000
    || !validTargets(record.targets) || !Number.isSafeInteger(record.nextIndex)
    || record.nextIndex < 0 || record.nextIndex > OPERATION_IDS.length
    || !Array.isArray(record.receiptDigests) || record.receiptDigests.length !== record.nextIndex
    || record.receiptDigests.some(value => !HASH.test(value))) unavailable()
  if (record.state === 'READY') {
    if (record.pending !== null || record.nextIndex === OPERATION_IDS.length) unavailable()
  } else if (record.state === 'DISPATCHED') {
    if (record.pending !== OPERATION_IDS[record.nextIndex]) unavailable()
  } else if (record.state === 'HOLD') {
    if (record.pending !== null && record.pending !== OPERATION_IDS[record.nextIndex]) unavailable()
  } else if (record.state === 'FINISHED') {
    if (record.nextIndex !== OPERATION_IDS.length || record.pending !== null) unavailable()
  } else unavailable()
  return Object.freeze(record)
}

function read(path, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
      || (stat.mode & 0o777) !== 0o600 || stat.size > 8192) unavailable()
    return validate(JSON.parse(fileSystem.readFileSync(path, 'utf8')))
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

function persist(path, record, fileSystem, first) {
  const directory = dirname(path)
  const temporary = first ? path : resolve(directory,
    `.tll-gen23-settings-${record.runId}-${record.nextIndex}-${record.state}.tmp`)
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

export function createStagingGeneration23SettingsJournal({ path = JOURNAL_PATH, fileSystem = fs,
  makeRunId = randomUUID, now = Date.now } = {}) {
  if (!STAGING_GENERATION_23_SETTINGS_JOURNAL_ENABLED || typeof path !== 'string' || !path
    || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let owned
  const timestamp = () => { const time = now(); if (!Number.isFinite(time)) unavailable(); return new Date(time).toISOString() }
  const update = (previous, change) => {
    const current = read(path, fileSystem)
    if (!owned || previous?.runId !== owned || JSON.stringify(current) !== JSON.stringify(previous)) unavailable()
    const next = validate({ ...previous, ...change, updatedAt: timestamp() })
    persist(path, next, fileSystem, false)
    return next
  }
  return Object.freeze({
    read: () => read(path, fileSystem),
    claim(targets, expiresAt) {
      if (read(path, fileSystem) || !validTargets(targets) || !iso(expiresAt)) unavailable()
      const createdAt = timestamp()
      const record = validate({ schema: SCHEMA, projectRef: PROJECT_REF, runId: makeRunId(),
        expiresAt, createdAt, updatedAt: createdAt, targets: targets.map(value => ({ ...value })),
        state: 'READY', nextIndex: 0, pending: null, receiptDigests: [] })
      if (Date.parse(expiresAt) <= now()) unavailable()
      persist(path, record, fileSystem, true); owned = record.runId; return record
    },
    dispatch(previous, operationId) {
      if (previous?.state !== 'READY' || operationId !== OPERATION_IDS[previous.nextIndex]
        || Date.parse(previous.expiresAt) <= now()) unavailable()
      return update(previous, { state: 'DISPATCHED', pending: operationId })
    },
    confirm(previous, receiptSha256) {
      if (previous?.state !== 'DISPATCHED' || !HASH.test(receiptSha256)
        || Date.parse(previous.expiresAt) <= now()) unavailable()
      const nextIndex = previous.nextIndex + 1
      const next = update(previous, { state: nextIndex === OPERATION_IDS.length ? 'FINISHED' : 'READY',
        nextIndex, pending: null, receiptDigests: [...previous.receiptDigests, receiptSha256] })
      if (next.state === 'FINISHED') owned = undefined
      return next
    },
    hold(previous) {
      if (!['READY', 'DISPATCHED'].includes(previous?.state)) unavailable()
      const next = update(previous, { state: 'HOLD' }); owned = undefined; return next
    },
  })
}
