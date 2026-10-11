import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { issueSyntheticSuccessorCapability, createMockSuccessorTransport, inspectMockSuccessorTransport,
  runSuccessorLocalOnce } from '../scripts/staging-owner-successor-local-runtime.mjs'
import { SUCCESSOR_PHASES, SHUTDOWN_PHASES } from '../scripts/staging-owner-successor-fixture.mjs'
import { createSuccessorDurableJournal } from '../scripts/staging-owner-successor-durable-journal.mjs'
const setup = t => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'tll-successor-local-')))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const startedAtMs = Date.now(), plan = { windowId: randomUUID(), sourceSha: 'a'.repeat(40),
    startedAtMs, expiresAtMs: startedAtMs + 60 * 60_000 }
  const grant = action => issueSyntheticSuccessorCapability({ plan, action, nowMs: startedAtMs,
    validUntilMs: startedAtMs + 30_000, reviewedSourceSha: plan.sourceSha })
  return { root, plan, grant }
}
const wiped = port => assert.ok(inspectMockSuccessorTransport(port).credentialBuffers.every(b => b.every(v => v === 0)))
test('durable full local sequence uses mock-only capability, persists every dispatch, wipes synthetic credentials', async t => {
  const { root, plan, grant } = setup(t), port = createMockSuccessorTransport({ plan })
  const capability = grant('LOCAL_RUN')
  const answer = await runSuccessorLocalOnce({ root, plan, port, capability, action: 'LOCAL_RUN' })
  assert.equal(answer.status, 'LOCAL_SEQUENCE_PASS'); assert.equal(answer.authorization, 'NONE'); wiped(port)
  assert.deepEqual(inspectMockSuccessorTransport(port).calls, SUCCESSOR_PHASES)
  const names = fs.readdirSync(join(root, plan.windowId)).filter(n => /\.json$/.test(n))
  assert.equal(names.length, 27)
  for (const name of names) {
    const path = join(root, plan.windowId, name), raw = fs.readFileSync(path, 'utf8')
    assert.equal(fs.statSync(path).mode & 0o777, 0o600)
    assert.ok(!raw.includes('SYNTHETIC-MANAGEMENT') && !raw.includes('SYNTHETIC-VERCEL'))
  }
  assert.equal((await runSuccessorLocalOnce({ root, plan, port, capability, action: 'LOCAL_RUN' })).status, 'LOCAL_CAPABILITY_DENIED')
})
for (const failAt of SUCCESSOR_PHASES) {
  test(`failure at ${failAt} never repeats writes; cleanup either verified or remains uncertain`, async t => {
    const { root, plan, grant } = setup(t), port = createMockSuccessorTransport({ plan, failAt })
    const answer = await runSuccessorLocalOnce({ root, plan, port, capability: grant('LOCAL_RUN'), action: 'LOCAL_RUN' })
    assert.equal(answer.status, SHUTDOWN_PHASES.includes(failAt) ? 'LOCAL_RECONCILIATION_REQUIRED' : 'LOCAL_FAILURE_SHUTDOWN_VERIFIED')
    const { calls, state } = inspectMockSuccessorTransport(port)
    assert.equal(calls.filter(p => p === failAt).length, 1); wiped(port)
    if (!SHUTDOWN_PHASES.includes(failAt)) assert.deepEqual(state, { backend: false, website: false, retired: true })
  })
}
for (const option of ['hangAt', 'lateAt']) {
  test(`${option}: deadline aborts, settlement completes before shutdown, no false PASS`, async t => {
    const { root, plan, grant } = setup(t), port = createMockSuccessorTransport({ plan, [option]: 'surfaceEnable' })
    const answer = await runSuccessorLocalOnce({ root, plan, port, capability: grant('LOCAL_RUN'), action: 'LOCAL_RUN', phaseTimeoutMs: 10 })
    assert.equal(answer.status, 'LOCAL_FAILURE_SHUTDOWN_VERIFIED')
    assert.deepEqual(inspectMockSuccessorTransport(port).state, { backend: false, website: false, retired: true }); wiped(port)
  })
}
test('unsettled write stays HOLD and cannot claim clean shutdown', async t => {
  const { root, plan, grant } = setup(t), port = createMockSuccessorTransport({ plan, failAt: 'surfaceEnable', uncertainSettlement: true })
  const answer = await runSuccessorLocalOnce({ root, plan, port, capability: grant('LOCAL_RUN'), action: 'LOCAL_RUN' })
  assert.equal(answer.status, 'LOCAL_RECONCILIATION_REQUIRED')
  assert.ok(!inspectMockSuccessorTransport(port).calls.includes('backendDisable')); wiped(port)
})
test('forged, expired, wrong-source, wrong-action capabilities cannot invoke the port', async t => {
  const { root, plan, grant } = setup(t)
  assert.throws(() => issueSyntheticSuccessorCapability({ plan, action: 'HOSTED_RUN', nowMs: plan.startedAtMs,
    validUntilMs: plan.startedAtMs + 100, reviewedSourceSha: plan.sourceSha }))
  assert.throws(() => issueSyntheticSuccessorCapability({ plan, action: 'LOCAL_RUN', nowMs: plan.startedAtMs,
    validUntilMs: plan.startedAtMs + 100, reviewedSourceSha: 'b'.repeat(40) }))
  for (const options of [{ capability: {} }, { capability: grant('LOCAL_RECOVERY') },
    { capability: grant('LOCAL_RUN'), now: () => plan.startedAtMs + 31_000 }]) {
    const port = createMockSuccessorTransport({ plan })
    const result = await runSuccessorLocalOnce({ root, plan, port, action: 'LOCAL_RUN', ...options })
    assert.equal(result.status, 'LOCAL_CAPABILITY_DENIED'); assert.deepEqual(inspectMockSuccessorTransport(port).calls, []); wiped(port)
  }
})
test('live owner, concurrent claim, unknown fields and corrupted ledger refuse recovery/replay', t => {
  const { root, plan } = setup(t), journal = createSuccessorDurableJournal({ root, plan })
  journal.dispatch('baseline', plan.startedAtMs + 1)
  assert.throws(() => createSuccessorDurableJournal({ root, plan }))
  assert.throws(() => createSuccessorDurableJournal({ root, plan, recovering: true }))
  assert.throws(() => createSuccessorDurableJournal({ root, plan: { ...plan, credential: 'must not persist' } }))
  fs.writeFileSync(join(journal.path, '000.json'), 'partial', { mode: 0o600 })
  assert.throws(() => journal.read())
})
test('filesystem fsync failure prevents mock dispatch and never erases consumed claim', async t => {
  const { root, plan, grant } = setup(t), port = createMockSuccessorTransport({ plan })
  const io = { ...fs, fsyncSync() { throw Error('synthetic disk failure') } }
  const answer = await runSuccessorLocalOnce({ root, plan, port, capability: grant('LOCAL_RUN'), action: 'LOCAL_RUN', journalIo: io })
  assert.equal(answer.status, 'LOCAL_RECONCILIATION_REQUIRED')
  assert.deepEqual(inspectMockSuccessorTransport(port).calls, []); wiped(port)
  assert.ok(fs.existsSync(join(root, plan.windowId)))
})
test('symlink, hardlink and permissive journal paths fail closed', t => {
  const { root, plan } = setup(t), journal = createSuccessorDurableJournal({ root, plan })
  const identity = join(journal.path, 'identity.json')
  fs.linkSync(identity, join(root, 'linked'))
  assert.throws(() => journal.read()); fs.unlinkSync(join(root, 'linked'))
  fs.chmodSync(identity, 0o644); assert.throws(() => journal.read()); fs.chmodSync(identity, 0o600)
  fs.renameSync(identity, join(root, 'identity.saved')); fs.symlinkSync(join(root, 'identity.saved'), identity)
  assert.throws(() => journal.read())
  fs.chmodSync(root, 0o755); assert.throws(() => createSuccessorDurableJournal({ root, plan }))
})

test('active expiry triggers bounded cleanup, never another customer phase', async t => {
  const { root, plan, grant } = setup(t), port = createMockSuccessorTransport({ plan })
  const now = () => inspectMockSuccessorTransport(port).calls.includes('surfaceEnable')
    ? plan.expiresAtMs + 1 : plan.startedAtMs + 1
  const answer = await runSuccessorLocalOnce({ root, plan, port, capability: grant('LOCAL_RUN'), action: 'LOCAL_RUN', now })
  assert.equal(answer.status, 'LOCAL_FAILURE_SHUTDOWN_VERIFIED')
  const { calls, state } = inspectMockSuccessorTransport(port)
  assert.ok(!calls.includes('ownerJourney')); assert.deepEqual(calls.slice(-4), SHUTDOWN_PHASES)
  assert.deepEqual(state, { backend: false, website: false, retired: true }); wiped(port)
})
test('cleanup grace expiry preserves uncertainty and clock failure wipes owned buffers', async t => {
  const { root, plan, grant } = setup(t), port = createMockSuccessorTransport({ plan })
  const now = () => inspectMockSuccessorTransport(port).calls.includes('surfaceEnable')
    ? plan.expiresAtMs + 15 * 60_000 : plan.startedAtMs + 1
  const answer = await runSuccessorLocalOnce({ root, plan, port, capability: grant('LOCAL_RUN'), action: 'LOCAL_RUN', now })
  assert.equal(answer.status, 'LOCAL_RECONCILIATION_REQUIRED'); wiped(port)
  const port2 = createMockSuccessorTransport({ plan })
  assert.equal((await runSuccessorLocalOnce({ root, plan, port: port2, capability: grant('LOCAL_RUN'), action: 'LOCAL_RUN',
    now: () => { throw Error('synthetic clock fault') } })).status, 'LOCAL_CAPABILITY_DENIED'); wiped(port2)
})
test('loss of future phase budget skips customer work and retires within reserve', async t => {
  const { root, plan, grant } = setup(t), port = createMockSuccessorTransport({ plan })
  const now = () => inspectMockSuccessorTransport(port).calls.includes('databaseEnable')
    ? plan.expiresAtMs - 20 * 60_000 : plan.startedAtMs + 1
  const answer = await runSuccessorLocalOnce({ root, plan, port, capability: grant('LOCAL_RUN'), action: 'LOCAL_RUN', now })
  assert.equal(answer.status, 'LOCAL_FAILURE_SHUTDOWN_VERIFIED')
  assert.ok(!inspectMockSuccessorTransport(port).calls.includes('surfaceEnable')); wiped(port)
})

test('durable fsync barrier precedes every mock dispatch, including cleanup', async t => {
  const { root, plan, grant } = setup(t), port = createMockSuccessorTransport({ plan })
  const files = new Map(), synchronized = new Set()
  const io = { ...fs,
    openSync(path, ...args) { const fd = fs.openSync(path, ...args); files.set(fd, path); return fd },
    fsyncSync(fd) {
      const path = files.get(fd)
      if (/\d{3}\.json$/.test(path)) {
        const event = JSON.parse(fs.readFileSync(path, 'utf8'))
        if (event.operation === 'dispatch') {
          assert.ok(!inspectMockSuccessorTransport(port).calls.includes(event.argument))
          synchronized.add(event.argument)
        }
      }
      fs.fsyncSync(fd)
    },
  }
  const answer = await runSuccessorLocalOnce({ root, plan, port, capability: grant('LOCAL_RUN'), action: 'LOCAL_RUN', journalIo: io })
  assert.equal(answer.status, 'LOCAL_SEQUENCE_PASS'); assert.equal(synchronized.size, 13); wiped(port)
})

for (const firstClock of [NaN, undefined, Infinity, -Infinity, null, '1000', {}, 1.25, -1]) {
  test(`invalid admission clock ${String(firstClock)} cannot dispatch even if later clocks are valid`, async t => {
    const { root, plan, grant } = setup(t), port = createMockSuccessorTransport({ plan })
    let calls = 0
    const result = await runSuccessorLocalOnce({ root, plan, port, capability: grant('LOCAL_RUN'), action: 'LOCAL_RUN',
      now: () => ++calls === 1 ? firstClock : plan.startedAtMs + 1 })
    assert.equal(result.status, 'LOCAL_CAPABILITY_DENIED')
    assert.deepEqual(inspectMockSuccessorTransport(port).calls, []); wiped(port)
    assert.equal(fs.existsSync(join(root, plan.windowId)), false)
  })
}
test('admission validates inclusive start, exclusive capability expiry, plan expiry and future issuance', async t => {
  const { root, plan } = setup(t)
  for (const [approvedAtMs, nowMs, expected] of [
    [plan.startedAtMs, plan.startedAtMs - 1, 'LOCAL_CAPABILITY_DENIED'],
    [plan.startedAtMs + 1000, plan.startedAtMs, 'LOCAL_CAPABILITY_DENIED'],
    [plan.startedAtMs, plan.startedAtMs + 100, 'LOCAL_CAPABILITY_DENIED'],
    [plan.expiresAtMs - 1, plan.expiresAtMs, 'LOCAL_CAPABILITY_DENIED'],
  ]) {
    const port = createMockSuccessorTransport({ plan })
    const capability = issueSyntheticSuccessorCapability({ plan, action: 'LOCAL_RUN', nowMs: approvedAtMs,
      validUntilMs: approvedAtMs + 100, reviewedSourceSha: plan.sourceSha })
    const result = await runSuccessorLocalOnce({ root, plan, port, capability, action: 'LOCAL_RUN', now: () => nowMs })
    assert.equal(result.status, expected); assert.deepEqual(inspectMockSuccessorTransport(port).calls, []); wiped(port)
  }
  const port = createMockSuccessorTransport({ plan })
  const capability = issueSyntheticSuccessorCapability({ plan, action: 'LOCAL_RUN', nowMs: plan.startedAtMs,
    validUntilMs: plan.startedAtMs + 100, reviewedSourceSha: plan.sourceSha })
  assert.equal((await runSuccessorLocalOnce({ root, plan, port, capability, action: 'LOCAL_RUN', now: () => plan.startedAtMs })).status, 'LOCAL_SEQUENCE_PASS'); wiped(port)
})
test('invalid later clock stops progress and cannot claim recovery or pass', async t => {
  const { root, plan, grant } = setup(t), port = createMockSuccessorTransport({ plan })
  let count = 0
  const result = await runSuccessorLocalOnce({ root, plan, port, capability: grant('LOCAL_RUN'), action: 'LOCAL_RUN',
    now: () => ++count === 1 ? plan.startedAtMs : NaN })
  assert.equal(result.status, 'LOCAL_RECONCILIATION_REQUIRED')
  assert.deepEqual(inspectMockSuccessorTransport(port).calls, []); wiped(port)
})
