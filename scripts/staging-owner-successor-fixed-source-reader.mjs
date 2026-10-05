/** Disabled fixed Git binding. Owner-supplied review hashes are not execution authority. */
import { spawnSync } from 'node:child_process'
import { setImmediate as yieldToSupervisor } from 'node:timers/promises'
import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { verifyOwnerSuccessorArmingSource, OWNER_SUCCESSOR_SOURCE_SCHEMA } from './staging-owner-successor-source-proof.mjs'
import { stagingPreviewGitExecutableReady, stagingPreviewGitHttpsHelperReady } from './staging-preview-git-source-preflight.mjs'
export const OWNER_SUCCESSOR_NATIVE_FIXED_SOURCE_READER_ENABLED = false
const ROOT = resolve(import.meta.dirname, '..')
const POLICY = resolve(ROOT, 'config/staging-owner-successor-source-policy.json')
const GIT = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/bin/git'
const EXEC = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/libexec/git-core'
const ORIGIN = 'https://github.com/tntipper/the-lifting-lab.git', BRANCH = 'codex/tll-integration'
const CONTEXT = 'scripts/staging-owner-successor-sql-context.mjs', MANIFEST = 'config/staging-account-activation-manifest.json'
const EDGE = 'lib/identity/staging-owner-successor-broker-readiness-edge.ts'
const HOLD = Object.freeze({ status: 'OWNER_SUCCESSOR_SOURCE_HOLD', authorization: 'NONE' })
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join('|') === [...keys].sort().join('|')
export function fixedOwnerSuccessorSourcePolicy(handoff) {
  if (!OWNER_SUCCESSOR_NATIVE_FIXED_SOURCE_READER_ENABLED
    || !exact(handoff, ['reviewedBaseSha', 'manifestSha256']) || !/^[a-f0-9]{40}$/.test(handoff.reviewedBaseSha)
    || !/^[a-f0-9]{64}$/.test(handoff.manifestSha256)) throw Error('Successor source policy unavailable')
  const stat = lstatSync(POLICY)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o022) !== 0 || stat.size > 32768)
    throw Error('Successor source policy unavailable')
  const policy = JSON.parse(readFileSync(POLICY, 'utf8'))
  if (!exact(policy, ['schema', 'branch', 'origin', 'manifest', 'contextPath', 'gates'])
    || policy.schema !== 'tll-owner-successor-fixed-source-policy/v1' || policy.branch !== BRANCH
    || policy.origin !== ORIGIN || policy.manifest !== MANIFEST || policy.contextPath !== CONTEXT
    || !policy.gates || typeof policy.gates !== 'object' || Array.isArray(policy.gates)) throw Error('Successor source policy unavailable')
  const gates = Object.freeze(Object.fromEntries(Object.entries(policy.gates).map(([path, names]) => {
    if (!(path === EDGE || /^scripts\/[a-z0-9-]+\.mjs$/.test(path)) || !Array.isArray(names)
      || names.some(name => !/^[A-Z][A-Z0-9_]*(?:ENABLED|ARMED)$/.test(name))) throw Error('Successor source policy unavailable')
    return [path, Object.freeze([...names])]
  })))
  return Object.freeze({ ...policy, schema: OWNER_SUCCESSOR_SOURCE_SCHEMA, ...handoff, gates })
}
/** Pure validation seam; the native reader supplies only these bounded fixed commands. */
export function ownerSuccessorGitProcessOptions(args, maxBuffer, policy) {
  if (!Array.isArray(args) || args.some(a => typeof a !== 'string') || !policy?.gates) throw Error('Successor Git unavailable')
  const joined = args.join('\0'), sha = '[a-f0-9]{40}'
  const simple = new Set(['rev-parse\0--show-toplevel', 'symbolic-ref\0--quiet\0--short\0HEAD',
    'config\0--local\0--get\0remote.origin.url', 'status\0--porcelain=v1\0--untracked-files=no',
    'rev-parse\0HEAD', ['rev-list', '--parents', '-n', '1', 'HEAD'].join('\0'), `ls-remote\0--heads\0${ORIGIN}\0refs/heads/${BRANCH}`])
  let limit = simple.has(joined) ? 4096 : null
  if (new RegExp(`^diff-tree\\x00--no-commit-id\\x00--name-status\\x00-r\\x00-z\\x00${sha}\\x00${sha}$`).test(joined)) limit = 16384
  const show = args.length === 2 && args[0] === 'show' && /^([a-f0-9]{40}):(.+)$/.exec(args[1])
  if (show && (show[2] === MANIFEST || Object.hasOwn(policy.gates, show[2]))) limit = 262144
  if (args.length === 5 && args[0] === 'ls-tree' && args[1] === '-z' && /^[a-f0-9]{40}$/.test(args[2])
    && args[3] === '--' && Object.hasOwn(policy.gates, args[4])) limit = 4096
  if (limit === null || maxBuffer !== limit) throw Error('Successor Git unavailable')
  return Object.freeze({ cwd: args[0] === 'ls-remote' ? '/' : ROOT,
    env: Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/var/empty', XDG_CONFIG_HOME: '/var/empty',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '/usr/bin/false', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_EXEC_PATH: EXEC }),
    stdio: Object.freeze(['ignore', 'pipe', 'ignore']), timeout: 15000, maxBuffer })
}
export async function readFixedOwnerSuccessorSource({ handoff, signal, now = Date.now } = {}) {
  if (!OWNER_SUCCESSOR_NATIVE_FIXED_SOURCE_READER_ENABLED) return HOLD
  try {
    if (!signal || signal.aborted || typeof signal.addEventListener !== 'function') return HOLD
    const policy = fixedOwnerSuccessorSourcePolicy(handoff), started = now()
    if (!Number.isSafeInteger(started)) return HOLD
    let last = started
    const readClock = () => {
      const at = now()
      if (signal.aborted || !Number.isSafeInteger(at) || at < last || at - started > 120000) throw Error('Successor Git unavailable')
      last = at; return at
    }
    const runGit = async (args, max) => {
      // Let the fd3 loss watcher and cancellation run between bounded Git reads.
      await yieldToSupervisor(undefined, { signal })
      readClock()
      if (!stagingPreviewGitExecutableReady() || !stagingPreviewGitHttpsHelperReady()) throw Error('Successor Git unavailable')
      const result = spawnSync(GIT, ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'protocol.ext.allow=never', ...args], ownerSuccessorGitProcessOptions(args, max, policy))
      try { await yieldToSupervisor(undefined, { signal }); readClock() }
      catch { result.stdout?.fill?.(0); throw Error('Successor Git unavailable') }
      if (signal.aborted || result.error || result.signal || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
        result.stdout?.fill?.(0); throw Error('Successor Git unavailable')
      }
      return result.stdout
    }
    const result = await verifyOwnerSuccessorArmingSource({ runGit, policy, root: ROOT, now: readClock })
    readClock()
    return result
  } catch { return HOLD }
}
