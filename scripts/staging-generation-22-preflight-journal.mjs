/** One-use, secret-free records for the two independent Gen22 pre-arm reads. */
import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { JOURNAL_PATH } from './staging-generation-22-journal.mjs'
import { RECOVERY_JOURNAL_PATH } from './staging-generation-22-recovery-journal.mjs'

export const STAGING_GENERATION_22_PREFLIGHT_JOURNAL_ENABLED = false
export const STAGING_GENERATION_22_PREFLIGHT_PATHS = Object.freeze({
  vercel: resolve(import.meta.dirname, '../../implementation-state/staging/tll-generation-22-preflight-vercel-v1.json'),
  supabase: resolve(import.meta.dirname, '../../implementation-state/staging/tll-generation-22-preflight-supabase-v1.json'),
})
const SCHEMA = 'tll-generation-22-preflight/v1'
const TARGETS = Object.freeze({ vercel: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4',
  supabase: 'qdmvngjwkcsilzmqksme' })
const GOOD = Object.freeze({ vercel: 'GENERATION_22_NAMES_ABSENT', supabase: 'DISABLED_BASELINE_OBSERVED' })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const HASH = /^[a-f0-9]{64}$/
const unavailable = () => { throw Error('Generation 22 preflight journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value

/** Fixed-path absence check; never constructs either write-capable journal. */
export function assertStagingGeneration22DispatchRecordsAbsent({ fileSystem = fs } = {}) {
  for (const path of [JOURNAL_PATH, RECOVERY_JOURNAL_PATH]) {
    try { fileSystem.lstatSync(path); unavailable() }
    catch (error) { if (error?.code !== 'ENOENT') unavailable() }
  }
  return true
}

function validate(record, mode) {
  if (!exact(record, ['schema', 'mode', 'target', 'runId', 'state', 'startedAt', 'finishedAt', 'outcome', 'resultSha256'])
    || record.schema !== SCHEMA || record.mode !== mode || record.target !== TARGETS[mode]
    || !UUID.test(record.runId) || !iso(record.startedAt)) unavailable()
  if (record.state === 'CLAIMED') {
    if (record.finishedAt !== null || record.outcome !== null || record.resultSha256 !== null) unavailable()
  } else if (record.state === 'FINISHED') {
    if (!iso(record.finishedAt) || Date.parse(record.finishedAt) < Date.parse(record.startedAt)
      || ![GOOD[mode], 'HOLD', 'READ_UNAVAILABLE'].includes(record.outcome)
      || (record.outcome === 'READ_UNAVAILABLE' ? record.resultSha256 !== null : !HASH.test(record.resultSha256))) unavailable()
  } else unavailable()
  return Object.freeze(record)
}

function read(path, mode, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
      || (stat.mode & 0o777) !== 0o600 || stat.size > 2048) unavailable()
    return validate(JSON.parse(fileSystem.readFileSync(path, 'utf8')), mode)
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

function write(path, record, fileSystem, temporary) {
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`)
  let descriptor
  try {
    fileSystem.mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    const directory = fileSystem.lstatSync(dirname(path))
    if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o777) !== 0o700) unavailable()
    descriptor = fileSystem.openSync(temporary ?? path, 'wx', 0o600)
    let offset = 0
    while (offset < bytes.length) {
      const count = fileSystem.writeSync(descriptor, bytes, offset, bytes.length - offset, null)
      if (!Number.isSafeInteger(count) || count < 1) unavailable()
      offset += count
    }
    fileSystem.fsyncSync(descriptor); fileSystem.closeSync(descriptor); descriptor = undefined
    if (temporary) fileSystem.renameSync(temporary, path)
    const directoryDescriptor = fileSystem.openSync(dirname(path), 'r')
    try { fileSystem.fsyncSync(directoryDescriptor) } finally { fileSystem.closeSync(directoryDescriptor) }
  } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
}

export function createStagingGeneration22PreflightJournal({ mode, path = STAGING_GENERATION_22_PREFLIGHT_PATHS[mode],
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (!Object.hasOwn(TARGETS, mode) || typeof path !== 'string' || !path
    || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let owned
  const timestamp = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  return Object.freeze({
    read: () => read(path, mode, fileSystem),
    claim() {
      if (read(path, mode, fileSystem)) unavailable()
      const record = validate({ schema: SCHEMA, mode, target: TARGETS[mode], runId: makeRunId(),
        state: 'CLAIMED', startedAt: timestamp(), finishedAt: null, outcome: null, resultSha256: null }, mode)
      write(path, record, fileSystem); owned = record.runId; return record
    },
    finish(claim, outcome, result) {
      const current = read(path, mode, fileSystem)
      if (!current || current.state !== 'CLAIMED' || current.runId !== owned || claim?.runId !== owned
        || ![GOOD[mode], 'HOLD', 'READ_UNAVAILABLE'].includes(outcome)
        || (outcome === 'READ_UNAVAILABLE' ? result !== null : !result || typeof result !== 'object')) unavailable()
      const resultSha256 = result === null ? null : createHash('sha256').update(JSON.stringify(result)).digest('hex')
      const final = validate({ ...current, state: 'FINISHED', finishedAt: timestamp(), outcome, resultSha256 }, mode)
      write(path, final, fileSystem, resolve(dirname(path), `.tll-generation-22-preflight-${owned}.tmp`))
      owned = undefined; return final
    },
  })
}
