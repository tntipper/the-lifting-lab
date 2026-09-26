/** Injected, bounded Vercel-only observer. No ambient credential or network. */
import { assessStagingPreviewSourceReadback } from './staging-account-hosted-baseline-surface.mjs'

export const PREVIEW_SOURCE_OBSERVER_ENABLED = false
export const PREVIEW_SOURCE_OBSERVER_DEADLINE_MS = 45_000
const unavailable = () => { throw new Error('Preview source observer unavailable') }
const fixed = status => Object.freeze({ status, projectId: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4' })

export async function runPreviewSourceObservation ({ readCredential, openProject, openSource, journal,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if ([readCredential, openProject, openSource, now, setTimer, clearTimer].some(value => typeof value !== 'function')
    || !journal || ['read', 'start', 'record', 'finish'].some(name => typeof journal[name] !== 'function')) unavailable()
  try { if (journal.read()) return fixed('REPLAY_REJECTED') }
  catch { return fixed('READ_UNAVAILABLE') }
  let phase
  try { phase = journal.start() } catch { return fixed('READ_UNAVAILABLE') }
  const controller = new AbortController()
  const deadline = now() + PREVIEW_SOURCE_OBSERVER_DEADLINE_MS
  let token, project, source, outcome = 'READ_UNAVAILABLE', receipt, cleanupFailed = false
  const bounded = async (operation, lateCleanup = () => {}) => {
    if (!Number.isFinite(now()) || now() >= deadline || controller.signal.aborted) unavailable()
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimer(() => { controller.abort(); reject(new Error('Preview source observer unavailable')) },
        Math.max(0, deadline - now()))
    })
    const pending = Promise.resolve().then(() => {
      if (controller.signal.aborted) unavailable()
      return operation()
    })
    void pending.then(value => { if (controller.signal.aborted) lateCleanup(value) }, () => {}).catch(() => {})
    try {
      const value = await Promise.race([pending, timeout])
      if (controller.signal.aborted || now() >= deadline) { lateCleanup(value); unavailable() }
      return value
    } finally { if (timer !== undefined) clearTimer(timer) }
  }
  try {
    token = await bounded(() => readCredential({ signal: controller.signal }), value => value?.fill?.(0))
    if (!Buffer.isBuffer(token) || token.length < 8 || token.length > 4_096 || token.includes(0)) unavailable()
    project = openProject(token)
    source = openSource(token)
    if (!project || typeof project.readProject !== 'function' || typeof project.dispose !== 'function'
      || !source || typeof source.readSource !== 'function' || typeof source.dispose !== 'function') unavailable()
    token.fill(0); token = undefined
    phase = journal.record(phase, 'PROJECT_READ')
    const projectReceipt = await bounded(() => project.readProject({ signal: controller.signal }))
    if (projectReceipt?.repository?.repoId !== 1264363509) unavailable()
    phase = journal.record(phase, 'SOURCE_READ')
    const sourceReceipt = await bounded(() => source.readSource({ signal: controller.signal }))
    receipt = assessStagingPreviewSourceReadback({ project: projectReceipt, deployment: sourceReceipt })
    outcome = 'OBSERVED'
  } catch { outcome = 'READ_UNAVAILABLE' } finally {
    controller.abort()
    try { source?.dispose() } catch { cleanupFailed = true }
    try { project?.dispose() } catch { cleanupFailed = true }
    token?.fill?.(0)
  }
  if (cleanupFailed) outcome = 'READ_UNAVAILABLE'
  try { journal.finish(phase, outcome === 'OBSERVED' ? 'OBSERVED' : 'RECONCILIATION_REQUIRED') }
  catch { outcome = 'READ_UNAVAILABLE' }
  return outcome === 'OBSERVED' ? Object.freeze({ ...fixed(outcome), receipt }) : fixed(outcome)
}
