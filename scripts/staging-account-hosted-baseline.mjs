/** Closed composition contract for the fresh, read-only staging baseline. */
import { createHash } from 'node:crypto'
import { BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER } from './staging-provider-broker-rotation.mjs'
import { projectOfficialProviderSchema } from './staging-provider-broker-native-adapter.mjs'
import { STAGING_ALIAS, STAGING_BRANCH, STAGING_PROJECT_REF, STAGING_SURFACE_TARGET } from './staging-surface-activation-transport.mjs'
import { VERCEL_PROJECT, VERCEL_PROJECT_ID, VERCEL_SCOPE, VERCEL_TEAM_ID } from './staging-surface-activation-native-binding.mjs'
import { PROJECT_REF, PRODUCTION_PROJECT_REF } from './staging-account-hosted-baseline-database.mjs'

export { PROJECT_REF, PRODUCTION_PROJECT_REF }
export const STAGING_ACCOUNT_HOSTED_BASELINE_ENABLED = false
export const STAGING_ACCOUNT_HOSTED_BASELINE_SCHEMA = 'tll-staging-account-hosted-baseline/v2'

const unavailable = () => { throw new Error('Staging hosted baseline unavailable') }
const VALIDATION_CODES = new Set(['database_validation_unavailable', 'provider_validation_unavailable', 'secret_inventory_validation_unavailable', 'surface_validation_unavailable', 'vercel_validation_unavailable', 'vercel_merge_unavailable'])
const validationUnavailable = code => {
  const error = new Error('Staging hosted baseline unavailable')
  error.code = code
  throw error
}
const validateStage = (code, operation) => {
  try { return operation() } catch { validationUnavailable(code) }
}
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const isSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,256}$/.test(value)
const target = () => STAGING_SURFACE_TARGET
function signal(value) { if (!value || typeof value.aborted !== 'boolean' || typeof value.addEventListener !== 'function' || value.aborted) unavailable() }
function validateNames(value) {
  if (!exact(value, ['supabase', 'vercel']) || !Array.isArray(value.supabase) || !Array.isArray(value.vercel)) unavailable()
  for (const names of [value.supabase, value.vercel]) if (names.length > 256 || names.some(name => typeof name !== 'string' || name.length < 1 || name.length > 256 || /[\x00-\x1f\x7f]/.test(name))) unavailable()
  return Object.freeze({ supabasePresent: value.supabase.includes(BROKER_SECRET_NAME), vercelPresent: value.vercel.includes(BROKER_SECRET_NAME) })
}
function validateSurface(value) {
  if (!exact(value, ['edge', 'flags']) || !exact(value.edge, ['target', 'functionName', 'enabled']) || !same(value.edge.target, target())
    || value.edge.functionName !== 'customer-subject-broker' || typeof value.edge.enabled !== 'boolean'
    || !exact(value.flags, ['target', 'privateCustomer', 'privateCart', 'publicCustomer', 'publicCart']) || !same(value.flags.target, target())) unavailable()
  for (const name of ['privateCustomer', 'privateCart', 'publicCustomer', 'publicCart']) if (typeof value.flags[name] !== 'boolean') unavailable()
  return Object.freeze({ edge: value.edge.enabled, privateCustomer: value.flags.privateCustomer, privateCart: value.flags.privateCart, publicCustomer: value.flags.publicCustomer, publicCart: value.flags.publicCart })
}
function validateVercel(value) {
  const keys = ['projectId', 'project', 'teamId', 'scope', 'branch', 'alias', 'deploymentId', 'immutableUrl', 'gitSourceCommit', 'applicationManifestSha256', 'repositoryId', 'gitProvider']
  if (!exact(value, keys) || value.projectId !== VERCEL_PROJECT_ID || value.project !== VERCEL_PROJECT || value.teamId !== VERCEL_TEAM_ID
    || value.scope !== VERCEL_SCOPE || value.branch !== STAGING_BRANCH || value.alias !== STAGING_ALIAS || !safeId(value.deploymentId)
    || typeof value.immutableUrl !== 'string' || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value.immutableUrl)
    || !isSha(value.gitSourceCommit) || !(value.applicationManifestSha256 === null || /^[a-f0-9]{64}$/.test(value.applicationManifestSha256))
    || !safeId(value.repositoryId) || value.gitProvider !== 'github') unavailable()
  return Object.freeze({ deploymentId: value.deploymentId, immutableUrl: value.immutableUrl, gitSourceCommit: value.gitSourceCommit,
    applicationManifestSha256: value.applicationManifestSha256, repositoryId: value.repositoryId, gitProvider: value.gitProvider })
}
function validateDatabase(value) {
  if (!exact(value, ['status', 'target', 'queryId', 'receiptHash', 'counts']) || value.status !== 'PASS' || value.target !== PROJECT_REF
    || value.queryId !== 'tll-staging-hosted-baseline-database/v2' || !/^[a-f0-9]{64}$/.test(value.receiptHash)
    || !exact(value.counts, ['migrations', 'controlsEnabled', 'runtimeRoles', 'runtimeSessions', 'executionEdges', 'operatorEdges'])
    || !same(value.counts, { migrations: 15, controlsEnabled: 0, runtimeRoles: 5, runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 })) unavailable()
  return Object.freeze({ ...value.counts, receiptHash: value.receiptHash })
}
function providerObservation(raw) {
  const provider = projectOfficialProviderSchema(raw)
  if (provider.identifier !== PROVIDER_IDENTIFIER) unavailable()
  return Object.freeze({ name: provider.name, enabled: provider.enabled, pkce: provider.pkce, emailOptional: provider.emailOptional,
    clientId: provider.clientId, acceptableClientIds: Object.freeze([...provider.acceptableClientIds]), scopes: Object.freeze([...provider.scopes]),
    attributeMappingPresent: provider.attributeMappingPresent, authorizationParamsPresent: provider.authorizationParamsPresent,
    skipNonceCheck: provider.skipNonceCheck,
    authorizationEndpointMatches: provider.authorizationUrl === STAGING_BROKER_PROVIDER.authorizationUrl,
    tokenEndpointMatches: provider.tokenUrl === STAGING_BROKER_PROVIDER.tokenUrl,
    userinfoEndpointMatches: provider.userinfoUrl === STAGING_BROKER_PROVIDER.userinfoUrl,
    jwksMatchesExpected: provider.jwksUrl === STAGING_BROKER_PROVIDER.jwksUrl,
    discoveryDocumentPresent: provider.discoveryDocumentPresent,
    issuerConfigured: provider.issuer !== '' || provider.discoveryUrl !== '' })
}

function addProviderHoldReasons(reasons, value) {
  if (value.name !== 'TLL staging subject broker') reasons.push('provider_name_drift')
  if (value.enabled) reasons.push('provider_enabled')
  if (value.pkce !== true) reasons.push('provider_pkce_disabled')
  if (value.clientId !== STAGING_BROKER_PROVIDER.clientId) reasons.push('provider_client_id_drift')
  if (!same(value.acceptableClientIds, [])) reasons.push('provider_acceptable_client_ids_drift')
  if (!same(value.scopes, STAGING_BROKER_PROVIDER.scopes)) reasons.push('provider_scopes_drift')
  if (value.emailOptional !== true) reasons.push('provider_email_policy_drift')
  if (value.attributeMappingPresent) reasons.push('provider_attribute_mapping_drift')
  if (value.authorizationParamsPresent) reasons.push('provider_authorization_params_drift')
  if (value.skipNonceCheck) reasons.push('provider_skip_nonce_check_enabled')
  if (!value.authorizationEndpointMatches) reasons.push('provider_authorization_endpoint_drift')
  if (!value.tokenEndpointMatches) reasons.push('provider_token_endpoint_drift')
  if (!value.userinfoEndpointMatches) reasons.push('provider_userinfo_endpoint_drift')
  if (!value.jwksMatchesExpected || value.discoveryDocumentPresent) reasons.push('provider_jwks_drift')
  if (value.issuerConfigured) reasons.push('provider_issuer_configured')
}

/**
 * Only five exact read ports are accepted. They receive no target, URL, SQL,
 * provider identifier or secret name from their caller; those are pinned here.
 */
export function createStagingAccountHostedBaseline({ readDatabase, readProvider, readBrokerSecrets, readSurface, readVercel } = {}) {
  if (PROJECT_REF !== STAGING_PROJECT_REF || PROJECT_REF === PRODUCTION_PROJECT_REF
    || [readDatabase, readProvider, readBrokerSecrets, readSurface, readVercel].some(port => typeof port !== 'function')) unavailable()
  const ports = Object.freeze({ readDatabase, readProvider, readBrokerSecrets, readSurface, readVercel })
  return Object.freeze({
    target: PROJECT_REF,
    nativeEnabled: STAGING_ACCOUNT_HOSTED_BASELINE_ENABLED,
    async observe(input = {}) {
      if (!exact(input, ['signal'])) unavailable()
      const { signal: abortSignal } = input
      signal(abortSignal)
      const linked = new AbortController()
      const abortLinked = () => { if (!linked.signal.aborted) linked.abort() }
      abortSignal.addEventListener('abort', abortLinked, { once: true })
      let database, provider, secrets, surface, vercel
      let classifiedReadFailure = null
      try {
        // Database identity is the first dependency; any malformed state stops
        // all later reads. The other safe reads are then collected once.
        const databaseRead = await ports.readDatabase({ signal: linked.signal })
        database = validateStage('database_validation_unavailable', () => validateDatabase(databaseRead))
        signal(linked.signal)
        const reads = [ports.readProvider, ports.readBrokerSecrets, ports.readSurface, ports.readVercel]
          .map(port => Promise.resolve().then(() => port({ signal: linked.signal })).catch(error => {
            if (!classifiedReadFailure && VALIDATION_CODES.has(error?.code)) classifiedReadFailure = error.code
            abortLinked(); throw error
          }))
        const settled = await Promise.allSettled(reads)
        if (classifiedReadFailure) validationUnavailable(classifiedReadFailure)
        if (linked.signal.aborted || settled.some(result => result.status !== 'fulfilled')) unavailable()
        ;[provider, secrets, surface, vercel] = settled.map(result => result.value)
      } catch (error) { if (VALIDATION_CODES.has(error?.code)) validationUnavailable(error.code); unavailable() }
      finally { abortLinked(); abortSignal.removeEventListener('abort', abortLinked) }
      const observedProvider = validateStage('provider_validation_unavailable', () => providerObservation(provider))
      const observedSecrets = validateStage('secret_inventory_validation_unavailable', () => validateNames(secrets))
      const observedSurface = validateStage('surface_validation_unavailable', () => validateSurface(surface))
      const observedVercel = validateStage('vercel_validation_unavailable', () => validateVercel(vercel))
      const reasonCodes = []
      addProviderHoldReasons(reasonCodes, observedProvider)
      if (observedSecrets.supabasePresent) reasonCodes.push('broker_secret_present_supabase')
      if (observedSecrets.vercelPresent) reasonCodes.push('broker_secret_present_vercel')
      if (Object.values(observedSurface).some(Boolean)) reasonCodes.push('surface_enabled')
      if (observedVercel.applicationManifestSha256 === null) reasonCodes.push('application_manifest_evidence_absent')
      const observation = Object.freeze({
        schema: STAGING_ACCOUNT_HOSTED_BASELINE_SCHEMA, target: PROJECT_REF,
        status: reasonCodes.length === 0 ? 'PASS' : 'HOLD', reasonCodes: Object.freeze(reasonCodes),
        database, provider: observedProvider, brokerSecrets: observedSecrets, surface: observedSurface, vercel: observedVercel,
      })
      return Object.freeze({ ...observation, observationHash: createHash('sha256').update(JSON.stringify(observation)).digest('hex') })
    },
  })
}
