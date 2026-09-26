/** Pure proof that a local-only arming worktree is one reviewed commit above the disabled source. */
import { resolve } from 'node:path'
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs'

export const STAGING_PREVIEW_GIT_PUBLISH_ARM_ROOT = resolve(import.meta.dirname, '../../implementation-preview-publish-arm-v1')
const branch = 'codex/tll-preview-publish-arm-v1'
const changed = ['config/staging-account-activation-manifest.json',
  'scripts/staging-preview-git-publish-live-launcher.mjs']
const HOLD = Object.freeze({ status: 'ARMING_WORKTREE_HOLD' })
const fullSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const line = bytes => {
  if (!Buffer.isBuffer(bytes) || bytes.length > 4_096) throw Error('Arming worktree unavailable')
  const value = bytes.toString('utf8')
  if (!value.endsWith('\n') || value.slice(0, -1).includes('\n') || value.includes('\r')) throw Error('Arming worktree unavailable')
  return value.slice(0, -1)
}
function readLocal(path) {
  const root = lstatSync(STAGING_PREVIEW_GIT_PUBLISH_ARM_ROOT)
  if (!root.isDirectory() || root.isSymbolicLink()
    || realpathSync(STAGING_PREVIEW_GIT_PUBLISH_ARM_ROOT) !== STAGING_PREVIEW_GIT_PUBLISH_ARM_ROOT
    || realpathSync(path) !== path) throw Error('Arming worktree unavailable')
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid()
      || (stat.mode & 0o022) !== 0 || stat.size < 1 || stat.size > 262_144) {
      throw Error('Arming worktree unavailable')
    }
    const bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, null)
      if (!Number.isSafeInteger(count) || count < 1) throw Error('Arming worktree unavailable')
      offset += count
    }
    const extra = Buffer.alloc(1)
    const after = fstatSync(fd)
    if (readSync(fd, extra, 0, 1, null) !== 0 || after.size !== stat.size
      || after.ino !== stat.ino || after.dev !== stat.dev || after.mtimeMs !== stat.mtimeMs) {
      throw Error('Arming worktree unavailable')
    }
    return bytes
  } finally { closeSync(fd) }
}

export async function verifyStagingPreviewGitPublishArm({ runGit, selectedCommit,
  approvedExecutionCommit, readFile = readLocal } = {}) {
  if (typeof runGit !== 'function' || typeof readFile !== 'function'
    || !fullSha(selectedCommit) || !fullSha(approvedExecutionCommit)) return HOLD
  const read = async (args, limit = 4_096) => {
    const result = await runGit(Object.freeze(args), limit)
    if (result?.status !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.length > limit) {
      throw Error('Arming worktree unavailable')
    }
    return result.stdout
  }
  try {
    if (line(await read(['rev-parse', '--show-toplevel'])) !== STAGING_PREVIEW_GIT_PUBLISH_ARM_ROOT
      || line(await read(['symbolic-ref', '--quiet', '--short', 'HEAD'])) !== branch
      || (await read(['status', '--porcelain=v1', '--untracked-files=all'])).length !== 0) return HOLD
    const executionCommit = line(await read(['rev-parse', 'HEAD']))
    if (executionCommit !== approvedExecutionCommit || executionCommit === selectedCommit) return HOLD
    if (line(await read(['rev-list', '--parents', '-n', '1', 'HEAD']))
      !== `${executionCommit} ${selectedCommit}`) return HOLD
    const paths = (await read(['diff-tree', '--no-commit-id', '--name-only', '-r',
      selectedCommit, executionCommit])).toString('utf8')
    if (paths !== `${changed.join('\n')}\n`) return HOLD
    const tree = (await read(['ls-tree', '-z', executionCommit, '--', ...changed])).toString('utf8')
    const records = tree.split('\0')
    if (records.pop() !== '' || records.length !== changed.length) return HOLD
    for (let index = 0; index < changed.length; index++) {
      const match = /^100644 blob ([a-f0-9]{40})\t(.+)$/.exec(records[index])
      if (!match || match[2] !== changed[index]) return HOLD
    }
    for (const path of changed) {
      const committed = await read(['show', `${executionCommit}:${path}`], 262_144)
      let local
      try {
        local = await readFile(resolve(STAGING_PREVIEW_GIT_PUBLISH_ARM_ROOT, path))
        if (!Buffer.isBuffer(local) || local.length > 262_144 || !committed.equals(local)) return HOLD
      } finally { committed.fill(0); local?.fill?.(0) }
    }
    return Object.freeze({ status: 'ARMING_WORKTREE_VERIFIED', executionCommit, sourceCommit: selectedCommit })
  } catch { return HOLD }
}
