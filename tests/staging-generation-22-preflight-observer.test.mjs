import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HOSTED_BASELINE_VERCEL_TARGET } from '../scripts/staging-account-hosted-baseline-vercel.mjs'
import { MISSING_VERCEL_SECRET_NAMES } from '../scripts/staging-generation-22-material.mjs'
import { createStagingGeneration22PreflightJournal } from '../scripts/staging-generation-22-preflight-journal.mjs'
import { runStagingGeneration22PreflightVercelObservation,
  STAGING_GENERATION_22_PREFLIGHT_OBSERVER_ENABLED } from '../scripts/staging-generation-22-preflight-observer.mjs'

const project = { target: HOSTED_BASELINE_VERCEL_TARGET, repository: { provider: 'github', repoId: 1264363509,
  org: 'tntipper', repo: 'the-lifting-lab', ownerId: 17, productionBranch: 'main', sourceless: false } }
const inventory = entries => ({ target: HOSTED_BASELINE_VERCEL_TARGET, environment: 'preview',
  branch: 'codex/tll-integration', entries })
const entry = key => ({ key, type: 'sensitive', visibility: 'secret', scope: 'branch' })
const journal = () => createStagingGeneration22PreflightJournal({ mode: 'vercel',
  path: join(mkdtempSync(join(tmpdir(), 'tll-gen22-observer-')), 'read.json') })

function fixture({ entries = [], observedProject = project } = {}) {
  const record = journal(), token = Buffer.from('invented-vercel-token')
  const calls = [], reader = { readProject: async () => { calls.push('project'); return observedProject },
    readEffectivePreviewEnvironmentInventory: async () => { calls.push('inventory'); return inventory(entries) },
    dispose: () => calls.push('dispose') }
  const run = () => runStagingGeneration22PreflightVercelObservation({ journal: record,
    readCredential: async () => { calls.push('credential'); return token },
    openVercel: () => reader })
  return { record, token, calls, run }
}

test('read-only Vercel observer accepts absent Gen22 names and consumes its record', async () => {
  assert.equal(STAGING_GENERATION_22_PREFLIGHT_OBSERVER_ENABLED, false)
  const sample = fixture({ entries: [entry('UNRELATED_SECRET')] })
  const result = await sample.run()
  assert.equal(result.status, 'GENERATION_22_NAMES_ABSENT')
  assert.deepEqual(result.assessment.present, [])
  assert.deepEqual(sample.calls, ['credential', 'project', 'inventory', 'dispose'])
  assert.ok(sample.token.every(byte => byte === 0))
  assert.equal(sample.record.read().outcome, 'GENERATION_22_NAMES_ABSENT')
  assert.equal((await sample.run()).status, 'REPLAY_REJECTED')
  assert.deepEqual(sample.calls, ['credential', 'project', 'inventory', 'dispose'])
})

test('a present proposed name holds; wrong project consumes an unavailable read', async () => {
  const existing = fixture({ entries: [entry(MISSING_VERCEL_SECRET_NAMES[0])] })
  assert.equal((await existing.run()).status, 'HOLD')
  assert.equal(existing.record.read().outcome, 'HOLD')
  const wrong = fixture({ observedProject: { ...project, repository: { ...project.repository, repoId: 42 } } })
  assert.equal((await wrong.run()).status, 'READ_UNAVAILABLE')
  assert.deepEqual(wrong.calls, ['credential', 'project', 'inventory', 'dispose'])
  assert.equal(wrong.record.read().outcome, 'READ_UNAVAILABLE')
  assert.ok(wrong.token.every(byte => byte === 0))
})

test('an existing record rejects before credential access', async () => {
  const sample = fixture()
  const claim = sample.record.claim()
  assert.equal(claim.state, 'CLAIMED')
  assert.equal((await sample.run()).status, 'REPLAY_REJECTED')
  assert.deepEqual(sample.calls, [])
})
