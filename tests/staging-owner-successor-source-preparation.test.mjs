/** Synthetic source/window only; actual reserved parent, fd3 child and native admission guards. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync, cpSync, chmodSync, linkSync, lstatSync, unlinkSync, symlinkSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { createSuccessorDefaultQualificationSource } from './fixtures/owner-successor-default-qualification.mjs'
const reviewPath = root => join(root, '.agent/owner-successor/cd4130c8-a8b8-462b-bdbe-5c3e6250a02d')
function fixture() {
  const copy = createSuccessorDefaultQualificationSource(), directory = reviewPath(copy.root)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const handoff = join(directory, 'source-review.json')
  writeFileSync(handoff, JSON.stringify({ reviewedBaseSha: copy.proof.sourceCommit, manifestSha256: copy.proof.manifestSha256 }), { mode: 0o600 })
  // The preload's relative root matches its normal tests/fixtures location.
  mkdirSync(join(copy.root, 'tests/fixtures'), { recursive: true })
  cpSync(new URL('./fixtures/owner-successor-admission-denial.mjs', import.meta.url), join(copy.root, 'tests/fixtures/owner-successor-admission-denial.mjs'))
  writeFileSync(join(copy.root, 'qualification-admission-case.json'), JSON.stringify({ expired: false }))
  return { copy, handoff }
}
function route(f) {
  const result = spawnSync(process.execPath, ['--import', join(f.copy.root, 'tests/fixtures/owner-successor-admission-denial.mjs'), join(f.copy.root, 'scripts/staging-owner-successor-reserved-entry.mjs')], {
    cwd: f.copy.root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000, maxBuffer: 65536,
  })
  assert.equal(result.error, undefined, result.stderr.toString())
  assert.equal(result.status, 1, result.stderr.toString())
  assert.deepEqual(JSON.parse(result.stdout), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
  const path = join(f.copy.root, 'qualification-admission-events.jsonl')
  return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
}
test('actual reserved parent and fd3 child repair links, verify exact source and stop at credential boundary', { timeout: 210000 }, () => {
  for (let round = 0; round < 3; round++) {
    const f = fixture()
    try {
      const policy = join(f.copy.root, 'config/staging-owner-successor-source-policy.json')
      const original = [readFileSync(policy), readFileSync(f.handoff)]
      const paths = [policy, f.handoff]
      paths.forEach((path, index) => linkSync(path, join(f.copy.root, `.parent-stress-${index}`)))
      const events = route(f), spawn = events.find(e => e.event === 'fixed_supervisor_spawn'), child = events.find(e => e.event === 'real_child_started')
      assert.ok(spawn && child && spawn.pid !== child.pid)
      assert.ok(events.some(e => e.event === 'child_links_injected'))
      assert.ok(events.some(e => e.event === 'credential_boundary_denied' && e.pid === child.pid))
      assert.ok(!events.some(e => ['hosted_fetch_denied', 'external_process_denied', 'unexpected_sync_transport_denied'].includes(e.event)))
      const ownership = JSON.parse(readFileSync(join(reviewPath(f.copy.root), 'worker-ownership.json')))
      assert.equal(ownership.pid, child.pid); assert.equal(ownership.supervisorPid, spawn.pid)
      assert.equal(ownership.identity.executionCommit, f.copy.proof.executionCommit)
      assert.equal(ownership.identity.sourceCommit, f.copy.proof.sourceCommit)
      assert.equal(lstatSync(policy).nlink, 1); assert.equal(lstatSync(f.handoff).nlink, 1)
      assert.deepEqual(readFileSync(policy), original[0]); assert.deepEqual(readFileSync(f.handoff), original[1])
      assert.equal(lstatSync(f.handoff).mode & 0o777, 0o600)
      assert.equal(f.copy.git(['status', '--porcelain=v1', '--untracked-files=no']), '')
    } finally { f.copy.dispose() }
  }
})
for (const name of ['mode', 'binding', 'symlink', 'tracked drift', 'expired']) test(`actual route rejects ${name} before child or credentials`, { timeout: 90000 }, () => {
  const f = fixture()
  try {
    if (name === 'mode') chmodSync(f.handoff, 0o644)
    if (name === 'binding') writeFileSync(f.handoff, JSON.stringify({ reviewedBaseSha: '0'.repeat(40), manifestSha256: f.copy.proof.manifestSha256 }))
    if (name === 'symlink') { const alias = join(f.copy.root, 'invalid-handoff-alias'); cpSync(f.handoff, alias); unlinkSync(f.handoff); symlinkSync(alias, f.handoff) }
    if (name === 'tracked drift') writeFileSync(join(f.copy.root, 'scripts/staging-owner-successor-reserved-entry.mjs'), readFileSync(join(f.copy.root, 'scripts/staging-owner-successor-reserved-entry.mjs'), 'utf8') + '\n// rejected drift\n')
    if (name === 'expired') writeFileSync(join(f.copy.root, 'qualification-admission-case.json'), JSON.stringify({ expired: true, expiredAt: Date.parse(f.copy.proof.expiresAt) + 1 }))
    const events = route(f)
    assert.ok(!events.some(e => ['fixed_supervisor_spawn', 'credential_boundary_denied', 'hosted_fetch_denied', 'external_process_denied'].includes(e.event)))
    assert.equal(existsSync(join(reviewPath(f.copy.root), 'worker-ownership.json')), false)
  } finally { f.copy.dispose() }
})
test('preparation rejects cancellation without admitting source', async () => {
  const f = fixture()
  try {
    const preparation = await f.copy.import('staging-owner-successor-source-preparation.mjs'), controller = new AbortController()
    controller.abort()
    await assert.rejects(preparation.prepareOwnerSuccessorSourceMetadata({ signal: controller.signal }), /unavailable/)
  } finally { f.copy.dispose() }
})

test('exclusive-copy collision preserves pre-existing evidence and rejects preparation', async () => {
  const f = fixture()
  try {
    linkSync(f.handoff, join(f.copy.root, 'collision-source-alias'))
    const temporary = join(dirname(f.handoff), `.owner-source-copy-${process.pid}-0`)
    const evidence = Buffer.from('pre-existing evidence must survive\n')
    writeFileSync(temporary, evidence, { flag: 'wx', mode: 0o600 })
    const preparation = await f.copy.import('staging-owner-successor-source-preparation.mjs')
    await assert.rejects(preparation.prepareOwnerSuccessorSourceMetadata({ signal: new AbortController().signal }), { code: 'EEXIST' })
    assert.deepEqual(readFileSync(temporary), evidence)
    assert.equal(lstatSync(f.handoff).nlink, 2)
    assert.equal(existsSync(join(reviewPath(f.copy.root), 'worker-ownership.json')), false)
    assert.equal(f.copy.git(['status', '--porcelain=v1', '--untracked-files=no']), '')
  } finally { f.copy.dispose() }
})
