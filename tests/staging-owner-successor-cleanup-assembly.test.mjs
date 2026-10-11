import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createOwnerSuccessorFixedCleanupAssembly, readOwnerSuccessorCleanupAdmission } from '../scripts/staging-owner-successor-cleanup-assembly.mjs'

const startedAt = '2030-01-01T12:00:00.000Z', expiresAt = '2030-01-01T13:00:00.000Z'
const at = Date.parse(startedAt) + 60_000
const proof = Object.freeze({ status: 'OWNER_SUCCESSOR_SOURCE_VERIFIED', authorization: 'NONE',
  sourceCommit: 'a'.repeat(40), executionCommit: 'b'.repeat(40), manifestSha256: 'c'.repeat(64), startedAt, expiresAt })
const credentials = () => ({ managementToken: Buffer.from(`sbp_${'a'.repeat(40)}`),
  vercelToken: Buffer.from('synthetic-vercel'), previewBypass: Buffer.from('synthetic-bypass') })
async function fixture(t, state = 'ACTIVE') {
  const root = mkdtempSync(join(tmpdir(), 'tll-cleanup-scope-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  cpSync(new URL('../scripts/', import.meta.url), join(root, 'scripts'), { recursive: true })
  symlinkSync(fileURLToPath(new URL('../node_modules/', import.meta.url)), join(root, 'node_modules'))
  for (const name of ['staging-owner-successor-cleanup-assembly.mjs', 'staging-owner-successor-whole-route-journal.mjs']) {
    const path = join(root, 'scripts', name)
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^(export const OWNER_SUCCESSOR_[A-Z0-9_]*ENABLED = )false$/gm, '$1true'))
  }
  const context = join(root, 'scripts/staging-owner-successor-sql-context.mjs')
  writeFileSync(context, readFileSync(context, 'utf8')
    .replace("ACTIVE_WINDOW_STARTED_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'", `ACTIVE_WINDOW_STARTED_AT = '${startedAt}'`)
    .replace("ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'", `ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`))
  const cleanup = await import(pathToFileURL(join(root, 'scripts/staging-owner-successor-cleanup-assembly.mjs')).href)
  const originalModule = await import(pathToFileURL(join(root, 'scripts/staging-owner-successor-whole-route-journal.mjs')).href)
  const identity = { windowId: 'cd4130c8-a8b8-462b-bdbe-5c3e6250a02d',
    sourceCommit: proof.sourceCommit, executionCommit: proof.executionCommit, manifestSha256: proof.manifestSha256, startedAt, expiresAt }
  mkdirSync(join(root, '.agent'), { mode: 0o700 })
  const journal = originalModule.createOwnerSuccessorWholeRouteJournal({ identity, now: () => at })
  let record = journal.claim()
  record = journal.verify(record, 'baseline')
  record = journal.dispatch(record, 'settings'); record = journal.verify(record, 'settings')
  record = journal.dispatch(record, 'databaseSetup')
  if (state === 'HOLD') record = journal.hold(record, 'databaseSetup')
  const originalPath = originalModule.JOURNAL_PATH
  const deadPid = () => {
    const child = spawnSync(process.execPath, ['-e', ''], { env: { PATH: '/usr/bin:/bin' }, stdio: 'ignore' })
    assert.equal(child.status, 0); assert.ok(child.pid >= 2)
    return child.pid
  }
  const ownershipPath = join(root, '.agent/owner-successor', identity.windowId, 'worker-ownership.json')
  writeFileSync(ownershipPath, JSON.stringify({ schema: 'tll-owner-successor-worker-ownership/v1', identity,
    pid: deadPid(), supervisorPid: deadPid() }), { mode: 0o600 })
  const preflight = { heldEvidence: { deploymentId: 'dpl_synthetic', immutableUrl: 'https://synthetic.vercel.app',
    sourceCommit: proof.sourceCommit }, requirements: { sourceCommit: proof.sourceCommit, manifestSha256: proof.manifestSha256 } }
  const options = { credentials: credentials(), sourceProof: proof, preflight, now: () => at,
    signal: new AbortController().signal, runCli: async () => assert.fail('no CLI before held proof'),
    fetch: async () => assert.fail('OFF native dependencies cannot fetch') }
  return { root, cleanup, journal, record, originalPath, ownershipPath, options }
}

test('ordinary disabled cleanup paths inspect no supplied inputs', () => {
  const hostile = new Proxy({}, { get() { assert.fail('disabled path must not inspect arguments') } })
  assert.throws(() => createOwnerSuccessorFixedCleanupAssembly(hostile), /unavailable/)
  assert.throws(() => readOwnerSuccessorCleanupAdmission(hostile), /unavailable/)
})
for (const state of ['ACTIVE', 'HOLD']) test(`strict native whole-route ${state} databaseSetup admission grants no resume API`, async t => {
  const f = await fixture(t, state), before = readFileSync(f.originalPath)
  const admission = f.cleanup.readOwnerSuccessorCleanupAdmission({ sourceProof: proof, now: () => at })
  assert.equal(admission.originalRunId, f.record.runId)
  assert.match(admission.originalSha256, /^[a-f0-9]{64}$/)
  const assembly = f.cleanup.createOwnerSuccessorFixedCleanupAssembly(f.options)
  assert.deepEqual(Object.keys(assembly).sort(), ['core', 'dispose'])
  assert.deepEqual(Object.keys(assembly.core), ['run'])
  assert.deepEqual(await assembly.core.run(), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
  const record = JSON.parse(readFileSync(f.cleanup.CLEANUP_JOURNAL_PATH, 'utf8'))
  assert.equal(record.schema, 'tll-owner-successor-cleanup-only/v1')
  assert.equal(record.authorization, 'NONE'); assert.equal(record.state, 'HOLD')
  assert.equal(record.originalSha256, admission.originalSha256)
  assert.equal(record.originalRunId, f.record.runId)
  assert.equal(record.pendingPhase, null)
  assert.equal(record.phases.length, 0)
  assert.deepEqual(readFileSync(f.originalPath), before)
  assert.deepEqual(await assembly.core.run(), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
  assert.throws(() => f.cleanup.readOwnerSuccessorCleanupAdmission({ sourceProof: proof, now: () => at }), /unavailable/)
})
test('later original phase cannot admit cleanup and original record is unchanged', async t => {
  const f = await fixture(t)
  const next = f.journal.verify(f.record, 'databaseSetup')
  f.journal.dispatch(next, 'restrictedConnections')
  const before = readFileSync(f.originalPath)
  assert.throws(() => f.cleanup.readOwnerSuccessorCleanupAdmission({ sourceProof: proof, now: () => at }), /unavailable/)
  assert.deepEqual(readFileSync(f.originalPath), before)
})
test('explicit not-dispatched setup hold is outside uncertain-effect cleanup scope', async t => {
  const f = await fixture(t)
  const notDispatched = { ...f.record, state: 'HOLD', phases: [...f.record.phases.slice(0, -1),
    { phase: 'databaseSetup', state: 'NOT_DISPATCHED_HOLD', summary: 'DATABASESETUP_NOT_DISPATCHED_HOLD' }] }
  writeFileSync(f.originalPath, `${JSON.stringify(notDispatched)}\n`, { mode: 0o600 })
  assert.throws(() => f.cleanup.readOwnerSuccessorCleanupAdmission({ sourceProof: proof, now: () => at }), /unavailable/)
})
test('two constructed cleanup instances cannot overwrite or replay the first durable claim', async t => {
  const f = await fixture(t), first = f.cleanup.createOwnerSuccessorFixedCleanupAssembly(f.options)
  const second = f.cleanup.createOwnerSuccessorFixedCleanupAssembly(f.options)
  assert.deepEqual(await first.core.run(), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
  const before = readFileSync(f.cleanup.CLEANUP_JOURNAL_PATH)
  assert.deepEqual(await second.core.run(), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
  assert.deepEqual(readFileSync(f.cleanup.CLEANUP_JOURNAL_PATH), before)
})
test('wrong source/window identity and expired shutdown reserve fail before credential inspection', async t => {
  const f = await fixture(t)
  for (const input of [{ ...proof, executionCommit: 'd'.repeat(40) }, { ...proof, expiresAt: '2030-01-01T14:00:00.000Z' }]) {
    assert.throws(() => f.cleanup.readOwnerSuccessorCleanupAdmission({ sourceProof: input, now: () => at }), /unavailable/)
  }
  for (const now of [() => NaN, () => Date.parse(expiresAt) - 15 * 60_000]) {
    assert.throws(() => f.cleanup.readOwnerSuccessorCleanupAdmission({ sourceProof: proof, now }), /unavailable/)
  }
})
test('private original file symlink and unsafe permissions deny admission', async t => {
  const f = await fixture(t)
  chmodSync(f.originalPath, 0o644)
  assert.throws(() => f.cleanup.readOwnerSuccessorCleanupAdmission({ sourceProof: proof, now: () => at }), /unavailable/)
  chmodSync(f.originalPath, 0o600)
  const bytes = readFileSync(f.originalPath), other = join(f.root, 'other-record.json')
  writeFileSync(other, bytes, { mode: 0o600 }); rmSync(f.originalPath); symlinkSync(other, f.originalPath)
  assert.throws(() => f.cleanup.readOwnerSuccessorCleanupAdmission({ sourceProof: proof, now: () => at }), /unavailable/)
})
test('original mutation after construction blocks claim and all effects', async t => {
  const f = await fixture(t), assembly = f.cleanup.createOwnerSuccessorFixedCleanupAssembly(f.options)
  f.journal.hold(f.record, 'databaseSetup')
  assert.deepEqual(await assembly.core.run(), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
  assert.throws(() => readFileSync(f.cleanup.CLEANUP_JOURNAL_PATH), { code: 'ENOENT' })
})
test('dispose before dispatch and invalid resumed clock cannot create a cleanup claim', async t => {
  const f = await fixture(t), assembly = f.cleanup.createOwnerSuccessorFixedCleanupAssembly(f.options)
  assembly.dispose()
  assert.deepEqual(await assembly.core.run(), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
  let clock = at
  const second = f.cleanup.createOwnerSuccessorFixedCleanupAssembly({ ...f.options, now: () => clock })
  clock = NaN
  assert.deepEqual(await second.core.run(), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
  assert.throws(() => readFileSync(f.cleanup.CLEANUP_JOURNAL_PATH), { code: 'ENOENT' })
})
test('live original worker or supervisor, missing ownership and ownership drift deny before effects', async t => {
  const f = await fixture(t), bytes = readFileSync(f.ownershipPath), original = JSON.parse(bytes)
  for (const change of [{ pid: process.pid }, { supervisorPid: process.pid }, { pid: 1 },
    { identity: { ...original.identity, executionCommit: 'd'.repeat(40) } }]) {
    writeFileSync(f.ownershipPath, JSON.stringify({ ...original, ...change }), { mode: 0o600 })
    assert.throws(() => f.cleanup.readOwnerSuccessorCleanupAdmission({ sourceProof: proof, now: () => at }), /unavailable/)
  }
  rmSync(f.ownershipPath)
  assert.throws(() => f.cleanup.readOwnerSuccessorCleanupAdmission({ sourceProof: proof, now: () => at }), { code: 'ENOENT' })
  writeFileSync(f.ownershipPath, bytes, { mode: 0o600 })
  const assembly = f.cleanup.createOwnerSuccessorFixedCleanupAssembly(f.options)
  writeFileSync(f.ownershipPath, JSON.stringify({ ...original, pid: process.pid }), { mode: 0o600 })
  assert.deepEqual(await assembly.core.run(), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
  assert.throws(() => readFileSync(f.cleanup.CLEANUP_JOURNAL_PATH), { code: 'ENOENT' })
  writeFileSync(f.ownershipPath, bytes, { mode: 0o600 })
  const changedBytes = f.cleanup.createOwnerSuccessorFixedCleanupAssembly(f.options)
  writeFileSync(f.ownershipPath, Buffer.concat([bytes, Buffer.from('\n')]), { mode: 0o600 })
  assert.deepEqual(await changedBytes.core.run(), { status: 'HOLD_RECONCILE', authorization: 'NONE' })
  assert.throws(() => readFileSync(f.cleanup.CLEANUP_JOURNAL_PATH), { code: 'ENOENT' })
})
