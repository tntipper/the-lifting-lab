/** Pure source selection and command policy for a future staging Git push. No process adapter. */
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

export const STAGING_PREVIEW_GIT_PUSH_NATIVE_ENABLED = false
const root = resolve(import.meta.dirname, '..')
const branch = 'codex/tll-integration'
const ref = `refs/heads/${branch}`
const origin = 'https://github.com/tntipper/the-lifting-lab.git'
const manifestPath = 'config/staging-account-activation-manifest.json'
const commonConfig = resolve(root, '../audit-code/.git/config')
const worktreeConfig = resolve(root, '../audit-code/.git/worktrees/implementation-integration/config.worktree')
const HOLD = Object.freeze({ status: 'PUBLISH_SOURCE_HOLD' })
const fullSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const commonValues = new Map([
  ['core.repositoryformatversion', '1'], ['core.filemode', 'true'], ['core.bare', 'false'],
  ['core.logallrefupdates', 'true'], ['core.ignorecase', 'true'], ['core.precomposeunicode', 'true'],
  ['remote.origin.url', origin], ['remote.origin.fetch', '+refs/heads/main:refs/remotes/origin/main'],
  ['remote.origin.promisor', 'true'], ['remote.origin.partialclonefilter', 'blob:none'],
  ['extensions.worktreeconfig', 'true'],
])
const worktreeValues = new Map([
  ['core.sparsecheckout', 'false'], ['core.sparsecheckoutcone', 'false'], ['index.sparse', 'false'],
])
const required = new Set([...commonValues.keys(), ...worktreeValues.keys(),
  `branch.${branch}.remote`, `branch.${branch}.merge`])
const line = (bytes, limit = 4_096) => {
  if (!Buffer.isBuffer(bytes) || bytes.length > limit) throw Error('Git publication source unavailable')
  const value = bytes.toString('utf8')
  if (!value.endsWith('\n') || value.slice(0, -1).includes('\n') || value.includes('\r')) throw Error('Git publication source unavailable')
  return value.slice(0, -1)
}

/** Effective config must contain only reviewed file origins and key/value shapes. */
export function stagingPreviewGitPublishConfigAccepted(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 65_536) return false
  const records = bytes.toString('utf8').split('\0')
  if (records.pop() !== '' || records.length % 2 !== 0) return false
  const seen = new Set()
  for (let index = 0; index < records.length; index += 2) {
    const source = records[index], entry = records[index + 1]
    const newline = entry.indexOf('\n')
    if (newline < 1 || entry.indexOf('\n', newline + 1) !== -1) return false
    const key = entry.slice(0, newline), value = entry.slice(newline + 1)
    if (!value || seen.has(key)) return false
    seen.add(key)
    if (source === `file:${commonConfig}`) {
      if (commonValues.has(key)) { if (commonValues.get(key) !== value) return false }
      else {
        const match = /^branch\.([a-z0-9/._-]+)\.(remote|merge)$/.exec(key)
        if (!match || value !== (match[2] === 'remote' ? 'origin' : `refs/heads/${match[1]}`)) return false
      }
    } else if (source === `file:${worktreeConfig}`) {
      if (!worktreeValues.has(key) || worktreeValues.get(key) !== value) return false
    } else return false
  }
  return [...required].every(key => seen.has(key))
}

export function stagingPreviewGitPushCommand({ selectedCommit, predecessorCommit } = {}) {
  if (!fullSha(selectedCommit) || !fullSha(predecessorCommit) || selectedCommit === predecessorCommit) {
    throw Error('Git publication command unavailable')
  }
  return Object.freeze(['-c', 'core.hooksPath=/dev/null', 'push', '--porcelain', '--no-verify',
    `--force-with-lease=${ref}:${predecessorCommit}`, '--', origin, `${selectedCommit}:${ref}`])
}

const fixedReads = new Set([
  ['config', '--null', '--list', '--show-origin'], ['rev-parse', '--show-toplevel'],
  ['symbolic-ref', '--quiet', '--short', 'HEAD'], ['config', '--local', '--get', 'remote.origin.url'],
  ['status', '--porcelain=v1', '--untracked-files=no'], ['rev-parse', 'HEAD'],
  ['ls-remote', '--heads', origin, ref],
].map(args => args.join('\0')))
export function captureStagingPreviewGitArguments(args) {
  try {
    if (!Array.isArray(args)) return null
    const length = Object.getOwnPropertyDescriptor(args, 'length')?.value
    if (!Number.isSafeInteger(length) || length < 1 || length > 9
      || Reflect.ownKeys(args).length !== length + 1) return null
    const captured = []
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(args, String(index))
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string'
        || descriptor.value.includes('\0')) return null
      captured.push(descriptor.value)
    }
    return Object.freeze(captured)
  } catch { return null }
}
const commandKey = args => {
  let result = ''
  for (let index = 0; index < args.length; index++) result += (index ? '\0' : '') + args[index]
  return result
}
/** Returns options only; a separate reviewed launcher must supply the pinned executable. */
export function stagingPreviewGitPublishProcessOptions(args, maxBuffer) {
  const captured = captureStagingPreviewGitArguments(args)
  if (!captured) throw Error('Git publication command unavailable')
  const command = commandKey(captured)
  const config = command === 'config\0--null\0--list\0--show-origin'
  const show = /^show\0[a-f0-9]{40}:config\/staging-account-activation-manifest\.json$/.test(command)
  const ancestor = /^merge-base\0--is-ancestor\0[a-f0-9]{40}\0[a-f0-9]{40}$/.test(command)
  let push = false
  if (captured.length === 9 && captured[2] === 'push') {
    try {
      push = command === stagingPreviewGitPushCommand({
        selectedCommit: /^([a-f0-9]{40}):refs\/heads\/codex\/tll-integration$/.exec(captured[8])?.[1],
        predecessorCommit: /^--force-with-lease=refs\/heads\/codex\/tll-integration:([a-f0-9]{40})$/.exec(captured[5])?.[1],
      }).join('\0')
    } catch { /* malformed command rejected below */ }
  }
  const limit = config ? 65_536 : show ? 262_144 : 4_096
  if ((!fixedReads.has(command) && !show && !ancestor && !push) || maxBuffer !== limit) {
    throw Error('Git publication command unavailable')
  }
  const remote = captured[0] === 'ls-remote'
  return Object.freeze({ cwd: remote ? '/' : root,
    env: Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/var/empty', XDG_CONFIG_HOME: '/var/empty',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/usr/bin/false', GIT_NO_REPLACE_OBJECTS: '1',
      GIT_EXEC_PATH: '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/libexec/git-core' }),
    stdio: Object.freeze(['ignore', 'pipe', 'ignore']), timeout: push ? 45_000 : 15_000, maxBuffer })
}

/** runGit returns {status, stdout}; every nonzero exit, including merge-base false, is a HOLD. */
export async function selectStagingPreviewGitPublication({ runGit } = {}) {
  if (typeof runGit !== 'function') return HOLD
  const read = async (args, maxBuffer = 4_096) => {
    const result = await runGit(Object.freeze(args), maxBuffer)
    if (result?.status !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.length > maxBuffer) {
      throw Error('Git publication source unavailable')
    }
    return result.stdout
  }
  let manifest, config
  try {
    config = await read(['config', '--null', '--list', '--show-origin'], 65_536)
    if (!stagingPreviewGitPublishConfigAccepted(config)) return HOLD
    if (line(await read(['rev-parse', '--show-toplevel'])) !== root
      || line(await read(['symbolic-ref', '--quiet', '--short', 'HEAD'])) !== branch
      || line(await read(['config', '--local', '--get', 'remote.origin.url'])) !== origin
      || (await read(['status', '--porcelain=v1', '--untracked-files=no'])).length !== 0) return HOLD
    const selectedCommit = line(await read(['rev-parse', 'HEAD']))
    if (!fullSha(selectedCommit)) return HOLD
    const remote = line(await read(['ls-remote', '--heads', origin, ref]))
    const match = /^([a-f0-9]{40})\trefs\/heads\/codex\/tll-integration$/.exec(remote)
    if (!match || match[1] === selectedCommit) return HOLD
    const predecessorCommit = match[1]
    if ((await read(['merge-base', '--is-ancestor', predecessorCommit, selectedCommit])).length !== 0) return HOLD
    manifest = await read(['show', `${selectedCommit}:${manifestPath}`], 262_144)
    if (manifest.length === 0) return HOLD
    return Object.freeze({ status: 'PUBLISH_SOURCE_SELECTED', selectedCommit, predecessorCommit,
      manifestSha256: createHash('sha256').update(manifest).digest('hex') })
  } catch { return HOLD } finally { manifest?.fill(0); config?.fill(0) }
}
