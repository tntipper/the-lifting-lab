/** One-use, secret-free record for the actual five-role staging connection proof. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PROJECT_REF } from './staging-generation-23-password-material.mjs'
import { WINDOW_ID } from './staging-generation-23-credentials.mjs'

export const STAGING_GENERATION_23_CONNECTION_DIAGNOSTIC_ENABLED = false
export const CONNECTION_DIAGNOSTIC_PATH = resolve(import.meta.dirname,
  '../../implementation-state/staging/tll-generation-23-restricted-connections-v14.json')
const SCHEMA = 'tll-generation-23-restricted-connection-diagnostic/v1'
const PURPOSES = new Set([null, 'customer', 'cart', 'broker', 'provisional', 'bridge'])
const PURPOSE_ORDER = ['customer', 'cart', 'broker', 'provisional', 'bridge']
const STEPS = new Set(['correct_roles', 'wrong_password', 'final_good', 'drain', 'cleanup', 'complete'])
const CHECKS = new Set([null, 'input', 'factory', 'connect', 'connect_wait', 'factory_retry',
  'connect_retry', 'identity', 'membership', 'matrix', 'own_probe', 'table_denial', 'release', 'close'])
const OUTCOMES = new Set([null, 'correct_role_failed', 'wrong_password_failed', 'final_good_failed',
  'sessions_remain', 'drain_read_failed', 'deadline', 'cancelled', 'cleanup_failed', 'unavailable'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const CONNECTION_FIELDS = ['operation', 'category', 'code', 'elapsed']
const connection = value => value === null || (exact(value, CONNECTION_FIELDS)
  && ['driver', 'acquire', 'state', 'closed'].includes(value.operation)
  && ['authentication', 'capacity', 'network', 'timeout', 'other'].includes(value.category)
  && ['under_1s', '1_to_4s', 'over_4s'].includes(value.elapsed)
  && (value.code === null || ['28P01', '28000', '53300', '57P03', '08001', '08004', '08006',
    'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'EAI_AGAIN'].includes(value.code)))
const connectionEvidence = value => value === null || (exact(value, ['first', 'second'])
  && connection(value.first) && connection(value.second))
const unavailable = () => { throw Error('Generation 23 connection diagnostic unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value

function validate(value) {
  const fields = ['schema', 'projectRef', 'windowId', 'sourceCommit', 'runId', 'expiresAt', 'deadlineAt', 'createdAt',
    'updatedAt', 'state', 'sequence', 'step', 'purpose', 'check', 'outcome']
  if ((!exact(value, fields) && !exact(value, [...fields, 'connectionEvidence']))
    || value.schema !== SCHEMA || value.projectRef !== PROJECT_REF || value.windowId !== WINDOW_ID
    || !/^[a-f0-9]{40}$/.test(value.sourceCommit) || !UUID.test(value.runId)
    || ![value.expiresAt, value.deadlineAt, value.createdAt, value.updatedAt].every(iso)
    || Date.parse(value.updatedAt) < Date.parse(value.createdAt)
    || Date.parse(value.deadlineAt) <= Date.parse(value.createdAt)
    || Date.parse(value.deadlineAt) > Date.parse(value.expiresAt)
    || !['CLAIMED', 'RUNNING', 'PASS', 'HOLD'].includes(value.state)
    || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || value.sequence > 128
    || !STEPS.has(value.step) || !PURPOSES.has(value.purpose)
    || !CHECKS.has(value.check) || !OUTCOMES.has(value.outcome)
    || (Object.hasOwn(value, 'connectionEvidence') && !connectionEvidence(value.connectionEvidence))
    || (value.connectionEvidence !== undefined && value.connectionEvidence !== null
      && (value.state !== 'HOLD' || !['correct_role_failed', 'final_good_failed'].includes(value.outcome)))
    || (value.state === 'CLAIMED' && (value.sequence !== 0 || value.step !== 'correct_roles'
      || value.purpose !== null || value.check !== null || value.outcome !== null))
    || (value.state === 'RUNNING' && (value.sequence < 1 || value.outcome !== null))
    || (value.state === 'PASS' && (value.step !== 'complete' || value.outcome !== null))
    || (value.state === 'HOLD' && value.outcome === null)) unavailable()
  return Object.freeze(value)
}

function read(path, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
      || (stat.mode & 0o777) !== 0o600 || stat.size > 2048) unavailable()
    return validate(JSON.parse(fileSystem.readFileSync(path, 'utf8')))
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

function persist(path, record, fileSystem, first) {
  const directory = dirname(path)
  const temporary = first ? path : resolve(directory,
    `.tll-gen23-connection-${record.runId}-${record.sequence}.tmp`)
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

export function createStagingGeneration23ConnectionDiagnostic({ path = CONNECTION_DIAGNOSTIC_PATH, sourceCommit,
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (!STAGING_GENERATION_23_CONNECTION_DIAGNOSTIC_ENABLED || typeof path !== 'string' || !path
    || !/^[a-f0-9]{40}$/.test(sourceCommit) || typeof makeRunId !== 'function'
    || typeof now !== 'function') unavailable()
  let owned
  const timestamp = () => { const value = now(); if (!Number.isFinite(value)) unavailable(); return new Date(value).toISOString() }
  const update = (previous, change) => {
    if (!owned || previous?.runId !== owned || !['CLAIMED', 'RUNNING'].includes(previous.state)
      || JSON.stringify(read(path, fileSystem)) !== JSON.stringify(previous)) unavailable()
    const updatedAt = timestamp()
    if (Date.parse(updatedAt) < Date.parse(previous.updatedAt)) unavailable()
    const next = validate({ ...previous, ...change, sequence: previous.sequence + 1, updatedAt })
    persist(path, next, fileSystem, false)
    if (next.state === 'HOLD' || next.state === 'PASS') owned = undefined
    return next
  }
  return Object.freeze({
    read: () => read(path, fileSystem),
    claim({ expiresAt, deadlineAt }) {
      if (read(path, fileSystem) || !iso(expiresAt) || !iso(deadlineAt)) unavailable()
      const createdAt = timestamp()
      const record = validate({ schema: SCHEMA, projectRef: PROJECT_REF, windowId: WINDOW_ID,
        sourceCommit, runId: makeRunId(),
        expiresAt, deadlineAt, createdAt, updatedAt: createdAt, state: 'CLAIMED', sequence: 0,
        step: 'correct_roles', purpose: null, check: null, outcome: null, connectionEvidence: null })
      persist(path, record, fileSystem, true); owned = record.runId; return record
    },
    progress(previous, { step, purpose = null, check = null }) {
      if (!STEPS.has(step) || step === 'complete' || !PURPOSES.has(purpose) || !CHECKS.has(check)) unavailable()
      if (step === 'correct_roles') {
        if (!['CLAIMED', 'RUNNING'].includes(previous?.state)
          || (previous.state === 'RUNNING' && previous.step !== 'correct_roles')) unavailable()
      } else if (step === 'wrong_password') {
        if (check !== null || !PURPOSE_ORDER.includes(purpose) || previous?.state !== 'RUNNING'
          || (previous.step === 'correct_roles' && purpose !== PURPOSE_ORDER[0])
          || (previous.step === 'wrong_password'
            && PURPOSE_ORDER.indexOf(purpose) !== PURPOSE_ORDER.indexOf(previous.purpose) + 1)
          || !['correct_roles', 'wrong_password'].includes(previous.step)) unavailable()
      } else if (step === 'final_good') {
        if (!PURPOSE_ORDER.includes(purpose) || previous?.state !== 'RUNNING'
          || !(previous.step === 'wrong_password' && previous.purpose === 'bridge'
            || previous.step === 'final_good')) unavailable()
      } else if (step === 'drain') {
        if (purpose !== null || check !== null || previous?.state !== 'RUNNING'
          || !(previous.step === 'correct_roles' && previous.purpose === 'bridge'
            && previous.check === 'table_denial'
            || previous.step === 'final_good' && previous.purpose === 'bridge'
            || previous.step === 'drain')) unavailable()
      } else if (step === 'cleanup') {
        if (purpose !== null || check !== null || previous?.state !== 'RUNNING'
          || previous.step !== 'drain') unavailable()
      }
      return update(previous, { state: 'RUNNING', step, purpose, check, outcome: null })
    },
    pass(previous) {
      if (previous?.state !== 'RUNNING' || previous.step !== 'cleanup'
        || now() >= Date.parse(previous.deadlineAt)) unavailable()
      return update(previous, { state: 'PASS', step: 'complete', purpose: null, check: null, outcome: null })
    },
    hold(previous, { outcome, purpose = null, check = null, connectionEvidence: evidence = null }) {
      if (outcome === null || !OUTCOMES.has(outcome) || !PURPOSES.has(purpose) || !CHECKS.has(check)
        || !connectionEvidence(evidence)
        || (evidence !== null && !['correct_role_failed', 'final_good_failed'].includes(outcome))) unavailable()
      return update(previous, { state: 'HOLD', outcome, purpose, check, connectionEvidence: evidence })
    },
  })
}
