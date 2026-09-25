import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBrokerPhaseJournal } from '../scripts/staging-provider-broker-phase-journal.mjs'
import { createProviderBrokerRotationJournal } from '../scripts/staging-provider-broker-rotation.mjs'
import { runStagingProviderBrokerRestWorker, STAGING_BROKER_REST_WORKER_CORE_ENABLED } from '../scripts/staging-provider-broker-rest-worker-core.mjs'

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-rest-worker-core-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const runId = randomUUID()
  const phaseJournal = createBrokerPhaseJournal({ path: join(directory, 'phase.json'), makeRunId: () => runId })
  const rotationJournal = createProviderBrokerRotationJournal({ path: join(directory, 'rotation.json'), makeRunId: () => runId })
  const credentials = { managementToken: Buffer.from('fixture-management'), vercelToken: Buffer.from('fixture-vercel'),
    protectionBypassToken: Buffer.from('fixture-bypass') }
  const calls = []
  const options = { phaseJournal, rotationJournal,
    acquireCredentials: async () => { calls.push('credentials'); assert.equal(phaseJournal.read().phase, 'LAUNCH_STARTED'); return credentials },
    fetch() {}, stopWorkerGroup() {}, execute() {},
    createPorts: async () => { calls.push('ports'); throw Error('synthetic setup failure') },
  }
  return { phaseJournal, rotationJournal, credentials, calls, options }
}

test('durable one-use phase starts before credentials and setup failure wipes all returned tokens', async t => {
  assert.equal(STAGING_BROKER_REST_WORKER_CORE_ENABLED, false)
  const f = fixture(t)
  const result = await runStagingProviderBrokerRestWorker(f.options)
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(f.phaseJournal.read().outcome, 'RECONCILIATION_REQUIRED')
  assert.equal(f.rotationJournal.read(), null)
  assert.deepEqual(f.calls, ['credentials', 'ports'])
  assert.ok(Object.values(f.credentials).every(value => value.every(byte => byte === 0)))
})

test('consumed phase refuses replay before credential acquisition', async t => {
  const f = fixture(t)
  await runStagingProviderBrokerRestWorker(f.options)
  f.calls.length = 0
  assert.equal((await runStagingProviderBrokerRestWorker(f.options)).status, 'REPLAY_REJECTED')
  assert.deepEqual(f.calls, [])
})

test('malformed credential bundle is rejected and every provided token is wiped', async t => {
  const f = fixture(t)
  const partial = { managementToken: Buffer.from('fixture-management'), vercelToken: Buffer.from('fixture-vercel'),
    unexpectedToken: Buffer.from('fixture-unexpected') }
  const result = await runStagingProviderBrokerRestWorker({ ...f.options,
    acquireCredentials: async () => partial })
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(f.calls.includes('ports'), false)
  assert.ok(Object.values(partial).every(value => value.every(byte => byte === 0)))
})
