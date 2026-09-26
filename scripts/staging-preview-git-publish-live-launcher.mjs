#!/usr/bin/env node
/** Disabled entry for one journaled staging Git publication from a separate local arming worktree. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const STAGING_PREVIEW_GIT_PUBLISH_LIVE_ENABLED = false
const sourceRoot = '/Users/tobiastipper/Library/Mobile Documents/com~apple~CloudDocs/Business/The Lifting Lab/TLL and Store/implementation-integration'
const armRoot = resolve(sourceRoot, '../implementation-preview-publish-arm-v1')
const gitBinary = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/bin/git'
const gitBinarySha256 = 'ee73b116cc37f44ecdaa9e3fdfbc25ce827675859f5f966ec671112fd5caf074'
const gitExecPath = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/libexec/git-core'
const approved = Object.freeze({ selectedCommit: '', predecessorCommit: '', manifestSha256: '' })
const checkerPaths = Object.freeze(['scripts/staging-account-activation-manifest.mjs',
  'scripts/staging-generation-21-credentials.mjs'])
const sourceCodePaths = Object.freeze([
  ...checkerPaths,
  'scripts/staging-preview-git-publish-arm-preflight.mjs',
  'scripts/staging-preview-git-publish-arm-native-read.mjs',
  'scripts/staging-preview-git-publish-binding.mjs',
  'scripts/staging-preview-git-publish-native-read.mjs',
  'scripts/staging-preview-git-publish-native-push.mjs',
  'scripts/staging-preview-git-publish-journal.mjs',
  'scripts/staging-preview-git-publish-coordinator.mjs',
  'scripts/staging-preview-git-publish-native-contract.mjs',
  'scripts/staging-preview-git-source-preflight.mjs',
  'config/staging-account-activation-manifest.json',
])
const HOLD = Object.freeze({ status: 'SOURCE_PUBLICATION_HOLD' })
const unavailable = () => { throw Error('Staging publication unavailable') }
const fullSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const line = bytes => {
  if (!Buffer.isBuffer(bytes) || bytes.length > 4_096) unavailable()
  const value = bytes.toString('utf8')
  if (!value.endsWith('\n') || value.slice(0, -1).includes('\n') || value.includes('\r')) unavailable()
  return value.slice(0, -1)
}
const sourceModule = name => pathToFileURL(resolve(sourceRoot, 'scripts', name)).href

function pinnedGitReady() {
  try {
    const stat = lstatSync(gitBinary)
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(gitBinary) !== gitBinary
      || stat.uid !== process.getuid() || (stat.mode & 0o022) !== 0) return false
    const bytes = readFileSync(gitBinary)
    try { return createHash('sha256').update(bytes).digest('hex') === gitBinarySha256 }
    finally { bytes.fill(0) }
  } catch { return false }
}

function sourceGit(args, maxBuffer = 4_096) {
  const result = spawnSync(gitBinary, ['-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', ...args], {
    cwd: sourceRoot,
    env: { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/var/empty', XDG_CONFIG_HOME: '/var/empty',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/usr/bin/false', GIT_EXEC_PATH: gitExecPath },
    stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer,
  })
  if (result.error || result.signal || result.status !== 0 || !Buffer.isBuffer(result.stdout)) unavailable()
  return result.stdout
}

function checkSourceBeforeImport() {
  if (!pinnedGitReady() || !fullSha(approved.selectedCommit)
    || !fullSha(approved.predecessorCommit) || approved.selectedCommit === approved.predecessorCommit
    || !digest(approved.manifestSha256)) unavailable()
  if (line(sourceGit(['rev-parse', '--show-toplevel'])) !== sourceRoot
    || line(sourceGit(['symbolic-ref', '--quiet', '--short', 'HEAD'])) !== 'codex/tll-integration'
    || sourceGit(['status', '--porcelain=v1', '--untracked-files=no']).length !== 0
    || line(sourceGit(['rev-parse', 'HEAD'])) !== approved.selectedCommit) unavailable()
  const manifest = sourceGit(['show',
    `${approved.selectedCommit}:config/staging-account-activation-manifest.json`], 262_144)
  try {
    if (createHash('sha256').update(manifest).digest('hex') !== approved.manifestSha256) unavailable()
  } finally { manifest.fill(0) }
}

function localBytes(root, path) {
  const location = resolve(root, path)
  if (realpathSync(root) !== root || realpathSync(location) !== location) unavailable()
  const fd = openSync(location, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid()
      || (stat.mode & 0o022) !== 0 || stat.size < 1 || stat.size > 262_144) unavailable()
    const bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, null)
      if (!Number.isSafeInteger(count) || count < 1) unavailable()
      offset += count
    }
    const after = fstatSync(fd), extra = Buffer.alloc(1)
    if (readSync(fd, extra, 0, 1, null) !== 0 || after.size !== stat.size
      || after.ino !== stat.ino || after.dev !== stat.dev || after.mtimeMs !== stat.mtimeMs) unavailable()
    return bytes
  } finally { closeSync(fd) }
}

function checkCommittedBytes(root, paths) {
  for (const path of paths) {
    const committed = sourceGit(['show', `${approved.selectedCommit}:${path}`], 262_144)
    let local
    try {
      local = localBytes(root, path)
      if (!committed.equals(local)) unavailable()
    } finally { committed.fill(0); local?.fill(0) }
  }
}

function checkManifest(root) {
  const result = spawnSync(process.execPath, [resolve(root, 'scripts/staging-account-activation-manifest.mjs'), '--check'], {
    cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/var/empty' },
    stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer: 4_096,
  })
  result.stdout?.fill?.(0)
  if (result.error || result.signal || result.status !== 0 || result.stdout?.length !== 0) unavailable()
}

/** A false gate returns before manifest, Git, journal, credential-helper or network work. */
export async function runStagingPreviewGitPublishLiveOnce() {
  if (STAGING_PREVIEW_GIT_PUBLISH_LIVE_ENABLED !== true) {
    return Object.freeze({ status: 'STAGING_PREVIEW_GIT_PUBLISH_LIVE_DISABLED' })
  }
  try {
    const here = resolve(import.meta.dirname, '..')
    const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    const approvedExecutionCommit = process.argv[2]
    if (!direct || process.argv.length !== 3 || here !== armRoot || !fullSha(approvedExecutionCommit)) unavailable()
    checkSourceBeforeImport()
    checkCommittedBytes(sourceRoot, sourceCodePaths)
    checkManifest(sourceRoot)
    const [arm, armNative, binding, nativeRead, nativePush, journal] = await Promise.all([
      import(sourceModule('staging-preview-git-publish-arm-preflight.mjs')),
      import(sourceModule('staging-preview-git-publish-arm-native-read.mjs')),
      import(sourceModule('staging-preview-git-publish-binding.mjs')),
      import(sourceModule('staging-preview-git-publish-native-read.mjs')),
      import(sourceModule('staging-preview-git-publish-native-push.mjs')),
      import(sourceModule('staging-preview-git-publish-journal.mjs')),
    ])
    const armProof = await arm.verifyStagingPreviewGitPublishArm({
      runGit: armNative.createStagingPreviewGitArmNativeReadPort().runGit,
      selectedCommit: approved.selectedCommit, approvedExecutionCommit,
    })
    if (armProof.status !== 'ARMING_WORKTREE_VERIFIED'
      || armProof.executionCommit !== approvedExecutionCommit
      || armProof.sourceCommit !== approved.selectedCommit) unavailable()
    checkCommittedBytes(armRoot, checkerPaths)
    checkManifest(armRoot)
    const publication = binding.createStagingPreviewGitPublishBinding({
      runGit: nativeRead.createStagingPreviewGitPublishNativeReadPort().runGit,
      journal: journal.createPreviewGitPublishJournal(),
      push: nativePush.createStagingPreviewGitPublishNativePushPort({ spawn: spawnSync }).push,
    })
    return await publication.execute(approved)
  } catch { return HOLD }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runStagingPreviewGitPublishLiveOnce()
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status !== 'STAGING_PREVIEW_GIT_PUBLISH_LIVE_DISABLED'
    && result.status !== 'SOURCE_PUBLISHED_PREVIEW_UNVERIFIED') process.exitCode = 1
}
