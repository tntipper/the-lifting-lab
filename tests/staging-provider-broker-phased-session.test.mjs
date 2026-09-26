import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createBrokerPhaseJournal } from '../scripts/staging-provider-broker-phase-journal.mjs'
import { BROKER_SECRET_NAME, createProviderBrokerRotationJournal, PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER, STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { BROKER_PHASED_ROTATION_LIVE_ENABLED, runPhasedBrokerRotation } from '../scripts/staging-provider-broker-phased-session.mjs'
import { assessBrokerRecoveryReceipts } from '../scripts/staging-provider-broker-reconciliation.mjs'

const startingProvider = () => ({ ...Object.fromEntries(Object.entries(STAGING_BROKER_PROVIDER).filter(([key]) => key !== 'callbackUrl')), scopes: ['subject'],
  id: 'provider-id', providerType: 'oauth2', name: 'TLL staging subject broker', acceptableClientIds: [],
  attributeMappingPresent: false, authorizationParamsPresent: false, issuer: '', discoveryUrl: '', skipNonceCheck: false,
  discoveryDocumentPresent: false, createdAt: '2026-09-22T10:00:00.000Z', updatedAt: '2026-09-22T10:00:00.000Z' })
function setup({ failAt, badReceipt, wrongRunId = false, clock = Date.now } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-phased-'))
  const runId = randomUUID(), phaseJournal = createBrokerPhaseJournal({ path: join(directory, 'phase.json'), makeRunId: () => runId, now: clock })
  const rotationJournal = createProviderBrokerRotationJournal({ path: join(directory, 'rotation.json'), makeRunId: () => wrongRunId ? randomUUID() : runId })
  const events = [], staged = { vercel: false, supabase: false }
  const receipt = status => ({ status, target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME })
  const ports = {
    preflight: async () => { events.push('preflight'); return { target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER,
      providerEnabled: false, edgeEnabled: false, privateEnabled: false, publicEnabled: false, supabase: [], vercel: [] } },
    getProvider: async () => { events.push('getProvider'); return { target: STAGING_PROVIDER_TARGET, provider: startingProvider() } },
    stageVercelBrokerSecret: async () => { assert.equal(phaseJournal.read().phase, 'VERCEL_STAGE_DISPATCH'); events.push('stageVercel'); staged.vercel = true; if (failAt === 'vercel') throw Error('uncertain'); return badReceipt === 'vercel' ? receipt('BAD') : receipt('STAGED') },
    stageSupabaseBrokerSecret: async () => { assert.equal(phaseJournal.read().phase, 'SUPABASE_STAGE_DISPATCH'); events.push('stageSupabase'); staged.supabase = true; if (failAt === 'supabase') throw Error('uncertain'); return receipt('STAGED') },
    updateProvider: async () => { assert.equal(phaseJournal.read().phase, 'PROVIDER_UPDATE_DISPATCH'); events.push('updateProvider'); if (failAt === 'provider') throw Error('uncertain'); return { status: 'UPDATED', target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER } },
    readProvider: async () => { events.push('readProvider'); return { target: STAGING_PROVIDER_TARGET, provider: STAGING_BROKER_PROVIDER } },
    readbackSecretNames: async () => { events.push('readbackSecretNames'); return { target: STAGING_PROVIDER_TARGET,
      vercel: staged.vercel ? [BROKER_SECRET_NAME] : [], supabase: staged.supabase ? [BROKER_SECRET_NAME] : [] } },
    removeVercelBrokerSecret: async () => { assert.equal(phaseJournal.read().phase, 'VERCEL_REMOVE_DISPATCH'); events.push('removeVercel'); staged.vercel = false; return receipt('REMOVED') },
    removeSupabaseBrokerSecret: async () => { assert.equal(phaseJournal.read().phase, 'SUPABASE_REMOVE_DISPATCH'); events.push('removeSupabase'); staged.supabase = false; return receipt('REMOVED') },
    dispose: async () => { events.push('dispose'); if (failAt === 'dispose') throw Error('disposal uncertain') },
  }
  const run = () => runPhasedBrokerRotation({ acquirePorts: async () => { events.push('acquire'); return ports }, phaseJournal, rotationJournal,
    randomBytes: size => Buffer.alloc(size, 7), now: clock })
  return { run, phaseJournal, rotationJournal, events, staged, ports }
}

test('phased rotation remains disabled as a standalone live entry', () => assert.equal(BROKER_PHASED_ROTATION_LIVE_ENABLED, false))
test('durably orders every dispatch before each effect and binds one run ID', async () => {
  let tick = Date.parse('2026-09-25T12:00:00.000Z')
  const f = setup({ clock: () => ++tick }), result = await f.run()
  assert.equal(result.status, 'ROTATION_VERIFIED'); assert.equal(result.phaseOutcome, 'VERIFIED')
  assert.equal(f.phaseJournal.read().runId, f.rotationJournal.read().runId)
  assert.equal(assessBrokerRecoveryReceipts({ phase: f.phaseJournal.read(), rotation: f.rotationJournal.read() }).status, 'READY_FOR_OBSERVATION')
  assert.deepEqual(f.phaseJournal.read().history.map(event => event.phase), [
    'LAUNCH_STARTED', 'PREFLIGHT', 'PROVIDER_PREREAD', 'INTENT_RECORDED', 'VERCEL_STAGE_DISPATCH', 'VERCEL_STAGE_ACK',
    'SUPABASE_STAGE_DISPATCH', 'SUPABASE_STAGE_ACK', 'PROVIDER_UPDATE_DISPATCH', 'PROVIDER_UPDATE_ACK', 'PROVIDER_POSTREAD', 'HOST_NAMES_READBACK',
  ])
  assert.equal(f.events[0], 'acquire'); assert.equal(f.events.at(-1), 'dispose')
  assert.equal((await f.run()).status, 'REPLAY_REJECTED')
})
test('an earlier core clock sample cannot move the intent outside the phase window', async () => {
  const base = Date.parse('2026-09-25T12:00:00.000Z')
  let sample = 0
  const clock = () => base + (++sample === 4 ? 100 : sample)
  const f = setup({ clock }), result = await f.run()
  assert.equal(result.status, 'ROTATION_VERIFIED')
  const phase = f.phaseJournal.read(), rotation = f.rotationJournal.read()
  assert.equal(rotation.createdAt, phase.history.find(event => event.phase === 'INTENT_RECORDED').at)
  assert.equal(assessBrokerRecoveryReceipts({ phase, rotation }).status, 'READY_FOR_OBSERVATION')
})
test('a lost staging acknowledgement requires confirmed removal before safe stop', async () => {
  const f = setup({ failAt: 'supabase' }), result = await f.run()
  assert.equal(result.status, 'STOPPED_BEFORE_PROVIDER_UPDATE'); assert.equal(result.phaseOutcome, 'STOPPED_BEFORE_UPDATE')
  assert.equal(f.phaseJournal.read().phase, 'REMOVAL_READBACK')
  assert.equal(assessBrokerRecoveryReceipts({ phase: f.phaseJournal.read(), rotation: f.rotationJournal.read() }).status, 'READY_FOR_OBSERVATION')
  assert.deepEqual(f.events.slice(-4), ['removeVercel', 'removeSupabase', 'readbackSecretNames', 'dispose'])
  assert.deepEqual(f.staged, { vercel: false, supabase: false })
})
test('provider uncertainty retains both staged values and requires reconciliation', async () => {
  const f = setup({ failAt: 'provider' }), result = await f.run()
  assert.equal(result.status, 'RECONCILIATION_REQUIRED'); assert.equal(result.phaseOutcome, 'RECONCILIATION_REQUIRED')
  assert.equal(f.phaseJournal.read().phase, 'PROVIDER_UPDATE_DISPATCH')
  assert.equal(f.events.includes('removeVercel'), false); assert.equal(f.staged.vercel && f.staged.supabase, true)
})
test('different journal run IDs stop before any host effect and leave an uncertain record', async () => {
  const f = setup({ wrongRunId: true }), result = await f.run()
  assert.equal(result.status, 'RECONCILIATION_REQUIRED'); assert.equal(result.phaseOutcome, 'RECONCILIATION_REQUIRED')
  assert.equal(f.events.includes('stageVercel'), false)
})
test('invalid host receipt cannot be acknowledged and must be removed', async () => {
  const f = setup({ badReceipt: 'vercel' }), result = await f.run()
  assert.equal(result.status, 'STOPPED_BEFORE_PROVIDER_UPDATE'); assert.equal(result.phaseOutcome, 'STOPPED_BEFORE_UPDATE')
  assert.equal(f.phaseJournal.read().history.some(event => event.phase === 'VERCEL_STAGE_ACK'), false)
  assert.equal(f.events.includes('removeVercel'), true)
})
test('failed dispatch recording prevents the corresponding host effect', async () => {
  const f = setup(), original = f.phaseJournal.record
  const journal = { ...f.phaseJournal, record: (previous, next) => {
    if (next === 'VERCEL_STAGE_DISPATCH') throw Error('disk unavailable')
    return original(previous, next)
  } }
  const result = await runPhasedBrokerRotation({ acquirePorts: async () => f.ports, phaseJournal: journal,
    rotationJournal: f.rotationJournal, randomBytes: size => Buffer.alloc(size, 7), now: Date.now })
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(f.events.includes('stageVercel'), false)
  assert.equal(f.phaseJournal.read().outcome, 'RECONCILIATION_REQUIRED')
})
test('credential adapter disposal failure cannot claim a verified phase', async () => {
  const f = setup({ failAt: 'dispose' }), result = await f.run()
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(f.phaseJournal.read().outcome, 'RECONCILIATION_REQUIRED')
})
