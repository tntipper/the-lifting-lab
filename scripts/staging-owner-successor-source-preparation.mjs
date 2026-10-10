/** Metadata-only preparation. Exact source/window/approval admission remains in the fixed reader. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync, openSync, writeFileSync, fchmodSync, fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { setImmediate as yieldToSupervisor } from 'node:timers/promises'
import { stagingPreviewGitExecutableReady, stagingPreviewGitHttpsHelperReady } from './staging-preview-git-source-preflight.mjs'
import { WINDOW_ID } from './staging-owner-successor-sql-context.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const GIT = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/bin/git'
const EXEC = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/libexec/git-core'
const HANDOFF = resolve(ROOT, '.agent/owner-successor', WINDOW_ID, 'source-review.json')
const denied = () => { throw Error('Successor source preparation unavailable') }
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
function gitRead(args, maxBuffer) {
  if (!stagingPreviewGitExecutableReady() || !stagingPreviewGitHttpsHelperReady()) denied()
  const result = spawnSync(GIT, ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'protocol.ext.allow=never', ...args], {
    cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/var/empty', XDG_CONFIG_HOME: '/var/empty',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '/usr/bin/false', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_EXEC_PATH: EXEC },
    stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, maxBuffer,
  })
  if (result.error || result.signal || result.status !== 0 || !Buffer.isBuffer(result.stdout)) denied()
  return result.stdout
}
function metadata(path, privateFile = false) {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || realpathSync(path) !== path
    || stat.nlink < 1 || (stat.mode & 0o022) !== 0 || stat.size < 0 || stat.size > (privateFile ? 1024 : 16777216)
    || privateFile && (stat.mode & 0o777) !== 0o600) denied()
  return stat
}
function same(a, b) {
  return ['dev', 'ino', 'nlink', 'mode', 'uid', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])
}
/** Fixed paths only. No executable, root, hash, policy, credential or clock overrides. */
export async function prepareOwnerSuccessorSourceMetadata({ signal } = {}) {
  if (!signal || signal.aborted || typeof signal.addEventListener !== 'function') denied()
  const started = Date.now()
  let last = started
  const checkpoint = async () => {
    await yieldToSupervisor(undefined, { signal })
    const at = Date.now()
    if (signal.aborted || !Number.isSafeInteger(at) || at < last || at - started > 120000) denied()
    last = at
  }
  await checkpoint()
  if (realpathSync(ROOT) !== ROOT) denied()
  const head = gitRead(['rev-parse', 'HEAD'], 4096).toString()
  if (!/^[a-f0-9]{40}\n$/.test(head)) denied()
  await checkpoint()
  const index = gitRead(['ls-files', '-v', '-z'], 262144).toString(), tree = gitRead(['ls-tree', '-r', '-z', 'HEAD'], 262144).toString()
  if (!index.endsWith('\0') || !tree.endsWith('\0')) denied()
  const paths = index.slice(0, -1).split('\0').map(record => { if (!record.startsWith('H ')) denied(); return record.slice(2) })
  if (!paths.length || new Set(paths).size !== paths.length) denied()
  await checkpoint()
  const records = tree.slice(0, -1).split('\0'), files = [], seen = new Set()
  let total = 0
  for (const record of records) {
    if (seen.size % 16 === 0) await checkpoint()
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)$/.exec(record)
    if (!match || seen.has(match[3]) || !paths.includes(match[3]) || match[3].split('/').some(part => !part || part === '.' || part === '..')) denied()
    seen.add(match[3])
    const path = resolve(ROOT, match[3])
    if (!path.startsWith(`${ROOT}/`)) denied()
    const stat = metadata(path), bytes = readFileSync(path)
    total += bytes.length
    if (total > 268435456 || bytes.length !== stat.size || (stat.mode & 0o111) !== (match[1] === '100755' ? 0o111 : 0)
      || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== match[2]
      || !same(stat, metadata(path))) denied()
    files.push({ path, stat, digest: sha256(bytes) })
  }
  if (seen.size !== paths.length) denied()
  const stat = metadata(HANDOFF, true), bytes = readFileSync(HANDOFF), value = JSON.parse(bytes)
  if (!value || Array.isArray(value) || Object.keys(value).sort().join('|') !== 'manifestSha256|reviewedBaseSha'
    || !/^[a-f0-9]{40}$/.test(value.reviewedBaseSha) || !/^[a-f0-9]{64}$/.test(value.manifestSha256)
    || !same(stat, metadata(HANDOFF, true))) denied()
  files.push({ path: HANDOFF, stat, digest: sha256(bytes), privateFile: true })
  let replaced = 0
  // All source bytes and existing permissions are checked before any replacement.
  for (const [offset, file] of files.entries()) {
    if (offset % 16 === 0) await checkpoint()
    const before = metadata(file.path, file.privateFile), bytes = readFileSync(file.path)
    if (!same(before, file.stat) || sha256(bytes) !== file.digest) denied()
    if (before.nlink !== 1) {
      const temporary = resolve(dirname(file.path), `.owner-source-copy-${process.pid}-${replaced}`)
      let fd
      try {
        fd = openSync(temporary, 'wx', before.mode & 0o777)
        writeFileSync(fd, bytes); fchmodSync(fd, before.mode & 0o777); fsyncSync(fd); closeSync(fd); fd = undefined
        if (!same(before, metadata(file.path, file.privateFile))) denied()
        renameSync(temporary, file.path); replaced++
      } finally {
        if (fd !== undefined) closeSync(fd)
        try { unlinkSync(temporary) } catch (error) { if (error.code !== 'ENOENT') throw error }
      }
    }
    const after = metadata(file.path, file.privateFile)
    if (after.nlink !== 1 || (after.mode & 0o777) !== (before.mode & 0o777) || sha256(readFileSync(file.path)) !== file.digest) denied()
  }
  await checkpoint()
  if (gitRead(['rev-parse', 'HEAD'], 4096).toString() !== head
    || gitRead(['status', '--porcelain=v1', '--untracked-files=no'], 4096).length !== 0) denied()
  // A concurrent relink or edit remains a rejection, never an exemption from admission.
  for (const [offset, file] of files.entries()) {
    if (offset % 16 === 0) await checkpoint()
    const after = metadata(file.path, file.privateFile)
    if (after.nlink !== 1 || sha256(readFileSync(file.path)) !== file.digest) denied()
  }
  await checkpoint()
  return Object.freeze({ status: 'SOURCE_METADATA_PREPARED', authorization: 'NONE', replaced })
}
