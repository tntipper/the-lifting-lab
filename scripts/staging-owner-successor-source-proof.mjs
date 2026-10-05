/** Read-only exact-byte successor proof. Injected Git only; never grants execution authority. */
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

export const OWNER_SUCCESSOR_SOURCE_PROOF_ENABLED = false
export const OWNER_SUCCESSOR_SOURCE_SCHEMA = 'tll-owner-successor-source-policy/v1'
const ROOT = resolve(import.meta.dirname, '..')
const ORIGIN = 'https://github.com/tntipper/the-lifting-lab.git'
const BRANCH = 'codex/tll-integration'
const CONTEXT = 'scripts/staging-owner-successor-sql-context.mjs'
const MANIFEST = 'config/staging-account-activation-manifest.json'
const UNSET = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'
const HOLD = Object.freeze({ status: 'OWNER_SUCCESSOR_SOURCE_HOLD', authorization: 'NONE' })
const SHA = /^[a-f0-9]{40}$/
const PATH = /^scripts\/[a-z0-9-]+\.mjs$/
const EDGE_PATH = 'lib/identity/staging-owner-successor-broker-readiness-edge.ts'
const EDGE_GATE = 'OWNER_SUCCESSOR_BROKER_READINESS_ENABLED'
const allowedPath = path => PATH.test(path) || path === EDGE_PATH
const GATE = /^[A-Z][A-Z0-9_]*(?:ENABLED|ARMED)$/
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join('|') === [...keys].sort().join('|')
const unique = values => new Set(values).size === values.length
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const line = bytes => {
  const value = bytes.toString('utf8')
  if (!Buffer.from(value).equals(bytes) || !value.endsWith('\n') || value.slice(0, -1).includes('\n')
    || value.includes('\r')) throw Error('Successor Git proof unavailable')
  return value.slice(0, -1)
}
function validPolicy(v) {
  if (!exact(v, ['schema', 'reviewedBaseSha', 'branch', 'origin', 'manifest', 'manifestSha256', 'contextPath', 'gates'])
    || !Object.isFrozen(v) || v.schema !== OWNER_SUCCESSOR_SOURCE_SCHEMA || !SHA.test(v.reviewedBaseSha)
    || v.branch !== BRANCH || v.origin !== ORIGIN || v.manifest !== MANIFEST || v.contextPath !== CONTEXT
    || !/^[a-f0-9]{64}$/.test(v.manifestSha256) || !v.gates || !Object.isFrozen(v.gates)
    || typeof v.gates !== 'object' || Array.isArray(v.gates)) return false
  const paths = Object.keys(v.gates)
  return paths.length >= 1 && paths.length <= 80 && paths.includes(CONTEXT)
    && paths.some(p => v.gates[p]?.length > 0) && paths.every(p => allowedPath(p)
      && Array.isArray(v.gates[p]) && Object.isFrozen(v.gates[p]) && v.gates[p].length <= 8
      && (p === CONTEXT || v.gates[p].length > 0) && unique(v.gates[p]) && v.gates[p].every(n => GATE.test(n)))
    && Object.hasOwn(v.gates, EDGE_PATH)
    && v.gates[EDGE_PATH].length === 1 && v.gates[EDGE_PATH][0] === EDGE_GATE
    && unique(paths.flatMap(p => v.gates[p]))
}
function sourceText(bytes) {
  const text = bytes.toString('utf8')
  if (!bytes.length || !Buffer.from(text).equals(bytes)) throw Error('Successor source encoding unavailable')
  return text
}
function declaration(text, name) {
  const matches = [...text.matchAll(new RegExp(`^export const ${name} = '([^']+)'$`, 'gm'))]
  if (matches.length !== 1 || [...text.matchAll(new RegExp(`^export const ${name} = `, 'gm'))].length !== 1)
    throw Error('Successor declaration unavailable')
  return matches[0][1]
}
function replaceOnce(text, before, after) {
  const at = text.indexOf(before)
  if (at < 0 || text.indexOf(before, at + before.length) >= 0) throw Error('Successor arming pattern unavailable')
  return text.slice(0, at) + after + text.slice(at + before.length)
}
const canonical = value => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(value)
  && Number.isSafeInteger(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value
const validWindow = (start, end, at) => canonical(start) && canonical(end) && Number.isSafeInteger(at)
  && Date.parse(end) - Date.parse(start) >= 45 * 60_000
  && Date.parse(end) - Date.parse(start) <= 60 * 60_000
  && at >= Date.parse(start) && at < Date.parse(end) - 15 * 60_000
function armedBytes(bytes, gates, context, start, end) {
  const source = sourceText(bytes)
  let expected = source
  for (const name of gates) {
    if ([...source.matchAll(new RegExp(`^export const ${name} = `, 'gm'))].length !== 1)
      throw Error('Successor duplicate gate unavailable')
    expected = replaceOnce(expected, `export const ${name} = false\n`, `export const ${name} = true\n`)
  }
  if (context) {
    for (const [name, value] of [['ACTIVE_WINDOW_STARTED_AT', start], ['ACTIVE_WINDOW_EXPIRES_AT', end]]) {
      if (declaration(source, name) !== UNSET) throw Error('Successor base already armed')
      expected = replaceOnce(expected, `export const ${name} = '${UNSET}'\n`, `export const ${name} = '${value}'\n`)
    }
  }
  return Buffer.from(expected)
}
/**
 * The reviewed fixed worker owns this deeply frozen policy and trusted Git port.
 * An arbitrary caller's policy or matching receipt cannot establish approval.
 * No default Git transport exists, and this verifier does not read credentials.
 */
export async function verifyOwnerSuccessorArmingSource({ runGit, policy, root = ROOT, now = Date.now } = {}) {
  if (!validPolicy(policy) || typeof runGit !== 'function' || typeof now !== 'function'
    || typeof root !== 'string' || resolve(root) !== root) return HOLD
  const read = async (args, max = 4096) => {
    const bytes = await runGit(Object.freeze(args), max)
    if (!Buffer.isBuffer(bytes) || bytes.length > max) throw Error('Successor Git response unavailable')
    return bytes
  }
  const clean = async head => line(await read(['rev-parse', 'HEAD'])) === head
    && (await read(['status', '--porcelain=v1', '--untracked-files=no'])).length === 0
  try {
    if (line(await read(['rev-parse', '--show-toplevel'])) !== root
      || line(await read(['symbolic-ref', '--quiet', '--short', 'HEAD'])) !== BRANCH
      || line(await read(['config', '--local', '--get', 'remote.origin.url'])) !== ORIGIN
      || (await read(['status', '--porcelain=v1', '--untracked-files=no'])).length !== 0) return HOLD
    const head = line(await read(['rev-parse', 'HEAD'])), base = policy.reviewedBaseSha
    if (!SHA.test(head) || head === base
      || line(await read(['ls-remote', '--heads', ORIGIN, `refs/heads/${BRANCH}`])) !== `${base}\trefs/heads/${BRANCH}`
      || line(await read(['rev-list', '--parents', '-n', '1', 'HEAD'])) !== `${head} ${base}`) return HOLD
    const paths = Object.keys(policy.gates).sort()
    const raw = (await read(['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', base, head], 16384)).toString('utf8')
    const fields = raw.split('\0'), changed = []
    if (fields.pop() !== '' || fields.length % 2) return HOLD
    for (let i = 0; i < fields.length; i += 2) {
      if (fields[i] !== 'M' || !allowedPath(fields[i + 1])) return HOLD
      changed.push(fields[i + 1])
    }
    if (!unique(changed) || changed.sort().join('|') !== paths.join('|')) return HOLD
    const context = sourceText(await read(['show', `${head}:${CONTEXT}`], 262144))
    const startedAt = declaration(context, 'ACTIVE_WINDOW_STARTED_AT'), expiresAt = declaration(context, 'ACTIVE_WINDOW_EXPIRES_AT')
    const began = now()
    if (!validWindow(startedAt, expiresAt, began)) return HOLD
    for (const path of paths) {
      const [before, after, baseTree, childTree] = await Promise.all([
        read(['show', `${base}:${path}`], 262144), read(['show', `${head}:${path}`], 262144),
        read(['ls-tree', '-z', base, '--', path]), read(['ls-tree', '-z', head, '--', path]),
      ])
      const tree = bytes => bytes.at(-1) === 0
        && new RegExp(`^100644 blob [a-f0-9]{40}\\t${path.replaceAll('.', '\\.')}\\x00$`).test(bytes.toString('utf8'))
      if (!tree(baseTree) || !tree(childTree)
        || !armedBytes(before, policy.gates[path], path === CONTEXT, startedAt, expiresAt).equals(after)) return HOLD
    }
    const manifest = await read(['show', `${base}:${MANIFEST}`], 262144)
    const finished = now()
    if (!manifest.length || digest(manifest) !== policy.manifestSha256 || finished < began
      || !validWindow(startedAt, expiresAt, finished) || !await clean(head)
      || line(await read(['symbolic-ref', '--quiet', '--short', 'HEAD'])) !== BRANCH
      || line(await read(['config', '--local', '--get', 'remote.origin.url'])) !== ORIGIN
      || line(await read(['ls-remote', '--heads', ORIGIN, `refs/heads/${BRANCH}`])) !== `${base}\trefs/heads/${BRANCH}`) return HOLD
    const finalAt = now()
    if (finalAt < finished || !validWindow(startedAt, expiresAt, finalAt)) return HOLD
    return Object.freeze({ status: 'OWNER_SUCCESSOR_SOURCE_VERIFIED', authorization: 'NONE',
      sourceCommit: base, executionCommit: head, manifestSha256: policy.manifestSha256, startedAt, expiresAt })
  } catch { return HOLD }
}

/** Native entry remains unavailable; a gate flip alone does not supply a transport or authority. */
export function readOwnerSuccessorArmingSourceFixed(options) {
  if (!OWNER_SUCCESSOR_SOURCE_PROOF_ENABLED) return HOLD
  return import('./staging-owner-successor-fixed-source-reader.mjs')
    .then(module => module.readFixedOwnerSuccessorSource(options)).catch(() => HOLD)
}
