/** Injected-only one-use push policy. A gated journaled launcher must supply the native process. */
import { stagingPreviewGitExecutableReady, stagingPreviewGitHttpsHelperReady,
  stagingPreviewGithubCliReady } from './staging-preview-git-source-preflight.mjs'
import { captureStagingPreviewGitArguments, stagingPreviewGitPushCommand,
  stagingPreviewGitPublishProcessOptions } from './staging-preview-git-publish-native-contract.mjs'

const gitBinary = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/bin/git'
const unavailable = () => { throw Error('Staging Git publication push unavailable') }
const fullSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

function captureSelection(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Reflect.ownKeys(value).length !== 3) return null
    const selectedCommit = Object.getOwnPropertyDescriptor(value, 'selectedCommit')?.value
    const predecessorCommit = Object.getOwnPropertyDescriptor(value, 'predecessorCommit')?.value
    const manifestSha256 = Object.getOwnPropertyDescriptor(value, 'manifestSha256')?.value
    return fullSha(selectedCommit) && fullSha(predecessorCommit) && selectedCommit !== predecessorCommit
      && digest(manifestSha256) ? Object.freeze({ selectedCommit, predecessorCommit, manifestSha256 }) : null
  } catch { return null }
}

/** No process adapter exists here; the future launcher must explicitly bind one behind its false gate. */
export function createStagingPreviewGitPublishNativePushPort({ spawn,
  preflight = () => stagingPreviewGitExecutableReady() && stagingPreviewGitHttpsHelperReady()
    && stagingPreviewGithubCliReady() } = {}) {
  let used = false
  return Object.freeze({
    push(selection) {
      if (used) unavailable()
      used = true
      const selected = captureSelection(selection)
      if (!selected || typeof spawn !== 'function' || typeof preflight !== 'function') unavailable()
      const args = captureStagingPreviewGitArguments(stagingPreviewGitPushCommand(selected))
      if (!args) unavailable()
      const options = stagingPreviewGitPublishProcessOptions(args, 4_096)
      if (preflight() !== true) unavailable()
      let result
      try { result = spawn(gitBinary, args, options) } catch { unavailable() }
      result?.stdout?.fill?.(0)
      result?.stderr?.fill?.(0)
      if (result?.error || result?.signal || result?.status !== 0) unavailable()
      return Object.freeze({ status: 'PUSH_DISPATCHED_UNVERIFIED' })
    },
  })
}
