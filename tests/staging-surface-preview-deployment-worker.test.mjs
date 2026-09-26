import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStagingPreviewDeploymentJournal } from '../scripts/staging-surface-preview-deployment-journal.mjs'
import { runStagingPreviewDeploymentWorker, STAGING_PREVIEW_DEPLOYMENT_WORKER_ENABLED } from '../scripts/staging-surface-preview-deployment-worker.mjs'

const input = Object.freeze({ branch: 'codex/tll-integration', sourceCommit: 'a'.repeat(40),
  manifestSha256: 'b'.repeat(64), publicCustomer: false, publicCart: false })
const signal = new AbortController().signal
function fixture(overrides = {}) {
  const journal = createStagingPreviewDeploymentJournal({
    path: join(mkdtempSync(join(tmpdir(), 'tll-preview-worker-')), 'private', 'journal.json'),
  })
  const options = { input, journal, signal, fetch: async () => { throw Error('network must not be used') },
    runCli: async () => { throw Error('CLI must not be used') }, stopWorkerGroup: () => { throw Error('must not stop') },
    acquireCredentials: async () => { throw Error('credential read failed') }, ...overrides }
  return { journal, options }
}

test('worker remains disabled and claims before touching any credential', async () => {
  assert.equal(STAGING_PREVIEW_DEPLOYMENT_WORKER_ENABLED, false)
  const f = fixture({ acquireCredentials: async () => {
    assert.equal(f.journal.read()?.phase, 'CLAIMED')
    throw Error('credential read failed')
  } })
  await assert.rejects(runStagingPreviewDeploymentWorker(f.options), /credential read failed/)
  assert.equal(f.journal.read()?.phase, 'HOLD_PRE_DISPATCH')
  await assert.rejects(runStagingPreviewDeploymentWorker(f.options), /unavailable/)
})

test('malformed or partial credential bundles are wiped and held before POST', async () => {
  for (const makeCredentials of [
    () => ({ vercelToken: Buffer.from('private-test-token'), protectionBypassToken: 'wrong' }),
    () => ({ vercelToken: Buffer.from('private-test-token'), protectionBypassToken: Buffer.from('private-bypass-token'), extra: 1 }),
  ]) {
    const credentials = makeCredentials(), f = fixture({ acquireCredentials: async () => credentials })
    await assert.rejects(runStagingPreviewDeploymentWorker(f.options), /unavailable/)
    assert.equal(f.journal.read()?.phase, 'HOLD_PRE_DISPATCH')
    for (const value of Object.values(credentials)) if (Buffer.isBuffer(value)) assert.ok(value.every(byte => byte === 0))
  }
})

test('verified composition receives one existing claim and wipes both credentials', async () => {
  const credentials = { vercelToken: Buffer.from('private-test-token'), protectionBypassToken: Buffer.from('private-bypass-token') }
  let verifies = 0, disposed = 0
  const f = fixture({ acquireCredentials: async () => credentials,
    createBinding: () => ({ readPinnedRepository: async () => ({}) }),
    createPost: () => ({ dispose: () => { disposed++ } }),
    createVerifier: ({ journal }) => ({ verify: async (_input, { priorClaim }) => {
      verifies++
      assert.equal(priorClaim.phase, 'CLAIMED')
      const sent = journal.dispatch(priorClaim), accepted = journal.accepted(sent, 'dpl_test123')
      journal.verified(accepted)
      return { status: 'PROTECTED_PREVIEW_VERIFIED', deploymentId: 'dpl_test123',
        sourceCommit: input.sourceCommit, manifestSha256: input.manifestSha256,
        customerEnabled: false, cartEnabled: false }
    } }),
  })
  assert.equal((await runStagingPreviewDeploymentWorker(f.options)).status, 'PROTECTED_PREVIEW_VERIFIED')
  assert.equal(verifies, 1); assert.equal(disposed, 1); assert.equal(f.journal.read()?.phase, 'VERIFIED')
  for (const value of Object.values(credentials)) assert.ok(value.every(byte => byte === 0))
})

test('an error after dispatch stops the worker and cannot start a recovery POST', async () => {
  const credentials = { vercelToken: Buffer.from('private-test-token'), protectionBypassToken: Buffer.from('private-bypass-token') }
  let stops = 0, disposed = 0
  const f = fixture({ acquireCredentials: async () => credentials, stopWorkerGroup: () => { stops++ },
    createBinding: () => ({ readPinnedRepository: async () => ({}) }),
    createPost: () => ({ dispose: () => { disposed++ } }),
    createVerifier: ({ journal }) => ({ verify: async (_input, { priorClaim }) => {
      journal.dispatch(priorClaim)
      throw Error('acknowledgement unknown')
    } }),
  })
  const pending = runStagingPreviewDeploymentWorker(f.options)
  assert.equal(await Promise.race([pending.then(() => 'returned', () => 'rejected'),
    new Promise(resolve => setTimeout(() => resolve('held'), 20))]), 'held')
  assert.equal(stops, 1); assert.equal(disposed, 1)
  assert.equal(f.journal.read()?.phase, 'POST_DISPATCH')
  for (const value of Object.values(credentials)) assert.ok(value.every(byte => byte === 0))
})
