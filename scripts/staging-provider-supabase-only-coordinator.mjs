/** Injected-only staging provider disable. No credential discovery or live entry point. */
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { PROVIDER_IDENTIFIER, STAGING_PROVIDER_TARGET } from './staging-provider-broker-rotation.mjs'
import { buildStagingProviderNormalizationPatch, verifyStagingProviderNormalization } from './staging-provider-normalization-contract.mjs'

export const SUPABASE_ONLY_PROVIDER_DISABLE_ENABLED = false
const unavailable = () => { throw new Error('Staging provider disable unavailable') }
const fixed = status => Object.freeze({ status, target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER })
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/** The caller owns bounded transport, a distinct one-use journal and credential wiping. */
export async function disableStagingProviderSupabaseOnly({ port, journal } = {}) {
  if (!port || ['readProvider', 'updateProvider'].some(name => typeof port[name] !== 'function')
    || !journal || ['read', 'recordIntent', 'transition'].some(name => typeof journal[name] !== 'function')) unavailable()
  try { if (journal.read()) return fixed('REPLAY_REJECTED') } catch { return fixed('RECONCILIATION_REQUIRED') }

  let before
  try {
    before = structuredClone(await port.readProvider(STAGING_PROVIDER_TARGET))
    if (!exact(buildStagingProviderNormalizationPatch(before), ['enabled', 'jwks_uri'])) unavailable()
  } catch { return fixed('STOPPED_BEFORE_UPDATE') }

  let intent
  try {
    const digest = createHash('sha256').update(JSON.stringify(before)).digest('hex')
    intent = journal.recordIntent(digest)
  } catch { return fixed('RECONCILIATION_REQUIRED') }

  try {
    const update = await port.updateProvider(STAGING_PROVIDER_TARGET, structuredClone(before))
    if (!exact(update, ['status', 'target', 'providerIdentifier'])
      || update.status !== 'UPDATED_NEEDS_INDEPENDENT_READBACK'
      || update.providerIdentifier !== PROVIDER_IDENTIFIER
      || !isDeepStrictEqual(update.target, STAGING_PROVIDER_TARGET)) unavailable()
    const acknowledged = journal.transition(intent, 'UPDATE_ACKNOWLEDGED')
    const after = await port.readProvider(STAGING_PROVIDER_TARGET)
    verifyStagingProviderNormalization(before, after)
    journal.transition(acknowledged, 'NORMALIZED_VERIFIED')
    return fixed('NORMALIZED_VERIFIED')
  } catch {
    try {
      const current = journal.read()
      if (current?.state === 'INTENT_RECORDED' || current?.state === 'UPDATE_ACKNOWLEDGED') {
        journal.transition(current, 'RECONCILIATION_REQUIRED')
      }
    } catch { /* Preserve the durable record for separate reconciliation. */ }
    return fixed('RECONCILIATION_REQUIRED')
  }
}
