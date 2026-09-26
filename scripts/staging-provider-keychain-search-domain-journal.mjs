/** One-use, secret-free journal for a local search-domain observation. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, join } from 'node:path'

const SCHEMA = 'tll-stage3-search-domain/v1'
const SHA = /^[a-f0-9]{64}$/
const RUN_ID = /^[0-9a-f-]{36}$/
const ERRORS = new Set(['CHILD_TIMEOUT', 'CHILD_SPAWN', 'CHILD_SIGNAL',
  'CHILD_EXIT', 'CHILD_OUTPUT', 'DEADLINE', 'PREFLIGHT'])
const COUNT = '(?:[0-8]|9PLUS)'
const OBSERVATION = new RegExp(`^DOMAIN_(?:USER|SYSTEM|COMMON|DYNAMIC|UNKNOWN)`
  + `:CURRENT_${COUNT}:USER_${COUNT}:EXACT_${COUNT}:SAMEFILE_${COUNT}`
  + `:USER_EXACT_${COUNT}:LISTS_(?:SAME|DIFFERENT):IDENTITY_(?:COMPLETE|INCOMPLETE)$`)
export const validSearchDomainCategory = value => typeof value === 'string'
  && (value === 'READ_UNAVAILABLE' || ERRORS.has(value) || OBSERVATION.test(value))
export const observedSearchDomainCategory = value => value === 'READ_UNAVAILABLE'
  || (typeof value === 'string' && OBSERVATION.test(value))
const fail = () => { throw Error('Search-domain journal unavailable') }

function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
}

function privateDirectory(path, io) {
  const stat = io.lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || (stat.mode & 0o777) !== 0o700) fail()
}

function readRecord(path, io) {
  let stat
  try { stat = io.lstatSync(path) }
  catch (error) { if (error?.code === 'ENOENT') return null; fail() }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 2_048) fail()
  let record
  try { record = JSON.parse(io.readFileSync(path, 'utf8')) } catch { fail() }
  if (!exact(record, ['schema', 'runId', 'sourceSha256', 'binarySha256',
    'state', 'result', 'startedAt', 'updatedAt', 'deadlineAt'])
    || record.schema !== SCHEMA || !RUN_ID.test(record.runId)
    || !SHA.test(record.sourceSha256) || !SHA.test(record.binarySha256)
    || !['PREPARED', 'DISPATCHED', 'TERMINAL'].includes(record.state)
    || (record.result !== null && !validSearchDomainCategory(record.result))
    || ((record.state === 'TERMINAL') !== (record.result !== null))
    || ![record.startedAt, record.updatedAt, record.deadlineAt]
      .every(value => typeof value === 'string' && Number.isFinite(Date.parse(value)))) fail()
  return Object.freeze(record)
}

function durableWrite(path, record, io, initial) {
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`)
  const temporary = initial ? path : join(dirname(path), `.tll-search-domain-${record.runId}-${record.state}.tmp`)
  let fd
  try {
    fd = io.openSync(temporary, 'wx', 0o600)
    for (let offset = 0; offset < bytes.length;) {
      const count = io.writeSync(fd, bytes, offset, bytes.length - offset)
      if (!Number.isSafeInteger(count) || count <= 0 || count > bytes.length - offset) fail()
      offset += count
    }
    io.fsyncSync(fd); io.closeSync(fd); fd = undefined
    if (!initial) io.renameSync(temporary, path)
    const directoryFd = io.openSync(dirname(path), 'r')
    try { io.fsyncSync(directoryFd) } finally { io.closeSync(directoryFd) }
  } finally {
    if (fd !== undefined) io.closeSync(fd)
    bytes.fill(0)
  }
}

export function createSearchDomainJournal({ path, io = fs, now = Date.now,
  makeRunId = randomUUID } = {}) {
  if (typeof path !== 'string' || !path || typeof now !== 'function'
    || typeof makeRunId !== 'function') fail()
  let ownedId = null
  const read = () => { privateDirectory(dirname(path), io); return readRecord(path, io) }
  const expectOwned = (previous, state) => {
    const current = read()
    if (!current || !previous || current.runId !== ownedId
      || previous.runId !== ownedId || current.state !== state
      || JSON.stringify(current) !== JSON.stringify(previous)) fail()
    return current
  }
  return Object.freeze({
    read,
    start(identity) {
      if (read() || !exact(identity, ['sourceSha256', 'binarySha256'])
        || !SHA.test(identity.sourceSha256) || !SHA.test(identity.binarySha256)) fail()
      const runId = makeRunId(), started = now()
      if (!RUN_ID.test(runId) || !Number.isFinite(started)) fail()
      const timestamp = new Date(started).toISOString()
      const record = Object.freeze({ schema: SCHEMA, runId, ...identity,
        state: 'PREPARED', result: null, startedAt: timestamp,
        updatedAt: timestamp, deadlineAt: new Date(started + 20_000).toISOString() })
      durableWrite(path, record, io, true)
      ownedId = runId
      return record
    },
    dispatch(previous) {
      const current = expectOwned(previous, 'PREPARED'), timestamp = now()
      if (!Number.isFinite(timestamp) || timestamp < Date.parse(current.updatedAt)
        || timestamp + 10_000 >= Date.parse(current.deadlineAt)) fail()
      const next = Object.freeze({ ...current, state: 'DISPATCHED',
        updatedAt: new Date(timestamp).toISOString() })
      durableWrite(path, next, io, false)
      return next
    },
    finish(previous, result) {
      if (!validSearchDomainCategory(result)) fail()
      const current = expectOwned(previous, previous?.state)
      if (!['PREPARED', 'DISPATCHED'].includes(current.state)) fail()
      if (current.state === 'PREPARED' && !['PREFLIGHT', 'DEADLINE'].includes(result)) fail()
      const timestamp = now()
      if (!Number.isFinite(timestamp) || timestamp < Date.parse(current.updatedAt)) fail()
      const next = Object.freeze({ ...current, state: 'TERMINAL', result,
        updatedAt: new Date(timestamp).toISOString() })
      durableWrite(path, next, io, false)
      ownedId = null
      return next
    },
  })
}
