/**
 * Disabled-state staging broker-provider rotation.
 *
 * This module has no native transport. Callers inject the three host/provider
 * adapters, which keeps credential handling outside source control and makes
 * the failure boundary testable before another runtime window is considered.
 */
import { randomBytes as systemRandomBytes, randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STAGING_PROJECT_REF = 'qdmvngjwkcsilzmqksme'
export const PROVIDER_IDENTIFIER = 'custom:tll-staging-subject-broker-v1'
export const BROKER_CLIENT_ID = 'tll-staging-subject-broker-v1'
export const BROKER_SECRET_NAME = 'TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET'
// Exact already-stored staging address. Supabase's OAuth2 runtime uses userinfo,
// not this address; keep it pinned rather than attempting an ignored empty update.
export const RETAINED_STAGING_JWKS_URI = 'https://the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app/auth/customer/authorize/.well-known/jwks.json'
export const STAGING_PROVIDER_TARGET = Object.freeze({
  projectRef: STAGING_PROJECT_REF,
  vercelProject: 'the-lifting-lab',
  vercelScope: 'my-lifting-lab-s-projects',
  branch: 'codex/tll-integration',
  environment: 'preview',
})
export const DEFAULT_JOURNAL_PATH = fileURLToPath(new URL('../../implementation-state/staging/tll-provider-broker-rotation.json', import.meta.url))

export const STAGING_BROKER_PROVIDER = Object.freeze({
  authorizationUrl: 'https://the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app/auth/customer/authorize',
  callbackUrl: 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/callback',
  clientId: BROKER_CLIENT_ID,
  emailOptional: true,
  enabled: false,
  identifier: PROVIDER_IDENTIFIER,
  jwksUrl: RETAINED_STAGING_JWKS_URI,
  pkce: true,
  scopes: Object.freeze(['subject']),
  tokenUrl: 'https://qdmvngjwkcsilzmqksme.supabase.co/functions/v1/tll-broker-token',
  userinfoUrl: 'https://qdmvngjwkcsilzmqksme.supabase.co/functions/v1/tll-broker-userinfo',
})

const JOURNAL_SCHEMA = 'tll-staging-provider-broker-rotation/v1'
const TERMINAL_STATES = new Set(['ROTATION_VERIFIED', 'STOPPED_BEFORE_PROVIDER_UPDATE', 'RECONCILIATION_REQUIRED'])
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const unavailable = () => { throw new Error('Staging provider broker rotation unavailable') }

function validateTarget(value) {
  if (!exactKeys(value, Object.keys(STAGING_PROVIDER_TARGET))) unavailable()
  for (const [key, expected] of Object.entries(STAGING_PROVIDER_TARGET)) if (value[key] !== expected) unavailable()
  return STAGING_PROVIDER_TARGET
}

function validateFrozenPreflight(value) {
  if (!exactKeys(value, ['target', 'providerIdentifier', 'providerEnabled', 'edgeEnabled', 'privateEnabled', 'publicEnabled', 'supabase', 'vercel'])
    || value.providerIdentifier !== PROVIDER_IDENTIFIER || value.providerEnabled !== false || value.edgeEnabled !== false
    || value.privateEnabled !== false || value.publicEnabled !== false || !Array.isArray(value.supabase) || value.supabase.length !== 0
    || !Array.isArray(value.vercel) || value.vercel.length !== 0) unavailable()
  validateTarget(value.target)
}

function validateMutationReceipt(value, status, name = BROKER_SECRET_NAME) {
  if (!exactKeys(value, ['status', 'target', 'name']) || value.status !== status || value.name !== name) unavailable()
  validateTarget(value.target)
}

function validateProviderMutationReceipt(value) {
  if (!exactKeys(value, ['status', 'target', 'providerIdentifier']) || value.status !== 'UPDATED' || value.providerIdentifier !== PROVIDER_IDENTIFIER) unavailable()
  validateTarget(value.target)
}

function fsyncDirectory(directory, fileSystem) {
  const descriptor = fileSystem.openSync(directory, 'r')
  try { fileSystem.fsyncSync(descriptor) } finally { fileSystem.closeSync(descriptor) }
}

function readJournal(path, fileSystem = fs) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || stat.size > 16_384) unavailable()
    const value = JSON.parse(fileSystem.readFileSync(path, 'utf8'))
    if (!exactKeys(value, ['schema', 'target', 'providerIdentifier', 'clientId', 'state', 'runId', 'createdAt'])
      || value.schema !== JOURNAL_SCHEMA || value.target !== STAGING_PROJECT_REF || value.providerIdentifier !== PROVIDER_IDENTIFIER
      || value.clientId !== BROKER_CLIENT_ID || !['INTENT_RECORDED', ...TERMINAL_STATES].includes(value.state)
      || typeof value.runId !== 'string' || value.runId.length < 8 || typeof value.createdAt !== 'string') unavailable()
    return Object.freeze(value)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    unavailable()
  }
}

/** A one-use journal intentionally stores only fixed identifiers and terminal state. */
export function createProviderBrokerRotationJournal({ path = DEFAULT_JOURNAL_PATH, fileSystem = fs, makeRunId = randomUUID } = {}) {
  let ownedRunId
  return Object.freeze({
    read: () => readJournal(path, fileSystem),
    recordIntent({ nowMs = Date.now() } = {}) {
      if (!Number.isFinite(nowMs) || readJournal(path, fileSystem)) unavailable()
      const runId = makeRunId()
      if (typeof runId !== 'string' || runId.length < 8) unavailable()
      const record = Object.freeze({ schema: JOURNAL_SCHEMA, target: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER,
        clientId: BROKER_CLIENT_ID, state: 'INTENT_RECORDED', runId, createdAt: new Date(nowMs).toISOString() })
      const directory = dirname(path), bytes = Buffer.from(JSON.stringify(record) + '\n'); let descriptor
      try {
        fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 })
        descriptor = fileSystem.openSync(path, 'wx', 0o600); fileSystem.writeSync(descriptor, bytes); fileSystem.fsyncSync(descriptor)
        fileSystem.closeSync(descriptor); descriptor = undefined; fsyncDirectory(directory, fileSystem); ownedRunId = runId
        return record
      } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
    },
    transition(intent, state) {
      if (!intent || intent.runId !== ownedRunId || intent.state !== 'INTENT_RECORDED' || !TERMINAL_STATES.has(state)) unavailable()
      const current = readJournal(path, fileSystem)
      if (!current || current.runId !== ownedRunId || current.state !== 'INTENT_RECORDED') unavailable()
      const record = Object.freeze({ ...current, state })
      const temporary = resolve(dirname(path), `.${JOURNAL_SCHEMA.replace(/[^a-z0-9]/gi, '_')}.${ownedRunId}.tmp`)
      const bytes = Buffer.from(JSON.stringify(record) + '\n'); let descriptor
      try {
        descriptor = fileSystem.openSync(temporary, 'wx', 0o600); fileSystem.writeSync(descriptor, bytes); fileSystem.fsyncSync(descriptor)
        fileSystem.closeSync(descriptor); descriptor = undefined; fileSystem.renameSync(temporary, path); fsyncDirectory(dirname(path), fileSystem)
        ownedRunId = undefined; return record
      } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
    },
  })
}

function validateExistingProvider(value) {
  const extra = ['id', 'providerType', 'name', 'acceptableClientIds', 'attributeMappingPresent',
    'authorizationParamsPresent', 'issuer', 'discoveryUrl', 'skipNonceCheck',
    'discoveryDocumentPresent', 'createdAt', 'updatedAt']
  if (!exactKeys(value, [...Object.keys(STAGING_BROKER_PROVIDER).filter(key => key !== 'callbackUrl'), ...extra])
    || typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 128
    || value.providerType !== 'oauth2' || !['TLL staging subject broker', BROKER_CLIENT_ID].includes(value.name)
    || !Array.isArray(value.acceptableClientIds) || value.acceptableClientIds.length !== 0
    || value.attributeMappingPresent !== false || value.authorizationParamsPresent !== false
    || value.issuer !== '' || value.discoveryUrl !== '' || value.skipNonceCheck !== false
    || value.discoveryDocumentPresent !== false
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) unavailable()
  // The official safe-held read permits an empty scope list or the intended
  // subject scope. All other provider settings must already match before a
  // new credential is generated; a changed JWKS address is never repaired.
  if (!Array.isArray(value.scopes) || !(value.scopes.length === 0
    || value.scopes.length === 1 && value.scopes[0] === 'subject')) unavailable()
  for (const [key, expected] of Object.entries(STAGING_BROKER_PROVIDER)) {
    if (key !== 'scopes' && key !== 'callbackUrl' && value[key] !== expected) unavailable()
  }
}

function projectProviderReadback(value) {
  if (!exactKeys(value, Object.keys(STAGING_BROKER_PROVIDER))) unavailable()
  for (const [key, expected] of Object.entries(STAGING_BROKER_PROVIDER)) {
    const actual = value[key]
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) unavailable()
    } else if (actual !== expected) unavailable()
  }
  return Object.freeze({ ...STAGING_BROKER_PROVIDER, scopes: Object.freeze([...STAGING_BROKER_PROVIDER.scopes]) })
}

function projectSecretNames(value) {
  if (!exactKeys(value, ['target', 'supabase', 'vercel']) || !Array.isArray(value.supabase) || !Array.isArray(value.vercel)) unavailable()
  validateTarget(value.target)
  const exact = names => names.length === 1 && names[0] === BROKER_SECRET_NAME
  if (!exact(value.supabase) || !exact(value.vercel)) unavailable()
  return Object.freeze({ supabase: Object.freeze([BROKER_SECRET_NAME]), vercel: Object.freeze([BROKER_SECRET_NAME]) })
}

function takeBrokerMaterial(randomBytes) {
  const raw = randomBytes(48)
  if (!Buffer.isBuffer(raw) || raw.length !== 48) unavailable()
  let encoded
  try {
    encoded = Buffer.from(raw.toString('base64url'), 'utf8')
    if (encoded.length < 32 || encoded.length > 512 || /[\x00-\x1f\x7f]/.test(encoded.toString('utf8'))) unavailable()
    return encoded
  } finally { raw.fill(0) }
}

async function callWithCopy(port, material, ...args) {
  const copy = Buffer.from(material)
  try { return await port(STAGING_PROVIDER_TARGET, ...args, copy) } finally { copy.fill(0) }
}

async function verifyRemoval(ports) {
  const names = await ports.readbackSecretNames(STAGING_PROVIDER_TARGET)
  validateTarget(names?.target)
  if (!exactKeys(names, ['target', 'supabase', 'vercel']) || !Array.isArray(names.supabase) || !Array.isArray(names.vercel)
    || names.supabase.includes(BROKER_SECRET_NAME) || names.vercel.includes(BROKER_SECRET_NAME)) unavailable()
}

/**
 * Rotate one generated client credential into Vercel Preview, the staging Edge
 * runtime and the existing custom provider. This function is injected-only and
 * deliberately never removes host values once provider update is attempted.
 */
export async function rotateStagingProviderBroker({ ports, journal = createProviderBrokerRotationJournal(), randomBytes = systemRandomBytes, now = Date.now } = {}) {
  const required = ['preflight', 'stageVercelBrokerSecret', 'stageSupabaseBrokerSecret', 'getProvider', 'updateProvider', 'readProvider',
    'removeVercelBrokerSecret', 'removeSupabaseBrokerSecret', 'readbackSecretNames']
  if (!ports || required.some(name => typeof ports[name] !== 'function') || !journal || typeof journal.recordIntent !== 'function' || typeof journal.transition !== 'function'
    || typeof journal.read !== 'function' || typeof randomBytes !== 'function' || typeof now !== 'function') unavailable()

  const prior = journal.read()
  if (prior) return Object.freeze({ status: ['INTENT_RECORDED', 'RECONCILIATION_REQUIRED'].includes(prior.state) ? 'RECONCILIATION_REQUIRED' : 'REPLAY_REJECTED',
    target: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER })

  let intent, material, vercelStageAttempted = false, supabaseStageAttempted = false, providerUpdateAttempted = false
  const stopped = async () => {
    try {
      if (vercelStageAttempted) validateMutationReceipt(await ports.removeVercelBrokerSecret(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME), 'REMOVED')
      if (supabaseStageAttempted) validateMutationReceipt(await ports.removeSupabaseBrokerSecret(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME), 'REMOVED')
      if (vercelStageAttempted || supabaseStageAttempted) await verifyRemoval(ports)
      if (intent) journal.transition(intent, 'STOPPED_BEFORE_PROVIDER_UPDATE')
      return Object.freeze({ status: 'STOPPED_BEFORE_PROVIDER_UPDATE', target: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER })
    } catch {
      try { if (intent) journal.transition(intent, 'RECONCILIATION_REQUIRED') } catch { /* journal is already terminal or inaccessible */ }
      return Object.freeze({ status: 'RECONCILIATION_REQUIRED', target: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER })
    }
  }

  try {
    // Prove the exact retained value before generating or staging credentials.
    validateFrozenPreflight(await ports.preflight(STAGING_PROVIDER_TARGET))
    const existing = await ports.getProvider(STAGING_PROVIDER_TARGET, PROVIDER_IDENTIFIER)
    if (!exactKeys(existing, ['target', 'provider'])) unavailable()
    validateTarget(existing.target); validateExistingProvider(existing.provider)
    material = takeBrokerMaterial(randomBytes)
    intent = journal.recordIntent({ nowMs: now() })
    vercelStageAttempted = true; validateMutationReceipt(await callWithCopy(ports.stageVercelBrokerSecret, material, BROKER_SECRET_NAME), 'STAGED')
    supabaseStageAttempted = true; validateMutationReceipt(await callWithCopy(ports.stageSupabaseBrokerSecret, material, BROKER_SECRET_NAME), 'STAGED')
    providerUpdateAttempted = true
    validateProviderMutationReceipt(await callWithCopy(ports.updateProvider, material, STAGING_BROKER_PROVIDER))
    const providerReadback = await ports.readProvider(STAGING_PROVIDER_TARGET, PROVIDER_IDENTIFIER)
    if (!exactKeys(providerReadback, ['target', 'provider'])) unavailable()
    validateTarget(providerReadback.target); const provider = projectProviderReadback(providerReadback.provider)
    projectSecretNames(await ports.readbackSecretNames(STAGING_PROVIDER_TARGET))
    journal.transition(intent, 'ROTATION_VERIFIED')
    return Object.freeze({ status: 'ROTATION_VERIFIED', target: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER, provider })
  } catch {
    if (providerUpdateAttempted) {
      try { if (intent) journal.transition(intent, 'RECONCILIATION_REQUIRED') } catch { /* preserve a prior durable terminal state */ }
      return Object.freeze({ status: 'RECONCILIATION_REQUIRED', target: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER })
    }
    // Another process may have won the exclusive journal between the initial
    // read and recordIntent. Never downgrade its active or terminal state.
    if (!intent && !vercelStageAttempted && !supabaseStageAttempted) {
      try {
        const concurrent = journal.read()
        if (concurrent) return Object.freeze({ status: ['INTENT_RECORDED', 'RECONCILIATION_REQUIRED'].includes(concurrent.state)
          ? 'RECONCILIATION_REQUIRED' : 'REPLAY_REJECTED', target: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER })
      } catch { return Object.freeze({ status: 'RECONCILIATION_REQUIRED', target: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER }) }
    }
    return stopped()
  } finally { material?.fill(0) }
}
