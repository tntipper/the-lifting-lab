/** Injected-only, one-use Supabase preflight. No credential source or transport. */
import { BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from './staging-account-hosted-baseline-database.mjs'
import { buildStagingProviderNormalizationPatch } from './staging-provider-normalization-contract.mjs'
import { assessProviderNormalizationPhase } from './staging-provider-normalization-phase-journal.mjs'

export const STAGING_PROVIDER_READONLY_PROBE_ENABLED = false
const unavailable = () => { throw new Error('Staging provider read-only probe unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const fixed = status => Object.freeze({ status, target: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER })

function verifyDatabase(value) {
  if (!exact(value, ['status', 'target', 'queryId', 'receiptHash', 'counts']) || value.status !== 'PASS'
    || value.target !== STAGING_PROJECT_REF || value.queryId !== STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID
    || typeof value.receiptHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.receiptHash)
    || !exact(value.counts, ['migrations', 'controlsEnabled', 'runtimeRoles', 'runtimeSessions', 'executionEdges', 'operatorEdges'])
    || value.counts.migrations !== 15 || value.counts.controlsEnabled !== 0 || value.counts.runtimeRoles !== 5
    || value.counts.runtimeSessions !== 0 || value.counts.executionEdges !== 0 || value.counts.operatorEdges !== 5) unavailable()
}

/** The distinct journal path is supplied by the disabled live launcher. */
export async function runStagingProviderReadOnlyProbe({ readCredential, openSupabase, journal,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if ([readCredential, openSupabase, now, setTimer, clearTimer].some(value => typeof value !== 'function')
    || !journal || ['read', 'start', 'record', 'finish'].some(name => typeof journal[name] !== 'function')) unavailable()
  try { if (journal.read()) return fixed('REPLAY_REJECTED') }
  catch { return fixed('READONLY_UNAVAILABLE') }
  let phase
  try { phase = journal.start() } catch { return fixed('READONLY_UNAVAILABLE') }
  const controller = new AbortController()
  let credential, binding, outcome = 'READONLY_UNAVAILABLE', receiptHash, cleanupFailed = false
  const bounded = async (operation, cleanupLate = () => {}) => {
    const current = assessProviderNormalizationPhase(phase, now())
    if (current.status !== 'ACTIVE_WITHIN_PHASE_BOUND' || controller.signal.aborted) unavailable()
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimer(() => { controller.abort(); reject(new Error('Staging provider read-only probe unavailable')) },
        Math.max(0, current.deadlineMs - current.elapsedMs))
    })
    const pending = Promise.resolve().then(operation)
    pending.then(value => { if (controller.signal.aborted) cleanupLate(value) }, () => {}).catch(() => {})
    try {
      const value = await Promise.race([pending, timeout])
      if (controller.signal.aborted) { cleanupLate(value); unavailable() }
      return value
    } finally { if (timer !== undefined) clearTimer(timer) }
  }
  try {
    credential = await bounded(() => readCredential({ signal: controller.signal }), value => value?.fill?.(0))
    if (!Buffer.isBuffer(credential) || credential.length < 8 || credential.length > 4_096 || credential.includes(0)) unavailable()
    binding = openSupabase(credential)
    if (!binding || binding.target !== STAGING_PROJECT_REF || typeof binding.dispose !== 'function'
      || ['readDatabase', 'readEdgeSecretNames', 'readProvider'].some(name => typeof binding[name] !== 'function')) unavailable()
    phase = journal.record(phase, 'PREFLIGHT')
    const database = await bounded(() => binding.readDatabase({ signal: controller.signal }))
    verifyDatabase(database)
    const names = await bounded(() => binding.readEdgeSecretNames({ signal: controller.signal }))
    if (!Array.isArray(names) || names.length > 4_096 || names.some(name => typeof name !== 'string' || !/^[A-Z][A-Z0-9_]{0,255}$/.test(name))
      || new Set(names).size !== names.length || names.includes(BROKER_SECRET_NAME)) unavailable()
    phase = journal.record(phase, 'PROVIDER_PREREAD')
    const provider = await bounded(() => binding.readProvider({ signal: controller.signal }))
    const patch = buildStagingProviderNormalizationPatch(provider)
    if (!exact(patch, ['enabled', 'jwks_uri']) || patch.enabled !== false || patch.jwks_uri !== '') unavailable()
    receiptHash = database.receiptHash
    outcome = 'READONLY_PROVIDER_PRECONDITION_VERIFIED'
  } catch { outcome = 'READONLY_UNAVAILABLE' } finally {
    controller.abort()
    try { binding?.dispose() } catch { cleanupFailed = true }
    credential?.fill?.(0)
  }
  if (cleanupFailed) outcome = 'READONLY_UNAVAILABLE'
  try { journal.finish(phase, outcome === 'READONLY_PROVIDER_PRECONDITION_VERIFIED' ? 'STOPPED_BEFORE_UPDATE' : 'RECONCILIATION_REQUIRED') }
  catch { outcome = 'READONLY_UNAVAILABLE' }
  return outcome === 'READONLY_PROVIDER_PRECONDITION_VERIFIED'
    ? Object.freeze({ ...fixed(outcome), databaseReceiptHash: receiptHash }) : fixed(outcome)
}
