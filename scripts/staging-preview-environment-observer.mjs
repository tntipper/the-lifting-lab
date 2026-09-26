/** Injected-only, one-use Vercel Preview name/classification observation. */
import { assessStagingPreviewEnvironment } from './staging-preview-environment-assessment.mjs'

export const STAGING_PREVIEW_ENVIRONMENT_OBSERVER_ENABLED = false
export const STAGING_PREVIEW_ENVIRONMENT_DEADLINE_MS = 45_000
const unavailable = () => { throw new Error('Staging Preview environment observer unavailable') }
const fixed = status => Object.freeze({ status, projectId: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4' })

export async function runStagingPreviewEnvironmentObservation({ readCredential, openVercel, journal,
  requiredSecrets, requiredConfiguration, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (typeof readCredential !== 'function' || typeof openVercel !== 'function'
    || !journal || ['read', 'claim', 'finish'].some(name => typeof journal[name] !== 'function')
    || typeof now !== 'function' || typeof setTimer !== 'function' || typeof clearTimer !== 'function') unavailable()
  try { if (journal.read()) return fixed('REPLAY_REJECTED') }
  catch { return fixed('READ_UNAVAILABLE') }
  let claim
  try { claim = journal.claim() } catch { return fixed('READ_UNAVAILABLE') }
  const controller = new AbortController(), deadline = now() + STAGING_PREVIEW_ENVIRONMENT_DEADLINE_MS
  let timer, credential, reader, result, outcome = 'READ_UNAVAILABLE'
  try {
    if (!Number.isFinite(deadline)) unavailable()
    const expired = new Promise((_, reject) => {
      timer = setTimer(() => { controller.abort(); reject(new Error('Staging Preview environment observer unavailable')) },
        STAGING_PREVIEW_ENVIRONMENT_DEADLINE_MS)
    })
    const operation = (async () => {
      credential = await readCredential({ signal: controller.signal })
      if (controller.signal.aborted) { credential?.fill?.(0); credential = undefined; unavailable() }
      if (controller.signal.aborted || !Buffer.isBuffer(credential) || credential.length < 8
        || credential.length > 4_096 || credential.includes(0)) unavailable()
      reader = openVercel(credential)
      if (!reader || typeof reader.readProject !== 'function'
        || typeof reader.readEffectivePreviewEnvironmentInventory !== 'function' || typeof reader.dispose !== 'function') unavailable()
      credential.fill(0); credential = undefined
      const project = await reader.readProject({ signal: controller.signal })
      if (controller.signal.aborted || project?.repository?.repoId !== 1264363509) unavailable()
      const inventory = await reader.readEffectivePreviewEnvironmentInventory({ signal: controller.signal })
      if (controller.signal.aborted) unavailable()
      return assessStagingPreviewEnvironment({ project, inventory, requiredSecrets, requiredConfiguration })
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
