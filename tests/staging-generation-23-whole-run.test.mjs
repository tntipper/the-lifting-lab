import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PHASES, REQUIRED_RESULTS,
  rehearseStagingGeneration23WholeRun } from '../scripts/staging-generation-23-whole-run.mjs'

const start = Date.parse('2026-09-26T12:00:00.000Z')
const expires = '2026-09-26T13:00:00.000Z'
const signal = new AbortController().signal

async function armed() {
  const source = await readFile(new URL('../scripts/staging-generation-23-whole-run.mjs', import.meta.url), 'utf8')
  assert.match(source, /export const STAGING_GENERATION_23_WHOLE_RUN_ENABLED = false/)
  return import(`data:text/javascript;base64,${Buffer.from(source.replace(
    'export const STAGING_GENERATION_23_WHOLE_RUN_ENABLED = false',
    'export const STAGING_GENERATION_23_WHOLE_RUN_ENABLED = true')).toString('base64')}`)
}

function fixture({ fail, throwAt, clockStep = 1000 } = {}) {
  let time = start
  const calls = []
  const operations = Object.fromEntries(PHASES.map(phase => [phase, async () => {
    calls.push(phase)
    if (phase === throwAt) throw new Error('synthetic lost reply with private material')
    return { status: phase === fail ? 'BAD' : REQUIRED_RESULTS[phase] }
  }]))
  return { operations, calls, now: () => { const current = time; time += clockStep; return current } }
}

test('ordinary source is disabled and cannot call any operation', async () => {
  const state = fixture()
  await assert.rejects(rehearseStagingGeneration23WholeRun({ ...state,
    windowExpiresAt: expires, signal }), /unavailable/)
  assert.deepEqual(state.calls, [])
})

test('complete local sequence records only nonsecret phase and time metadata', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const state = fixture()
  const result = await run({ ...state, windowExpiresAt: expires, signal })
  assert.equal(result.status, 'LOCAL_SEQUENCE_PASS')
  assert.equal(result.completedPhases, PHASES.length)
  assert.deepEqual(state.calls, PHASES)
  assert.equal(result.timeline.length, PHASES.length * 2)
  assert.deepEqual(Object.keys(result.timeline[0]), ['phase', 'state', 'atMs'])
  assert.equal(JSON.stringify(result).includes('private material'), false)
})

test('every wrong receipt halts before the next phase; no phase is retried', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  for (const phase of PHASES) {
    const state = fixture({ fail: phase })
    const result = await run({ ...state, windowExpiresAt: expires, signal })
    assert.equal(result.status, 'HOLD', phase)
    assert.equal(result.failedPhase, phase)
    assert.deepEqual(state.calls, PHASES.slice(0, PHASES.indexOf(phase) + 1))
    assert.equal(result.timeline.at(-1).state, 'UNCONFIRMED')
  }
})

test('lost reply from provider, Preview or retirement halts without automatic recovery write', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  for (const phase of ['providerEnable', 'surfaceEnable', 'databaseRetire']) {
    const state = fixture({ throwAt: phase })
    const result = await run({ ...state, windowExpiresAt: expires, signal })
    assert.equal(result.status, 'HOLD')
    assert.equal(result.failedPhase, phase)
    assert.match(result.nextAction, /RECONCILE/)
    assert.deepEqual(state.calls, PHASES.slice(0, PHASES.indexOf(phase) + 1))
    assert.equal(JSON.stringify(result).includes('private material'), false)
  }
})

test('customer step is withheld when less than 15 minutes remain for shutdown', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const state = fixture({ clockStep: 200_000 })
  const result = await run({ ...state, windowExpiresAt: expires, signal })
  assert.equal(result.failedPhase, 'ownerJourney')
  assert.equal(result.timeline.at(-1).state, 'NOT_DISPATCHED')
  assert.equal(state.calls.includes('ownerJourney'), false)
})

test('activation is withheld before provider access when cleanup reserve is gone', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const state = fixture({ clockStep: 330_000 })
  const result = await run({ ...state, windowExpiresAt: expires, signal })
  assert.equal(result.failedPhase, 'providerEnable')
  assert.equal(result.timeline.at(-1).state, 'NOT_DISPATCHED')
  assert.equal(state.calls.includes('providerEnable'), false)
})

test('no password setting or database setup starts without the shutdown reserve', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const shortWindow = fixture({ clockStep: 1000 })
  const settingsStop = await run({ ...shortWindow,
    windowExpiresAt: new Date(start + 14 * 60_000).toISOString(), signal })
  assert.equal(settingsStop.failedPhase, 'settings')
  assert.deepEqual(shortWindow.calls, ['baseline'])

  const setupWindow = fixture({ clockStep: 550_000 })
  const setupStop = await run({ ...setupWindow, windowExpiresAt: expires, signal })
  assert.equal(setupStop.failedPhase, 'databaseSetup')
  assert.deepEqual(setupWindow.calls, ['baseline', 'settings'])
  assert.equal(setupStop.timeline.at(-1).state, 'NOT_DISPATCHED')
})

test('enabled Preview cannot start after earlier steps consume the shutdown reserve', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const state = fixture({ clockStep: 210_000 })
  const result = await run({ ...state, windowExpiresAt: expires, signal })
  assert.equal(result.failedPhase, 'surfaceEnable')
  assert.deepEqual(state.calls, PHASES.slice(0, PHASES.indexOf('surfaceEnable')))
  assert.equal(result.timeline.at(-1).state, 'NOT_DISPATCHED')
})

test('incomplete operation map and expired window stop before any action', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const state = fixture()
  delete state.operations.finalReadback
  await assert.rejects(run({ ...state, windowExpiresAt: expires, signal }), /unavailable/)
  assert.deepEqual(state.calls, [])
  const complete = fixture()
  await assert.rejects(run({ ...complete, now: () => start + 3_600_000,
    windowExpiresAt: expires, signal }), /unavailable/)
  assert.deepEqual(complete.calls, [])
})
