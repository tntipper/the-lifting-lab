import test from 'node:test'
import assert from 'node:assert/strict'
import { createInventoryLedgerRepository, enqueuePreparedInventoryOperation, runInventoryOperation } from '../lib/commerce/inventory-ledger.ts'
import { fixture } from './inventory-ledger/fixture.mjs'

const workerId = '72000000-0000-4000-8000-000000000001', token = '73000000-0000-4000-8000-000000000001'
function repo(f, overrides = {}) {
  const events = []
  return { events,
    enqueue: async document => { events.push(['enqueue', document]); return { status: 'enqueued' } },
    claim: async () => ({ status: 'claimed', mode: 'first_attempt', operation_id: f.plan.operationId, worker_id: workerId, fence: '1', manifest_document: JSON.stringify(f.manifest) }),
    beginAttempt: async () => { events.push(['attempt']); return { status: 'attempt_committed' } },
    beginReconciliation: async (...args) => { events.push(['reconciliation', ...args]); return { status: 'reconciling', reconcile_token: token } },
    finishReconciliation: async (...args) => { events.push(['finish', ...args]); return { status: args[4] === 'reconciled' ? 'completed' : 'held' } },
    ...overrides,
  }
}
function args(f, repository, extra = {}) { return { repository, adapter: f.adapter, operationId: f.plan.operationId, workerId, issuedPlan: f.plan, enabled: true, ...extra } }

test('repository parameterises every call and returns only after COMMIT acknowledgement', async () => {
  const events = []; let commit
  const repository = createInventoryLedgerRepository({ connect: async () => ({ query: async (sql, parameters) => {
    events.push([sql, parameters]); if (sql === 'COMMIT') await new Promise(resolve => { commit = resolve })
    return { rows: sql.startsWith('select') ? [{ result: { status: 'attempt_committed' } }] : [] }
  }, release: () => { events.push(['release']) } }) })
  let returned = false
  const call = repository.beginAttempt('id', 'worker', '2', "untrusted'); SELECT secret --").then(value => { returned = true; return value })
  while (!commit) await new Promise(resolve => setTimeout(resolve, 1))
  assert.equal(returned, false); assert.equal(events[1][0], "SET LOCAL synchronous_commit = 'on'"); assert.match(events[2][0], /\$4::text/); assert.equal(events[2][0].includes('SELECT secret'), false)
  commit(); assert.equal((await call).status, 'attempt_committed'); assert.equal(events.at(-1)[0], 'release')
})
test('lost COMMIT response is uncertain, rolled back best effort, released and redacted', async () => {
  const events = [], repository = createInventoryLedgerRepository({ connect: async () => ({ query: async sql => {
    events.push(sql); if (sql === 'COMMIT') throw new Error('synthetic-secret-must-not-escape')
    return { rows: [{ result: { status: 'attempt_committed' } }] }
  }, release: discard => events.push(['release', discard]) }) })
  assert.deepEqual(await repository.beginAttempt('id', 'worker', '1', 'hash'), { status: 'ledger_uncertain' })
  assert.deepEqual(events.slice(-2), ['ROLLBACK', ['release', true]])
})
test('enqueue persists only the issued frozen manifest', async () => {
  const f = await fixture(), repository = repo(f)
  assert.equal((await enqueuePreparedInventoryOperation(repository, f.adapter, f.plan)).status, 'enqueued')
  assert.equal(repository.events[0][1], JSON.stringify(f.manifest))
  assert.equal((await enqueuePreparedInventoryOperation(repository, f.adapter, structuredClone(f.plan))).status, 'hold')
  assert.equal(repository.events.length, 1)
})
test('worker remains disabled without explicit configuration and does not claim or call Shopify', async () => {
  const f = await fixture(), repository = repo(f, { claim: async () => { throw new Error('Must not claim') } })
  const result = await runInventoryOperation(args(f, repository, { enabled: undefined }))
  assert.equal(result.status, 'disabled'); assert.deepEqual(f.calls, ['TllInventoryTarget'])
})
test('current owned plan follows commit, one mutation, acknowledgement and fresh durable read', async () => {
  const f = await fixture(), repository = repo(f)
  const result = await runInventoryOperation(args(f, repository))
  assert.equal(result.status, 'completed'); assert.equal(result.retryAllowed, false)
  assert.deepEqual(repository.events.map(event => event[0]), ['attempt', 'reconciliation', 'finish'])
  assert.equal(repository.events[1][4], 'acknowledged'); assert.equal(repository.events[2][5], 'reconciled')
  assert.deepEqual(f.calls, ['TllInventoryTarget', 'TllInventorySet', 'TllInventoryTarget', 'TllInventoryTarget'])
})
for (const status of ['ledger_uncertain', 'ledger_unavailable', 'fenced', 'expired', 'disabled']) test(`unconfirmed attempt (${status}) never calls Shopify`, async () => {
  const f = await fixture(), repository = repo(f, { beginAttempt: async () => ({ status }) })
  const result = await runInventoryOperation(args(f, repository))
  assert.equal(result.status, 'blocked'); assert.equal(result.code, 'ATTEMPT_NOT_CONFIRMED'); assert.deepEqual(f.calls, ['TllInventoryTarget'])
})
test('queued restart cannot execute a deserialised plan, even before any attempt', async () => {
  const f = await fixture(), repository = repo(f)
  const result = await runInventoryOperation(args(f, repository, { issuedPlan: structuredClone(f.plan) }))
  assert.equal(result.status, 'held'); assert.equal(result.code, 'RESTART_REQUIRES_NEW_PLAN')
  assert.equal(repository.events.some(e => e[0] === 'attempt'), false)
  assert.equal(repository.events[0][4], 'not_sent'); assert.equal(f.calls.includes('TllInventorySet'), false)
})
test('reclaimed lease reads and holds even if the old plan remains in memory', async () => {
  const f = await fixture(), repository = repo(f, { claim: async () => ({ status: 'claimed', mode: 'reconcile_only', operation_id: f.plan.operationId, worker_id: workerId, fence: '2', reconcile_token: token, manifest_document: JSON.stringify(f.manifest) }) })
  f.setQuantity(7)
  const result = await runInventoryOperation(args(f, repository))
  assert.equal(result.status, 'held'); assert.equal(repository.events[0][0], 'finish'); assert.equal(repository.events[0][5], 'hold')
  assert.equal(f.calls.includes('TllInventorySet'), false)
})
test('lost Shopify response records uncertainty and holds despite desired observed quantity', async () => {
  const f = await fixture({ mutationFailure: true }), repository = repo(f)
  const result = await runInventoryOperation(args(f, repository)); assert.equal(result.status, 'held')
  assert.equal(repository.events[1][4], 'unknown'); assert.equal(repository.events[2][5], 'hold')
  assert.equal(f.calls.filter(c => c === 'TllInventorySet').length, 1)
})
test('fenced reconciliation result cannot report completion after a successful external response', async () => {
  const f = await fixture(), repository = repo(f, { finishReconciliation: async () => ({ status: 'fenced' }) })
  const result = await runInventoryOperation(args(f, repository)); assert.equal(result.status, 'blocked'); assert.equal(result.code, 'FINISH_NOT_CONFIRMED')
  assert.equal(f.calls.filter(c => c === 'TllInventorySet').length, 1)
})
test('corrupted persisted provenance or request cannot reach the mutation boundary', async () => {
  const f = await fixture(), altered = structuredClone(f.manifest); altered.plan.requestHash = '0'.repeat(64)
  const repository = repo(f, { claim: async () => ({ status: 'claimed', mode: 'first_attempt', operation_id: f.plan.operationId, worker_id: workerId, fence: '1', manifest_document: JSON.stringify(altered) }) })
  assert.equal((await runInventoryOperation(args(f, repository))).code, 'MANIFEST_INVALID')
  assert.deepEqual(f.calls, ['TllInventoryTarget'])
})
