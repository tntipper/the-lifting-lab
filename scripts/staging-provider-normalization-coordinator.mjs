/** Injected-only one-shot orchestration; no launcher, credentials or network. */
import { createHash } from 'node:crypto'
import { STAGING_PROVIDER_TARGET, PROVIDER_IDENTIFIER } from './staging-provider-broker-rotation.mjs'
import { buildStagingProviderNormalizationPatch, verifyStagingProviderNormalization } from './staging-provider-normalization-contract.mjs'

export const STAGING_PROVIDER_NORMALIZATION_COORDINATOR_ENABLED = false
const unavailable = () => { throw new Error('Staging provider normalization coordinator unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const controls = ['customer', 'cart', 'broker', 'provisional', 'bridge']

function validateTarget(value) {
  if (!exact(value, Object.keys(STAGING_PROVIDER_TARGET))) unavailable()
  for (const [key, expected] of Object.entries(STAGING_PROVIDER_TARGET)) if (value[key] !== expected) unavailable()
}

function validatePreflight(value, nowMs) {
  if (!exact(value, ['target', 'observedAt', 'controls', 'runtimeSessions', 'edgeEnabled', 'privateEnabled', 'publicEnabled',
    'supabaseBrokerSecretNames', 'vercelBrokerSecretNames'])) unavailable()
  validateTarget(value.target)
  if (!exact(value.controls, controls) || controls.some(key => value.controls[key] !== false)
    || value.runtimeSessions !== 0 || value.edgeEnabled !== false || value.privateEnabled !== false || value.publicEnabled !== false
    || !Array.isArray(value.supabaseBrokerSecretNames) || value.supabaseBrokerSecretNames.length !== 0
    || !Array.isArray(value.vercelBrokerSecretNames) || value.vercelBrokerSecretNames.length !== 0
    || typeof value.observedAt !== 'string') unavailable()
  const observed = Date.parse(value.observedAt)
  if (!Number.isFinite(observed) || new Date(observed).toISOString() !== value.observedAt
    || !Number.isFinite(nowMs) || nowMs - observed < 0 || nowMs - observed > 30_000) unavailable()
  return value
}

function fixed(status) {
  return Object.freeze({ status, target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER })
}

/** One call maximum per fresh durable journal; any post-intent uncertainty holds. */
export async function normalizeStagingProviderOnce({ ports, journal, now = Date.now } = {}) {
  if (!ports || ['preflight', 'readProvider', 'updateProvider'].some(key => typeof ports[key] !== 'function')
    || !journal || ['read', 'recordIntent', 'transition'].some(key => typeof journal[key] !== 'function')
    || typeof now !== 'function') unavailable()
  try { if (journal.read()) return fixed('REPLAY_REJECTED') } catch { return fixed('RECONCILIATION_REQUIRED') }

  let baseline, before
  try {
    baseline = validatePreflight(structuredClone(await ports.preflight(STAGING_PROVIDER_TARGET)), now())
    before = structuredClone(await ports.readProvider(STAGING_PROVIDER_TARGET))
    buildStagingProviderNormalizationPatch(before)
    validatePreflight(baseline, now())
  } catch { return fixed('STOPPED_BEFORE_UPDATE') }

  const preflightSha256 = createHash('sha256').update(JSON.stringify({ baseline, provider: before })).digest('hex')
  let intent
  try { validatePreflight(baseline, now()) } catch { return fixed('STOPPED_BEFORE_UPDATE') }
  try { intent = journal.recordIntent(preflightSha256) } catch { return fixed('RECONCILIATION_REQUIRED') }
  try {
    validatePreflight(baseline, now())
    const update = await ports.updateProvider(STAGING_PROVIDER_TARGET, structuredClone(before))
    if (!exact(update, ['status', 'target', 'providerIdentifier']) || update.status !== 'UPDATED_NEEDS_INDEPENDENT_READBACK'
      || update.providerIdentifier !== PROVIDER_IDENTIFIER) unavailable()
    validateTarget(update.target)
    const acknowledged = journal.transition(intent, 'UPDATE_ACKNOWLEDGED')
    const after = await ports.readProvider(STAGING_PROVIDER_TARGET)
    verifyStagingProviderNormalization(before, after)
    const postflight = validatePreflight(structuredClone(await ports.preflight(STAGING_PROVIDER_TARGET)), now())
    if (Date.parse(postflight.observedAt) <= Date.parse(baseline.observedAt)
      || Date.parse(postflight.observedAt) < Date.parse(intent.createdAt)) unavailable()
    journal.transition(acknowledged, 'NORMALIZED_VERIFIED')
    return fixed('NORMALIZED_VERIFIED')
  } catch {
    try {
      const current = journal.read()
      if (current?.state === 'INTENT_RECORDED' || current?.state === 'UPDATE_ACKNOWLEDGED') journal.transition(current, 'RECONCILIATION_REQUIRED')
    } catch { /* Preserve the durable record, even if a transition is uncertain. */ }
    return fixed('RECONCILIATION_REQUIRED')
  }
}
