/** Read-only proof for the one local Gen23 arming commit. No credentials or hosted writes. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stagingPreviewGitExecutableReady, stagingPreviewGitHttpsHelperReady } from './staging-preview-git-source-preflight.mjs'

const ROOT = resolve(import.meta.dirname, '..')
// This module is a read-only proof. The explicit OFF marker satisfies the
// repository-wide Gen23 guard inventory without authorising any action.
export const STAGING_GENERATION_23_ARMING_SOURCE_PROOF_ENABLED = false
const GIT = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/bin/git'
const GIT_EXEC_PATH = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/libexec/git-core'
const POLICY_PATH = resolve(ROOT, 'config/staging-generation-23-arming-policy.json')
const HOLD = Object.freeze({ status: 'GEN23_ARMING_SOURCE_HOLD' })
const SHA = /^[a-f0-9]{40}$/
const PATH = /^scripts\/[a-z0-9-]+\.mjs$/
const GATE = /^[A-Z][A-Z0-9_]*(?:ENABLED|ARMED)$/
const line = bytes => {
  if (!Buffer.isBuffer(bytes) || bytes.length > 4096) throw Error('Git proof unavailable')
  const value = bytes.toString('utf8')
  if (!value.endsWith('\n') || value.slice(0, -1).includes('\n') || value.includes('\r')) throw Error('Git proof unavailable')
  return value.slice(0, -1)
}
const unique = values => new Set(values).size === values.length

function policyValid(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('|') !== 'branch|expiry|gates|manifest|origin|schema'
    || value.schema !== 'tll-staging-generation-23-arming-policy/v1'
    || value.branch !== 'codex/tll-integration'
    || value.origin !== 'https://github.com/tntipper/the-lifting-lab.git'
    || value.manifest !== 'config/staging-account-activation-manifest.json'
    || !value.expiry || Object.keys(value.expiry).sort().join('|') !== 'name|path'
    || value.expiry.path !== 'scripts/staging-generation-23-credentials.mjs'
    || value.expiry.name !== 'ACTIVE_WINDOW_EXPIRES_AT'
    || !value.gates || typeof value.gates !== 'object' || Array.isArray(value.gates)) return false
  const paths = Object.keys(value.gates)
  return paths.length >= 1 && paths.length <= 80 && unique(paths) && paths.every(path => PATH.test(path)
    && Array.isArray(value.gates[path]) && value.gates[path].length >= 1
    && value.gates[path].length <= 8 && unique(value.gates[path])
    && value.gates[path].every(name => GATE.test(name)))
}

function replaceOnce(source, before, after) {
  const at = source.indexOf(before)
  if (at < 0 || source.indexOf(before, at + before.length) >= 0) throw Error('Arming pattern unavailable')
  return source.slice(0, at) + after + source.slice(at + before.length)
}

function expectedArmedBytes(base, gates, expiry, expiresAt) {
  if (!Buffer.isBuffer(base) || base.length < 1 || base.length > 262144) throw Error('Source unavailable')
  const source = base.toString('utf8')
  if (!Buffer.from(source, 'utf8').equals(base)) throw Error('Source encoding unavailable')
  let expected = source
  for (const name of gates) {
    if ([...source.matchAll(new RegExp(`^export const ${name} = `, 'gm'))].length !== 1) {
      throw Error('Duplicate gate unavailable')
    }
    expected = replaceOnce(expected, `export const ${name} = false\n`, `export const ${name} = true\n`)
  }
  if (expiry) {
    if ([...source.matchAll(/^export const ACTIVE_WINDOW_EXPIRES_AT = /gm)].length !== 1) {
      throw Error('Duplicate expiry unavailable')
    }
    expected = replaceOnce(expected,
      "export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'\n",
      `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'\n`)
  }
  return Buffer.from(expected, 'utf8')
}

/** Injected Git port permits an offline test; the fixed entry below supplies the real binary. */
export async function verifyStagingGeneration23ArmingSource({ runGit, policy, root = ROOT,
  now = Date.now } = {}) {
  if (typeof runGit !== 'function' || !policyValid(policy) || typeof now !== 'function') return HOLD
  const read = async (args, limit = 4096) => {
    const result = await runGit(Object.freeze(args), limit)
    if (!Buffer.isBuffer(result) || result.length > limit) throw Error('Git proof unavailable')
    return result
  }
  try {
    if (line(await read(['rev-parse', '--show-toplevel'])) !== root
      || line(await read(['symbolic-ref', '--quiet', '--short', 'HEAD'])) !== policy.branch
      || line(await read(['config', '--local', '--get', 'remote.origin.url'])) !== policy.origin
      || (await read(['status', '--porcelain=v1', '--untracked-files=no'])).length !== 0) return HOLD
    const head = line(await read(['rev-parse', 'HEAD']))
    if (!SHA.test(head)) return HOLD
    const remoteLine = line(await read(['ls-remote', '--heads', policy.origin, `refs/heads/${policy.branch}`]))
    const remoteMatch = /^([a-f0-9]{40})\trefs\/heads\/codex\/tll-integration$/.exec(remoteLine)
    if (!remoteMatch) return HOLD
    const sourceCommit = remoteMatch[1]
    let expiresAt = null
    const expectedPaths = Object.keys(policy.gates).sort()
    if (head !== sourceCommit) {
      if (line(await read(['rev-list', '--parents', '-n', '1', 'HEAD'])) !== `${head} ${sourceCommit}`) return HOLD
      const raw = await read(['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', sourceCommit, head], 16384)
      const records = raw.toString('utf8').split('\0')
      if (records.pop() !== '' || records.length % 2 !== 0) return HOLD
      const changed = []
      for (let i = 0; i < records.length; i += 2) {
        if (records[i] !== 'M' || !PATH.test(records[i + 1])) return HOLD
        changed.push(records[i + 1])
      }
      if (!unique(changed) || changed.sort().join('\0') !== expectedPaths.join('\0')) return HOLD
      // The expiry is deliberately limited to the same one-hour window as the hosted runner.
      const expiryHead = await read(['show', `${head}:${policy.expiry.path}`], 262144)
      const expiryMatches = [...expiryHead.toString('utf8').matchAll(/^export const ACTIVE_WINDOW_EXPIRES_AT = '([^']+)'$/gm)]
      if (expiryMatches.length !== 1) return HOLD
      expiresAt = expiryMatches[0][1]
      const current = now()
      if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(expiresAt)
        || !Number.isFinite(current) || !Number.isFinite(Date.parse(expiresAt))
        || Date.parse(expiresAt) <= current || Date.parse(expiresAt) - current > 3600000) return HOLD
      for (const path of expectedPaths) {
        const [base, armed, baseTree, armedTree] = await Promise.all([
          read(['show', `${sourceCommit}:${path}`], 262144),
          read(['show', `${head}:${path}`], 262144),
          read(['ls-tree', '-z', sourceCommit, '--', path], 4096),
          read(['ls-tree', '-z', head, '--', path], 4096),
        ])
        if (!/^100644 blob [a-f0-9]{40}\t[^\0]+\0$/.test(baseTree.toString('utf8'))
          || !/^100644 blob [a-f0-9]{40}\t[^\0]+\0$/.test(armedTree.toString('utf8'))
          || !baseTree.toString('utf8').endsWith(`\t${path}\0`)
          || !armedTree.toString('utf8').endsWith(`\t${path}\0`)) return HOLD
        const expected = expectedArmedBytes(base, policy.gates[path], path === policy.expiry.path, expiresAt)
        if (!expected.equals(armed)) return HOLD
      }
    } else {
      // A published commit counts as disarmed only when every listed gate and
      // the one window expiry are still at their exact disabled declarations.
      for (const path of expectedPaths) {
        const source = await read(['show', `${sourceCommit}:${path}`], 262144)
        expectedArmedBytes(source, policy.gates[path], path === policy.expiry.path,
          '2026-01-01T00:00:00.000Z')
      }
    }
    const manifest = await read(['show', `${sourceCommit}:${policy.manifest}`], 262144)
    if (manifest.length < 1) return HOLD
    return Object.freeze({ status: 'GEN23_ARMING_SOURCE_VERIFIED', sourceCommit,
      executionCommit: head, manifestSha256: createHash('sha256').update(manifest).digest('hex'), expiresAt })
  } catch { return HOLD }
}

function fixedGit(args, maxBuffer) {
  if (!stagingPreviewGitExecutableReady() || !stagingPreviewGitHttpsHelperReady()) throw Error('Git unavailable')
  const remote = args[0] === 'ls-remote'
  const result = spawnSync(GIT, args, {
    cwd: remote ? '/' : ROOT,
    env: { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/var/empty', XDG_CONFIG_HOME: '/var/empty',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/usr/bin/false', GIT_NO_REPLACE_OBJECTS: '1',
      GIT_NO_LAZY_FETCH: '1', GIT_EXEC_PATH },
    stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, maxBuffer,
  })
  if (result.error || result.status !== 0 || result.signal || !Buffer.isBuffer(result.stdout)) throw Error('Git unavailable')
  return result.stdout
}

export function readStagingGeneration23ArmingSourceFixed() {
  try {
    const policy = JSON.parse(readFileSync(POLICY_PATH, 'utf8'))
    return verifyStagingGeneration23ArmingSource({ runGit: fixedGit, policy })
  } catch { return Promise.resolve(HOLD) }
}
