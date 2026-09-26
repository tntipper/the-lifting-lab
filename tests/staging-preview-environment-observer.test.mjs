import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HOSTED_BASELINE_VERCEL_TARGET } from '../scripts/staging-account-hosted-baseline-vercel.mjs'
import { createStagingPreviewEnvironmentJournal } from '../scripts/staging-preview-environment-journal.mjs'
import { runStagingPreviewEnvironmentObservation, STAGING_PREVIEW_ENVIRONMENT_OBSERVER_ENABLED } from '../scripts/staging-preview-environment-observer.mjs'

const project = { target: HOSTED_BASELINE_VERCEL_TARGET, repository: { provider: 'github', repoId: 1264363509,
  org: 'tntipper', repo: 'the-lifting-lab', ownerId: 17, productionBranch: 'main', sourceless: false } }
const inventory = { target: HOSTED_BASELINE_VERCEL_TARGET, environment: 'preview', branch: 'codex/tll-integration',
  entries: [{ key: 'TLL_STAGING_CART_STOREFRONT_TOKEN', type: 'sensitive', visibility: 'config', scope: 'branch' }] }
const requirements = { requiredSecrets: ['TLL_STAGING_CART_STOREFRONT_TOKEN'], requiredConfiguration: ['NEXT_PUBLIC_TLL_STAGING_CUSTOMER'] }
function journal() {
  return createStagingPreviewEnvironmentJournal({ path: join(mkdtempSync(join(tmpdir(), 'tll-preview-observer-')), 'journal.json') })
}

test('journal claim precedes credential; fixed project is read before inventory; result is name-only and unreplayable', async () => {
  assert.equal(STAGING_PREVIEW_ENVIRONMENT_OBSERVER_ENABLED, false)
  const events = [], j = journal(), token = Buffer.from('secret-token-for-test')
  const run = () => runStagingPreviewEnvironmentObservation({ journal: j, ...requirements,
    readCredential: async () => { events.push('credential'); assert.equal(j.read().state, 'CLAIMED'); return token },
    openVercel: () => ({ readProject: async () => { events.push('project'); return project },
      readEffectivePreviewEnvironmentInventory: async () => { events.push('inventory'); return inventory },
      dispose: () => events.push('dispose') }) })
  const result = await run()
  assert.deepEqual(events, ['credential', 'project', 'inventory', 'dispose'])
  assert.equal(result.status, 'HOLD')
  assert.deepEqual(result.assessment.missing, ['NEXT_PUBLIC_TLL_STAGING_CUSTOMER'])
  assert.deepEqual(result.assessment.secretClassificationUnproven, ['TLL_STAGING_CART_STOREFRONT_TOKEN'])
  assert.equal(j.read().outcome, 'HOLD'); assert.equal(token.every(byte => byte === 0), true)
  assert.equal((await run()).status, 'REPLAY_REJECTED')
  assert.deepEqual(events, ['credential', 'project', 'inventory', 'dispose'])
})

test('repository drift stops before inventory and records unavailable', async () => {
  const j = journal(); let inventoryCalls = 0
  const result = await runStagingPreviewEnvironmentObservation({ journal: j, ...requirements,
    readCredential: async () => Buffer.from('secret-token-for-test'),
    openVercel: () => ({ readProject: async () => ({ ...project, repository: { ...project.repository, repoId: 4 } }),
      readEffectivePreviewEnvironmentInventory: async () => { inventoryCalls++; return inventory }, dispose: () => {} }) })
  assert.equal(result.status, 'READ_UNAVAILABLE'); assert.equal(inventoryCalls, 0)
  assert.equal(j.read().outcome, 'READ_UNAVAILABLE')
})

test('expired credential read settles and wipes a late buffer', async () => {
  const j = journal(); let deliver
  const pending = new Promise(resolve => { deliver = resolve })
  const result = await runStagingPreviewEnvironmentObservation({ journal: j, ...requirements,
    readCredential: async () => pending, openVercel: () => { throw Error('must not open') },
    setTimer: callback => { queueMicrotask(callback); return 1 }, clearTimer: () => {} })
  assert.equal(result.status, 'READ_UNAVAILABLE'); assert.equal(j.read().outcome, 'READ_UNAVAILABLE')
  const late = Buffer.from('late-secret-token')
  deliver(late)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(late.every(byte => byte === 0), true)
})
