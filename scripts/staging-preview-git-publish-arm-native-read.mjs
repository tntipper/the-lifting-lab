/** Fixed read-only Git port for the separate local arming worktree. No push vector. */
import { spawnSync } from 'node:child_process'
import { stagingPreviewGitExecutableReady, stagingPreviewGitHttpsHelperReady } from './staging-preview-git-source-preflight.mjs'
import { captureStagingPreviewGitArguments } from './staging-preview-git-publish-native-contract.mjs'
import { STAGING_PREVIEW_GIT_PUBLISH_ARM_ROOT } from './staging-preview-git-publish-arm-preflight.mjs'

const gitBinary = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/bin/git'
const gitExecPath = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/libexec/git-core'
const unavailable = () => { throw Error('Staging publication arming read unavailable') }
const fullSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const files = ['config/staging-account-activation-manifest.json',
  'scripts/staging-preview-git-publish-live-launcher.mjs']
const fixed = new Set([
  ['rev-parse', '--show-toplevel'], ['symbolic-ref', '--quiet', '--short', 'HEAD'],
  ['status', '--porcelain=v1', '--untracked-files=all'], ['rev-parse', 'HEAD'],
  ['rev-list', '--parents', '-n', '1', 'HEAD'],
].map(args => args.join('\0')))
const key = args => args.join('\0')

export function stagingPreviewGitArmReadProcessOptions(args, maxBuffer) {
  const captured = captureStagingPreviewGitArguments(args)
  if (!captured) unavailable()
  const command = key(captured)
  const diff = captured.length === 6 && captured[0] === 'diff-tree'
    && captured[1] === '--no-commit-id' && captured[2] === '--name-only'
    && captured[3] === '-r' && fullSha(captured[4]) && fullSha(captured[5])
  const tree = captured.length === 6 && captured[0] === 'ls-tree' && captured[1] === '-z'
    && fullSha(captured[2]) && captured[3] === '--'
    && captured[4] === files[0] && captured[5] === files[1]
  const show = captured.length === 2 && captured[0] === 'show'
    && files.some(path => /^([a-f0-9]{40}):(.+)$/.exec(captured[1])?.[2] === path)
  const limit = show ? 262_144 : 4_096
  if ((!fixed.has(command) && !diff && !tree && !show) || maxBuffer !== limit) unavailable()
  return Object.freeze({ cwd: STAGING_PREVIEW_GIT_PUBLISH_ARM_ROOT,
    env: Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/var/empty', XDG_CONFIG_HOME: '/var/empty',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '/usr/bin/false', GIT_EXEC_PATH: gitExecPath }),
    stdio: Object.freeze(['ignore', 'pipe', 'ignore']), timeout: 15_000, maxBuffer })
}

export function createStagingPreviewGitArmNativeReadPort({ spawn = spawnSync } = {}) {
  return Object.freeze({
    runGit(args, maxBuffer) {
      const captured = captureStagingPreviewGitArguments(args)
      if (!captured || captured.some(value => value === 'push') || captured[0] === '-c') unavailable()
      const options = stagingPreviewGitArmReadProcessOptions(captured, maxBuffer)
      if (!stagingPreviewGitExecutableReady() || !stagingPreviewGitHttpsHelperReady()) unavailable()
      const effective = Object.freeze(['-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', ...captured])
      const result = spawn(gitBinary, effective, options)
      if (result.error || result.signal || !Number.isSafeInteger(result.status)
        || !Buffer.isBuffer(result.stdout) || result.stdout.length > maxBuffer) {
        result.stdout?.fill?.(0)
        unavailable()
      }
      return Object.freeze({ status: result.status, stdout: result.stdout })
    },
  })
}
