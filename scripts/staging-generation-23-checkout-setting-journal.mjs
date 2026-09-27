/** Separate durable records for the one ON and one OFF checkout setting writes. */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { CHECKOUT_SETTING_NAME } from './staging-generation-23-checkout-setting.mjs'
import { STAGING_BRANCH } from './staging-surface-activation-transport.mjs'

export const STAGING_GENERATION_23_CHECKOUT_SETTING_JOURNAL_ENABLED = false
const SCHEMA = 'tll-generation-23-checkout-setting/v1'
const STATES = new Set(['INTENT_RECORDED', 'ENABLE_VERIFIED', 'FREEZE_VERIFIED', 'RECONCILIATION_REQUIRED'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const unavailable = () => { throw Error('Generation 23 checkout setting journal unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const pathFor = action => resolve(import.meta.dirname,
  `../../implementation-state/staging/tll-generation-23-checkout-${action.toLowerCase()}-v8.json`)

function validate(value, action) {
  if (!exact(value, ['schema', 'action', 'settingName', 'settingId', 'branch', 'runId', 'state', 'createdAt'])
    || value.schema !== SCHEMA || value.action !== action || value.settingName !== CHECKOUT_SETTING_NAME
    || value.branch !== STAGING_BRANCH || !/^[A-Za-z0-9_-]{4,128}$/.test(value.settingId)
    || !UUID.test(value.runId) || !STATES.has(value.state)
    || value.state === 'ENABLE_VERIFIED' && action !== 'ENABLE'
    || value.state === 'FREEZE_VERIFIED' && action !== 'FREEZE'
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) unavailable()
  return Object.freeze(value)
}

function read(path, action, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
      || (stat.mode & 0o777) !== 0o600 || stat.size > 2048) unavailable()
    return validate(JSON.parse(fileSystem.readFileSync(path, 'utf8')), action)
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

function persist(path, value, fileSystem, first) {
  const directory = dirname(path)
  fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const parent = fileSystem.lstatSync(directory)
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777) !== 0o700) unavailable()
  const temporary = first ? path : resolve(directory, `.checkout-${value.runId}-${value.state}.tmp`)
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
  let descriptor
  try {
    descriptor = fileSystem.openSync(temporary, 'wx', 0o600)
    let offset = 0
    while (offset < bytes.length) {
      const written = fileSystem.writeSync(descriptor, bytes, offset, bytes.length - offset, null)
      if (!Number.isSafeInteger(written) || written < 1) unavailable()
      offset += written
    }
    fileSystem.fsyncSync(descriptor); fileSystem.closeSync(descriptor); descriptor = undefined
    if (!first) fileSystem.renameSync(temporary, path)
    const dir = fileSystem.openSync(directory, 'r')
    try { fileSystem.fsyncSync(dir) } finally { fileSystem.closeSync(dir) }
  } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
}

export function createStagingGeneration23CheckoutSettingJournal({ action, path,
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (!STAGING_GENERATION_23_CHECKOUT_SETTING_JOURNAL_ENABLED || !['ENABLE', 'FREEZE'].includes(action)
    || path !== undefined && (typeof path !== 'string' || !path)
    || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  path ??= pathFor(action)
  let owned
  return Object.freeze({
    read: () => read(path, action, fileSystem),
    recordIntent(selectedAction, target) {
      if (selectedAction !== action || read(path, action, fileSystem)
        || !exact(target, ['name', 'id', 'branch', 'environment', 'classification'])
        || target.name !== CHECKOUT_SETTING_NAME || target.branch !== STAGING_BRANCH
        || target.environment !== 'preview' || target.classification !== 'config'
        || !/^[A-Za-z0-9_-]{4,128}$/.test(target.id)) unavailable()
      const created = now(), runId = makeRunId()
      if (!Number.isFinite(created) || !UUID.test(runId)) unavailable()
      const record = validate({ schema: SCHEMA, action, settingName: CHECKOUT_SETTING_NAME,
        settingId: target.id, branch: STAGING_BRANCH, runId, state: 'INTENT_RECORDED',
        createdAt: new Date(created).toISOString() }, action)
      persist(path, record, fileSystem, true); owned = runId
      return record
    },
    transition(intent, state) {
      if (!owned || intent?.runId !== owned || intent.state !== 'INTENT_RECORDED'
        || !['RECONCILIATION_REQUIRED', action === 'ENABLE' ? 'ENABLE_VERIFIED' : 'FREEZE_VERIFIED'].includes(state)) unavailable()
      const current = read(path, action, fileSystem)
      if (!current || current.runId !== owned || current.state !== 'INTENT_RECORDED'
        || current.settingId !== intent.settingId) unavailable()
      const next = validate({ ...current, state }, action)
      persist(path, next, fileSystem, false); owned = undefined
      return next
    },
  })
}
