import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { verifyOwnerSuccessorArmingSource, readOwnerSuccessorArmingSourceFixed,
  OWNER_SUCCESSOR_SOURCE_SCHEMA } from '../scripts/staging-owner-successor-source-proof.mjs'

const root = '/synthetic/successor', base = 'a'.repeat(40), child = 'b'.repeat(40)
const context = 'scripts/staging-owner-successor-sql-context.mjs'
const worker = 'scripts/staging-owner-successor-worker.mjs'
const edgePath = 'lib/identity/staging-owner-successor-broker-readiness-edge.ts'
const edgeGate = 'OWNER_SUCCESSOR_BROKER_READINESS_ENABLED'
const manifest = Buffer.from('{"synthetic":true}\n')
const start = '2026-10-05T12:00:00.000Z', end = '2026-10-05T13:00:00.000Z'
const time = Date.parse(start), unset = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'
const freeze = p => Object.freeze({ ...p, gates: Object.freeze(Object.fromEntries(
  Object.entries(p.gates).map(([path, names]) => [path, Object.freeze([...names])])) ) })
const policy = freeze({ schema: OWNER_SUCCESSOR_SOURCE_SCHEMA, reviewedBaseSha: base,
  branch: 'codex/tll-integration', origin: 'https://github.com/tntipper/the-lifting-lab.git',
  manifest: 'config/staging-account-activation-manifest.json',
  manifestSha256: createHash('sha256').update(manifest).digest('hex'), contextPath: context,
  gates: { [context]: [], [worker]: ['OWNER_SUCCESSOR_WORKER_ENABLED'], [edgePath]: [edgeGate] } })
const original = { [context]: `export const ACTIVE_WINDOW_STARTED_AT = '${unset}'\nexport const ACTIVE_WINDOW_EXPIRES_AT = '${unset}'\n`,
  [worker]: 'export const OWNER_SUCCESSOR_WORKER_ENABLED = false\n', [edgePath]: `export const ${edgeGate} = false\n` }
const armed = { [context]: `export const ACTIVE_WINDOW_STARTED_AT = '${start}'\nexport const ACTIVE_WINDOW_EXPIRES_AT = '${end}'\n`,
  [worker]: 'export const OWNER_SUCCESSOR_WORKER_ENABLED = true\n', [edgePath]: `export const ${edgeGate} = true\n` }
function fixture({ overrides = {}, originalSource = original, armedSource = armed } = {}) {
  const map = new Map(), key = a => a.join('\0'), put = (a, s) => map.set(key(a), Buffer.from(s))
  put(['rev-parse', '--show-toplevel'], `${root}\n`)
  put(['symbolic-ref', '--quiet', '--short', 'HEAD'], `${policy.branch}\n`)
  put(['config', '--local', '--get', 'remote.origin.url'], `${policy.origin}\n`)
  put(['status', '--porcelain=v1', '--untracked-files=no'], '')
  put(['rev-parse', 'HEAD'], `${child}\n`)
  put(['ls-remote', '--heads', policy.origin, `refs/heads/${policy.branch}`], `${base}\trefs/heads/${policy.branch}\n`)
  put(['rev-list', '--parents', '-n', '1', 'HEAD'], `${child} ${base}\n`)
  put(['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', base, child], `M\0${context}\0M\0${worker}\0M\0${edgePath}\0`)
  put(['show', `${base}:${policy.manifest}`], manifest)
  for (const path of Object.keys(originalSource)) {
    put(['show', `${base}:${path}`], originalSource[path]); put(['show', `${child}:${path}`], armedSource[path])
    for (const ref of [base, child]) put(['ls-tree', '-z', ref, '--', path], `100644 blob ${'c'.repeat(40)}\t${path}\0`)
  }
  for (const [k, value] of Object.entries(overrides)) map.set(k, value)
  const calls = []
  return { calls, runGit: async args => { calls.push([...args]); const value = map.get(key(args));
    if (!value) throw Error('Unexpected fixture request'); return value } }
}
const argsKey = a => a.join('\0')
const verify = async (f = fixture(), extra = {}) => verifyOwnerSuccessorArmingSource({
  runGit: f.runGit, policy, root, now: () => time, ...extra })
test('exact trusted direct child verifies source bytes without authority', async () => {
  assert.deepEqual(await verify(), { status: 'OWNER_SUCCESSOR_SOURCE_VERIFIED', authorization: 'NONE',
    sourceCommit: base, executionCommit: child, manifestSha256: policy.manifestSha256, startedAt: start, expiresAt: end })
})
test('fixed native entry remains disabled without inspecting supplied options', () => {
  assert.equal(readOwnerSuccessorArmingSourceFixed(new Proxy({}, { get() { throw Error('access') } })).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
})
for (const [label, cmd, value] of [
  ['wrong root', ['rev-parse', '--show-toplevel'], '/elsewhere\n'],
  ['wrong branch', ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'main\n'],
  ['wrong origin', ['config', '--local', '--get', 'remote.origin.url'], 'https://example.org/repo\n'],
  ['dirty tracked tree', ['status', '--porcelain=v1', '--untracked-files=no'], ' M scripts/file.mjs\n'],
  ['remote drift', ['ls-remote', '--heads', policy.origin, `refs/heads/${policy.branch}`], `${'d'.repeat(40)}\trefs/heads/${policy.branch}\n`],
  ['indirect child', ['rev-list', '--parents', '-n', '1', 'HEAD'], `${child} ${'d'.repeat(40)}\n`],
  ['merge child', ['rev-list', '--parents', '-n', '1', 'HEAD'], `${child} ${base} ${'d'.repeat(40)}\n`],
  ['extra path', ['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', base, child], `M\0${context}\0M\0${worker}\0M\0scripts/extra.mjs\0`],
  ['rename', ['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', base, child], `R100\0${context}\0${worker}\0`],
  ['symlink tree', ['ls-tree', '-z', child, '--', worker], `120000 blob ${'c'.repeat(40)}\t${worker}\0`],
  ['manifest drift', ['show', `${base}:${policy.manifest}`], '{}\n'],
]) test(`holds on ${label}`, async () => assert.equal((await verify(fixture({ overrides: {
  [argsKey(cmd)]: Buffer.from(value) } }))).status, 'OWNER_SUCCESSOR_SOURCE_HOLD'))
test('extra bytes, skipped gate, duplicate gate or base already armed hold', async () => {
  for (const f of [fixture({ armedSource: { ...armed, [worker]: `${armed[worker]}// extra\n` } }),
    fixture({ armedSource: { ...armed, [worker]: original[worker] } }),
    fixture({ originalSource: { ...original, [worker]: original[worker].repeat(2) } }),
    fixture({ originalSource: armed })]) assert.equal((await verify(f)).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
})
test('canonical duration, start admission and shutdown reserve enforced', async () => {
  for (const expiry of ['2026-10-05T12:44:59.000Z', '2026-10-05T13:00:01.000Z', '2026-10-05T13:00:00Z', '2026-02-30T13:00:00.000Z']) {
    const f = fixture({ armedSource: { ...armed, [context]: armed[context].replace(end, expiry) } })
    assert.equal((await verify(f)).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
  }
  for (const at of [time - 1, time + 45 * 60_000, NaN, Infinity])
    assert.equal((await verify(fixture(), { now: () => at })).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
  assert.equal((await verify(fixture(), { now: () => time + 45 * 60_000 - 1 })).status, 'OWNER_SUCCESSOR_SOURCE_VERIFIED')
})
test('policy must be deeply frozen, exact, fixed target and reviewed base', async () => {
  for (const p of [{ ...policy }, freeze({ ...policy, branch: 'main' }), freeze({ ...policy, reviewedBaseSha: 'd'.repeat(40) }),
    freeze({ ...policy, contextPath: worker }), freeze({ ...policy, extra: true }),
    freeze({ ...policy, gates: { [context]: [], [worker]: ['OWNER_SUCCESSOR_WORKER_ENABLED', 'OWNER_SUCCESSOR_WORKER_ENABLED'] } })]) {
    const f = fixture(); assert.equal((await verify(f, { policy: p })).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
  }
})
test('end-of-read expiry, backwards clock and changed HEAD hold', async () => {
  for (const finish of [time - 1, time + 45 * 60_000]) {
    let count = 0; assert.equal((await verify(fixture(), { now: () => count++ ? finish : time })).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
  }
  const f = fixture(); let heads = 0
  const runGit = async (args, max) => argsKey(args) === argsKey(['rev-parse', 'HEAD']) && heads++
    ? Buffer.from(`${'e'.repeat(40)}\n`) : f.runGit(args, max)
  assert.equal((await verify(f, { runGit })).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
})
test('oversized, nonbuffer and failed Git responses fail closed', async () => {
  for (const runGit of [async () => Buffer.alloc(4097), async () => 'not bytes', async () => { throw Error('failure') }])
    assert.equal((await verify(fixture(), { runGit })).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
})
test('branch, origin or remote drift during source reads hold', async () => {
  for (const changed of [
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    ['config', '--local', '--get', 'remote.origin.url'],
    ['ls-remote', '--heads', policy.origin, `refs/heads/${policy.branch}`],
  ]) {
    const f = fixture(); let seen = 0
    const runGit = async (args, max) => argsKey(args) === argsKey(changed) && seen++
      ? Buffer.from('drift\n') : f.runGit(args, max)
    assert.equal((await verify(f, { runGit })).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
  }
})
test('exact fixed Edge library path can arm only its single declared readiness gate', async () => {
  const p = freeze({ ...policy, gates: { ...policy.gates, [edgePath]: [edgeGate] } })
  const options = { originalSource: { ...original, [edgePath]: `export const ${edgeGate} = false\n` },
    armedSource: { ...armed, [edgePath]: `export const ${edgeGate} = true\n` }, overrides: {
      [argsKey(['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', base, child])]:
        Buffer.from(`M\0${context}\0M\0${worker}\0M\0${edgePath}\0`),
    } }
  assert.equal((await verify(fixture(options), { policy: p })).status, 'OWNER_SUCCESSOR_SOURCE_VERIFIED')
  for (const gates of [{ ...policy.gates, [edgePath]: ['OTHER_EDGE_GATE_ENABLED'] },
    { ...policy.gates, [edgePath]: [edgeGate, 'OTHER_EDGE_GATE_ENABLED'] },
    { ...policy.gates, 'lib/identity/other-edge.ts': [edgeGate] }]) {
    assert.equal((await verify(fixture(options), { policy: freeze({ ...policy, gates }) })).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
  }
  for (const mode of ['120000', '100755']) {
    const f = fixture({ ...options, overrides: { ...options.overrides,
      [argsKey(['ls-tree', '-z', child, '--', edgePath])]: Buffer.from(`${mode} blob ${'c'.repeat(40)}\t${edgePath}\0`),
    } })
    assert.equal((await verify(f, { policy: p })).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
  }
  const extra = fixture({ ...options, armedSource: { ...options.armedSource,
    [edgePath]: `${options.armedSource[edgePath]}// unreviewed byte\n` } })
  assert.equal((await verify(extra, { policy: p })).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
  const wrongDiff = fixture({ ...options, overrides: { ...options.overrides,
    [argsKey(['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', base, child])]:
      Buffer.from(`M\0${context}\0M\0${worker}\0M\0lib/identity/other-edge.ts\0`),
  } })
  assert.equal((await verify(wrongDiff, { policy: p })).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
})
test('missing mandatory Edge path in the policy denies before Git I/O', async () => {
  const gates = { ...policy.gates }; delete gates[edgePath]
  const f = fixture()
  assert.equal((await verify(f, { policy: freeze({ ...policy, gates }) })).status, 'OWNER_SUCCESSOR_SOURCE_HOLD')
  assert.equal(f.calls.length, 0)
})
