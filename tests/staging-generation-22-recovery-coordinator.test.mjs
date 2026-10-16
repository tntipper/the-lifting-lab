import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration22RecoveryCoordinator } from '../scripts/staging-generation-22-recovery-coordinator.mjs'

const expiry = '2026-09-26T10:50:00.000Z'
const recoveryExpiry = '2026-09-26T11:30:00.000Z'
const now = () => Date.parse('2026-09-26T11:00:00.000Z')
async function armed() {
  const scripts = new URL('../scripts/', import.meta.url)
  let credentials = await readFile(new URL('staging-generation-22-credentials.mjs', scripts), 'utf8')
  credentials = credentials.replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
    `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiry}'`).replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credentials).toString('base64')}`
  let recoveryJournal = await readFile(new URL('staging-generation-22-recovery-journal.mjs', scripts), 'utf8')
  recoveryJournal = recoveryJournal.replace('export const STAGING_GENERATION_22_RECOVERY_JOURNAL_ENABLED = false',
    'export const STAGING_GENERATION_22_RECOVERY_JOURNAL_ENABLED = true')
    .replace("export const RECOVERY_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
    `export const RECOVERY_WINDOW_EXPIRES_AT = '${recoveryExpiry}'`)
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
    .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  const recoveryUrl = `data:text/javascript;base64,${Buffer.from(recoveryJournal).toString('base64')}`
  let source = await readFile(new URL('staging-generation-22-recovery-coordinator.mjs', scripts), 'utf8')
  source = source.replace('export const STAGING_GENERATION_22_RECOVERY_COORDINATOR_ENABLED = false',
    'export const STAGING_GENERATION_22_RECOVERY_COORDINATOR_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replace("from './staging-generation-22-recovery-journal.mjs'", `from '${recoveryUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const create = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`))
    .createStagingGeneration22RecoveryCoordinator
  return Object.assign(create, { journalModule: await import(recoveryUrl) })
}

function fixture({ failActive = false, failRecovery = false, failRetired = false,
  failHold = false } = {}) {
  const calls = []
  let state = { schema: 'tll-staging-generation-22-recovery-dispatch/v1',
    projectRef: 'qdmvngjwkcsilzmqksme', generation: 22,
    windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543', expiresAt: expiry,
    recoveryExpiresAt: recoveryExpiry, runId: '5f5bf963-3d2c-4f37-b489-d5047e0ebdc9',
    createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T10:00:00.000Z',
    state: 'CLAIMED', receiptDigest: null }
  const journal = {
    read() { calls.push('read'); return state },
    dispatch(previous) { assert.equal(previous, state); calls.push('dispatch')
      state = { ...state, state: 'DISPATCHED' }; return state },
    capability(previous) { assert.equal(previous, state); calls.push('capability'); return Object.freeze({}) },
    confirm(previous, receiptDigest) { assert.equal(previous, state); calls.push('confirm')
      state = { ...state, state: 'FINISHED', receiptDigest }; return state },
    hold(previous) { assert.equal(previous, state); calls.push('hold')
      if (failHold) throw new Error('synthetic durable hold failure')
      state = { ...state, state: 'HOLD' }; return state },
  }
  const active = { async prove({ signal }) { calls.push('active')
    assert.equal(signal.aborted, false)
    if (failActive) throw new Error('synthetic active read failure')
    return { status: 'PASS_ACTIVE', projectRef: 'qdmvngjwkcsilzmqksme',
      queryId: 'tll-staging-generation-22-active-check/v1', receiptSha256: 'a'.repeat(64) } } }
  const recovery = { async retire({ capability, signal, expiresAt }) {
    calls.push('retire'); assert.deepEqual(capability, {}); assert.equal(signal.aborted, false)
    assert.equal(expiresAt, expiry)
    if (failRecovery) throw new Error('synthetic uncertain retirement')
    return { status: 'PASS_RETIRED', projectRef: 'qdmvngjwkcsilzmqksme', generation: 22,
      windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543', receiptSha256: 'b'.repeat(64) }
  } }
  const retired = { async prove({ signal }) { calls.push('retired'); assert.equal(signal.aborted, false)
    if (failRetired) throw new Error('synthetic retired read failure')
    return { status: 'PASS_RETIRED', projectRef: 'qdmvngjwkcsilzmqksme',
      queryId: 'tll-staging-generation-22-retired-check/v1', receiptSha256: 'c'.repeat(64) } } }
  return { journal, active, recovery, retired, calls, now }
}

test('recovery coordinator remains disconnected by default', () => {
  assert.throws(() => createStagingGeneration22RecoveryCoordinator(fixture()), /unavailable/)
})

test('one retirement follows active proof and is followed by retired proof', async () => {
  const create = await armed(), input = fixture()
  const coordinator = create(input)
  const result = await coordinator.recover({ signal: new AbortController().signal })
  assert.equal(result.status, 'RECOVERY_VERIFIED')
  assert.deepEqual(input.calls, ['read', 'active', 'dispatch', 'capability', 'retire', 'confirm', 'retired'])
  assert.equal(input.journal.read().state, 'FINISHED')
  await assert.rejects(coordinator.recover({ signal: new AbortController().signal }), /unavailable/)
})

test('no retirement occurs when active state is unproved or receipt is malformed', async () => {
  const create = await armed()
  const malformed = fixture()
  malformed.active.prove = async () => ({ status: 'PASS_ACTIVE',
    projectRef: 'qdmvngjwkcsilzmqksme', queryId: 'tll-staging-generation-22-active-check/v1',
    receiptSha256: 'wrong' })
  for (const input of [fixture({ failActive: true }), malformed]) {
    const result = await create(input).recover({ signal: new AbortController().signal })
    assert.equal(result.status, 'HOLD_RECONCILE')
    assert.equal(input.calls.includes('retire'), false)
    assert.equal(input.calls.includes('dispatch'), false)
  }
})

test('wrong-generation record and caller cancellation stop before dispatch', async () => {
  const create = await armed()
  const wrong = fixture()
  const read = wrong.journal.read
  wrong.journal.read = () => ({ ...read(), generation: 21 })
  assert.equal((await create(wrong).recover({ signal: new AbortController().signal })).status,
    'JOURNAL_UNCERTAIN')
  assert.equal(wrong.calls.includes('active'), false)
  assert.equal(wrong.calls.includes('dispatch'), false)

  const stalled = fixture()
  const controller = new AbortController()
  let requestSignal
  stalled.active.prove = ({ signal }) => { requestSignal = signal; stalled.calls.push('active')
    return new Promise(() => {}) }
  const attempt = create(stalled).recover({ signal: controller.signal })
  await new Promise(resolve => setImmediate(resolve))
  controller.abort()
  assert.equal((await attempt).status, 'HOLD_RECONCILE')
  assert.equal(requestSignal.aborted, true)
  assert.equal(stalled.calls.includes('dispatch'), false)
})

test('uncertain retirement is held and retired read is never used', async () => {
  const create = await armed(), input = fixture({ failRecovery: true })
  const result = await create(input).recover({ signal: new AbortController().signal })
  assert.equal(result.status, 'HOLD_RECONCILE')
  assert.deepEqual(input.calls, ['read', 'active', 'dispatch', 'capability', 'retire', 'hold'])
})

test('failed durable hold reports uncertainty; failed post-retirement read does not replay', async () => {
  const create = await armed()
  const holdFailure = fixture({ failRecovery: true, failHold: true })
  assert.equal((await create(holdFailure).recover({ signal: new AbortController().signal })).status,
    'JOURNAL_UNCERTAIN')
  const readFailure = fixture({ failRetired: true })
  assert.equal((await create(readFailure).recover({ signal: new AbortController().signal })).status,
    'RETIREMENT_UNVERIFIED')
  assert.equal(readFailure.journal.read().state, 'FINISHED')
  assert.equal(readFailure.calls.filter(call => call === 'retire').length, 1)
})

test('real one-use recovery journal composes with the disabled coordinator in memory', async () => {
  const create = await armed(), input = fixture()
  let clock = Date.parse('2026-09-26T10:00:00.000Z')
  const current = () => clock
  const path = join(mkdtempSync(join(tmpdir(), 'tll-gen22-recovery-coordinate-')),
    'private', 'record.json')
  const journal = create.journalModule.createStagingGeneration22RecoveryJournal({ path, now: current })
  journal.claim()
  clock = Date.parse('2026-09-26T11:00:00.000Z')
  const result = await create({ ...input, journal, now: current })
    .recover({ signal: new AbortController().signal })
  assert.equal(result.status, 'RECOVERY_VERIFIED')
  assert.equal(journal.read().state, 'FINISHED')
  assert.match(journal.read().receiptDigest, /^[a-f0-9]{64}$/)
})
