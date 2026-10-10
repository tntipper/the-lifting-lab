import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

async function journal() {
  const scripts = new URL('../scripts/', import.meta.url)
  let source = await readFile(new URL('staging-generation-23-whole-route-journal.mjs', scripts), 'utf8')
  source = source.replace('export const STAGING_GENERATION_23_WHOLE_ROUTE_JOURNAL_ENABLED = false',
    'export const STAGING_GENERATION_23_WHOLE_ROUTE_JOURNAL_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
    .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  const journalSource = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  return journalSource.createStagingGeneration23WholeRouteJournal({
    path: join(mkdtempSync(join(tmpdir(), 'tll-gen23-joined-journal-')), 'route.json'),
  })
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

test('complete controller durably records each phase and its final PASS', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const record = await journal(), state = fixture()
  const result = await run({ ...state, journal: record, windowExpiresAt: expires, signal })
  assert.equal(result.status, 'LOCAL_SEQUENCE_PASS')
  assert.equal(record.read().state, 'PASS')
  assert.equal(record.read().phases.length, PHASES.length)
  assert.throws(() => record.claim(), /unavailable/)
})

test('known owner failure records separate verified shutdown rather than PASS', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const record = await journal(), state = fixture()
  state.operations.ownerJourney = async () => ({ status: 'OWNER_JOURNEY_FAILED_VERIFIED' })
  const result = await run({ ...state, journal: record, windowExpiresAt: expires, signal })
  assert.equal(result.status, 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED')
  assert.equal(record.read().state, 'OWNER_FAILURE_SHUTDOWN_VERIFIED')
  assert.equal(record.read().phases.find(value => value.phase === 'ownerJourney').state,
    'FAILED_VERIFIED')
})

test('a failed operation leaves a terminal hold before dependent work', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const record = await journal(), state = fixture({ fail: 'surfaceEnable' })
  const result = await run({ ...state, journal: record, windowExpiresAt: expires, signal })
  assert.equal(result.status, 'HOLD')
  assert.equal(record.read().state, 'HOLD')
  assert.equal(record.read().pendingPhase, 'surfaceEnable')
  assert.equal(state.calls.includes('ownerJourney'), false)
})

test('journal preserves a budget-skipped customer test while shutdown succeeds', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const record = await journal()
  let time = start
  const operations = Object.fromEntries(PHASES.map(phase => [phase, async () => {
    if (phase === 'surfaceEnable') time = start + 47 * 60_000
    return { status: REQUIRED_RESULTS[phase] }
  }]))
  const result = await run({ operations, now: () => time, journal: record,
    windowExpiresAt: expires, signal })
  assert.equal(result.status, 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED')
  assert.equal(record.read().state, 'OWNER_FAILURE_SHUTDOWN_VERIFIED')
  assert.equal(record.read().phases.find(value => value.phase === 'ownerJourney').state,
    'SKIPPED_VERIFIED')
})

test('journal records a budget hold before dispatching a later effect', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const record = await journal(), state = fixture({ clockStep: 330_000 })
  const result = await run({ ...state, journal: record, windowExpiresAt: expires, signal })
  assert.equal(result.status, 'HOLD')
  assert.equal(record.read().state, 'HOLD')
  assert.equal(record.read().phases.at(-1).state, 'NOT_DISPATCHED_HOLD')
  assert.equal(state.calls.includes(result.failedPhase), false)
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

test('customer step is withheld and verified shutdown still runs when under 15 minutes remain', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  let time = start
  const calls = []
  const operations = Object.fromEntries(PHASES.map(phase => [phase, async () => {
    calls.push(phase)
    if (phase === 'surfaceEnable') time = start + 47 * 60_000
    return { status: REQUIRED_RESULTS[phase] }
  }]))
  const result = await run({ operations, now: () => time,
    windowExpiresAt: expires, signal })
  assert.equal(result.status, 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED')
  assert.equal(result.failedPhase, 'ownerJourney')
  assert.equal(result.timeline.find(item => item.phase === 'ownerJourney').state, 'NOT_DISPATCHED')
  assert.equal(calls.includes('ownerJourney'), false)
  assert.deepEqual(calls.slice(-4), PHASES.slice(-4))
})

test('customer step needs its own ten-minute budget in addition to shutdown reserve', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  let time = start
  const calls = []
  const operations = Object.fromEntries(PHASES.map(phase => [phase, async () => {
    calls.push(phase)
    if (phase === 'surfaceEnable') time = start + 36 * 60_000
    return { status: REQUIRED_RESULTS[phase] }
  }]))
  const result = await run({ operations, now: () => time,
    windowExpiresAt: expires, signal })
  assert.equal(result.status, 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED')
  assert.equal(result.failedPhase, 'ownerJourney')
  assert.equal(result.reason, 'INSUFFICIENT_OWNER_BUDGET')
  assert.equal(result.timeline.find(item => item.phase === 'ownerJourney').state, 'NOT_DISPATCHED')
  assert.equal(calls.includes('ownerJourney'), false)
  assert.deepEqual(calls.slice(-4), PHASES.slice(-4))
})

test('a verified customer failure closes backend and Preview before retirement', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const state = fixture()
  state.operations.ownerJourney = async () => {
    state.calls.push('ownerJourney')
    return { status: 'OWNER_JOURNEY_FAILED_VERIFIED' }
  }
  const result = await run({ ...state, windowExpiresAt: expires, signal })
  assert.equal(result.status, 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED')
  assert.equal(result.reason, 'OWNER_JOURNEY_FAILED_VERIFIED')
  assert.deepEqual(state.calls, PHASES)
  assert.equal(result.timeline.find(item => item.phase === 'ownerJourney' && item.state === 'FAILED_VERIFIED')?.state,
    'FAILED_VERIFIED')
  assert.equal(result.timeline.at(-1).state, 'VERIFIED')
})

test('shutdown failure after a known customer failure is still a HOLD', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const state = fixture({ fail: 'backendDisable' })
  state.operations.ownerJourney = async () => {
    state.calls.push('ownerJourney')
    return { status: 'OWNER_JOURNEY_FAILED_VERIFIED' }
  }
  const result = await run({ ...state, windowExpiresAt: expires, signal })
  assert.equal(result.status, 'HOLD')
  assert.equal(result.failedPhase, 'backendDisable')
  assert.equal(result.priorOwnerFailure, 'OWNER_JOURNEY_FAILED_VERIFIED')
  assert.equal(state.calls.includes('surfaceFreeze'), false)
})

test('customer step receives a deadline and a late result cannot count as a pass', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  let time = start, ownerDeadline
  const calls = []
  const operations = Object.fromEntries(PHASES.map(phase => [phase, async ({ phaseDeadlineAt }) => {
    calls.push(phase)
    if (phase === 'ownerJourney') {
      ownerDeadline = phaseDeadlineAt
      time = start + 11 * 60_000
    }
    return { status: REQUIRED_RESULTS[phase] }
  }]))
  const result = await run({ operations, now: () => time,
    windowExpiresAt: expires, signal })
  assert.equal(ownerDeadline, new Date(start + 10 * 60_000).toISOString())
  assert.equal(result.status, 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED')
  assert.equal(result.failedPhase, 'ownerJourney')
  assert.equal(result.reason, 'OWNER_JOURNEY_OVERRAN_BUDGET')
  assert.equal(result.timeline.find(item => item.phase === 'ownerJourney'
    && item.state === 'LATE_VERIFIED')?.state, 'LATE_VERIFIED')
  assert.deepEqual(calls.slice(-4), PHASES.slice(-4))
})

test('an uncertain late customer result still holds for reconciliation', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  let time = start
  const calls = []
  const operations = Object.fromEntries(PHASES.map(phase => [phase, async () => {
    calls.push(phase)
    if (phase === 'ownerJourney') {
      time = start + 11 * 60_000
      return { status: 'UNKNOWN' }
    }
    return { status: REQUIRED_RESULTS[phase] }
  }]))
  const result = await run({ operations, now: () => time,
    windowExpiresAt: expires, signal })
  assert.equal(result.status, 'HOLD')
  assert.equal(result.failedPhase, 'ownerJourney')
  assert.equal(result.timeline.at(-1).state, 'UNCONFIRMED')
  assert.equal(calls.includes('backendDisable'), false)
})

test('activation is withheld before provider access when cleanup reserve is gone', async () => {
  const { rehearseStagingGeneration23WholeRun: run } = await armed()
  const state = fixture({ clockStep: 330_000 })
  const result = await run({ ...state, windowExpiresAt: expires, signal })
  assert.equal(result.failedPhase, 'consumerReadiness')
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
  assert.equal(result.failedPhase, 'databaseEnable')
  assert.deepEqual(state.calls, PHASES.slice(0, PHASES.indexOf('databaseEnable')))
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
