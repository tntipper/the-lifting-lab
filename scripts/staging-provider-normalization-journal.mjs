/** Secret-free, single-use dispatch journal for staging provider normalization. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROVIDER_IDENTIFIER, STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'

export const PROVIDER_NORMALIZATION_JOURNAL_ENABLED = false
export const DEFAULT_PROVIDER_NORMALIZATION_JOURNAL = fileURLToPath(new URL('../../implementation-state/staging/tll-provider-normalization-v1.json', import.meta.url))
const SCHEMA = 'tll-staging-provider-normalization/v1'
const STATES = Object.freeze(['INTENT_RECORDED', 'UPDATE_ACKNOWLEDGED', 'NORMALIZED_VERIFIED', 'RECONCILIATION_REQUIRED'])
const unavailable = () => { throw new Error('Staging provider normalization journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const hash64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const uuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)

function syncDirectory(path, fileSystem) {
  const fd = fileSystem.openSync(dirname(path), 'r')
  try { fileSystem.fsyncSync(fd) } finally { fileSystem.closeSync(fd) }
}

function readJournal(path, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 8_192) unavailable()
    const value = JSON.parse(fileSystem.readFileSync(path, 'utf8'))
    if (!exact(value, ['schema', 'projectRef', 'providerIdentifier', 'runId', 'preflightSha256', 'state', 'createdAt', 'updatedAt'])
      || value.schema !== SCHEMA || value.projectRef !== STAGING_PROJECT_REF || value.providerIdentifier !== PROVIDER_IDENTIFIER
      || !uuid(value.runId) || !hash64(value.preflightSha256) || !STATES.includes(value.state)
      || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string'
      || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt))) unavailable()
    return Object.freeze(value)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    unavailable()
  }
}

export function createProviderNormalizationJournal({ path = DEFAULT_PROVIDER_NORMALIZATION_JOURNAL,
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (typeof path !== 'string' || path.length < 1 || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let ownedRunId
  return Object.freeze({
    read: () => readJournal(path, fileSystem),
    recordIntent(preflightSha256) {
      if (!hash64(preflightSha256) || readJournal(path, fileSystem)) unavailable()
      const runId = makeRunId(), nowMs = now()
      if (!uuid(runId) || !Number.isFinite(nowMs)) unavailable()
      const timestamp = new Date(nowMs).toISOString()
      const record = Object.freeze({ schema: SCHEMA, projectRef: STAGING_PROJECT_REF,
        providerIdentifier: PROVIDER_IDENTIFIER, runId, preflightSha256,
        state: 'INTENT_RECORDED', createdAt: timestamp, updatedAt: timestamp })
      const bytes = Buffer.from(JSON.stringify(record) + '\n')
      let fd
      try {
        fileSystem.mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
        fd = fileSystem.openSync(path, 'wx', 0o600)
        fileSystem.writeSync(fd, bytes); fileSystem.fsyncSync(fd)
        fileSystem.closeSync(fd); fd = undefined
        syncDirectory(path, fileSystem)
        ownedRunId = runId
        return record
      } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes.fill(0) }
    },
    transition(intent, state) {
      if (!intent || intent.runId !== ownedRunId || !STATES.includes(state) || state === 'INTENT_RECORDED') unavailable()
      const current = readJournal(path, fileSystem)
      if (!current || current.runId !== ownedRunId || current.state !== intent.state
        || !((current.state === 'INTENT_RECORDED' && ['UPDATE_ACKNOWLEDGED', 'RECONCILIATION_REQUIRED'].includes(state))
          || (current.state === 'UPDATE_ACKNOWLEDGED' && ['NORMALIZED_VERIFIED', 'RECONCILIATION_REQUIRED'].includes(state)))) unavailable()
      const next = Object.freeze({ ...current, state, updatedAt: new Date(now()).toISOString() })
      const temporary = resolve(dirname(path), `.tll-provider-normalization.${ownedRunId}.tmp`)
      const bytes = Buffer.from(JSON.stringify(next) + '\n')
      let fd
      try {
        fd = fileSystem.openSync(temporary, 'wx', 0o600)
        fileSystem.writeSync(fd, bytes); fileSystem.fsyncSync(fd)
        fileSystem.closeSync(fd); fd = undefined
        fileSystem.renameSync(temporary, path)
        syncDirectory(path, fileSystem)
        if (['NORMALIZED_VERIFIED', 'RECONCILIATION_REQUIRED'].includes(state)) ownedRunId = undefined
        return next
      } finally { if (fd !== undefined) fileSystem.closeSync(fd); bytes.fill(0) }
    },
  })
}
