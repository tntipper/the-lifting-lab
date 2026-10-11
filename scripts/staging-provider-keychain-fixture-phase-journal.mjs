/** One-use, secret-free phase record for the disposable Keychain fixture only. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, join } from 'node:path'

const SCHEMA = 'tll-stage3-disposable-keychain-fixture/v1'
const PHASES = Object.freeze(['PREFLIGHT', 'NATIVE_ATTEMPT', 'LOCAL_RECONCILIATION'])
const PHASE_DEADLINES_MS = Object.freeze({ PREFLIGHT: 15_000,
  NATIVE_ATTEMPT: 65_000, LOCAL_RECONCILIATION: 10_000 })
const RUN_DEADLINE_MS = 90_000
const OUTCOMES = Object.freeze(['PASS', 'HOLD', 'UNCERTAIN'])
const fail = () => { throw Error('Disposable Keychain fixture journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function assertDirectory(path, io) {
  const stat = io.lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || (stat.mode & 0o777) !== 0o700) fail()
}

function parse(path, io) {
  let stat
  try { stat = io.lstatSync(path) } catch (error) { if (error?.code === 'ENOENT') return null; fail() }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 4_096) fail()
  let record
  try { record = JSON.parse(io.readFileSync(path, 'utf8')) } catch { fail() }
  if (!exact(record, ['schema', 'runId', 'sourceSha256', 'fixtureSha256', 'binarySha256',
    'sequence', 'phase', 'startedAt', 'updatedAt',
    'phaseDeadlineAt', 'runDeadlineAt', 'outcome'])
    || record.schema !== SCHEMA || !/^[0-9a-f-]{36}$/.test(record.runId)
    || [record.sourceSha256, record.fixtureSha256, record.binarySha256]
      .some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    || !Number.isSafeInteger(record.sequence) || record.sequence < 0
    || !PHASES.includes(record.phase) || typeof record.startedAt !== 'string'
    || typeof record.updatedAt !== 'string' || typeof record.phaseDeadlineAt !== 'string'
    || typeof record.runDeadlineAt !== 'string'
    || ![record.startedAt, record.updatedAt, record.phaseDeadlineAt, record.runDeadlineAt]
      .every(value => Number.isFinite(Date.parse(value)))
    || (record.outcome !== null && !OUTCOMES.includes(record.outcome))) fail()
  return Object.freeze(record)
}

function durableWrite(path, record, io, { initial = false } = {}) {
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`)
  const temporary = initial ? path : join(dirname(path), `.tll-fixture-${record.runId}-${record.sequence}.tmp`)
  let descriptor
  try {
    descriptor = io.openSync(temporary, 'wx', 0o600)
    for (let offset = 0; offset < bytes.length;) {
      const written = io.writeSync(descriptor, bytes, offset, bytes.length - offset)
      if (!Number.isSafeInteger(written) || written <= 0 || written > bytes.length - offset) fail()
      offset += written
    }
    io.fsyncSync(descriptor)
    io.closeSync(descriptor); descriptor = undefined
    if (!initial) io.renameSync(temporary, path)
    const directory = io.openSync(dirname(path), 'r')
    try { io.fsyncSync(directory) } finally { io.closeSync(directory) }
  } finally {
    if (descriptor !== undefined) io.closeSync(descriptor)
    bytes.fill(0)
  }
}

export function createFixturePhaseJournal({ path, io = fs, now = Date.now, makeRunId = randomUUID } = {}) {
  if (typeof path !== 'string' || !path || typeof now !== 'function' || typeof makeRunId !== 'function') fail()
  let ownedId = null
  return Object.freeze({
    read() { assertDirectory(dirname(path), io); return parse(path, io) },
    start(identity) {
      assertDirectory(dirname(path), io)
      if (parse(path, io)) fail()
      if (!exact(identity, ['sourceSha256', 'fixtureSha256', 'binarySha256'])
        || Object.values(identity).some(value => typeof value !== 'string'
          || !/^[a-f0-9]{64}$/.test(value))) fail()
      const runId = makeRunId(), startedMs = now(), timestamp = new Date(startedMs).toISOString()
      if (typeof runId !== 'string' || !/^[0-9a-f-]{36}$/.test(runId)) fail()
      const record = Object.freeze({ schema: SCHEMA, runId, ...identity, sequence: 0,
        phase: PHASES[0], startedAt: timestamp, updatedAt: timestamp,
        phaseDeadlineAt: new Date(startedMs + PHASE_DEADLINES_MS.PREFLIGHT).toISOString(),
        runDeadlineAt: new Date(startedMs + RUN_DEADLINE_MS).toISOString(), outcome: null })
      durableWrite(path, record, io, { initial: true })
      ownedId = runId
      return record
    },
    advance(previous, phase) {
      if (!previous || previous.runId !== ownedId || previous.outcome !== null
        || !PHASES.includes(phase) || PHASES.indexOf(phase) <= PHASES.indexOf(previous.phase)) fail()
      const current = parse(path, io)
      if (!current || current.runId !== ownedId || current.sequence !== previous.sequence
        || current.outcome !== null) fail()
      const updatedMs = now(), runDeadlineMs = Date.parse(current.runDeadlineAt)
      if (!Number.isFinite(updatedMs) || updatedMs < Date.parse(current.updatedAt)
        || updatedMs >= runDeadlineMs) fail()
      const next = Object.freeze({ ...current, sequence: current.sequence + 1,
        phase, updatedAt: new Date(updatedMs).toISOString(),
        phaseDeadlineAt: new Date(Math.min(updatedMs + PHASE_DEADLINES_MS[phase], runDeadlineMs)).toISOString() })
      durableWrite(path, next, io)
      return next
    },
    finish(previous, outcome) {
      if (!previous || previous.runId !== ownedId || previous.outcome !== null
        || !OUTCOMES.includes(outcome)) fail()
      const current = parse(path, io)
      if (!current || current.runId !== ownedId || current.sequence !== previous.sequence
        || current.outcome !== null) fail()
      const next = Object.freeze({ ...current, sequence: current.sequence + 1,
        updatedAt: new Date(now()).toISOString(), outcome })
      durableWrite(path, next, io)
      ownedId = null
      return next
    },
  })
}
