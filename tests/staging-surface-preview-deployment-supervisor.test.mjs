import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStagingPreviewDeploymentJournal } from '../scripts/staging-surface-preview-deployment-journal.mjs'
import { runBoundedStagingPreviewDeploymentWorker,
  STAGING_PREVIEW_DEPLOYMENT_SUPERVISOR_ENABLED, STAGING_PREVIEW_DEPLOYMENT_WORKER_DEADLINE_MS,
} from '../scripts/staging-surface-preview-deployment-supervisor.mjs'

const input = Object.freeze({ branch: 'codex/tll-integration', sourceCommit: 'a'.repeat(40),
  manifestSha256: 'b'.repeat(64), publicCustomer: false, publicCart: false })
const proof = 'OFFLINE_PREVIEW_SUPERVISOR_PROOF'
const options = args => ({ executable: process.execPath, args, cwd: process.cwd(),
  env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, proof })

test('Preview worker is disabled and cannot exceed its fixed whole-process limit', async () => {
  assert.equal(STAGING_PREVIEW_DEPLOYMENT_SUPERVISOR_ENABLED, false)
  await assert.rejects(runBoundedStagingPreviewDeploymentWorker({ ...options([]),
    deadlineMs: STAGING_PREVIEW_DEPLOYMENT_WORKER_DEADLINE_MS + 1 }), /unavailable/)
})

test('a stalled worker is stopped with its one-use dispatch record intact', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-preview-supervisor-')), 'private', 'journal.json')
  const journalUrl = new URL('../scripts/staging-surface-preview-deployment-journal.mjs', import.meta.url).href
  const controlUrl = new URL('../scripts/staging-provider-broker-recovery-process-control.mjs', import.meta.url).href
  const program = `Promise.all([import(${JSON.stringify(journalUrl)}),import(${JSON.stringify(controlUrl)})]).then(async ([j,c])=>{`
    + `await c.acceptSupervisorPipe({proof:${JSON.stringify(proof)}});`
    + `const journal=j.createStagingPreviewDeploymentJournal({path:process.argv[1]});`
    + `journal.dispatch(journal.claim(${JSON.stringify(input)}));`
    + `setInterval(()=>{},1000)})`
  const result = await runBoundedStagingPreviewDeploymentWorker({ ...options(['-e', program, path]), deadlineMs: 1000 })
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(result.output, null)
  const journal = createStagingPreviewDeploymentJournal({ path })
  assert.equal(journal.read()?.phase, 'POST_DISPATCH')
  assert.throws(() => journal.claim(input), /unavailable/)
})
