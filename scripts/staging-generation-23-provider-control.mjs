/** Disabled Gen23 provider switch with exact readback and a separate one-use record. */
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { projectOfficialProviderSchema, STAGING_PROVIDER_NAME } from './staging-provider-broker-native-adapter.mjs'
import { BROKER_CLIENT_ID, PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER,
  STAGING_PROVIDER_TARGET, STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'

export const STAGING_GENERATION_23_PROVIDER_CONTROL_ENABLED = false
export const PROVIDER_CONTROL_PATHS = Object.freeze({
  ENABLE: resolve(import.meta.dirname, '../../implementation-state/staging/tll-generation-23-provider-enable-v3.json'),
  DISABLE: resolve(import.meta.dirname, '../../implementation-state/staging/tll-generation-23-provider-disable-v3.json'),
})
const SCHEMA = 'tll-generation-23-provider-control/v1'
const HASH = /^[a-f0-9]{64}$/
const unavailable = () => { throw new Error('Generation 23 provider control unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

function strictProvider(raw, expectedEnabled) {
  const value = projectOfficialProviderSchema(raw)
  if (value.identifier !== PROVIDER_IDENTIFIER
    || ![STAGING_PROVIDER_NAME, BROKER_CLIENT_ID].includes(value.name)
    || value.clientId !== BROKER_CLIENT_ID || value.enabled !== expectedEnabled
    || value.pkce !== true || value.emailOptional !== true
    || value.attributeMappingPresent || value.authorizationParamsPresent
    || value.issuer !== '' || value.discoveryUrl !== '' || value.skipNonceCheck !== false
    || value.discoveryDocumentPresent || value.jwksUrl !== STAGING_BROKER_PROVIDER.jwksUrl
    || value.authorizationUrl !== STAGING_BROKER_PROVIDER.authorizationUrl
    || value.tokenUrl !== STAGING_BROKER_PROVIDER.tokenUrl
    || value.userinfoUrl !== STAGING_BROKER_PROVIDER.userinfoUrl
    || !isDeepStrictEqual(value.acceptableClientIds, [])
    || !isDeepStrictEqual(value.scopes, ['subject'])) unavailable()
  return value
}

function readRecord(path, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
      || (stat.mode & 0o777) !== 0o600 || stat.size > 2048) unavailable()
    const record = JSON.parse(fileSystem.readFileSync(path, 'utf8'))
    if (!exact(record, ['schema', 'projectRef', 'action', 'runId', 'state',
      'baselineSha256', 'createdAt', 'updatedAt']) || record.schema !== SCHEMA
      || record.projectRef !== STAGING_PROJECT_REF
      || !['ENABLE', 'DISABLE'].includes(record.action)
      || !['DISPATCHED', 'VERIFIED', 'HOLD'].includes(record.state)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.runId)
      || !HASH.test(record.baselineSha256)
      || !Number.isFinite(Date.parse(record.createdAt))
      || !Number.isFinite(Date.parse(record.updatedAt))) unavailable()
    return record
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

function persist(path, record, fileSystem, exclusive) {
  const directory = dirname(path)
  const temporary = exclusive ? path : resolve(directory, `.tll-gen23-provider-${record.runId}-${record.state}.tmp`)
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`)
  let descriptor
  try {
    fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const parent = fileSystem.lstatSync(directory)
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777) !== 0o700) unavailable()
    descriptor = fileSystem.openSync(temporary, 'wx', 0o600)
    let written = 0
    while (written < bytes.length) {
      const count = fileSystem.writeSync(descriptor, bytes, written, bytes.length - written, null)
      if (!Number.isInteger(count) || count < 1) unavailable()
      written += count
    }
    fileSystem.fsyncSync(descriptor); fileSystem.closeSync(descriptor); descriptor = undefined
    if (!exclusive) fileSystem.renameSync(temporary, path)
    const dir = fileSystem.openSync(directory, 'r')
    try { fileSystem.fsyncSync(dir) } finally { fileSystem.closeSync(dir) }
  } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
}

/** A record for one action only. Terminal and uncertain records are never reused. */
export function createStagingGeneration23ProviderJournal({ action, path = PROVIDER_CONTROL_PATHS[action],
  fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (!STAGING_GENERATION_23_PROVIDER_CONTROL_ENABLED || !['ENABLE', 'DISABLE'].includes(action)
    || typeof path !== 'string' || !path || typeof now !== 'function'
    || typeof makeRunId !== 'function') unavailable()
  let owned
  return Object.freeze({
    action,
    read: () => readRecord(path, fileSystem),
    claim(baseline) {
      if (readRecord(path, fileSystem) || !baseline || typeof baseline !== 'object') unavailable()
      const clock = now(), runId = makeRunId()
      if (!Number.isFinite(clock) || typeof runId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(runId)) unavailable()
      const record = Object.freeze({ schema: SCHEMA, projectRef: STAGING_PROJECT_REF,
        action, runId, state: 'DISPATCHED', baselineSha256: digest(baseline),
        createdAt: new Date(clock).toISOString(), updatedAt: new Date(clock).toISOString() })
      persist(path, record, fileSystem, true)
      owned = runId
      return record
    },
    finish(previous, state) {
      if (!['VERIFIED', 'HOLD'].includes(state) || previous?.state !== 'DISPATCHED'
        || previous.runId !== owned || JSON.stringify(readRecord(path, fileSystem)) !== JSON.stringify(previous)) unavailable()
      const next = Object.freeze({ ...previous, state, updatedAt: new Date(now()).toISOString() })
      persist(path, next, fileSystem, false)
      owned = undefined
      return next
    },
  })
}

/** The injected port must be bounded by the eventual supervised worker. */
export async function runStagingGeneration23ProviderControl({ action, port, journal, signal } = {}) {
  if (!STAGING_GENERATION_23_PROVIDER_CONTROL_ENABLED || !['ENABLE', 'DISABLE'].includes(action)
    || journal?.action !== action || typeof journal.read !== 'function'
    || typeof journal.claim !== 'function' || typeof journal.finish !== 'function'
    || typeof port?.readProvider !== 'function' || typeof port?.updateProvider !== 'function'
    || typeof port?.readBackendState !== 'function'
    || !signal || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
  try { if (journal.read()) return Object.freeze({ status: 'REPLAY_REJECTED' }) }
  catch { return Object.freeze({ status: 'HOLD_RECONCILE' }) }

  const enabled = action === 'ENABLE'
  let before
  try {
    const backend = await port.readBackendState(STAGING_PROVIDER_TARGET, { signal })
    if (!exact(backend, ['projectRef', 'controlsEnabled', 'runtimeSessions'])
      || backend.projectRef !== STAGING_PROJECT_REF || backend.controlsEnabled !== false
      || !Number.isSafeInteger(backend.runtimeSessions) || backend.runtimeSessions < 0
      || (enabled && backend.runtimeSessions !== 0)) unavailable()
    // During shutdown, close provider access after the backend is OFF even if
    // customer sessions remain. Session drain is required before role retirement.
    before = structuredClone(await port.readProvider(STAGING_PROVIDER_TARGET, { signal }))
    strictProvider(before, !enabled)
    if (signal.aborted) unavailable()
  } catch { return Object.freeze({ status: 'STOPPED_BEFORE_DISPATCH' }) }

  let intent
  try { intent = journal.claim(before) } catch { return Object.freeze({ status: 'HOLD_RECONCILE' }) }
  try {
    if (signal.aborted) unavailable()
    const result = await port.updateProvider(STAGING_PROVIDER_TARGET, PROVIDER_IDENTIFIER,
      Object.freeze({ enabled }), { signal })
    if (!exact(result, ['status', 'projectRef', 'identifier'])
      || result.status !== 'UPDATED_NEEDS_READBACK' || result.projectRef !== STAGING_PROJECT_REF
      || result.identifier !== PROVIDER_IDENTIFIER || signal.aborted) unavailable()
    const after = structuredClone(await port.readProvider(STAGING_PROVIDER_TARGET, { signal }))
    strictProvider(after, enabled)
    const stable = value => Object.fromEntries(Object.entries(value)
      .filter(([key]) => !['enabled', 'updated_at'].includes(key)))
    if (!isDeepStrictEqual(stable(before), stable(after))
      || Date.parse(after.updated_at) < Date.parse(before.updated_at) || signal.aborted) unavailable()
    journal.finish(intent, 'VERIFIED')
    return Object.freeze({ status: enabled ? 'PROVIDER_ENABLED_VERIFIED' : 'PROVIDER_DISABLED_VERIFIED',
      projectRef: STAGING_PROJECT_REF, identifier: PROVIDER_IDENTIFIER })
  } catch {
    try { journal.finish(intent, 'HOLD') } catch { /* preserve dispatch record */ }
    return Object.freeze({ status: 'HOLD_RECONCILE' })
  }
}
