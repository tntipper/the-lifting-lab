/** Injected-only, one-use observation of fixed Supabase staging state. */
import { STAGING_PROJECT_REF } from './staging-provider-broker-rotation.mjs'
import { assessStagingMinimumSupabase } from './staging-minimum-configuration-assessment.mjs'

export const STAGING_MINIMUM_CONFIGURATION_OBSERVER_ENABLED = false
export const STAGING_MINIMUM_CONFIGURATION_DEADLINE_MS = 58_000
const unavailable = () => { throw new Error('Staging minimum configuration observer unavailable') }
const fixed = status => Object.freeze({ status, projectRef: STAGING_PROJECT_REF })

export async function runStagingMinimumConfigurationObservation({ readCredential, openSupabase, journal,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (typeof readCredential !== 'function' || typeof openSupabase !== 'function'
    || !journal || ['read', 'claim', 'finish'].some(name => typeof journal[name] !== 'function')
    || typeof now !== 'function' || typeof setTimer !== 'function' || typeof clearTimer !== 'function') unavailable()
  try { if (journal.read()) return fixed('REPLAY_REJECTED') }
  catch { return fixed('READ_UNAVAILABLE') }
  let claim
  try { claim = journal.claim() } catch { return fixed('READ_UNAVAILABLE') }
  const controller = new AbortController(), deadline = now() + STAGING_MINIMUM_CONFIGURATION_DEADLINE_MS
  let timer, credential, reader, result, outcome = 'READ_UNAVAILABLE'
  try {
    if (!Number.isFinite(deadline)) unavailable()
    const expired = new Promise((_, reject) => {
      timer = setTimer(() => { controller.abort(); reject(new Error('Staging minimum configuration observer unavailable')) },
        STAGING_MINIMUM_CONFIGURATION_DEADLINE_MS)
    })
    const operation = (async () => {
      const pending = Promise.resolve().then(() => readCredential({ signal: controller.signal }))
      pending.then(value => { if (controller.signal.aborted) value?.fill?.(0) }, () => {})
      credential = await pending
      if (controller.signal.aborted) { credential?.fill?.(0); credential = undefined; unavailable() }
      if (!Buffer.isBuffer(credential) || credential.length < 8 || credential.length > 4_096 || credential.includes(0)) unavailable()
      reader = openSupabase(credential)
      if (!reader || reader.target !== STAGING_PROJECT_REF
        || ['readDatabase', 'readEdgeSecretNames', 'readProvider', 'dispose'].some(name => typeof reader[name] !== 'function')) unavailable()
      credential.fill(0); credential = undefined
      const database = await reader.readDatabase({ signal: controller.signal })
      if (controller.signal.aborted) unavailable()
      const edgeNames = await reader.readEdgeSecretNames({ signal: controller.signal })
      if (controller.signal.aborted) unavailable()
      const provider = await reader.readProvider({ signal: controller.signal })
      if (controller.signal.aborted) unavailable()
      return assessStagingMinimumSupabase({ database, edgeNames, provider })
    })()
    result = await Promise.race([operation, expired])
    if (controller.signal.aborted || now() >= deadline) unavailable()
    outcome = result.status
  } catch { outcome = 'READ_UNAVAILABLE' } finally {
    controller.abort(); if (timer !== undefined) clearTimer(timer)
    try { reader?.dispose() } catch { outcome = 'READ_UNAVAILABLE' }
    credential?.fill?.(0)
  }
  try { journal.finish(claim, outcome, outcome === 'READ_UNAVAILABLE' ? null : result) }
  catch { return fixed('READ_UNAVAILABLE') }
  return outcome === 'READ_UNAVAILABLE' ? fixed(outcome) : Object.freeze({ ...fixed(outcome), assessment: result })
}
