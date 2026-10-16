/** Separate one-use V2 journal. It never reads or rewrites any V1 record. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, join } from 'node:path'

const SCHEMA = 'tll-stage3-fixture-recovery/v2'
const PHASES = Object.freeze(['CAPTURE_BASELINE', 'API_DELETE', 'SIDECAR_RECONCILE',
  'DIRECTORY_REMOVE', 'FINAL_VERIFY'])
const LIMITS = Object.freeze({ CAPTURE_BASELINE: 15_000, API_DELETE: 30_000,
  SIDECAR_RECONCILE: 15_000, DIRECTORY_REMOVE: 10_000, FINAL_VERIFY: 10_000 })
const RUN_LIMIT = 90_000
const SHA = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f-]{36}$/
const OUTCOMES = new Set(['PASS', 'HOLD', 'UNCERTAIN'])
const ACTIVE_SEQUENCE = Object.freeze({ CAPTURE_BASELINE: [0, 1], API_DELETE: [2],
  SIDECAR_RECONCILE: [3], DIRECTORY_REMOVE: [4], FINAL_VERIFY: [5] })
const fail = () => { throw Error('V2 recovery journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function privateDirectory(path, io) {
  const value = io.lstatSync(path)
  if (!value.isDirectory() || value.isSymbolicLink() || value.uid !== process.getuid()
    || (value.mode & 0o777) !== 0o700) fail()
}

function parse(path, io) {
  let named
  try { named = io.lstatSync(path) }
  catch (error) { if (error?.code === 'ENOENT') return null; fail() }
  if (!named.isFile() || named.isSymbolicLink() || named.uid !== process.getuid()
    || named.nlink !== 1 || (named.mode & 0o777) !== 0o600 || named.size < 1
    || named.size > 4_096) fail()
  let descriptor, bytes
  try {
    descriptor = io.openSync(path, io.constants.O_RDONLY | io.constants.O_NOFOLLOW
      | io.constants.O_NONBLOCK | io.constants.O_CLOEXEC)
    const opened = io.fstatSync(descriptor)
    if (!opened.isFile() || opened.isSymbolicLink() || opened.dev !== named.dev
      || opened.ino !== named.ino || opened.uid !== named.uid || opened.nlink !== 1
      || opened.size !== named.size || (opened.mode & 0o777) !== 0o600) fail()
    bytes = Buffer.alloc(opened.size)
    for (let offset = 0; offset < bytes.length;) {
      const count = io.readSync(descriptor, bytes, offset, bytes.length - offset, offset)
      if (!Number.isSafeInteger(count) || count <= 0 || count > bytes.length - offset) fail()
      offset += count
    }
    const after = io.fstatSync(descriptor), stillNamed = io.lstatSync(path)
    for (const value of [after, stillNamed]) {
      if (!value.isFile() || value.isSymbolicLink() || value.dev !== named.dev
        || value.ino !== named.ino || value.uid !== named.uid || value.nlink !== 1
        || value.size !== named.size || (value.mode & 0o777) !== 0o600) fail()
    }
  } catch { bytes?.fill(0); fail() }
  finally { if (descriptor !== undefined) io.closeSync(descriptor) }
  let record
  try { record = JSON.parse(bytes.toString('utf8')) } catch { fail() }
  finally { bytes?.fill(0) }
  if (!exact(record, ['schema', 'runId', 'sourceSha256', 'binarySha256', 'baselineSha256',
    'sequence', 'phase', 'startedAt', 'updatedAt', 'phaseDeadlineAt', 'runDeadlineAt', 'outcome'])
    || record.schema !== SCHEMA || !UUID.test(record.runId)
    || !SHA.test(record.sourceSha256) || !SHA.test(record.binarySha256)
    || (record.baselineSha256 !== null && !SHA.test(record.baselineSha256))
    || !Number.isSafeInteger(record.sequence) || record.sequence < 0
    || !PHASES.includes(record.phase)
    || !(record.outcome === null ? ACTIVE_SEQUENCE[record.phase]
      : ACTIVE_SEQUENCE[record.phase].map(sequence => sequence + 1)).includes(record.sequence)
    || ((record.phase !== 'CAPTURE_BASELINE' || record.sequence > 1)
      && record.baselineSha256 === null)
    || (record.phase === 'CAPTURE_BASELINE' && record.sequence === 0
      && record.baselineSha256 !== null)
    || (record.outcome !== null && !OUTCOMES.has(record.outcome))
    || ![record.startedAt, record.updatedAt, record.phaseDeadlineAt, record.runDeadlineAt]
      .every(item => typeof item === 'string' && Number.isFinite(Date.parse(item)))) fail()
  return Object.freeze(record)
}

function durableWrite(path, record, io, initial) {
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`)
  const temporary = initial ? path : join(dirname(path), `.tll-fixture-recovery-v2-${record.runId}-${record.sequence}.tmp`)
  let descriptor
  try {
    descriptor = io.openSync(temporary, 'wx', 0o600)
    for (let offset = 0; offset < bytes.length;) {
      const written = io.writeSync(descriptor, bytes, offset, bytes.length - offset)
      if (!Number.isSafeInteger(written) || written <= 0 || written > bytes.length - offset) fail()
      offset += written
    }
    io.fsyncSync(descriptor); io.closeSync(descriptor); descriptor = undefined
    if (!initial) io.renameSync(temporary, path)
    const directory = io.openSync(dirname(path), 'r')
    try { io.fsyncSync(directory) } finally { io.closeSync(directory) }
  } finally {
    if (descriptor !== undefined) io.closeSync(descriptor)
    bytes.fill(0)
  }
}

export function createFixtureRecoveryV2Journal({ path, io = fs, now = Date.now,
  makeRunId = randomUUID } = {}) {
  if (typeof path !== 'string' || !path || typeof now !== 'function'
    || typeof makeRunId !== 'function') fail()
  let ownedId = null
  const read = () => { privateDirectory(dirname(path), io); return parse(path, io) }
  const owned = previous => {
    const current = read()
    if (!previous || !current || !ownedId || previous.runId !== ownedId
      || current.runId !== ownedId || JSON.stringify(current) !== JSON.stringify(previous)
      || current.outcome !== null) fail()
    return current
  }
  return Object.freeze({
    read,
    start(identity) {
      if (read() || !exact(identity, ['sourceSha256', 'binarySha256'])
        || !SHA.test(identity.sourceSha256) || !SHA.test(identity.binarySha256)) fail()
      const runId = makeRunId(), instant = now()
      if (!UUID.test(runId) || !Number.isFinite(instant)) fail()
      const stamp = new Date(instant).toISOString()
      const record = Object.freeze({ schema: SCHEMA, runId, ...identity,
        baselineSha256: null, sequence: 0, phase: 'CAPTURE_BASELINE',
        startedAt: stamp, updatedAt: stamp,
        phaseDeadlineAt: new Date(instant + LIMITS.CAPTURE_BASELINE).toISOString(),
        runDeadlineAt: new Date(instant + RUN_LIMIT).toISOString(), outcome: null })
      durableWrite(path, record, io, true); ownedId = runId
      return record
    },
    pinBaseline(previous, digest) {
      const current = owned(previous), instant = now()
      if (current.phase !== 'CAPTURE_BASELINE' || current.baselineSha256 !== null
        || !SHA.test(digest) || !Number.isFinite(instant)
        || instant < Date.parse(current.updatedAt)
        || instant >= Date.parse(current.phaseDeadlineAt)
        || instant >= Date.parse(current.runDeadlineAt)) fail()
      const next = Object.freeze({ ...current, baselineSha256: digest,
        sequence: current.sequence + 1, updatedAt: new Date(instant).toISOString() })
      durableWrite(path, next, io, false)
      return next
    },
    advance(previous, phase) {
      const current = owned(previous), instant = now()
      if (!current.baselineSha256 || PHASES.indexOf(phase) !== PHASES.indexOf(current.phase) + 1
        || !Number.isFinite(instant) || instant < Date.parse(current.updatedAt)
        || instant >= Date.parse(current.phaseDeadlineAt)
        || instant >= Date.parse(current.runDeadlineAt)) fail()
      const deadline = Math.min(instant + LIMITS[phase], Date.parse(current.runDeadlineAt))
      const next = Object.freeze({ ...current, phase, sequence: current.sequence + 1,
        updatedAt: new Date(instant).toISOString(),
        phaseDeadlineAt: new Date(deadline).toISOString() })
      durableWrite(path, next, io, false)
      return next
    },
    finish(previous, outcome) {
      const current = owned(previous), instant = now()
      if (!OUTCOMES.has(outcome) || !Number.isFinite(instant)
        || instant < Date.parse(current.updatedAt)) fail()
      const next = Object.freeze({ ...current, sequence: current.sequence + 1,
        updatedAt: new Date(instant).toISOString(), outcome })
      durableWrite(path, next, io, false); ownedId = null
      return next
    },
  })
}
