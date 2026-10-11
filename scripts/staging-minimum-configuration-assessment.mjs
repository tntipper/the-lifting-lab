/** Pure assessment of the post-rotation Supabase staging state. No live port. */
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from './staging-account-hosted-baseline-database.mjs'
import { BROKER_SECRET_NAME, STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'
import { projectOfficialStagingProvider } from './staging-provider-broker-native-adapter.mjs'

export const STAGING_MINIMUM_CONFIGURATION_ASSESSMENT_ENABLED = false
export const REQUIRED_EDGE_NAMES = Object.freeze([
  BROKER_SECRET_NAME,
  'TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED',
  'TLL_STAGING_POSTGRES_CA_PEM',
  'TLL_STAGING_POSTGRES_CA_SHA256',
])
export const MISSING_EDGE_NAME = 'TLL_STAGING_BROKER_DATABASE_PASSWORD'
const safeName = /^[A-Z][A-Z0-9_]{0,255}$/
const unavailable = () => { throw new Error('Staging minimum configuration assessment unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

export function assessStagingMinimumSupabase({ database, edgeNames, provider } = {}) {
  if (!exact(database, ['status', 'target', 'queryId', 'receiptHash', 'counts'])
    || database.status !== 'PASS' || database.target !== STAGING_PROJECT_REF
    || database.queryId !== STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID
    || typeof database.receiptHash !== 'string' || !/^[a-f0-9]{64}$/.test(database.receiptHash)
    || !exact(database.counts, ['migrations', 'controlsEnabled', 'runtimeRoles', 'runtimeSessions', 'executionEdges', 'operatorEdges'])
    || database.counts.migrations !== 15 || database.counts.controlsEnabled !== 0
    || database.counts.runtimeRoles !== 5 || database.counts.runtimeSessions !== 0
    || database.counts.executionEdges !== 0 || database.counts.operatorEdges !== 5
    || !Array.isArray(edgeNames) || edgeNames.length > 4096
    || edgeNames.some(name => typeof name !== 'string' || !safeName.test(name))
    || new Set(edgeNames).size !== edgeNames.length) unavailable()

  // The official provider projection rejects unknown fields, changed URLs,
  // enabled state, and a changed retained JWKS address.
  try { projectOfficialStagingProvider(provider) } catch { unavailable() }
  const names = new Set(edgeNames)
  const absent = REQUIRED_EDGE_NAMES.filter(name => !names.has(name))
  if (names.has(MISSING_EDGE_NAME) || absent.length) return Object.freeze({
    status: 'HOLD', projectRef: STAGING_PROJECT_REF,
    missingEdgeNames: Object.freeze(absent), brokerDatabasePasswordAlreadyPresent: names.has(MISSING_EDGE_NAME),
  })
  return Object.freeze({
    status: 'DISABLED_BASELINE_OBSERVED', projectRef: STAGING_PROJECT_REF,
    missingEdgeNames: Object.freeze([]), brokerDatabasePasswordAlreadyPresent: false,
  })
}
