/** Fixed read-only Git process port for staging publication source selection. No push adapter. */
import { spawnSync } from 'node:child_process'
import { stagingPreviewGitExecutableReady, stagingPreviewGitHttpsHelperReady } from './staging-preview-git-source-preflight.mjs'
import { captureStagingPreviewGitArguments, stagingPreviewGitPublishProcessOptions } from './staging-preview-git-publish-native-contract.mjs'

const gitBinary = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/bin/git'
const unavailable = () => { throw Error('Staging Git publication read unavailable') }

/** A caller can request only the contract's read commands; push is rejected before spawn. */
export function createStagingPreviewGitPublishNativeReadPort({ spawn = spawnSync } = {}) {
  return Object.freeze({
    runGit(args, maxBuffer) {
      const captured = captureStagingPreviewGitArguments(args)
      if (!captured || captured[0] === '-c') unavailable()
      for (let index = 0; index < captured.length; index++) if (captured[index] === 'push') unavailable()
      const options = stagingPreviewGitPublishProcessOptions(captured, maxBuffer)
      if (!stagingPreviewGitExecutableReady() || !stagingPreviewGitHttpsHelperReady()) unavailable()
      const result = spawn(gitBinary, captured, options)
      if (result.error || result.signal || !Number.isSafeInteger(result.status)
        || !Buffer.isBuffer(result.stdout) || result.stdout.length > maxBuffer) {
        result.stdout?.fill?.(0)
        unavailable()
      }
      return Object.freeze({ status: result.status, stdout: result.stdout })
    },
  })
}
