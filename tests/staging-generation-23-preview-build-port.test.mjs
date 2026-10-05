import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { STAGING_BRANCH, STAGING_SURFACE_TARGET } from '../scripts/staging-surface-activation-transport.mjs'

const source = await readFile(new URL('../scripts/staging-generation-23-preview-build-port.mjs', import.meta.url), 'utf8')
const moduleUrl = new URL('../scripts/staging-surface-activation-transport.mjs', import.meta.url).href
const armed = source.replace('export const STAGING_GENERATION_23_PREVIEW_BUILD_PORT_ENABLED = false',
  'export const STAGING_GENERATION_23_PREVIEW_BUILD_PORT_ENABLED = true')
  .replace("from './staging-surface-activation-transport.mjs'", `from '${moduleUrl}'`)
assert.notEqual(armed, source)
const { createStagingGeneration23PreviewBuildPort } = await import(
  `data:text/javascript;base64,${Buffer.from(armed).toString('base64')}`)

const signal = new AbortController().signal
const base = { branch: STAGING_BRANCH, sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64),
  project: STAGING_SURFACE_TARGET.vercelProject, scope: STAGING_SURFACE_TARGET.vercelScope }
const request = enabled => ({ ...base, publicCustomer: enabled, publicCart: enabled })
const journal = () => {
  let record = null
  return { read: () => record, set: value => { record = value } }
}
function fixture({ failFirst = false, wrongReceipt = false } = {}) {
  const enabledJournal = journal(), heldJournal = journal(), events = []
  let builds = 0
  const runBuild = async ({ input, journal: selected, signal: passed }) => {
    assert.equal(passed, signal)
    builds++
    events.push(input.publicCustomer ? 'enabled' : 'held')
    const deploymentId = `dpl_test${builds}A`
    selected.set({ phase: failFirst && builds === 1 ? 'POST_DISPATCH' : 'VERIFIED',
      deploymentId, sourceCommit: input.sourceCommit, manifestSha256: input.manifestSha256,
      publicCustomer: input.publicCustomer, publicCart: input.publicCart })
    if (failFirst && builds === 1) throw Error('acknowledgement uncertain')
    return { status: 'PROTECTED_PREVIEW_VERIFIED', deploymentId,
      immutableUrl: `https://test-${builds}.vercel.app`, sourceCommit: input.sourceCommit,
      manifestSha256: input.manifestSha256, customerEnabled: input.publicCustomer,
      cartEnabled: wrongReceipt ? !input.publicCart : input.publicCart }
  }
  const readDeployment = async (target, deploymentId, { signal: passed }) => {
    assert.deepEqual(target, STAGING_SURFACE_TARGET)
    assert.equal(passed, signal)
    return { target, deploymentId, immutableUrl: `https://test-${builds}.vercel.app`,
      sourceCommit: base.sourceCommit, manifestSha256: base.manifestSha256,
      ready: true, createdAt: '2026-09-27T12:00:00.000Z' }
  }
  const port = createStagingGeneration23PreviewBuildPort({ enabledJournal, heldJournal, runBuild, readDeployment })
  return { port, enabledJournal, heldJournal, events, get builds() { return builds } }
}

test('enabled then OFF Preview use two distinct verified one-use records', async () => {
  const f = fixture()
  const enabled = await f.port.createDeployment(STAGING_SURFACE_TARGET, request(true), { signal })
  assert.equal(enabled.deploymentId, 'dpl_test1A')
  assert.equal(Object.hasOwn(enabled, 'target'), false)
  assert.equal(f.enabledJournal.read().phase, 'VERIFIED')
  assert.equal(f.heldJournal.read(), null)
  const held = await f.port.createDeployment(STAGING_SURFACE_TARGET, request(false), { signal })
  assert.equal(held.deploymentId, 'dpl_test2A')
  assert.equal(f.heldJournal.read().phase, 'VERIFIED')
  assert.deepEqual(f.events, ['enabled', 'held'])
  await assert.rejects(f.port.createDeployment(STAGING_SURFACE_TARGET, request(false), { signal }), /unavailable/)
  assert.equal(f.builds, 2)
})

test('wrong order, shared record, target and abort stop before a worker call', async () => {
  const f = fixture()
  await assert.rejects(f.port.createDeployment(STAGING_SURFACE_TARGET, request(false), { signal }), /unavailable/)
  await assert.rejects(f.port.createDeployment({ ...STAGING_SURFACE_TARGET, projectRef: 'wrhgscovsgsudtedbljr' }, request(true), { signal }), /unavailable/)
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(f.port.createDeployment(STAGING_SURFACE_TARGET, request(true), { signal: aborted.signal }), /unavailable/)
  assert.equal(f.builds, 0)
  const shared = journal()
  assert.throws(() => createStagingGeneration23PreviewBuildPort({ enabledJournal: shared,
    heldJournal: shared, runBuild: async () => {}, readDeployment: async () => {} }), /unavailable/)
})

test('uncertain first POST cannot be retried or followed by an OFF build', async () => {
  const f = fixture({ failFirst: true })
  await assert.rejects(f.port.createDeployment(STAGING_SURFACE_TARGET, request(true), { signal }), /uncertain/)
  assert.equal(f.enabledJournal.read().phase, 'POST_DISPATCH')
  await assert.rejects(f.port.createDeployment(STAGING_SURFACE_TARGET, request(true), { signal }), /unavailable/)
  await assert.rejects(f.port.createDeployment(STAGING_SURFACE_TARGET, request(false), { signal }), /unavailable/)
  assert.equal(f.builds, 1)
  assert.equal(f.heldJournal.read(), null)
})

test('incorrect verified receipt stops the second build and stays consumed', async () => {
  const f = fixture({ wrongReceipt: true })
  await assert.rejects(f.port.createDeployment(STAGING_SURFACE_TARGET, request(true), { signal }), /unavailable/)
  assert.equal(f.enabledJournal.read().phase, 'VERIFIED')
  await assert.rejects(f.port.createDeployment(STAGING_SURFACE_TARGET, request(false), { signal }), /unavailable/)
  assert.equal(f.builds, 1)
})
