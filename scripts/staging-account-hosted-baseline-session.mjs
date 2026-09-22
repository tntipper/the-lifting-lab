import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { STAGING_BROKER_PROVIDER } from './staging-provider-broker-rotation.mjs'

export const HOSTED_BASELINE_SESSION_SCHEMA = 'tll-staging-hosted-baseline-session/v1'
export const HOSTED_BASELINE_SESSION_TARGET = 'qdmvngjwkcsilzmqksme'
export const HOSTED_BASELINE_SESSION_PRODUCTION_EXCLUDED = 'wrhgscovsgsudtedbljr'
export const HOSTED_BASELINE_SESSION_DEADLINE_MS = 60_000
export const HOSTED_BASELINE_SESSION_JOURNAL_PATH = resolve(import.meta.dirname, '../../implementation-state/staging/tll-hosted-baseline-observation.json')

const unavailable = () => { throw new Error('Staging hosted baseline session unavailable') }
const wipe = value => { if (Buffer.isBuffer(value)) value.fill(0) }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const safeString = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[A-Z0-9_./:-]+$/i.test(value)
const cleanProviderString = (value, maximum) => typeof value === 'string' && value.length >= 1 && value.length <= maximum && !/[\x00-\x1f\x7f]/.test(value)
const validRunId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const sha256 = value => createHash('sha256').update(value).digest('hex')
const HOLD_REASONS = new Set(['provider_name_drift','provider_enabled','provider_pkce_disabled','provider_client_id_drift','provider_acceptable_client_ids_drift','provider_scopes_drift','provider_email_policy_drift','provider_attribute_mapping_drift','provider_authorization_params_drift','provider_skip_nonce_check_enabled','provider_authorization_endpoint_drift','provider_token_endpoint_drift','provider_userinfo_endpoint_drift','provider_jwks_configured','provider_issuer_configured','broker_secret_present_supabase','broker_secret_present_vercel','surface_enabled','application_manifest_evidence_absent'])

function validRecord (value) {
  if (!exact(value, ['schema', 'state', 'runId', 'target', 'startedAt', 'updatedAt', 'deadlineMs', 'status', 'reasonCodes', 'observationHash'])
    || value.schema !== HOSTED_BASELINE_SESSION_SCHEMA || !validRunId(value.runId)
    || value.target !== HOSTED_BASELINE_SESSION_TARGET || !Number.isSafeInteger(value.deadlineMs) || value.deadlineMs < 1 || value.deadlineMs > HOSTED_BASELINE_SESSION_DEADLINE_MS
    || !Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.updatedAt)) || Date.parse(value.updatedAt) < Date.parse(value.startedAt) || !Array.isArray(value.reasonCodes)
    || value.reasonCodes.length > 19 || value.reasonCodes.some(code => !safeString(code)) || new Set(value.reasonCodes).size !== value.reasonCodes.length) unavailable()
  if (value.state === 'INTENT_RECORDED') {
    if (value.status !== null || value.observationHash !== null || value.reasonCodes.length !== 0) unavailable()
  } else if (value.state === 'OBSERVATION_RECORDED') {
    if (!['PASS', 'HOLD'].includes(value.status) || !/^[a-f0-9]{64}$/.test(value.observationHash)) unavailable()
  } else if (value.state === 'OBSERVATION_FAILED') {
    if (value.status !== 'FAILED' || value.observationHash !== null || value.reasonCodes.length < 1) unavailable()
  } else unavailable()
  return Object.freeze({ ...value, reasonCodes: Object.freeze([...value.reasonCodes]) })
}

function secureRead (path, fileSystem) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 8_192) unavailable()
    return validRecord(JSON.parse(fileSystem.readFileSync(path, 'utf8')))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    unavailable()
  }
}

function durableWriteNew (path, value, fileSystem) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8')
  let descriptor
  try {
    fileSystem.mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    descriptor = fileSystem.openSync(path, 'wx', 0o600)
    fileSystem.writeSync(descriptor, bytes)
    fileSystem.fsyncSync(descriptor)
    fileSystem.closeSync(descriptor); descriptor = undefined
    const directory = fileSystem.openSync(dirname(path), 'r')
    try { fileSystem.fsyncSync(directory) } finally { fileSystem.closeSync(directory) }
  } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
}

function durableReplace (path, value, runId, fileSystem) {
  const temporary = resolve(dirname(path), `.tll-hosted-baseline-${runId}.tmp`)
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8')
  let descriptor
  try {
    descriptor = fileSystem.openSync(temporary, 'wx', 0o600)
    fileSystem.writeSync(descriptor, bytes)
    fileSystem.fsyncSync(descriptor)
    fileSystem.closeSync(descriptor); descriptor = undefined
    fileSystem.renameSync(temporary, path)
    const directory = fileSystem.openSync(dirname(path), 'r')
    try { fileSystem.fsyncSync(directory) } finally { fileSystem.closeSync(directory) }
  } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
}

export function createHostedBaselineObservationJournal ({ path = HOSTED_BASELINE_SESSION_JOURNAL_PATH, fileSystem = fs, makeRunId = randomUUID, now = Date.now } = {}) {
  if (typeof path !== 'string' || !path || typeof makeRunId !== 'function' || typeof now !== 'function') unavailable()
  let owner = null
  return Object.freeze({
    read: () => secureRead(path, fileSystem),
    claim () {
      if (secureRead(path, fileSystem)) unavailable()
      const runId = makeRunId()
      if (!validRunId(runId)) unavailable()
      const timestamp = new Date(now()).toISOString()
      const intent = Object.freeze({ schema: HOSTED_BASELINE_SESSION_SCHEMA, state: 'INTENT_RECORDED', runId, target: HOSTED_BASELINE_SESSION_TARGET,
        startedAt: timestamp, updatedAt: timestamp, deadlineMs: HOSTED_BASELINE_SESSION_DEADLINE_MS, status: null, reasonCodes: Object.freeze([]), observationHash: null })
      durableWriteNew(path, intent, fileSystem); owner = runId
      return intent
    },
    finish (intent, terminal) {
      if (!intent || intent.runId !== owner || !validRecord(terminal) || terminal.runId !== owner || terminal.state === 'INTENT_RECORDED') unavailable()
      const current = secureRead(path, fileSystem)
      if (!current || current.runId !== owner || current.state !== 'INTENT_RECORDED') unavailable()
      durableReplace(path, terminal, owner, fileSystem); owner = null
      return terminal
    },
  })
}

// The boundary checker intentionally recognizes live launchers only when their
// journal constructor is explicit. This alias remains a separate schema/path.
export const createStagingWindowPhaseJournal = createHostedBaselineObservationJournal

function copyCredential (value, maxLength = 4096) {
  if (!Buffer.isBuffer(value) || value.length < 8 || value.length > maxLength || value.includes(0)) unavailable()
  const copy = Buffer.from(value)
  if (!/^[\x21-\x7e]+$/.test(copy.toString('utf8'))) { copy.fill(0); unavailable() }
  return copy
}

function observationHash (value) {
  const serialized = JSON.stringify(value)
  if (serialized.length > 1_048_576) unavailable()
  return sha256(serialized)
}

function canonicalReasons (value) {
  const p = value.provider; const s = value.brokerSecrets; const surface = value.surface; const reasons = []
  if (p.name !== 'TLL staging subject broker') reasons.push('provider_name_drift')
  if (p.enabled) reasons.push('provider_enabled')
  if (p.pkce !== true) reasons.push('provider_pkce_disabled')
  if (p.clientId !== STAGING_BROKER_PROVIDER.clientId) reasons.push('provider_client_id_drift')
  if (JSON.stringify(p.acceptableClientIds) !== '[]') reasons.push('provider_acceptable_client_ids_drift')
  if (JSON.stringify(p.scopes) !== JSON.stringify(STAGING_BROKER_PROVIDER.scopes)) reasons.push('provider_scopes_drift')
  if (p.emailOptional !== true) reasons.push('provider_email_policy_drift')
  if (p.attributeMappingPresent) reasons.push('provider_attribute_mapping_drift')
  if (p.authorizationParamsPresent) reasons.push('provider_authorization_params_drift')
  if (p.skipNonceCheck) reasons.push('provider_skip_nonce_check_enabled')
  if (!p.authorizationEndpointMatches) reasons.push('provider_authorization_endpoint_drift')
  if (!p.tokenEndpointMatches) reasons.push('provider_token_endpoint_drift')
  if (!p.userinfoEndpointMatches) reasons.push('provider_userinfo_endpoint_drift')
  if (p.jwksConfigured) reasons.push('provider_jwks_configured')
  if (p.issuerConfigured) reasons.push('provider_issuer_configured')
  if (s.supabasePresent) reasons.push('broker_secret_present_supabase')
  if (s.vercelPresent) reasons.push('broker_secret_present_vercel')
  if (Object.values(surface).some(Boolean)) reasons.push('surface_enabled')
  if (value.vercel.applicationManifestSha256 === null) reasons.push('application_manifest_evidence_absent')
  return reasons
}

function safePlain (value, depth = 0) {
  if (depth > 12 || value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value !== undefined && (typeof value !== 'number' || Number.isFinite(value))
  if (Array.isArray(value)) return value.length <= 4096 && value.every(item => safePlain(item, depth + 1))
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Object.hasOwn(value, 'toJSON')) return false
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(descriptor => 'value' in descriptor && safePlain(descriptor.value, depth + 1))
}

/** Validate only the immutable core receipt and return no provider payload. */
export function projectHostedBaselineObservation (value) {
  const keys = ['schema', 'target', 'status', 'reasonCodes', 'database', 'provider', 'brokerSecrets', 'surface', 'vercel', 'observationHash']
  if (!exact(value, keys) || !safePlain(value) || value.schema !== 'tll-staging-account-hosted-baseline/v1'
    || value.target !== HOSTED_BASELINE_SESSION_TARGET || value.target === HOSTED_BASELINE_SESSION_PRODUCTION_EXCLUDED
    || !['PASS', 'HOLD'].includes(value.status) || !Array.isArray(value.reasonCodes) || value.reasonCodes.length > 19
    || value.reasonCodes.some(code => !HOLD_REASONS.has(code)) || new Set(value.reasonCodes).size !== value.reasonCodes.length
    || !/^[a-f0-9]{64}$/.test(value.observationHash)) unavailable()
  if ((value.status === 'PASS') !== (value.reasonCodes.length === 0)) unavailable()
  if (!exact(value.database, ['migrations', 'controlsEnabled', 'runtimeRoles', 'runtimeSessions', 'executionEdges', 'operatorEdges', 'receiptHash'])
    || ![value.database.migrations, value.database.controlsEnabled, value.database.runtimeRoles, value.database.runtimeSessions, value.database.executionEdges, value.database.operatorEdges].every(Number.isSafeInteger)
    || value.database.migrations !== 15 || value.database.controlsEnabled !== 0 || value.database.runtimeRoles !== 5 || value.database.runtimeSessions !== 0 || value.database.executionEdges !== 0 || value.database.operatorEdges !== 5 || !/^[a-f0-9]{64}$/.test(value.database.receiptHash)) unavailable()
  if (!exact(value.brokerSecrets, ['supabasePresent', 'vercelPresent']) || typeof value.brokerSecrets.supabasePresent !== 'boolean' || typeof value.brokerSecrets.vercelPresent !== 'boolean'
    || !exact(value.surface, ['edge', 'privateCustomer', 'privateCart', 'publicCustomer', 'publicCart']) || Object.values(value.surface).some(item => typeof item !== 'boolean')
    || !exact(value.provider, ['name', 'enabled', 'pkce', 'emailOptional', 'clientId', 'acceptableClientIds', 'scopes', 'attributeMappingPresent', 'authorizationParamsPresent', 'skipNonceCheck', 'authorizationEndpointMatches', 'tokenEndpointMatches', 'userinfoEndpointMatches', 'jwksConfigured', 'issuerConfigured'])
    || !cleanProviderString(value.provider.name, 128) || !cleanProviderString(value.provider.clientId, 256) || !Array.isArray(value.provider.acceptableClientIds) || !Array.isArray(value.provider.scopes)
    || value.provider.acceptableClientIds.length > 32 || value.provider.scopes.length > 32 || value.provider.acceptableClientIds.some(item => !cleanProviderString(item, 256)) || value.provider.scopes.some(item => !cleanProviderString(item, 256))
    || ['enabled','pkce','emailOptional','attributeMappingPresent','authorizationParamsPresent','skipNonceCheck','authorizationEndpointMatches','tokenEndpointMatches','userinfoEndpointMatches','jwksConfigured','issuerConfigured'].some(key => typeof value.provider[key] !== 'boolean')
    || !exact(value.vercel, ['deploymentId','immutableUrl','gitSourceCommit','applicationManifestSha256','repositoryId','gitProvider']) || typeof value.vercel.deploymentId !== 'string' || value.vercel.deploymentId.length > 256 || !/^dpl_[A-Za-z0-9]+$/.test(value.vercel.deploymentId) || typeof value.vercel.immutableUrl !== 'string' || value.vercel.immutableUrl.length > 256 || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value.vercel.immutableUrl) || typeof value.vercel.gitSourceCommit !== 'string' || value.vercel.gitSourceCommit.length !== 40 || !/^[a-f0-9]{40}$/.test(value.vercel.gitSourceCommit) || !(value.vercel.applicationManifestSha256 === null || typeof value.vercel.applicationManifestSha256 === 'string' && value.vercel.applicationManifestSha256.length === 64 && /^[a-f0-9]{64}$/.test(value.vercel.applicationManifestSha256)) || typeof value.vercel.repositoryId !== 'string' || value.vercel.repositoryId.length > 256 || !/^[1-9][0-9]*$/.test(value.vercel.repositoryId) || value.vercel.gitProvider !== 'github') unavailable()
  const expectedReasons = canonicalReasons(value)
  if (JSON.stringify(value.reasonCodes) !== JSON.stringify(expectedReasons) || (value.status === 'PASS') !== (expectedReasons.length === 0)) unavailable()
  const core = { schema: value.schema, target: value.target, status: value.status, reasonCodes: [...value.reasonCodes], database: value.database,
    provider: value.provider, brokerSecrets: value.brokerSecrets, surface: value.surface, vercel: value.vercel }
  if (observationHash(core) !== value.observationHash) unavailable()
  return Object.freeze({ schema: core.schema, target: core.target, status: core.status, reasonCodes: Object.freeze([...core.reasonCodes]), observationHash: value.observationHash })
}

/** Track both raw fetches and reader/cancel promises until they have settled. */
export function createTrackedHostedBaselineFetch ({ fetch: fetcher } = {}) {
  if (typeof fetcher !== 'function') unavailable()
  const pending = new Set(); let cleanupUncertain = false
  const trackOperation = promise => { const settled = Promise.resolve(promise); pending.add(settled); settled.then(() => pending.delete(settled), () => pending.delete(settled)); return settled }
  const trackCleanup = promise => { const settled = trackOperation(promise); settled.catch(() => { cleanupUncertain = true }); return settled }
  const wrapBody = body => {
    if (!body || typeof body.getReader !== 'function') return body
    return Object.freeze({
      getReader () {
        const raw = body.getReader()
        return Object.freeze({ read: () => trackOperation(raw.read()), cancel: value => trackCleanup(raw.cancel(value)), releaseLock: () => raw.releaseLock() })
      },
      cancel: value => trackCleanup(body.cancel(value)),
    })
  }
  return Object.freeze({
    fetch: async (...args) => {
      const response = await trackOperation(fetcher(...args))
      if (!response || typeof response !== 'object') unavailable()
      // A Proxy preserves Response's branded prototype getters (`status`,
      // `headers`, `url`, `redirected`) while substituting only its stream.
      return new Proxy(response, {
        get (target, property) {
          if (property === 'body') return wrapBody(target.body)
          return Reflect.get(target, property, target)
        },
      })
    },
    async settle () { while (pending.size) await Promise.allSettled([...pending]); if (cleanupUncertain) unavailable() },
  })
}

/** Pure constructor seam: dispose all partial bindings if a later step fails. */
export async function createHostedBaselineCompositionFromFactories ({ factories, supabaseCredential, vercelCredential, protectionBypassCredential, fetch: fetcher } = {}) {
  if (!exact(factories, ['supabase', 'vercel', 'surface', 'composition']) || Object.values(factories).some(factory => typeof factory !== 'function')) unavailable()
  const tracker = createTrackedHostedBaselineFetch({ fetch: fetcher })
  let supabase; let vercel; let surface; let composition
  const dispose = async () => {
    const values = [composition, surface, vercel, supabase]
    const settled = await Promise.allSettled(values.map(value => Promise.resolve().then(() => value?.dispose?.())))
    await tracker.settle()
    if (settled.some(result => result.status !== 'fulfilled')) unavailable()
  }
  try {
    supabase = factories.supabase({ fetch: tracker.fetch, managementToken: supabaseCredential })
    vercel = factories.vercel({ fetch: tracker.fetch, vercelToken: vercelCredential })
    surface = factories.surface({ fetch: tracker.fetch, vercelToken: vercelCredential, protectionBypassToken: protectionBypassCredential })
    composition = factories.composition({ supabase, vercel, surface })
    if (!composition || typeof composition.observe !== 'function') unavailable()
    return Object.freeze({ observe: input => composition.observe(input), dispose })
  } catch {
    try { await dispose() } catch { const error = Error('Staging hosted baseline cleanup uncertain'); error.code = 'CLEANUP_UNCERTAIN'; throw error }
    unavailable()
  }
}

function terminal (intent, state, { now, status, reasonCodes = [], observationHash: hash = null }) {
  return Object.freeze({ ...intent, state, updatedAt: new Date(now()).toISOString(), status, reasonCodes: Object.freeze([...reasonCodes]), observationHash: hash })
}

/**
 * Runs one future-approved observation. Every external primitive is injected:
 * importing this module is inert, and callers cannot change its targets.
 */
export async function runHostedBaselineSession ({
  verifyManifest,
  journal = createHostedBaselineObservationJournal(),
  readCredential,
  createComposition,
  deadlineMs = HOSTED_BASELINE_SESSION_DEADLINE_MS,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (HOSTED_BASELINE_SESSION_TARGET === HOSTED_BASELINE_SESSION_PRODUCTION_EXCLUDED || typeof verifyManifest !== 'function'
    || !journal || typeof journal.read !== 'function' || typeof journal.claim !== 'function' || typeof journal.finish !== 'function' || typeof readCredential !== 'function'
    || typeof createComposition !== 'function' || !Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > HOSTED_BASELINE_SESSION_DEADLINE_MS
    || typeof now !== 'function' || typeof setTimer !== 'function' || typeof clearTimer !== 'function') unavailable()
  // Verification deliberately precedes even the secret-free intent claim.
  await verifyManifest()
  let supabaseRaw; let vercelRaw; let bypassRaw; let supabaseCredential; let vercelCredential; let protectionBypassCredential
  const eraseCredentials = () => { for (const value of [supabaseRaw, vercelRaw, bypassRaw, supabaseCredential, vercelCredential, protectionBypassCredential]) wipe(value) }
  try { if (journal.read()) return Object.freeze({ status: 'JOURNAL_UNAVAILABLE', target: HOSTED_BASELINE_SESSION_TARGET }) }
  catch { return Object.freeze({ status: 'JOURNAL_UNAVAILABLE', target: HOSTED_BASELINE_SESSION_TARGET }) }
  // A missing or malformed credential must not consume the single hosted run.
  try {
    supabaseRaw = await readCredential('supabase')
    supabaseCredential = copyCredential(supabaseRaw)
    vercelRaw = await readCredential('vercel')
    vercelCredential = copyCredential(vercelRaw, 512)
    bypassRaw = await readCredential('vercel-bypass')
    protectionBypassCredential = copyCredential(bypassRaw, 1024)
  } catch {
    eraseCredentials()
    return Object.freeze({ status: 'CREDENTIAL_UNAVAILABLE', target: HOSTED_BASELINE_SESSION_TARGET })
  }
  let intent
  try { intent = journal.claim() } catch { eraseCredentials(); return Object.freeze({ status: 'JOURNAL_UNAVAILABLE', target: HOSTED_BASELINE_SESSION_TARGET }) }
  const controller = new AbortController()
  const timer = setTimer(() => controller.abort(), deadlineMs)
  let composition; let outcome
  try {
    composition = await createComposition(Object.freeze({ supabaseCredential, vercelCredential, protectionBypassCredential, signal: controller.signal }))
    if (!composition || typeof composition.observe !== 'function') unavailable()
    // Do not race the observation against a timer: after aborting, wait for all
    // in-flight operations to settle before writing a terminal receipt.
    const observation = await composition.observe(Object.freeze({ signal: controller.signal }))
    if (controller.signal.aborted) unavailable()
    const projected = projectHostedBaselineObservation(observation)
    outcome = Object.freeze({ state: 'OBSERVATION_RECORDED', status: projected.status, reasonCodes: projected.reasonCodes, observationHash: projected.observationHash, observation: projected })
  } catch (error) {
    if (error?.code === 'CLEANUP_UNCERTAIN') outcome = Object.freeze({ state: 'INTENT_RECORDED', status: null, reasonCodes: Object.freeze([]), observationHash: null })
    else
      outcome = Object.freeze({ state: 'OBSERVATION_FAILED', status: 'FAILED', reasonCodes: Object.freeze([controller.signal.aborted ? 'deadline_or_abort' : 'observation_unavailable']), observationHash: null })
  } finally {
    clearTimer(timer)
    controller.abort()
    let cleanupFailed = false
    try { await composition?.dispose?.() } catch { cleanupFailed = true }
    eraseCredentials()
    if (cleanupFailed) outcome = Object.freeze({ state: 'INTENT_RECORDED', status: null, reasonCodes: Object.freeze([]), observationHash: null })
    if (outcome.state === 'INTENT_RECORDED') return Object.freeze({ status: 'RECONCILIATION_REQUIRED', target: HOSTED_BASELINE_SESSION_TARGET })
    try {
      journal.finish(intent, terminal(intent, outcome.state, { now, status: outcome.status, reasonCodes: outcome.reasonCodes, observationHash: outcome.observationHash }))
    } catch { return Object.freeze({ status: 'JOURNAL_UNAVAILABLE', target: HOSTED_BASELINE_SESSION_TARGET }) }
  }
  if (outcome.state === 'OBSERVATION_RECORDED') return Object.freeze({ status: 'OBSERVATION_RECORDED', target: HOSTED_BASELINE_SESSION_TARGET, observation: outcome.observation })
  return Object.freeze({ status: 'OBSERVATION_FAILED', target: HOSTED_BASELINE_SESSION_TARGET, reasonCodes: outcome.reasonCodes })
}
