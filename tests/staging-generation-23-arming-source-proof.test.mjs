import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { verifyStagingGeneration23ArmingSource } from '../scripts/staging-generation-23-arming-source-proof.mjs'

const root = '/synthetic/gen23'
const base = 'a'.repeat(40)
const child = 'b'.repeat(40)
const expiry = '2026-09-27T15:30:00.000Z'
const now = () => Date.parse('2026-09-27T15:00:00.000Z')
const first = 'scripts/staging-generation-23-credentials.mjs'
const second = 'scripts/staging-generation-23-worker-entry.mjs'
const manifest = Buffer.from('{"synthetic":true}\n')
const policy = {
  schema: 'tll-staging-generation-23-arming-policy/v1', branch: 'codex/tll-integration',
  origin: 'https://github.com/tntipper/the-lifting-lab.git',
  manifest: 'config/staging-account-activation-manifest.json',
  expiry: { path: first, name: 'ACTIVE_WINDOW_EXPIRES_AT' },
  gates: {
    [first]: ['STAGING_GENERATION_23_CREDENTIALS_ENABLED'],
    [second]: ['STAGING_GENERATION_23_WORKER_ENTRY_ENABLED', 'STAGING_GENERATION_23_WORKER_CLI_ARMED'],
  },
}
const originals = {
  [first]: Buffer.from("export const STAGING_GENERATION_23_CREDENTIALS_ENABLED = false\nexport const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'\n"),
  [second]: Buffer.from('export const STAGING_GENERATION_23_WORKER_ENTRY_ENABLED = false\nexport const STAGING_GENERATION_23_WORKER_CLI_ARMED = false\n'),
}
const armed = {
  [first]: Buffer.from(`export const STAGING_GENERATION_23_CREDENTIALS_ENABLED = true\nexport const ACTIVE_WINDOW_EXPIRES_AT = '${expiry}'\n`),
  [second]: Buffer.from('export const STAGING_GENERATION_23_WORKER_ENTRY_ENABLED = true\nexport const STAGING_GENERATION_23_WORKER_CLI_ARMED = true\n'),
}
const key = args => args.join('\0')
const put = (map, args, value) => map.set(key(args), Buffer.isBuffer(value) ? value : Buffer.from(value))

function fixture({ selected = child, dirty = false, changed = armed,
  remote = base, paths = [first, second], parent = base } = {}) {
  const map = new Map()
  put(map, ['rev-parse', '--show-toplevel'], `${root}\n`)
  put(map, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'codex/tll-integration\n')
  put(map, ['config', '--local', '--get', 'remote.origin.url'], `${policy.origin}\n`)
  put(map, ['status', '--porcelain=v1', '--untracked-files=no'], dirty ? ' M scripts/example.mjs\n' : '')
  put(map, ['rev-parse', 'HEAD'], `${selected}\n`)
  put(map, ['ls-remote', '--heads', policy.origin, 'refs/heads/codex/tll-integration'],
    `${remote}\trefs/heads/codex/tll-integration\n`)
  put(map, ['rev-list', '--parents', '-n', '1', 'HEAD'], `${selected} ${parent}\n`)
  put(map, ['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', remote, selected],
    Buffer.from(paths.map(path => `M\0${path}\0`).join('')))
  for (const path of [first, second]) {
    put(map, ['show', `${remote}:${path}`], originals[path])
    if (selected !== remote) put(map, ['show', `${selected}:${path}`], changed[path])
    for (const ref of [remote, selected]) put(map, ['ls-tree', '-z', ref, '--', path],
      `100644 blob ${'c'.repeat(40)}\t${path}\0`)
  }
  put(map, ['show', `${remote}:${policy.manifest}`], manifest)
  return async (args, maxBuffer) => {
    const value = map.get(key(args))
    if (!value || value.length > maxBuffer) throw Error(`Unexpected Git read: ${key(args)}`)
    return Buffer.from(value)
  }
}

test('accepts one direct child containing only every declared gate and the expiry', async () => {
  const result = await verifyStagingGeneration23ArmingSource({ runGit: fixture(), policy, root, now })
  assert.deepEqual(result, {
    status: 'GEN23_ARMING_SOURCE_VERIFIED', sourceCommit: base, executionCommit: child,
    manifestSha256: createHash('sha256').update(manifest).digest('hex'), expiresAt: expiry,
  })
})

test('accepts the exact disarmed remote commit with its committed manifest', async () => {
  const result = await verifyStagingGeneration23ArmingSource({ runGit: fixture({ selected: base }), policy, root, now })
  assert.equal(result.status, 'GEN23_ARMING_SOURCE_VERIFIED')
  assert.equal(result.sourceCommit, base)
  assert.equal(result.expiresAt, null)
})

test('published source with an already active gate is not a disarmed base', async () => {
  const normal = fixture({ selected: base })
  const runGit = async (args, limit) => args.join('\0') === ['show', `${base}:${second}`].join('\0')
    ? Buffer.from(armed[second]) : normal(args, limit)
  const result = await verifyStagingGeneration23ArmingSource({ runGit, policy, root, now })
  assert.equal(result.status, 'GEN23_ARMING_SOURCE_HOLD')
})

test('holds on an extra source byte, a missing listed gate, or an added path', async () => {
  for (const options of [
    { changed: { ...armed, [second]: Buffer.concat([armed[second], Buffer.from('// extra\n')]) } },
    { changed: { ...armed, [second]: originals[second] } },
    { paths: [first, second, 'scripts/extra.mjs'] },
  ]) {
    const result = await verifyStagingGeneration23ArmingSource({ runGit: fixture(options), policy, root, now })
    assert.equal(result.status, 'GEN23_ARMING_SOURCE_HOLD')
  }
})

test('holds on remote drift, dirty tracked tree, indirect child, or stale expiry', async () => {
  for (const options of [{ remote: 'd'.repeat(40) }, { dirty: true }, { parent: 'e'.repeat(40) }]) {
    const result = await verifyStagingGeneration23ArmingSource({ runGit: fixture(options), policy, root, now })
    assert.equal(result.status, 'GEN23_ARMING_SOURCE_HOLD')
  }
  const result = await verifyStagingGeneration23ArmingSource({ runGit: fixture(), policy, root,
    now: () => Date.parse('2026-09-27T16:00:00.000Z') })
  assert.equal(result.status, 'GEN23_ARMING_SOURCE_HOLD')
})
