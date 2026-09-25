/** Injected-only, read-only reconciliation after the consumed provider update. */
import { BROKER_CLIENT_ID, BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER,
  STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME, projectOfficialProviderSchema } from './staging-provider-broker-native-adapter.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from './staging-account-hosted-baseline-database.mjs'

export const PROVIDER_SAFE_HELD_RECONCILIATION_ENABLED = false
export const RETAINED_STAGING_JWKS_URI = `${STAGING_BROKER_PROVIDER.authorizationUrl}/.well-known/jwks.json`
const unavailable = () => { throw new Error('Staging provider read-only reconciliation unavailable') }
const fixed = status => Object.freeze({ status, projectRef: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER })
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const equalArray = (value, expected) => Array.isArray(value) && value.length === expected.length
  && value.every((item, index) => item === expected[index])

function assessProvider(value) {
  const p = projectOfficialProviderSchema(value)
  if (p.identifier !== PROVIDER_IDENTIFIER || ![STAGING_PROVIDER_NAME, BROKER_CLIENT_ID].includes(p.name)
    || p.clientId !== BROKER_CLIENT_ID || !equalArray(p.acceptableClientIds, [])
    || !(equalArray(p.scopes, []) || equalArray(p.scopes, STAGING_BROKER_PROVIDER.scopes))
    || p.pkce !== true || p.enabled !== false || p.emailOptional !== true
    || p.attributeMappingPresent || p.authorizationParamsPresent || p.issuer !== '' || p.discoveryUrl !== ''
    || p.skipNonceCheck || p.discoveryDocumentPresent
    || p.authorizationUrl !== STAGING_BROKER_PROVIDER.authorizationUrl
    || p.tokenUrl !== STAGING_BROKER_PROVIDER.tokenUrl || p.userinfoUrl !== STAGING_BROKER_PROVIDER.userinfoUrl
    || p.jwksUrl !== RETAINED_STAGING_JWKS_URI) unavailable()
}

function assessDatabase(value) {
  const counts = { migrations: 15, controlsEnabled: 0, runtimeRoles: 5,
    runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 }
  if (!exact(value, ['status', 'target', 'queryId', 'receiptHash', 'counts']) || value.status !== 'PASS'
    || value.target !== STAGING_PROJECT_REF || value.queryId !== STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID
    || typeof value.receiptHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.receiptHash)
    || !exact(value.counts, Object.keys(counts))
    || Object.entries(counts).some(([key, count]) => value.counts[key] !== count)) unavailable()
}

/** Journal starts before credentials; a failed or uncertain read is not replayed. */
export async function reconcileSafeHeldProviderOnce({ readCredential, openSupabase, journal,
  execute } = {}) {
  if ([readCredential, openSupabase, execute].some(value => typeof value !== 'function')
    || !journal || ['read', 'start', 'record', 'finish'].some(name => typeof journal[name] !== 'function')) unavailable()
  try { if (journal.read()) return fixed('REPLAY_REJECTED') }
  catch { return fixed('RECONCILIATION_REQUIRED') }
  let phase
  try { phase = journal.start() } catch { return fixed('RECONCILIATION_REQUIRED') }
  let credential, binding, outcome = 'READ_UNAVAILABLE'
  try {
    credential = await readCredential()
    if (!Buffer.isBuffer(credential) || credential.length < 8 || credential.length > 4_096 || credential.includes(0)) unavailable()
    binding = openSupabase(credential)
    if (!binding || binding.target !== STAGING_PROJECT_REF || typeof binding.dispose !== 'function'
      || ['readDatabase', 'readEdgeSecretNames', 'readProvider'].some(name => typeof binding[name] !== 'function')) unavailable()
    phase = journal.record(phase, 'PREFLIGHT')
    // Both preflight reads share one 30-second executor budget inside PREFLIGHT's 45 seconds.
    const preflight = await execute(async signal => {
      const database = await binding.readDatabase({ signal })
      assessDatabase(database)
      return binding.readEdgeSecretNames({ signal })
    })
    const names = preflight?.value
    if (preflight?.status !== 'COMPLETED' || !Array.isArray(names) || names.length > 4_096
      || names.some(name => typeof name !== 'string' || !/^[A-Z][A-Z0-9_]{0,255}$/.test(name))
      || new Set(names).size !== names.length || names.includes(BROKER_SECRET_NAME)) unavailable()
    phase = journal.record(phase, 'PROVIDER_PREREAD')
    const provider = await execute(signal => binding.readProvider({ signal }))
    if (provider?.status !== 'COMPLETED') unavailable()
    assessProvider(provider.value)
    outcome = 'SAFE_HELD_PROVIDER_OBSERVED'
  } catch { outcome = 'READ_UNAVAILABLE' }
  finally {
    try { binding?.dispose() } catch { outcome = 'READ_UNAVAILABLE' }
    credential?.fill?.(0)
  }
  try { journal.finish(phase, outcome === 'SAFE_HELD_PROVIDER_OBSERVED' ? 'STOPPED_BEFORE_UPDATE' : 'RECONCILIATION_REQUIRED') }
  catch { return fixed('RECONCILIATION_REQUIRED') }
  return fixed(outcome)
}
