#!/usr/bin/env node
/** Fixed, read-only Git proof for a future staging Preview source. No deployment. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const branch = 'codex/tll-integration'
const origin = 'https://github.com/tntipper/the-lifting-lab.git'
const manifestPath = 'config/staging-account-activation-manifest.json'
const gitBinary = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/bin/git'
const gitBinarySha256 = 'ee73b116cc37f44ecdaa9e3fdfbc25ce827675859f5f966ec671112fd5caf074'
const gitExecPath = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/libexec/git-core'
const gitHttpsHelperSha256 = '20dbe4b0aa0c95e234158aef05c706cd88c23a0d84b8cf7810cec4502551491f'
const githubCli = '/Users/tobiastipper/.local/bin/gh'
const githubCliSha256 = 'a38e8ea1b9794a445a1ce746392e36111ca00a3242a6447b49cd4c162cb191a7'
const githubCliConfig = '/Users/tobiastipper/.config/gh'
const hold = () => Object.freeze({ status: 'SOURCE_PROOF_UNAVAILABLE' })
const notRemote = () => Object.freeze({ status: 'SOURCE_NOT_AT_REMOTE' })
const line = bytes => {
  if (!Buffer.isBuffer(bytes) || bytes.length > 4_096) throw new Error('Git source proof unavailable')
  const value = bytes.toString('utf8')
  if (!value.endsWith('\n') || value.slice(0, -1).includes('\n') || value.includes('\r')) throw new Error('Git source proof unavailable')
  return value.slice(0, -1)
}

/** The caller supplies only a Git runner; command vectors and identities are fixed here. */
export async function readStagingPreviewGitSourceProof({ runGit } = {}) {
  if (typeof runGit !== 'function') return hold()
  const read = async (args, maxBuffer = 4_096) => {
    const value = await runGit(Object.freeze(args), maxBuffer)
    if (!Buffer.isBuffer(value) || value.length > maxBuffer) throw new Error('Git source proof unavailable')
    return value
  }
  let committedManifest
  try {
    if (line(await read(['rev-parse', '--show-toplevel'])) !== root
      || line(await read(['symbolic-ref', '--quiet', '--short', 'HEAD'])) !== branch
      || line(await read(['config', '--local', '--get', 'remote.origin.url'])) !== origin) return hold()
    const trackedStatus = await read(['status', '--porcelain=v1', '--untracked-files=no'])
    if (trackedStatus.length !== 0) return hold()
    const local = line(await read(['rev-parse', 'HEAD']))
    if (!/^[a-f0-9]{40}$/.test(local)) return hold()
    const remote = line(await read(['ls-remote', '--heads', origin, `refs/heads/${branch}`]))
    const match = /^([a-f0-9]{40})\trefs\/heads\/codex\/tll-integration$/.exec(remote)
    if (!match) return hold()
    if (local !== match[1]) return notRemote()
    committedManifest = await read(['show', `${local}:${manifestPath}`], 262_144)
    if (committedManifest.length === 0) return hold()
    return Object.freeze({ status: 'SOURCE_PROOF_VERIFIED', sourceCommit: local,
      manifestSha256: createHash('sha256').update(committedManifest).digest('hex') })
  } catch { return hold() } finally { committedManifest?.fill(0) }
}

const fixedCommands = new Set([
  ['rev-parse', '--show-toplevel'], ['symbolic-ref', '--quiet', '--short', 'HEAD'],
  ['config', '--local', '--get', 'remote.origin.url'],
  ['status', '--porcelain=v1', '--untracked-files=no'], ['rev-parse', 'HEAD'],
  ['ls-remote', '--heads', origin, `refs/heads/${branch}`],
].map(args => args.join('\u0000')))

/** Exposed only for offline policy tests; it cannot spawn a process. */
export function stagingPreviewGitProcessOptions(args, maxBuffer) {
  const command = Array.isArray(args) && args.every(value => typeof value === 'string') ? args.join('\u0000') : ''
  const show = /^show\u0000[a-f0-9]{40}:config\/staging-account-activation-manifest\.json$/.test(command)
  if ((!fixedCommands.has(command) && !show) || maxBuffer !== (show ? 262_144 : 4_096)) {
    throw new Error('Git source proof unavailable')
  }
  const remote = args[0] === 'ls-remote'
  return Object.freeze({
    cwd: remote ? '/' : root,
    env: Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/var/empty', XDG_CONFIG_HOME: '/var/empty',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/usr/bin/false', GIT_NO_REPLACE_OBJECTS: '1',
      GIT_NO_LAZY_FETCH: '1',
      GIT_EXEC_PATH: gitExecPath }),
    stdio: Object.freeze(['ignore', 'pipe', 'ignore']), timeout: 15_000, maxBuffer,
  })
}

/** The live read runner supplies neither path nor digest from caller input. */
export function stagingPreviewGitExecutableReady({ path = gitBinary, sha256 = gitBinarySha256 } = {}) {
  try {
    if (typeof path !== 'string' || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) return false
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path
      || stat.uid !== process.getuid() || (stat.mode & 0o022) !== 0) return false
    const bytes = readFileSync(path)
    try { return createHash('sha256').update(bytes).digest('hex') === sha256 } finally { bytes.fill(0) }
  } catch { return false }
}

export function stagingPreviewGitHttpsHelperReady() {
  try {
    const directory = lstatSync(gitExecPath)
    const link = lstatSync(`${gitExecPath}/git-remote-https`)
    if (!directory.isDirectory() || directory.isSymbolicLink() || realpathSync(gitExecPath) !== gitExecPath
      || directory.uid !== process.getuid() || (directory.mode & 0o022) !== 0
      || !link.isSymbolicLink() || readlinkSync(`${gitExecPath}/git-remote-https`) !== 'git-remote-http') return false
    return stagingPreviewGitExecutableReady({ path: `${gitExecPath}/git-remote-http`, sha256: gitHttpsHelperSha256 })
  } catch { return false }
}

/** Push-only prerequisite; never opens the credential store or prints a token. */
export function stagingPreviewGithubCliReady() {
  try {
    const directory = lstatSync(githubCliConfig)
    const hosts = lstatSync(`${githubCliConfig}/hosts.yml`)
    return stagingPreviewGitExecutableReady({ path: githubCli, sha256: githubCliSha256 })
      && directory.isDirectory() && !directory.isSymbolicLink()
      && realpathSync(githubCliConfig) === githubCliConfig
      && directory.uid === process.getuid() && (directory.mode & 0o022) === 0
      && hosts.isFile() && !hosts.isSymbolicLink() && hosts.nlink === 1
      && hosts.uid === process.getuid() && (hosts.mode & 0o077) === 0
  } catch { return false }
}

function fixedGit(args, maxBuffer) {
  if (!stagingPreviewGitExecutableReady() || !stagingPreviewGitHttpsHelperReady()) {
    throw new Error('Git source proof unavailable')
  }
  const result = spawnSync(gitBinary, args, stagingPreviewGitProcessOptions(args, maxBuffer))
  if (result.error || result.status !== 0 || result.signal || !Buffer.isBuffer(result.stdout)) {
    result.stdout?.fill?.(0)
    throw new Error('Git source proof unavailable')
  }
  return result.stdout
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await readStagingPreviewGitSourceProof({ runGit: fixedGit }))}\n`)
}
