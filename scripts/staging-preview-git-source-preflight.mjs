#!/usr/bin/env node
/** Fixed, read-only Git proof for a future staging Preview source. No deployment. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const branch = 'codex/tll-integration'
const origin = 'https://github.com/tntipper/the-lifting-lab.git'
const manifestPath = 'config/staging-account-activation-manifest.json'
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
      GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/usr/bin/false', GIT_NO_REPLACE_OBJECTS: '1' }),
    stdio: Object.freeze(['ignore', 'pipe', 'ignore']), timeout: 15_000, maxBuffer,
  })
}

function fixedGit(args, maxBuffer) {
  const result = spawnSync('/usr/bin/git', args, stagingPreviewGitProcessOptions(args, maxBuffer))
  if (result.error || result.status !== 0 || result.signal || !Buffer.isBuffer(result.stdout)) {
    result.stdout?.fill?.(0)
    throw new Error('Git source proof unavailable')
  }
  return result.stdout
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await readStagingPreviewGitSourceProof({ runGit: fixedGit }))}\n`)
}
