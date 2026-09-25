/** Injected evidence assessment only. No credential, network, file or mutation boundary. */
import { BROKER_CLIENT_ID, BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, RETAINED_STAGING_JWKS_URI,
  STAGING_BROKER_PROVIDER, STAGING_PROJECT_REF, STAGING_PROVIDER_TARGET } from './staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME, projectOfficialProviderSchema } from './staging-provider-broker-native-adapter.mjs'
import { assessBrokerPhase } from './staging-provider-broker-phase-journal.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from './staging-account-hosted-baseline-database.mjs'
import { PREVIEW_READINESS_TARGET } from './staging-provider-preview-readiness-session.mjs'

export const BROKER_RECONCILIATION_ENABLED = false
const fixed = status => Object.freeze({ status, projectRef: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER })
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const equal = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
  && actual.every((value, index) => value === expected[index])
const has = (record, phase) => record.history.some(item => item.phase === phase)

function validRotation(record, state, phase) {
  const intentIndex = phase.history.findIndex(event => event.phase === 'INTENT_RECORDED')
  const intentAt = phase.history[intentIndex]?.at
  const followingAt = phase.history[intentIndex + 1]?.at
  return exact(record, ['schema', 'target', 'providerIdentifier', 'clientId', 'state', 'runId', 'createdAt'])
    && record.schema === 'tll-staging-provider-broker-rotation/v1' && record.target === STAGING_PROJECT_REF
    && record.providerIdentifier === PROVIDER_IDENTIFIER && record.clientId === BROKER_CLIENT_ID
    && record.state === state && record.runId === phase.runId
    && typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt))
    && new Date(Date.parse(record.createdAt)).toISOString() === record.createdAt
    && typeof intentAt === 'string' && typeof followingAt === 'string'
    && Date.parse(record.createdAt) >= Date.parse(intentAt)
    && Date.parse(record.createdAt) <= Date.parse(followingAt)
}

function validDatabase(value) {
  const counts = { migrations: 15, controlsEnabled: 0, runtimeRoles: 5,
    runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 }
  return exact(value, ['status', 'target', 'queryId', 'receiptHash', 'counts'])
    && value.status === 'PASS' && value.target === STAGING_PROJECT_REF
    && value.queryId === STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID
    && typeof value.receiptHash === 'string' && /^[a-f0-9]{64}$/.test(value.receiptHash)
    && exact(value.counts, Object.keys(counts))
    && Object.entries(counts).every(([key, expected]) => value.counts[key] === expected)
}

function validPreview(value) {
  return exact(value, ['deploymentId', 'immutableUrl', 'projectRef', 'branch',
    'privateCustomer', 'privateCart', 'publicCustomer', 'publicCart'])
    && value.deploymentId === PREVIEW_READINESS_TARGET.deploymentId
    && value.immutableUrl === PREVIEW_READINESS_TARGET.immutableUrl
    && value.projectRef === STAGING_PROJECT_REF && value.branch === PREVIEW_READINESS_TARGET.branch
    && [value.privateCustomer, value.privateCart, value.publicCustomer, value.publicCart].every(flag => flag === false)
}

function validNames(value, expected) {
  return exact(value, ['target', 'supabase', 'vercel'])
    && exact(value.target, Object.keys(STAGING_PROVIDER_TARGET))
    && Object.entries(STAGING_PROVIDER_TARGET).every(([key, required]) => value.target[key] === required)
    && equal(value.supabase, expected) && equal(value.vercel, expected)
}

function validProvider(value, rotated) {
  const p = projectOfficialProviderSchema(value)
  return p.identifier === PROVIDER_IDENTIFIER
    && (rotated ? p.name === STAGING_PROVIDER_NAME : [STAGING_PROVIDER_NAME, BROKER_CLIENT_ID].includes(p.name))
    && p.clientId === BROKER_CLIENT_ID && equal(p.acceptableClientIds, [])
    && (rotated ? equal(p.scopes, STAGING_BROKER_PROVIDER.scopes)
      : equal(p.scopes, []) || equal(p.scopes, STAGING_BROKER_PROVIDER.scopes))
    && p.pkce === true && p.enabled === false && p.emailOptional === true
    && !p.attributeMappingPresent && !p.authorizationParamsPresent && p.issuer === '' && p.discoveryUrl === ''
    && p.skipNonceCheck === false && !p.discoveryDocumentPresent
    && p.authorizationUrl === STAGING_BROKER_PROVIDER.authorizationUrl
    && p.tokenUrl === STAGING_BROKER_PROVIDER.tokenUrl
    && p.userinfoUrl === STAGING_BROKER_PROVIDER.userinfoUrl
    && p.jwksUrl === RETAINED_STAGING_JWKS_URI
}

/**
 * Classify already-collected read-only observations. An active or stale phase
 * is returned before inspecting evidence, so a caller must stop the old run
 * before gathering hosted observations in a separate process.
 */
export function assessBrokerRecoveryReceipts({ phase, rotation, nowMs = Date.now() } = {}) {
  let progress
  try { progress = assessBrokerPhase(phase, nowMs) } catch { return fixed('PHASE_RECORD_UNAVAILABLE') }
  if (progress.status === 'ACTIVE_WITHIN_PHASE_BOUND') return fixed('ACTIVE_WINDOW_HOLD')
  if (progress.status === 'STALE_REQUIRES_RECONCILIATION') return fixed('STALE_WINDOW_STOP_REQUIRED')
  if (phase.outcome === 'RECONCILIATION_REQUIRED') return fixed('RECONCILIATION_REQUIRED')

  const dispatched = has(phase, 'PROVIDER_UPDATE_DISPATCH')
  const expectedRotation = phase.outcome === 'VERIFIED' ? 'ROTATION_VERIFIED' : 'STOPPED_BEFORE_PROVIDER_UPDATE'
  if (phase.outcome === 'VERIFIED' && !validRotation(rotation, expectedRotation, phase)
    || phase.outcome === 'STOPPED_BEFORE_UPDATE' && (dispatched || has(phase, 'INTENT_RECORDED')
      ? !validRotation(rotation, expectedRotation, phase) : rotation !== null)) return fixed('RECONCILIATION_REQUIRED')

  return fixed('READY_FOR_OBSERVATION')
}

export function assessBrokerRecovery({ phase, rotation, evidence, nowMs = Date.now() } = {}) {
  const receipts = assessBrokerRecoveryReceipts({ phase, rotation, nowMs })
  if (receipts.status !== 'READY_FOR_OBSERVATION') return receipts

  try {
    if (!exact(evidence, ['provider', 'names', 'database', 'preview'])
      || !validDatabase(evidence.database) || !validPreview(evidence.preview)) return fixed('RECONCILIATION_REQUIRED')
    if (phase.outcome === 'STOPPED_BEFORE_UPDATE') {
      return validProvider(evidence.provider, false) && validNames(evidence.names, [])
        ? fixed('SAFE_HELD_CONFIGURATION_OBSERVED') : fixed('RECONCILIATION_REQUIRED')
    }
    return validProvider(evidence.provider, true) && validNames(evidence.names, [BROKER_SECRET_NAME])
      ? fixed('CONFIGURATION_CONSISTENT_SECRET_UNPROVEN') : fixed('RECONCILIATION_REQUIRED')
  } catch { return fixed('RECONCILIATION_REQUIRED') }
}
