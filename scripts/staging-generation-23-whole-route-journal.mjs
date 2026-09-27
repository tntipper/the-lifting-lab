/**
 * Disabled, non-secret, one-use journal for the complete Gen23 staging route.
 *
 * It deliberately contains only the fixed staging target, a run identifier and
 * categorical progress. Connectors must retain their own exact target and
 * receipt records; this parent record must never become a place for URLs,
 * credentials, customer data, or free-form diagnostic text.
 */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PHASES } from './staging-generation-23-whole-run.mjs'

export const STAGING_GENERATION_23_WHOLE_ROUTE_JOURNAL_ENABLED = false
export const WHOLE_ROUTE_STAGING_TARGET = 'tll-stage3-protected-staging'
export const JOURNAL_PATH = resolve(import.meta.dirname,
  '../../implementation-state/staging/tll-generation-23-whole-route-v4.json')

const SCHEMA = 'tll-generation-23-whole-route/v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const STATES = new Set(['ACTIVE', 'PASS', 'HOLD', 'OWNER_FAILURE_SHUTDOWN_VERIFIED'])
const OWNER_FAILURE_REASONS = new Set(['OWNER_JOURNEY_FAILED_VERIFIED',
  'OWNER_JOURNEY_OVERRAN_BUDGET', 'INSUFFICIENT_OWNER_BUDGET'])
const unavailable = () => { throw new Error('Generation 23 whole-route journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value

function phaseSummary(phase, state) {
  return `${phase.toUpperCase()}_${state}`
}

function validPhase(value, index, state) {
  if (state === 'FAILED_VERIFIED') return PHASES[index] === 'ownerJourney'
    && exact(value, ['phase', 'state', 'summary', 'reason'])
    && value.phase === 'ownerJourney' && value.state === state
    && OWNER_FAILURE_REASONS.has(value.reason)
    && value.summary === phaseSummary(value.phase, state)
  if (state === 'SKIPPED_VERIFIED') return PHASES[index] === 'ownerJourney'
    && exact(value, ['phase', 'state', 'summary', 'reason'])
    && value.phase === 'ownerJourney' && value.state === state
    && value.reason === 'INSUFFICIENT_OWNER_BUDGET'
    && value.summary === phaseSummary(value.phase, state)
  return exact(value, ['phase', 'state', 'summary']) && value.phase === PHASES[index]
    && value.state === state && value.summary === phaseSummary(value.phase, state)
}

const validCompleted = (value, index) => validPhase(value, index, 'VERIFIED')
  || validPhase(value, index, 'FAILED_VERIFIED') || validPhase(value, index, 'SKIPPED_VERIFIED')
const ownerFailed = phases => phases.some((value, index) => validPhase(value, index, 'FAILED_VERIFIED')
  || validPhase(value, index, 'SKIPPED_VERIFIED'))

function validate(record) {
  if (!exact(record, ['schema', 'target', 'runId', 'createdAt', 'updatedAt', 'state',
    'nextIndex', 'pendingPhase', 'phases']) || record.schema !== SCHEMA
    || record.target !== WHOLE_ROUTE_STAGING_TARGET || !UUID.test(record.runId)
    || !iso(record.createdAt) || !iso(record.updatedAt)
    || Date.parse(record.updatedAt) < Date.parse(record.createdAt) || !STATES.has(record.state)
    || !Number.isSafeInteger(record.nextIndex) || record.nextIndex < 0 || record.nextIndex > PHASES.length
    || !Array.isArray(record.phases)) unavailable()

  if (record.state === 'ACTIVE') {
    if (record.pendingPhase === null) {
      if (record.nextIndex === 0 || record.nextIndex >= PHASES.length
        || record.phases.length !== record.nextIndex
        || !record.phases.every(validCompleted)) unavailable()
    } else if (record.pendingPhase !== PHASES[record.nextIndex]
      || record.phases.length !== record.nextIndex + 1
      || !record.phases.slice(0, -1).every(validCompleted)
      || !validPhase(record.phases.at(-1), record.nextIndex, 'DISPATCHED')) unavailable()
  } else if (record.state === 'PASS') {
    if (record.nextIndex !== PHASES.length || record.pendingPhase !== null
      || record.phases.length !== PHASES.length
      || !record.phases.every((value, index) => validPhase(value, index, 'VERIFIED'))) unavailable()
  } else if (record.state === 'OWNER_FAILURE_SHUTDOWN_VERIFIED') {
    if (record.nextIndex !== PHASES.length || record.pendingPhase !== null
      || record.phases.length !== PHASES.length || !ownerFailed(record.phases)
      || !record.phases.every(validCompleted)) unavailable()
  } else if (record.state === 'HOLD') {
    if (!record.pendingPhase || record.pendingPhase !== PHASES[record.nextIndex]
      || record.phases.length !== record.nextIndex + 1
      || !record.phases.slice(0, -1).every(validCompleted)
      || !(validPhase(record.phases.at(-1), record.nextIndex, 'HOLD')
        || validPhase(record.phases.at(-1), record.nextIndex, 'NOT_DISPATCHED_HOLD'))) unavailable()
  }
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

function persist(path, record, fileSystem, initial) {
  const directory = dirname(path)
  const temporary = initial ? path : resolve(directory,
    `.tll-gen23-whole-route-${record.runId}-${record.nextIndex}-${record.state}.tmp`)
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`)
  let descriptor
  try {
    fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const parent = fileSystem.lstatSync(directory)
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777) !== 0o700) unavailable()
    descriptor = fileSystem.openSync(temporary, 'wx', 0o600)
    let offset = 0
    while (offset < bytes.length) {
      const written = fileSystem.writeSync(descriptor, bytes, offset, bytes.length - offset, null)
      if (!Number.isSafeInteger(written) || written < 1) unavailable()
      offset += written
    }
    fileSystem.fsyncSync(descriptor); fileSystem.closeSync(descriptor); descriptor = undefined
    if (!initial) fileSystem.renameSync(temporary, path)
    const directoryDescriptor = fileSystem.openSync(directory, 'r')
    try { fileSystem.fsyncSync(directoryDescriptor) } finally { fileSystem.closeSync(directoryDescriptor) }
  } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
}

export function createStagingGeneration23WholeRouteJournal({ path = JOURNAL_PATH, fileSystem = fs,
  makeRunId = randomUUID, now = Date.now } = {}) {
  if (!STAGING_GENERATION_23_WHOLE_ROUTE_JOURNAL_ENABLED || typeof path !== 'string' || !path
    || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let owned, faulted = false
  const timestamp = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  const write = (record, initial) => {
    try { persist(path, record, fileSystem, initial) } catch (error) { faulted = true; throw error }
  }
  const update = (previous, change) => {
    const current = read(path, fileSystem)
    if (faulted || !owned || previous?.runId !== owned
      || JSON.stringify(current) !== JSON.stringify(previous)) unavailable()
    const next = validate({ ...previous, ...change, updatedAt: timestamp() })
    write(next, false)
    if (next.state !== 'ACTIVE') owned = undefined
    return next
  }
  return Object.freeze({
    read: () => read(path, fileSystem),
    claim() {
      if (faulted || read(path, fileSystem)) unavailable()
      const createdAt = timestamp()
      const record = validate({ schema: SCHEMA, target: WHOLE_ROUTE_STAGING_TARGET, runId: makeRunId(),
        createdAt, updatedAt: createdAt, state: 'ACTIVE', nextIndex: 0, pendingPhase: PHASES[0],
        phases: [{ phase: PHASES[0], state: 'DISPATCHED', summary: phaseSummary(PHASES[0], 'DISPATCHED') }] })
      write(record, true); owned = record.runId; return record
    },
    dispatch(previous, phase) {
      if (faulted || previous?.state !== 'ACTIVE' || previous.pendingPhase !== null
        || phase !== PHASES[previous.nextIndex]) unavailable()
      return update(previous, { pendingPhase: phase,
        phases: [...previous.phases, { phase, state: 'DISPATCHED', summary: phaseSummary(phase, 'DISPATCHED') }] })
    },
    verify(previous, phase) {
      if (faulted || previous?.state !== 'ACTIVE' || previous.pendingPhase !== phase
        || previous.phases.at(-1)?.state !== 'DISPATCHED') unavailable()
      const phases = [...previous.phases]
      phases[phases.length - 1] = { phase, state: 'VERIFIED', summary: phaseSummary(phase, 'VERIFIED') }
      const complete = previous.nextIndex + 1 === PHASES.length
      return update(previous, { state: complete
        ? ownerFailed(phases) ? 'OWNER_FAILURE_SHUTDOWN_VERIFIED' : 'PASS' : 'ACTIVE',
      nextIndex: previous.nextIndex + 1,
        pendingPhase: null, phases })
    },
    ownerFailure(previous, reason) {
      const phase = 'ownerJourney'
      if (faulted || previous?.state !== 'ACTIVE' || previous.pendingPhase !== phase
        || previous.phases.at(-1)?.state !== 'DISPATCHED'
        || !OWNER_FAILURE_REASONS.has(reason)) unavailable()
      const phases = [...previous.phases]
      phases[phases.length - 1] = { phase, state: 'FAILED_VERIFIED',
        summary: phaseSummary(phase, 'FAILED_VERIFIED'), reason }
      return update(previous, { nextIndex: previous.nextIndex + 1, pendingPhase: null, phases })
    },
    skipOwner(previous) {
      const phase = 'ownerJourney'
      if (faulted || previous?.state !== 'ACTIVE' || previous.pendingPhase !== null
        || previous.nextIndex !== PHASES.indexOf(phase)) unavailable()
      return update(previous, { nextIndex: previous.nextIndex + 1,
        phases: [...previous.phases, { phase, state: 'SKIPPED_VERIFIED',
          summary: phaseSummary(phase, 'SKIPPED_VERIFIED'), reason: 'INSUFFICIENT_OWNER_BUDGET' }] })
    },
    holdBeforeDispatch(previous, phase) {
      if (faulted || previous?.state !== 'ACTIVE' || previous.pendingPhase !== null
        || phase !== PHASES[previous.nextIndex]) unavailable()
      return update(previous, { state: 'HOLD', pendingPhase: phase,
        phases: [...previous.phases, { phase, state: 'NOT_DISPATCHED_HOLD',
          summary: phaseSummary(phase, 'NOT_DISPATCHED_HOLD') }] })
    },
    hold(previous, phase) {
      if (faulted || previous?.state !== 'ACTIVE' || previous.pendingPhase !== phase
        || previous.phases.at(-1)?.state !== 'DISPATCHED') unavailable()
      const phases = [...previous.phases]
      phases[phases.length - 1] = { phase, state: 'HOLD', summary: phaseSummary(phase, 'HOLD') }
      return update(previous, { state: 'HOLD', phases })
    },
  })
}
