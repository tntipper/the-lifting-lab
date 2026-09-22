import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSurfaceActivationJournal, enableStagingSurfaces, freezeStagingSurfaces, HELD_SURFACE_FLAGS,
  NATIVE_SURFACE_ACTIVATION_TRANSPORT_ENABLED, STAGING_BRANCH, STAGING_SURFACE_TARGET } from '../scripts/staging-surface-activation-transport.mjs'

const NOW = 1_789_000_000_000
const requirements = { sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64), observedAt: new Date(NOW).toISOString() }
const oldDeployment = { target: STAGING_SURFACE_TARGET, deploymentId: 'dpl_old123', immutableUrl: 'https://tll-old-123.vercel.app',
  sourceCommit: requirements.sourceCommit, manifestSha256: requirements.manifestSha256, ready: true, createdAt: new Date(NOW - 60_000).toISOString() }
const freshDeployment = { ...oldDeployment, deploymentId: 'dpl_fresh456', immutableUrl: 'https://tll-fresh-456.vercel.app', createdAt: new Date(NOW).toISOString() }
const journal = () => createSurfaceActivationJournal({ path: join(mkdtempSync(join(tmpdir(), 'tll-surface-')), 'journal.json'), makeRunId: () => 'reviewed-surface-run' })

function fixture({ failAt, sameDeployment = false, runtimeDrift = false, nowValue = NOW } = {}) {
  const events = []; let flags = { ...HELD_SURFACE_FLAGS }, active = oldDeployment, created = 0
  const target = value => assert.deepEqual(value, STAGING_SURFACE_TARGET)
  const mutation = (surface, enabled) => surface === 'edge' ? { target: STAGING_SURFACE_TARGET, surface, enabled }
    : { target: STAGING_SURFACE_TARGET, surface, customer: enabled, cart: enabled }
  const runtime = id => ({ target: STAGING_SURFACE_TARGET, deploymentId: id, immutableUrl: active.immutableUrl,
    customerEnabled: runtimeDrift ? !flags.privateCustomer : flags.privateCustomer, cartEnabled: flags.privateCart, brokerEnabled: flags.edge,
    publicCustomerEnabled: flags.publicCustomer, publicCartEnabled: flags.publicCart })
  const ports = {
    setEdgeEnabled: async (value, enabled) => { target(value); events.push(`edge:${enabled}`); flags.edge = enabled; if (failAt === `edge:${enabled}`) throw Error('lost acknowledgement'); return mutation('edge', enabled) },
    setVercelPrivateEnabled: async (value, input) => { target(value); events.push(`private:${input.customer}`); flags.privateCustomer = input.customer; flags.privateCart = input.cart; if (failAt === `private:${input.customer}`) throw Error('lost acknowledgement'); return mutation('private', input.customer) },
    setVercelPublicEnabled: async (value, input) => { target(value); events.push(`public:${input.customer}`); flags.publicCustomer = input.customer; flags.publicCart = input.cart; if (failAt === `public:${input.customer}`) throw Error('lost acknowledgement'); return mutation('public', input.customer) },
    readSurfaceFlags: async value => { target(value); events.push('flags'); if (failAt === 'flags') throw Error('held'); return { target: STAGING_SURFACE_TARGET, ...flags } },
    createPreviewDeployment: async (value, input) => { target(value); events.push('create'); created++; if (failAt === 'create' || (failAt === 'firstCreate' && created === 1)) throw Error('lost acknowledgement')
      assert.deepEqual(input, { branch: STAGING_BRANCH, sourceCommit: requirements.sourceCommit, manifestSha256: requirements.manifestSha256,
        publicCustomer: flags.publicCustomer, publicCart: flags.publicCart }); active = sameDeployment ? oldDeployment : { ...freshDeployment, deploymentId: `dpl_fresh${created}A` }; return { ...active } },
    readDeployment: async (value, id) => { target(value); events.push('readDeployment'); assert.equal(id, active.deploymentId); return { ...active } },
    resolveAlias: async (value, alias) => { target(value); events.push('alias'); return { target: STAGING_SURFACE_TARGET, alias, deploymentId: active.deploymentId, immutableUrl: active.immutableUrl } },
    probeTls: async (value, url) => { target(value); events.push('tls'); return { target: STAGING_SURFACE_TARGET, url, tls: true } },
    readRuntimeReadiness: async (value, id) => { target(value); events.push('runtime'); return runtime(id) },
  }
  return { events, ports, now: () => nowValue }
}

test('freeze builds and proves a distinct immutable held Preview after ordered writes', async () => {
  assert.equal(NATIVE_SURFACE_ACTIVATION_TRANSPORT_ENABLED, false)
  const f = fixture(), j = journal(), result = await freezeStagingSurfaces({ ports: f.ports, currentEvidence: oldDeployment, requirements, journal: j, now: f.now })
  assert.equal(result.status, 'SURFACES_HELD_VERIFIED'); assert.notEqual(result.deployment.deploymentId, oldDeployment.deploymentId)
  assert.deepEqual(f.events.slice(0, 4), ['edge:false', 'private:false', 'public:false', 'create'])
  assert.equal(result.runtime.publicCustomerEnabled, false); assert.equal(j.read().state, 'FREEZE_VERIFIED')
})

test('journal is exclusive mode 0600 and contains no deployment or secret material', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-surface-journal-')), 'journal.json'), j = createSurfaceActivationJournal({ path, makeRunId: () => 'reviewed-surface-run' })
  const intent = j.recordIntent('FREEZE', { nowMs: NOW }); assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.doesNotMatch(readFileSync(path, 'utf8'), /secret|token|password|dpl_/i); j.transition(intent, 'FREEZE_VERIFIED')
})

test('enable proves held runtime and a distinct enabled build including public flags', async () => {
  const f = fixture(), j = journal(), result = await enableStagingSurfaces({ ports: f.ports, heldEvidence: oldDeployment, requirements, journal: j, now: f.now })
  assert.equal(result.status, 'SURFACES_ENABLED_VERIFIED'); assert.notEqual(result.deployment.deploymentId, oldDeployment.deploymentId)
  assert.equal(result.runtime.publicCustomerEnabled, true); assert.equal(result.runtime.publicCartEnabled, true)
  assert.ok(f.events.indexOf('edge:true') < f.events.indexOf('private:true') && f.events.indexOf('private:true') < f.events.indexOf('public:true'))
  assert.equal(j.read().state, 'ENABLE_VERIFIED')
})

test('same or runtime-drifted deployment evidence cannot produce a verified state', async () => {
  for (const options of [{ sameDeployment: true }, { runtimeDrift: true }]) {
    const f = fixture(options), result = await enableStagingSurfaces({ ports: f.ports, heldEvidence: oldDeployment, requirements, journal: journal(), now: f.now })
    assert.notEqual(result.status, 'SURFACES_ENABLED_VERIFIED')
  }
})

test('lost deployment acknowledgement freezes once and never retries enable', async () => {
  const f = fixture({ failAt: 'create' }), result = await enableStagingSurfaces({ ports: f.ports, heldEvidence: oldDeployment, requirements, journal: journal(), now: f.now })
  assert.equal(result.status, 'HOLD_RECONCILIATION_REQUIRED'); assert.equal(f.events.filter(value => value === 'create').length, 2)
  assert.equal(f.events.filter(value => value === 'edge:true').length, 1); assert.equal(f.events.filter(value => value === 'edge:false').length, 1)
})

test('a held recovery build cannot clear uncertainty from a lost enabled-build acknowledgement', async () => {
  const f = fixture({ failAt: 'firstCreate' }), j = journal()
  const result = await enableStagingSurfaces({ ports: f.ports, heldEvidence: oldDeployment, requirements, journal: j, now: f.now })
  assert.equal(result.status, 'HOLD_RECONCILIATION_REQUIRED'); assert.equal(f.events.filter(value => value === 'create').length, 2)
  assert.equal(result.runtime.publicCustomerEnabled, false); assert.equal(j.read().state, 'RECONCILIATION_REQUIRED')
})

test('a deployment created after operation start but before flag-write completion is rejected', async () => {
  const f = fixture(); let calls = 0
  const result = await enableStagingSurfaces({ ports: f.ports, heldEvidence: oldDeployment, requirements, journal: journal(),
    now: () => calls++ < 2 ? NOW : NOW + 1_000 })
  assert.notEqual(result.status, 'SURFACES_ENABLED_VERIFIED')
})

test('invalid prerequisite, production drift and completed replay are side-effect free', async () => {
  const cases = [
    { evidence: { ...oldDeployment, target: { ...STAGING_SURFACE_TARGET, projectRef: 'wrhgscovsgsudtedbljr' } }, req: requirements },
    { evidence: oldDeployment, req: { ...requirements, observedAt: new Date(NOW - 300_001).toISOString() } },
  ]
  for (const value of cases) {
    const f = fixture(), result = await enableStagingSurfaces({ ports: f.ports, heldEvidence: value.evidence, requirements: value.req, journal: journal(), now: f.now })
    assert.equal(result.status, 'HOLD'); assert.deepEqual(f.events, [])
  }
  const j = journal(), intent = j.recordIntent('ENABLE', { nowMs: NOW }); j.transition(intent, 'ENABLE_VERIFIED')
  const f = fixture(), result = await enableStagingSurfaces({ ports: f.ports, heldEvidence: oldDeployment, requirements, journal: j, now: f.now })
  assert.equal(result.status, 'REPLAY_REJECTED'); assert.deepEqual(f.events, [])
})

test('journal race and clock expiry before mutation do not write flags', async () => {
  const f = fixture(); let reads = 0
  const competing = { read: () => reads++ === 0 ? null : { state: 'INTENT_RECORDED' }, recordIntent: () => { throw Error('lost race') }, transition: () => { throw Error('not owned') } }
  const raced = await enableStagingSurfaces({ ports: f.ports, heldEvidence: oldDeployment, requirements, journal: competing, now: f.now })
  assert.equal(raced.status, 'HOLD_RECONCILIATION_REQUIRED'); assert.ok(!f.events.some(value => /^(edge|private|public):/.test(value)))

  const delayed = fixture(); let calls = 0
  const expired = await enableStagingSurfaces({ ports: delayed.ports, heldEvidence: oldDeployment, requirements, journal: journal(), now: () => calls++ === 0 ? NOW : NOW + 300_001 })
  assert.equal(expired.status, 'HOLD'); assert.ok(!delayed.events.some(value => /^(edge|private|public):/.test(value)))
})
