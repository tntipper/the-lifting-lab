/** Injected-only, read-only check of one pinned protected staging Preview. */
export const PREVIEW_READINESS_SESSION_ENABLED = false
export const PREVIEW_READINESS_TARGET = Object.freeze({
  deploymentId: 'dpl_9CFPQG6JChoGrkWidhh73BY1Qj1b',
  immutableUrl: 'https://the-lifting-7kom7bvbo-my-lifting-lab-s-projects.vercel.app',
  aliasUrl: 'https://the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app',
  projectRef: 'qdmvngjwkcsilzmqksme', branch: 'codex/tll-integration',
})
const unavailable = () => { throw new Error('Staging Preview readiness unavailable') }
const fixed = status => Object.freeze({ status, deploymentId: PREVIEW_READINESS_TARGET.deploymentId,
  projectRef: PREVIEW_READINESS_TARGET.projectRef })
const keys = ['deploymentId', 'immutableUrl', 'projectRef', 'branch', 'privateCustomer', 'privateCart', 'publicCustomer', 'publicCart']

function exactDisabled(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')
    || value.deploymentId !== PREVIEW_READINESS_TARGET.deploymentId
    || value.immutableUrl !== PREVIEW_READINESS_TARGET.immutableUrl
    || value.projectRef !== PREVIEW_READINESS_TARGET.projectRef || value.branch !== PREVIEW_READINESS_TARGET.branch
    || [value.privateCustomer, value.privateCart, value.publicCustomer, value.publicCart].some(item => item !== false)) unavailable()
}

/** The injected reader may make only the ordered three fixed GETs. */
export async function observeProtectedPreviewOnce({ readBypass, readReadiness, journal } = {}) {
  if (typeof readBypass !== 'function' || typeof readReadiness !== 'function'
    || !journal || ['read', 'start', 'record', 'finish'].some(name => typeof journal[name] !== 'function')) unavailable()
  try { if (journal.read()) return fixed('REPLAY_REJECTED') } catch { return fixed('RECONCILIATION_REQUIRED') }
  let bypass, phase
  try {
    bypass = await readBypass()
    if (!Buffer.isBuffer(bypass) || bypass.length < 8 || bypass.length > 4_096 || bypass.includes(0)) unavailable()
    phase = journal.start()
    phase = journal.record(phase, 'PROJECT_READ')
    exactDisabled(await readReadiness(PREVIEW_READINESS_TARGET.aliasUrl, bypass))
    phase = journal.record(phase, 'SOURCE_READ')
    exactDisabled(await readReadiness(PREVIEW_READINESS_TARGET.immutableUrl, bypass))
    exactDisabled(await readReadiness(PREVIEW_READINESS_TARGET.aliasUrl, bypass))
    phase = journal.finish(phase, 'OBSERVED')
    return fixed('PREVIEW_DISABLED_VERIFIED')
  } catch {
    if (phase?.outcome === null) {
      try { phase = journal.finish(phase, 'READ_UNAVAILABLE') } catch { /* Preserve uncertain phase. */ }
    }
    try { return fixed(phase?.outcome === 'READ_UNAVAILABLE' ? 'READ_UNAVAILABLE'
      : journal.read() ? 'RECONCILIATION_REQUIRED' : 'READ_UNAVAILABLE') }
    catch { return fixed('RECONCILIATION_REQUIRED') }
  } finally { bypass?.fill?.(0) }
}
