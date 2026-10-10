import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingPreviewDeploymentJournal } from '../scripts/staging-surface-preview-deployment-journal.mjs'
import { runBoundedStagingPreviewDeploymentWorker } from '../scripts/staging-surface-preview-deployment-supervisor.mjs'

const fixture = fileURLToPath(new URL('./fixtures/staging-preview-worker-offline.mjs', import.meta.url))
const input = Object.freeze({ branch: 'codex/tll-integration', sourceCommit: 'a'.repeat(40),
  manifestSha256: 'b'.repeat(64), publicCustomer: false, publicCart: false })
async function run(mode) {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-preview-process-')), 'private', 'journal.json')
  const result = await runBoundedStagingPreviewDeploymentWorker({ executable: process.execPath,
    args: [fixture, mode, path], cwd: process.cwd(), env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    proof: 'OFFLINE_PREVIEW_FULL_WORKER_PROOF', deadlineMs: 3000 })
  return { result, journal: createStagingPreviewDeploymentJournal({ path }) }
}

test('real supervised child verifies a synthetic protected build exactly once', async () => {
  const { result, journal } = await run('success')
  assert.equal(result.status, 'EXITED')
  const value = JSON.parse(result.output.toString('utf8'))
  result.output.fill(0)
  assert.deepEqual(value, { status: 'PROTECTED_PREVIEW_VERIFIED', deploymentId: 'dpl_offline123' })
  assert.equal(journal.read().phase, 'VERIFIED')
  assert.throws(() => journal.claim(input), /unavailable/)
})

test('lost POST reply kills the supervised child and preserves an unreplayable dispatch', async () => {
  const { result, journal } = await run('lost-post')
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(result.output, null)
  assert.equal(journal.read().phase, 'POST_DISPATCH')
  assert.throws(() => journal.claim(input), /unavailable/)
})
