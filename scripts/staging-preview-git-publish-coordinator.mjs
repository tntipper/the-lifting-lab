/** Injected-only staging branch publication coordinator. No Git or network binding. */
export const STAGING_PREVIEW_GIT_PUBLISH_NATIVE_ENABLED = false
const HOLD = Object.freeze({ status: 'SOURCE_PUBLICATION_HOLD' })
const fullSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
function captureSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Reflect.ownKeys(value).length !== 3) return null
  const sourceCommit = Object.getOwnPropertyDescriptor(value, 'selectedCommit')?.value
  const predecessorCommit = Object.getOwnPropertyDescriptor(value, 'predecessorCommit')?.value
  const manifestSha256 = Object.getOwnPropertyDescriptor(value, 'manifestSha256')?.value
  if (!fullSha(sourceCommit) || !fullSha(predecessorCommit) || sourceCommit === predecessorCommit
    || !digest(manifestSha256)) return null
  return Object.freeze({ selectedCommit: sourceCommit, predecessorCommit, manifestSha256 })
}

/** Ports must be bounded, reviewed bindings in any future live launcher. */
export function createStagingPreviewGitPublishCoordinator({ journal, readRemote, push } = {}) {
  let used = false
  return Object.freeze({
    async execute(selection) {
      if (used) return HOLD
      used = true
      let selected
      try { selected = captureSelection(selection) } catch { return HOLD }
      if (!selected || typeof readRemote !== 'function' || typeof push !== 'function'
        || typeof journal?.start !== 'function' || typeof journal?.recordDispatch !== 'function'
        || typeof journal?.finish !== 'function') return HOLD
      let before
      try { before = await readRemote('before') } catch { return HOLD }
      if (before !== selected.predecessorCommit) return HOLD
      let dispatched
      try {
        const intent = journal.start(selected)
        dispatched = journal.recordDispatch(intent)
        if (dispatched?.phase !== 'DISPATCH_RECORDED'
          || dispatched?.selectedCommit !== selected.selectedCommit
          || dispatched?.predecessorCommit !== selected.predecessorCommit
          || dispatched?.manifestSha256 !== selected.manifestSha256) return HOLD
      } catch { return HOLD }
      try { await push(selected) } catch { /* acknowledgement is uncertain; reconcile once */ }
      let after
      try { after = await readRemote('after') } catch { /* fixed unavailable outcome below */ }
      const outcome = after === selected.selectedCommit ? 'REMOTE_SELECTED'
        : fullSha(after) ? 'REMOTE_NOT_SELECTED' : 'REMOTE_UNAVAILABLE'
      try {
        const finished = journal.finish(dispatched, outcome)
        if (finished?.outcome !== outcome || finished?.selectedCommit !== selected.selectedCommit
          || finished?.predecessorCommit !== selected.predecessorCommit
          || finished?.manifestSha256 !== selected.manifestSha256) return HOLD
      } catch { return HOLD }
      return outcome === 'REMOTE_SELECTED'
        ? Object.freeze({ status: 'SOURCE_PUBLISHED_PREVIEW_UNVERIFIED', sourceCommit: selected.selectedCommit,
          manifestSha256: selected.manifestSha256 })
        : HOLD
    },
  })
}
