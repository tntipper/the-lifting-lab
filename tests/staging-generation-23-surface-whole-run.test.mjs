import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enableStagingSurfaces, freezeStagingSurfaces } from '../scripts/staging-surface-activation-transport.mjs'
import { START, requirements, held, rehearsal, surfaceFixture } from './helpers/staging-generation-23-surface-fixture.mjs'

test('whole order invokes the existing enabled and OFF Preview controller exactly once', async () => {
  const { PHASES, REQUIRED_RESULTS, rehearseStagingGeneration23WholeRun: run } = await rehearsal()
  const surface = surfaceFixture(), calls = []
  let enabled
  const operations = Object.fromEntries(PHASES.map(phase => [phase, async () => {
    calls.push(phase)
    if (phase === 'surfaceEnable') {
      const result = await enableStagingSurfaces({ ports: surface.ports, heldEvidence: held,
        requirements, journal: surface.journal('enable'), now: () => START })
      assert.equal(result.status, 'SURFACES_ENABLED_VERIFIED')
      enabled = result.deployment
    } else if (phase === 'surfaceFreeze') {
      const result = await freezeStagingSurfaces({ ports: surface.ports, currentEvidence: enabled,
        requirements, journal: surface.journal('freeze'), now: () => START })
      assert.equal(result.status, 'SURFACES_HELD_VERIFIED')
    }
    return { status: REQUIRED_RESULTS[phase] }
  }]))
  const result = await run({ operations, now: () => START, windowExpiresAt: new Date(START + 3_600_000).toISOString(),
    signal: new AbortController().signal })
  assert.equal(result.status, 'LOCAL_SEQUENCE_PASS')
  assert.deepEqual(calls, PHASES)
  assert.deepEqual(surface.events, ['edge:true', 'private:true', 'public:true', 'create',
    'edge:false', 'private:false', 'public:false', 'create'])
})

test('lost public-setting reply blocks owner journey and all later writes', async () => {
  const { PHASES, REQUIRED_RESULTS, rehearseStagingGeneration23WholeRun: run } = await rehearsal()
  const surface = surfaceFixture({ losePublicReply: true }), calls = []
  const operations = Object.fromEntries(PHASES.map(phase => [phase, async () => {
    calls.push(phase)
    if (phase === 'surfaceEnable') {
      const result = await enableStagingSurfaces({ ports: surface.ports, heldEvidence: held,
        requirements, journal: surface.journal('enable'), now: () => START })
      return { status: result.status }
    }
    return { status: REQUIRED_RESULTS[phase] }
  }]))
  const result = await run({ operations, now: () => START, windowExpiresAt: new Date(START + 3_600_000).toISOString(),
    signal: new AbortController().signal })
  assert.equal(result.status, 'HOLD')
  assert.equal(result.failedPhase, 'surfaceEnable')
  assert.equal(calls.includes('ownerJourney'), false)
  assert.deepEqual(surface.events, ['edge:true', 'private:true', 'public:true'])
})
