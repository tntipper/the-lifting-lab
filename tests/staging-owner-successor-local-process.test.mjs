import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runSuccessorLocalProcess } from '../scripts/staging-owner-successor-local-process.mjs'
const setup = t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tll-successor-process-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const startedAtMs = Date.now()
  return { root, plan: { windowId: randomUUID(), sourceSha: 'a'.repeat(40),
    startedAtMs, expiresAtMs: startedAtMs + 60 * 60_000 } }
}
const events = (root, plan) => readdirSync(join(root, plan.windowId)).filter(n => /^\d{3}\.json$/.test(n))
  .sort().map(n => JSON.parse(readFileSync(join(root, plan.windowId, n), 'utf8')))
test('real detached fixture worker completes with bounded categorical output and no hosted authority', async t => {
  const input = setup(t), answer = await runSuccessorLocalProcess(input)
  assert.equal(answer.status, 'LOCAL_SEQUENCE_PASS'); assert.equal(answer.authorization, 'NONE')
  assert.equal(answer.provenance, 'SYNTHETIC_LOCAL_ONLY')
  assert.equal(events(input.root, input.plan).filter(e => e.operation === 'dispatch').length, 13)
  assert.equal((await runSuccessorLocalProcess(input)).status, 'LOCAL_RECONCILIATION_REQUIRED')
})
test('killed fixture after durable dispatch recovers cleanup-only once; journey and uncertain mutation never replay', async t => {
  const input = setup(t)
  assert.equal((await runSuccessorLocalProcess({ ...input, crashAt: 'surfaceEnable' })).status, 'LOCAL_PROCESS_RECONCILIATION_REQUIRED')
  const before = events(input.root, input.plan)
  assert.equal(before.at(-1).operation, 'dispatch'); assert.equal(before.at(-1).argument, 'surfaceEnable')
  const recovery = await runSuccessorLocalProcess({ ...input, action: 'LOCAL_RECOVERY' })
  assert.equal(recovery.status, 'LOCAL_FAILURE_SHUTDOWN_VERIFIED')
  const after = events(input.root, input.plan).slice(before.length)
  assert.deepEqual(after.filter(e => e.operation === 'dispatch').map(e => e.argument),
    ['backendDisable', 'surfaceFreeze', 'databaseRetire', 'finalReadback'])
  assert.equal((await runSuccessorLocalProcess({ ...input, action: 'LOCAL_RECOVERY' })).status, 'LOCAL_RECONCILIATION_REQUIRED')
})
test('crash during shutdown cannot replay shutdown under a new local capability', async t => {
  const input = setup(t)
  assert.equal((await runSuccessorLocalProcess({ ...input, crashAt: 'surfaceFreeze' })).status, 'LOCAL_PROCESS_RECONCILIATION_REQUIRED')
  const before = events(input.root, input.plan).length
  assert.equal((await runSuccessorLocalProcess({ ...input, action: 'LOCAL_RECOVERY' })).status, 'LOCAL_RECONCILIATION_REQUIRED')
  assert.equal(events(input.root, input.plan).filter(e => e.operation === 'dispatch' && e.argument === 'surfaceFreeze').length, 1)
  assert.ok(events(input.root, input.plan).length <= before + 1)
})
test('process binding refuses host actions, arbitrary scenarios or excessive deadlines', async t => {
  const input = setup(t)
  for (const extra of [{ action: 'HOSTED_RUN' }, { failAt: 'payment' }, { deadlineMs: 30_001 }])
    await assert.rejects(runSuccessorLocalProcess({ ...input, ...extra }))
})
