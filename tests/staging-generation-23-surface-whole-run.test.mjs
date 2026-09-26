import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSurfaceActivationJournal, enableStagingSurfaces, freezeStagingSurfaces,
  HELD_SURFACE_FLAGS, STAGING_BRANCH, STAGING_SURFACE_TARGET } from '../scripts/staging-surface-activation-transport.mjs'

const START = Date.parse('2026-09-26T12:00:00.000Z')
const requirements = { sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64),
  observedAt: new Date(START).toISOString() }
const held = { target: STAGING_SURFACE_TARGET, deploymentId: 'dpl_held123',
  immutableUrl: 'https://tll-held-123.vercel.app', sourceCommit: requirements.sourceCommit,
  manifestSha256: requirements.manifestSha256, ready: true,
  createdAt: new Date(START - 60_000).toISOString() }

async function rehearsal() {
  const source = await readFile(new URL('../scripts/staging-generation-23-whole-run.mjs', import.meta.url), 'utf8')
  const armed = source.replace('export const STAGING_GENERATION_23_WHOLE_RUN_ENABLED = false',
    'export const STAGING_GENERATION_23_WHOLE_RUN_ENABLED = true')
  assert.notEqual(armed, source)
  return import(`data:text/javascript;base64,${Buffer.from(armed).toString('base64')}`)
}

function surfaceFixture({ losePublicReply = false } = {}) {
  const events = []
  let flags = { ...HELD_SURFACE_FLAGS }, active = held, build = 0
  const check = value => assert.deepEqual(value, STAGING_SURFACE_TARGET)
  const response = (surface, enabled) => surface === 'edge'
    ? { target: STAGING_SURFACE_TARGET, surface, enabled }
    : { target: STAGING_SURFACE_TARGET, surface, customer: enabled, cart: enabled }
  const ports = {
    async setEdgeEnabled(target, enabled) {
      check(target); events.push(`edge:${enabled}`); flags.edge = enabled
      return response('edge', enabled)
    },
    async setVercelPrivateEnabled(target, input) {
      check(target); events.push(`private:${input.customer}`)
      flags.privateCustomer = input.customer; flags.privateCart = input.cart
      return response('private', input.customer)
    },
    async setVercelPublicEnabled(target, input) {
      check(target); events.push(`public:${input.customer}`)
      flags.publicCustomer = input.customer; flags.publicCart = input.cart
      if (losePublicReply && input.customer) throw new Error('synthetic lost response')
      return response('public', input.customer)
    },
    async readSurfaceFlags(target) { check(target); return { target, ...flags } },
    async createPreviewDeployment(target, input) {
      check(target); events.push('create')
      assert.equal(input.branch, STAGING_BRANCH)
      assert.equal(input.sourceCommit, requirements.sourceCommit)
      assert.equal(input.manifestSha256, requirements.manifestSha256)
      assert.equal(input.publicCustomer, flags.publicCustomer)
      assert.equal(input.publicCart, flags.publicCart)
      build++
      active = { ...held, deploymentId: `dpl_build${build}A`,
        immutableUrl: `https://tll-build-${build}.vercel.app`,
        createdAt: new Date(START).toISOString() }
      return { ...active }
    },
    async readDeployment(target, id) { check(target); assert.equal(id, active.deploymentId); return { ...active } },
    async resolveAlias(target, alias) { check(target); return { target, alias,
      deploymentId: active.deploymentId, immutableUrl: active.immutableUrl } },
    async probeTls(target, url) { check(target); return { target, url, tls: true } },
    async readRuntimeReadiness(target, id) { check(target); assert.equal(id, active.deploymentId)
      return { target, deploymentId: id, immutableUrl: active.immutableUrl,
        customerEnabled: flags.privateCustomer, cartEnabled: flags.privateCart,
        brokerEnabled: flags.edge, publicCustomerEnabled: flags.publicCustomer,
        publicCartEnabled: flags.publicCart } },
  }
  const journal = action => createSurfaceActivationJournal({ path: join(mkdtempSync(
    join(tmpdir(), 'tll-gen23-surface-rehearsal-')), `${action}.json`),
  makeRunId: () => `reviewed-${action}-run` })
  return { ports, events, journal }
}

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
