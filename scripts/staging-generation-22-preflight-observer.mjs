/** Injected-only Vercel read for the Gen22 pre-installation state. */
import { assessStagingGeneration22PreflightVercel } from './staging-generation-22-preflight-assessment.mjs'

export const STAGING_GENERATION_22_PREFLIGHT_OBSERVER_ENABLED = false
export const STAGING_GENERATION_22_PREFLIGHT_DEADLINE_MS = 58_000
const TARGET = 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4'
const unavailable = () => { throw Error('Generation 22 preflight observer unavailable') }
const fixed = status => Object.freeze({ status, projectId: TARGET })

export async function runStagingGeneration22PreflightVercelObservation({ readCredential, openVercel, journal,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (typeof readCredential !== 'function' || typeof openVercel !== 'function'
    || !journal || ['read', 'claim', 'finish'].some(name => typeof journal[name] !== 'function')
    || typeof now !== 'function' || typeof setTimer !== 'function' || typeof clearTimer !== 'function') unavailable()
  try { if (journal.read()) return fixed('REPLAY_REJECTED') }
  catch { return fixed('READ_UNAVAILABLE') }
  let claim
  try { claim = journal.claim() } catch { return fixed('READ_UNAVAILABLE') }
  const controller = new AbortController(), deadline = now() + STAGING_GENERATION_22_PREFLIGHT_DEADLINE_MS
  let timer, credential, reader, result, outcome = 'READ_UNAVAILABLE'
  try {
    if (!Number.isFinite(deadline)) unavailable()
    const expired = new Promise((_, reject) => {
      timer = setTimer(() => { controller.abort(); reject(Error('Generation 22 preflight observer expired')) },
        STAGING_GENERATION_22_PREFLIGHT_DEADLINE_MS)
    })
    const operation = (async () => {
      const pending = Promise.resolve().then(() => readCredential({ signal: controller.signal }))
      pending.then(value => { if (controller.signal.aborted) value?.fill?.(0) }, () => {})
      credential = await pending
      if (controller.signal.aborted) { credential?.fill?.(0); credential = undefined; unavailable() }
      if (!Buffer.isBuffer(credential) || credential.length < 8 || credential.length > 1024
        || credential.includes(0)) unavailable()
      reader = openVercel(credential)
      if (!reader || typeof reader.readProject !== 'function'
        || typeof reader.readEffectivePreviewEnvironmentInventory !== 'function'
        || typeof reader.dispose !== 'function') unavailable()
      credential.fill(0); credential = undefined
      const project = await reader.readProject({ signal: controller.signal })
      if (controller.signal.aborted) unavailable()
      const inventory = await reader.readEffectivePreviewEnvironmentInventory({ signal: controller.signal })
      if (controller.signal.aborted) unavailable()
      return assessStagingGeneration22PreflightVercel({ project, inventory })
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
