/** Injected-only staging surface state machine; no native launcher or credential reader. */
import * as fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NATIVE_SURFACE_ACTIVATION_TRANSPORT_ENABLED = false
export const STAGING_PROJECT_REF = 'qdmvngjwkcsilzmqksme'
export const PRODUCTION_PROJECT_REF = 'wrhgscovsgsudtedbljr'
export const STAGING_BRANCH = 'codex/tll-integration'
export const STAGING_ALIAS = 'https://the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app'
export const STAGING_SURFACE_TARGET = Object.freeze({ projectRef: STAGING_PROJECT_REF, vercelProject: 'the-lifting-lab',
  vercelScope: 'my-lifting-lab-s-projects', branch: STAGING_BRANCH, environment: 'preview', alias: STAGING_ALIAS })
export const DEFAULT_JOURNAL_PATH = fileURLToPath(new URL('../../implementation-state/staging/tll-surface-activation.json', import.meta.url))
export const MAX_FRESH_PREREQUISITE_MS = 5 * 60 * 1000
export const HELD_SURFACE_FLAGS = Object.freeze({ edge: false, privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false })
export const ENABLED_SURFACE_FLAGS = Object.freeze({ edge: true, privateCustomer: true, privateCart: true, publicCustomer: true, publicCart: true })

const JOURNAL_SCHEMA = 'tll-staging-surface-activation/v1'
const TERMINAL = new Set(['FREEZE_VERIFIED', 'ENABLE_VERIFIED', 'HOLD', 'RECONCILIATION_REQUIRED'])
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const unavailable = () => { throw new Error('Staging surface activation unavailable') }

function validateTarget(value) {
  if (!exactKeys(value, Object.keys(STAGING_SURFACE_TARGET))) unavailable()
  for (const [key, expected] of Object.entries(STAGING_SURFACE_TARGET)) if (value[key] !== expected) unavailable()
  return STAGING_SURFACE_TARGET
}
function fsyncDirectory(directory, fileSystem) {
  const descriptor = fileSystem.openSync(directory, 'r')
  try { fileSystem.fsyncSync(descriptor) } finally { fileSystem.closeSync(descriptor) }
}
function readJournal(path, fileSystem = fs) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 16_384) unavailable()
    const value = JSON.parse(fileSystem.readFileSync(path, 'utf8'))
    if (!exactKeys(value, ['schema', 'target', 'branch', 'alias', 'runId', 'action', 'state', 'createdAt'])
      || value.schema !== JOURNAL_SCHEMA || value.target !== STAGING_PROJECT_REF || value.branch !== STAGING_BRANCH || value.alias !== STAGING_ALIAS
      || !['FREEZE', 'ENABLE'].includes(value.action) || !['INTENT_RECORDED', ...TERMINAL].includes(value.state)
      || typeof value.runId !== 'string' || value.runId.length < 8 || typeof value.createdAt !== 'string') unavailable()
    return Object.freeze(value)
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

export function createSurfaceActivationJournal({ path = DEFAULT_JOURNAL_PATH, fileSystem = fs, makeRunId = randomUUID } = {}) {
  let ownedRunId
  return Object.freeze({
    read: () => readJournal(path, fileSystem),
    recordIntent(action, { nowMs = Date.now() } = {}) {
      if (!['FREEZE', 'ENABLE'].includes(action) || !Number.isFinite(nowMs) || readJournal(path, fileSystem)) unavailable()
      const runId = makeRunId(); if (typeof runId !== 'string' || runId.length < 8) unavailable()
      const record = Object.freeze({ schema: JOURNAL_SCHEMA, target: STAGING_PROJECT_REF, branch: STAGING_BRANCH, alias: STAGING_ALIAS,
        runId, action, state: 'INTENT_RECORDED', createdAt: new Date(nowMs).toISOString() })
      const directory = dirname(path), bytes = Buffer.from(JSON.stringify(record) + '\n'); let descriptor
      try {
        fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 }); descriptor = fileSystem.openSync(path, 'wx', 0o600)
        fileSystem.writeSync(descriptor, bytes); fileSystem.fsyncSync(descriptor); fileSystem.closeSync(descriptor); descriptor = undefined
        fsyncDirectory(directory, fileSystem); ownedRunId = runId; return record
      } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
    },
    transition(intent, state) {
      if (!intent || intent.runId !== ownedRunId || intent.state !== 'INTENT_RECORDED' || !TERMINAL.has(state)) unavailable()
      const current = readJournal(path, fileSystem)
      if (!current || current.runId !== ownedRunId || current.state !== 'INTENT_RECORDED') unavailable()
      const record = Object.freeze({ ...current, state }), temporary = resolve(dirname(path), `.${JOURNAL_SCHEMA.replace(/[^a-z0-9]/gi, '_')}.${ownedRunId}.tmp`)
      const bytes = Buffer.from(JSON.stringify(record) + '\n'); let descriptor
      try {
        descriptor = fileSystem.openSync(temporary, 'wx', 0o600); fileSystem.writeSync(descriptor, bytes); fileSystem.fsyncSync(descriptor)
        fileSystem.closeSync(descriptor); descriptor = undefined; fileSystem.renameSync(temporary, path); fsyncDirectory(dirname(path), fileSystem)
        ownedRunId = undefined; return record
      } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
    },
  })
}

function validateRequirements(value, nowMs) {
  if (!exactKeys(value, ['sourceCommit', 'manifestSha256', 'observedAt']) || !/^[a-f0-9]{40}$/.test(value?.sourceCommit ?? '')
    || !/^[a-f0-9]{64}$/.test(value?.manifestSha256 ?? '') || typeof value?.observedAt !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.observedAt) || !Number.isFinite(nowMs)) unavailable()
  const observed = Date.parse(value.observedAt)
  if (!Number.isFinite(observed) || observed > nowMs || nowMs - observed > MAX_FRESH_PREREQUISITE_MS) unavailable()
  return value
}
function validateFlags(value, expected) {
  if (!exactKeys(value, ['target', ...Object.keys(HELD_SURFACE_FLAGS)])) unavailable(); validateTarget(value.target)
  for (const [key, wanted] of Object.entries(expected)) if (value[key] !== wanted) unavailable()
  return Object.freeze({ target: STAGING_SURFACE_TARGET, ...expected })
}
function validateIdentity(value, requirements, { nowMs, createdAfterMs } = {}) {
  if (!exactKeys(value, ['target', 'deploymentId', 'immutableUrl', 'sourceCommit', 'manifestSha256', 'ready', 'createdAt'])) unavailable()
  validateTarget(value.target)
  const created = Date.parse(value.createdAt)
  if (!/^dpl_[A-Za-z0-9]+$/.test(value.deploymentId ?? '') || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value.immutableUrl ?? '')
    || value.sourceCommit !== requirements.sourceCommit || value.manifestSha256 !== requirements.manifestSha256 || value.ready !== true
    || !Number.isFinite(created) || created > nowMs || (createdAfterMs !== undefined && created < createdAfterMs)) unavailable()
  return Object.freeze({ ...value, target: STAGING_SURFACE_TARGET })
}
function validateAlias(value, identity) {
  if (!exactKeys(value, ['target', 'alias', 'deploymentId', 'immutableUrl'])) unavailable(); validateTarget(value.target)
  if (value.alias !== STAGING_ALIAS || value.deploymentId !== identity.deploymentId || value.immutableUrl !== identity.immutableUrl) unavailable()
}
function validateTls(value, url) {
  if (!exactKeys(value, ['target', 'url', 'tls'])) unavailable(); validateTarget(value.target)
  if (value.url !== url || value.tls !== true) unavailable()
}
function validateRuntime(value, expected, identity) {
  if (!exactKeys(value, ['target', 'deploymentId', 'immutableUrl', 'customerEnabled', 'cartEnabled', 'brokerEnabled', 'publicCustomerEnabled', 'publicCartEnabled'])) unavailable()
  validateTarget(value.target)
  if (value.deploymentId !== identity.deploymentId || value.immutableUrl !== identity.immutableUrl
    || value.customerEnabled !== expected.privateCustomer || value.cartEnabled !== expected.privateCart || value.brokerEnabled !== expected.edge
    || value.publicCustomerEnabled !== expected.publicCustomer || value.publicCartEnabled !== expected.publicCart) unavailable()
  return Object.freeze({ ...value, target: STAGING_SURFACE_TARGET })
}
function validateMutation(value, surface, enabled) {
  const keys = surface === 'edge' ? ['target', 'surface', 'enabled'] : ['target', 'surface', 'customer', 'cart']
  if (!exactKeys(value, keys)) unavailable(); validateTarget(value.target)
  if (value.surface !== surface || (surface === 'edge' ? value.enabled !== enabled : value.customer !== enabled || value.cart !== enabled)) unavailable()
}
function validateJournal(journal) {
  if (!journal || typeof journal.read !== 'function' || typeof journal.recordIntent !== 'function' || typeof journal.transition !== 'function') unavailable()
}
function existingStatus(journal) {
  const prior = journal.read(); if (!prior) return null
  return ['INTENT_RECORDED', 'RECONCILIATION_REQUIRED'].includes(prior.state) ? 'HOLD_RECONCILIATION_REQUIRED' : 'REPLAY_REJECTED'
}
function stableResult(status, extra = {}) { return Object.freeze({ status, target: STAGING_PROJECT_REF, branch: STAGING_BRANCH, alias: STAGING_ALIAS, ...extra }) }
function requirePorts(ports) {
  const names = ['setEdgeEnabled', 'setVercelPrivateEnabled', 'setVercelPublicEnabled', 'readSurfaceFlags', 'createPreviewDeployment',
    'readDeployment', 'resolveAlias', 'probeTls', 'readRuntimeReadiness']
  if (!ports || names.some(name => typeof ports[name] !== 'function')) unavailable()
}
async function readDeploymentProof(ports, identity, expected) {
  validateAlias(await ports.resolveAlias(STAGING_SURFACE_TARGET, STAGING_ALIAS), identity)
  validateTls(await ports.probeTls(STAGING_SURFACE_TARGET, identity.immutableUrl), identity.immutableUrl)
  validateTls(await ports.probeTls(STAGING_SURFACE_TARGET, STAGING_ALIAS), STAGING_ALIAS)
  validateFlags(await ports.readSurfaceFlags(STAGING_SURFACE_TARGET), expected)
  return validateRuntime(await ports.readRuntimeReadiness(STAGING_SURFACE_TARGET, identity.deploymentId), expected, identity)
}
async function writeFlags(ports, flags) {
  validateMutation(await ports.setEdgeEnabled(STAGING_SURFACE_TARGET, flags.edge), 'edge', flags.edge)
  validateMutation(await ports.setVercelPrivateEnabled(STAGING_SURFACE_TARGET, { customer: flags.privateCustomer, cart: flags.privateCart }), 'private', flags.privateCustomer)
  validateMutation(await ports.setVercelPublicEnabled(STAGING_SURFACE_TARGET, { customer: flags.publicCustomer, cart: flags.publicCart }), 'public', flags.publicCustomer)
}
async function deployAndProve(ports, requirements, flags, priorIdentity, createdAfterMs, now, onDispatch = () => {}) {
  const input = { branch: STAGING_BRANCH, sourceCommit: requirements.sourceCommit, manifestSha256: requirements.manifestSha256,
    publicCustomer: flags.publicCustomer, publicCart: flags.publicCart }
  onDispatch()
  const created = validateIdentity(await ports.createPreviewDeployment(STAGING_SURFACE_TARGET, input), requirements, { nowMs: now(), createdAfterMs })
  if (created.deploymentId === priorIdentity.deploymentId || created.immutableUrl === priorIdentity.immutableUrl) unavailable()
  const identity = validateIdentity(await ports.readDeployment(STAGING_SURFACE_TARGET, created.deploymentId), requirements, { nowMs: now(), createdAfterMs })
  if (identity.deploymentId !== created.deploymentId || identity.immutableUrl !== created.immutableUrl || identity.createdAt !== created.createdAt) unavailable()
  return { identity, runtime: await readDeploymentProof(ports, identity, flags) }
}
async function recoverHeld(ports, requirements, priorIdentity, startedAt, now) {
  await writeFlags(ports, HELD_SURFACE_FLAGS)
  const heldBuildBoundary = now()
  if (!Number.isFinite(heldBuildBoundary) || heldBuildBoundary < startedAt) unavailable()
  return deployAndProve(ports, requirements, HELD_SURFACE_FLAGS, priorIdentity, heldBuildBoundary, now)
}

export async function freezeStagingSurfaces({ ports, currentEvidence, requirements, journal = createSurfaceActivationJournal(), now = Date.now } = {}) {
  requirePorts(ports); validateJournal(journal); if (typeof now !== 'function') unavailable()
  const replay = existingStatus(journal); if (replay) return stableResult(replay)
  const startedAt = now(); let current, intent
  try {
    validateRequirements(requirements, startedAt); current = validateIdentity(currentEvidence, requirements, { nowMs: startedAt })
    intent = journal.recordIntent('FREEZE', { nowMs: startedAt })
  } catch { return stableResult(existingStatus(journal) ?? 'HOLD') }
  try {
    const { identity, runtime } = await recoverHeld(ports, requirements, current, startedAt, now)
    validateRequirements(requirements, now()); journal.transition(intent, 'FREEZE_VERIFIED')
    return stableResult('SURFACES_HELD_VERIFIED', { deployment: identity, runtime })
  } catch {
    try { journal.transition(intent, 'RECONCILIATION_REQUIRED') } catch { /* preserve durable state */ }
    return stableResult('HOLD_RECONCILIATION_REQUIRED')
  }
}

export async function enableStagingSurfaces({ ports, heldEvidence, requirements, journal = createSurfaceActivationJournal(), now = Date.now } = {}) {
  requirePorts(ports); validateJournal(journal); if (typeof now !== 'function') unavailable()
  const replay = existingStatus(journal); if (replay) return stableResult(replay)
  const startedAt = now(); let held, intent, activationAttempted = false, enabledDeploymentDispatched = false
  try {
    validateRequirements(requirements, startedAt); held = validateIdentity(heldEvidence, requirements, { nowMs: startedAt })
    await readDeploymentProof(ports, held, HELD_SURFACE_FLAGS)
    intent = journal.recordIntent('ENABLE', { nowMs: startedAt }); validateRequirements(requirements, now())
  } catch {
    if (intent) {
      try { journal.transition(intent, 'HOLD') } catch { return stableResult('HOLD_RECONCILIATION_REQUIRED', { activationAttempted: false }) }
      return stableResult('HOLD', { activationAttempted: false })
    }
    return stableResult(existingStatus(journal) ?? 'HOLD', { activationAttempted: false })
  }
  try {
    activationAttempted = true; await writeFlags(ports, ENABLED_SURFACE_FLAGS)
    const enabledBuildBoundary = now()
    if (!Number.isFinite(enabledBuildBoundary) || enabledBuildBoundary < startedAt) unavailable()
    const { identity, runtime } = await deployAndProve(ports, requirements, ENABLED_SURFACE_FLAGS, held, enabledBuildBoundary, now,
      () => { enabledDeploymentDispatched = true })
    validateRequirements(requirements, now()); journal.transition(intent, 'ENABLE_VERIFIED')
    return stableResult('SURFACES_ENABLED_VERIFIED', { deployment: identity, runtime })
  } catch {
    try {
      const { identity, runtime } = await recoverHeld(ports, requirements, held, startedAt, now)
      if (enabledDeploymentDispatched) {
        journal.transition(intent, 'RECONCILIATION_REQUIRED')
        return stableResult('HOLD_RECONCILIATION_REQUIRED', { activationAttempted, deployment: identity, runtime })
      }
      journal.transition(intent, 'HOLD'); return stableResult('HOLD', { activationAttempted, deployment: identity, runtime })
    } catch {
      try { journal.transition(intent, 'RECONCILIATION_REQUIRED') } catch { /* preserve durable state */ }
      return stableResult('HOLD_RECONCILIATION_REQUIRED', { activationAttempted })
    }
  }
}
