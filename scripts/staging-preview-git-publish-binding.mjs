/** Injected-only composition of fixed source reads, one-use journal and a future push port. */
import { createStagingPreviewGitPublishCoordinator } from './staging-preview-git-publish-coordinator.mjs'
import { selectStagingPreviewGitPublication } from './staging-preview-git-publish-native-contract.mjs'

export const STAGING_PREVIEW_GIT_PUBLISH_BINDING_NATIVE_ENABLED = false
const HOLD = Object.freeze({ status: 'SOURCE_PUBLICATION_HOLD' })
const origin = 'https://github.com/tntipper/the-lifting-lab.git'
const ref = 'refs/heads/codex/tll-integration'
const fullSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
function captureExpected(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Reflect.ownKeys(value).length !== 3) return null
    const selectedCommit = Object.getOwnPropertyDescriptor(value, 'selectedCommit')?.value
    const predecessorCommit = Object.getOwnPropertyDescriptor(value, 'predecessorCommit')?.value
    const manifestSha256 = Object.getOwnPropertyDescriptor(value, 'manifestSha256')?.value
    return fullSha(selectedCommit) && fullSha(predecessorCommit) && selectedCommit !== predecessorCommit
      && digest(manifestSha256) ? Object.freeze({ selectedCommit, predecessorCommit, manifestSha256 }) : null
  } catch { return null }
}

/** No native Git or push adapter is imported. The future launcher must supply reviewed ports. */
export function createStagingPreviewGitPublishBinding({ runGit, journal, push } = {}) {
  let used = false
  const readRemote = async () => {
    const result = await runGit(Object.freeze(['ls-remote', '--heads', origin, ref]), 4_096)
    if (result?.status !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.length > 4_096) {
      throw Error('Git publication remote unavailable')
    }
    const value = result.stdout.toString('utf8')
    const match = /^([a-f0-9]{40})\trefs\/heads\/codex\/tll-integration\n$/.exec(value)
    if (!match) throw Error('Git publication remote unavailable')
    return match[1]
  }
  return Object.freeze({
    async execute(expectedSelection) {
      if (used) return HOLD
      used = true
      const expected = captureExpected(expectedSelection)
      if (!expected || typeof runGit !== 'function' || typeof push !== 'function') return HOLD
      const selected = await selectStagingPreviewGitPublication({ runGit })
      if (selected.status !== 'PUBLISH_SOURCE_SELECTED' || selected.selectedCommit !== expected.selectedCommit
        || selected.predecessorCommit !== expected.predecessorCommit
        || selected.manifestSha256 !== expected.manifestSha256) return HOLD
      const coordinator = createStagingPreviewGitPublishCoordinator({ journal, push, readRemote,
        recheckSource: () => selectStagingPreviewGitPublication({ runGit }) })
      return coordinator.execute(Object.freeze({ selectedCommit: selected.selectedCommit,
        predecessorCommit: selected.predecessorCommit, manifestSha256: selected.manifestSha256 }))
    },
  })
}
