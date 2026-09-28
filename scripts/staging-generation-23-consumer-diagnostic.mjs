/** One-use, secret-free progress record for the held consumer checks. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PROJECT_REF } from './staging-generation-23-password-material.mjs'

export const STAGING_GENERATION_23_CONSUMER_DIAGNOSTIC_ENABLED = false
export const JOURNAL_PATH = resolve(import.meta.dirname,
  '../../implementation-state/staging/tll-generation-23-consumer-diagnostic-v18.json')
export const STAGES = Object.freeze([
  'preview_build', 'deployment_identity', 'website_request',
  'website_response_validation', 'broker_service_key', 'broker_request',
  'broker_response_validation',
])
const unavailable = () => { throw Error('Generation 23 consumer diagnostic unavailable') }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const sha = /^[a-f0-9]{40}$/
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function valid(record) {
  if (!exact(record, ['schema', 'projectRef', 'runId', 'sourceCommit', 'stage',
    'state', 'sequence', 'websiteHttpStatus', 'brokerHttpStatus', 'createdAt', 'updatedAt'])
    || record.schema !== 'tll-gen23-consumer-diagnostic/v1'
    || record.projectRef !== PROJECT_REF || !uuid.test(record.runId)
    || !sha.test(record.sourceCommit) || !STAGES.includes(record.stage)
    || !['PENDING', 'VERIFIED', 'HOLD', 'PASS'].includes(record.state)
    || !Number.isSafeInteger(record.sequence) || record.sequence < 0
    || record.sequence > STAGES.length * 2
    || [record.websiteHttpStatus, record.brokerHttpStatus].some(status => status !== null
      && (!Number.isInteger(status) || status < 100 || status > 599))
    || !iso(record.createdAt) || !iso(record.updatedAt)
    || Date.parse(record.updatedAt) < Date.parse(record.createdAt)) unavailable()
  return Object.freeze(record)
}

function read(path) {
  try {
    const stat = fs.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
      || (stat.mode & 0o777) !== 0o600 || stat.size > 2048) unavailable()
    return valid(JSON.parse(fs.readFileSync(path, 'utf8')))
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

function persist(path, record, initial) {
  const directory = dirname(path)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const parent = fs.lstatSync(directory)
  if (!parent.isDirectory() || parent.isSymbolicLink()
    || (parent.mode & 0o777) !== 0o700) unavailable()
  const temporary = initial ? path : `${path}.${record.runId}.${record.sequence}.tmp`
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`)
  let handle
  try {
    handle = fs.openSync(temporary, 'wx', 0o600)
    let offset = 0
    while (offset < bytes.length) {
      const count = fs.writeSync(handle, bytes, offset, bytes.length - offset)
      if (!Number.isSafeInteger(count) || count < 1) unavailable()
      offset += count
    }
    fs.fsyncSync(handle); fs.closeSync(handle); handle = undefined
    if (!initial) fs.renameSync(temporary, path)
    const dir = fs.openSync(directory, 'r')
    try { fs.fsyncSync(dir) } finally { fs.closeSync(dir) }
  } finally { if (handle !== undefined) fs.closeSync(handle); bytes.fill(0) }
}

/** Failure to record progress stops the hosted operation before the next request. */
export function createStagingGeneration23ConsumerDiagnostic({ path = JOURNAL_PATH,
  makeRunId = randomUUID, now = Date.now } = {}) {
  if (!STAGING_GENERATION_23_CONSUMER_DIAGNOSTIC_ENABLED || typeof path !== 'string'
    || !path || typeof makeRunId !== 'function' || typeof now !== 'function'
    || read(path)) unavailable()
  let owned, current
  const stamp = () => new Date(now()).toISOString()
  const update = change => {
    if (!current || current.runId !== owned
      || JSON.stringify(read(path)) !== JSON.stringify(current)) unavailable()
    const next = valid({ ...current, ...change, sequence: current.sequence + 1,
      updatedAt: stamp() })
    persist(path, next, false)
    current = next
    return next
  }
  return Object.freeze({
    read: () => read(path),
    claim(sourceCommit) {
      if (owned || !sha.test(sourceCommit) || read(path)) unavailable()
      const time = stamp()
      current = valid({ schema: 'tll-gen23-consumer-diagnostic/v1', projectRef: PROJECT_REF,
        runId: makeRunId(), sourceCommit, stage: STAGES[0], state: 'PENDING',
        sequence: 0, websiteHttpStatus: null, brokerHttpStatus: null,
        createdAt: time, updatedAt: time })
      persist(path, current, true); owned = current.runId
      return current
    },
    verified(stage, httpStatus = null) {
      if (!owned || current?.stage !== stage || current.state !== 'PENDING'
        || (['website_request', 'broker_request'].includes(stage) && httpStatus === null)
        || (httpStatus !== null && (!Number.isInteger(httpStatus)
          || httpStatus < 100 || httpStatus > 599))) unavailable()
      return update({ state: 'VERIFIED', ...(stage === 'website_request'
        ? { websiteHttpStatus: httpStatus } : stage === 'broker_request'
          ? { brokerHttpStatus: httpStatus } : {}) })
    },
    pending(stage) {
      if (!owned || current?.state !== 'VERIFIED'
        || STAGES.indexOf(stage) !== STAGES.indexOf(current.stage) + 1) unavailable()
      return update({ stage, state: 'PENDING' })
    },
    finish() {
      if (!owned || current?.stage !== STAGES.at(-1)
        || current.state !== 'VERIFIED') unavailable()
      const result = update({ state: 'PASS' })
      owned = undefined
      return result
    },
    hold() {
      if (!owned || !['PENDING', 'VERIFIED'].includes(current?.state)) unavailable()
      const result = update({ state: 'HOLD' })
      owned = undefined
      return result
    },
  })
}
