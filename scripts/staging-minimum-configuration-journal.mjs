/** Exclusive, secret-free record for one post-rotation Supabase staging read. */
import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'

export const STAGING_MINIMUM_CONFIGURATION_JOURNAL_PATH = resolve(import.meta.dirname,
  '../../implementation-state/staging/tll-minimum-configuration-supabase-v1.json')
const SCHEMA = 'tll-minimum-configuration-supabase/v1'
const OUTCOMES = new Set(['DISABLED_BASELINE_OBSERVED', 'HOLD', 'READ_UNAVAILABLE'])
const unavailable = () => { throw new Error('Staging minimum configuration journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function validate(value) {
  if (!exact(value, ['schema', 'projectRef', 'runId', 'state', 'startedAt', 'finishedAt', 'outcome', 'resultSha256'])
    || value.schema !== SCHEMA || value.projectRef !== STAGING_PROJECT_REF
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.runId)
    || !Number.isFinite(Date.parse(value.startedAt)) || new Date(Date.parse(value.startedAt)).toISOString() !== value.startedAt) unavailable()
  if (value.state === 'CLAIMED') {
    if (value.finishedAt !== null || value.outcome !== null || value.resultSha256 !== null) unavailable()
  } else if (value.state === 'FINISHED') {
    if (!OUTCOMES.has(value.outcome) || !Number.isFinite(Date.parse(value.finishedAt))
      || new Date(Date.parse(value.finishedAt)).toISOString() !== value.finishedAt
      || Date.parse(value.finishedAt) < Date.parse(value.startedAt)
      || (value.outcome === 'READ_UNAVAILABLE' ? value.resultSha256 !== null : !/^[a-f0-9]{64}$/.test(value.resultSha256))) unavailable()
  } else unavailable()
  return Object.freeze(value)
}

function read(path, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 2_048) unavailable()
    return validate(JSON.parse(fileSystem.readFileSync(path, 'utf8')))
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

function durableWrite(path, value, fileSystem, temporary) {
  const bytes = Buffer.from(JSON.stringify(value) + '\n'); let descriptor
  try {
    fileSystem.mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    const directoryStat = fileSystem.lstatSync(dirname(path))
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || (directoryStat.mode & 0o777) !== 0o700) unavailable()
    descriptor = fileSystem.openSync(temporary ?? path, 'wx', 0o600)
    let offset = 0
    while (offset < bytes.length) {
      const written = fileSystem.writeSync(descriptor, bytes, offset, bytes.length - offset, null)
      if (!Number.isSafeInteger(written) || written <= 0) unavailable()
      offset += written
    }
    fileSystem.fsyncSync(descriptor); fileSystem.closeSync(descriptor); descriptor = undefined
    if (temporary) fileSystem.renameSync(temporary, path)
    const directory = fileSystem.openSync(dirname(path), 'r')
    try { fileSystem.fsyncSync(directory) } finally { fileSystem.closeSync(directory) }
  } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
}

export function createStagingMinimumConfigurationJournal({ path = STAGING_MINIMUM_CONFIGURATION_JOURNAL_PATH,
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (typeof path !== 'string' || !path || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let owned
  const timestamp = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  return Object.freeze({
    read: () => read(path, fileSystem),
    claim() {
      if (read(path, fileSystem)) unavailable()
      const record = validate({ schema: SCHEMA, projectRef: STAGING_PROJECT_REF, runId: makeRunId(), state: 'CLAIMED',
        startedAt: timestamp(), finishedAt: null, outcome: null, resultSha256: null })
      durableWrite(path, record, fileSystem); owned = record.runId; return record
    },
    finish(claim, outcome, result) {
      const current = read(path, fileSystem)
      if (!current || current.state !== 'CLAIMED' || current.runId !== owned || claim?.runId !== owned
        || !OUTCOMES.has(outcome) || (outcome === 'READ_UNAVAILABLE' ? result !== null : !result || typeof result !== 'object')) unavailable()
      const resultSha256 = result === null ? null : createHash('sha256').update(JSON.stringify(result)).digest('hex')
      const final = validate({ ...current, state: 'FINISHED', finishedAt: timestamp(), outcome, resultSha256 })
      durableWrite(path, final, fileSystem, resolve(dirname(path), `.tll-minimum-supabase-${owned}.tmp`))
      owned = undefined; return final
    },
  })
}
