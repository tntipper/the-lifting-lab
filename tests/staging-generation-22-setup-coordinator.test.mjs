import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OPERATION_IDS } from '../scripts/staging-generation-22-journal.mjs'
import { DISABLED_VERCEL_CONFIGURATION } from '../scripts/staging-generation-22-material.mjs'
import { createStagingGeneration22SetupCoordinator } from '../scripts/staging-generation-22-setup-coordinator.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const expiry = '2026-09-26T10:50:00.000Z'
const recoveryExpiry = '2026-09-26T11:30:00.000Z'
async function armed() {
  let material = await readFile(new URL('staging-generation-22-material.mjs', scripts), 'utf8')
  material = material.replace('export const STAGING_GENERATION_22_MATERIAL_ENABLED = false',
    'export const STAGING_GENERATION_22_MATERIAL_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  const materialUrl = `data:text/javascript;base64,${Buffer.from(material).toString('base64')}`
  let credentials = await readFile(new URL('staging-generation-22-credentials.mjs', scripts), 'utf8')
  credentials = credentials.replace('export const STAGING_GENERATION_22_CREDENTIALS_ENABLED = false',
    'export const STAGING_GENERATION_22_CREDENTIALS_ENABLED = true')
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
    `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiry}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialsUrl = `data:text/javascript;base64,${Buffer.from(credentials).toString('base64')}`
  let journal = await readFile(new URL('staging-generation-22-journal.mjs', scripts), 'utf8')
  journal = journal.replace('export const STAGING_GENERATION_22_JOURNAL_ENABLED = false',
    'export const STAGING_GENERATION_22_JOURNAL_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialsUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
    .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  const journalUrl = `data:text/javascript;base64,${Buffer.from(journal).toString('base64')}`
  let recoveryJournal = await readFile(new URL('staging-generation-22-recovery-journal.mjs', scripts), 'utf8')
  recoveryJournal = recoveryJournal.replace('export const STAGING_GENERATION_22_RECOVERY_JOURNAL_ENABLED = false',
    'export const STAGING_GENERATION_22_RECOVERY_JOURNAL_ENABLED = true')
    .replace("export const RECOVERY_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const RECOVERY_WINDOW_EXPIRES_AT = '${recoveryExpiry}'`)
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialsUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
    .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  const recoveryJournalUrl = `data:text/javascript;base64,${Buffer.from(recoveryJournal).toString('base64')}`
  let databaseHost = await readFile(new URL('staging-generation-22-database-host.mjs', scripts), 'utf8')
  databaseHost = databaseHost.replace('export const STAGING_GENERATION_22_DATABASE_HOST_ENABLED = false',
    'export const STAGING_GENERATION_22_DATABASE_HOST_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialsUrl}'`)
    .replace("from './staging-generation-22-journal.mjs'", `from '${journalUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const databaseHostUrl = `data:text/javascript;base64,${Buffer.from(databaseHost).toString('base64')}`
  let source = await readFile(new URL('staging-generation-22-setup-coordinator.mjs', scripts), 'utf8')
  source = source.replace('export const STAGING_GENERATION_22_SETUP_COORDINATOR_ENABLED = false',
    'export const STAGING_GENERATION_22_SETUP_COORDINATOR_ENABLED = true')
    .replace("from './staging-generation-22-material.mjs'", `from '${materialUrl}'`)
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialsUrl}'`)
    .replace("from './staging-generation-22-journal.mjs'", `from '${journalUrl}'`)
    .replace("from './staging-generation-22-recovery-journal.mjs'", `from '${recoveryJournalUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return { ...await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`),
    journalModule: await import(journalUrl), credentialsModule: await import(credentialsUrl),
    databaseHostModule: await import(databaseHostUrl), recoveryJournalModule: await import(recoveryJournalUrl) }
}

function fixture({ failAt, failReadback = false } = {}) {
  const calls = []
  const journal = {
    claim() { calls.push('claim'); return { state: 'CLAIMED', nextIndex: 0 } },
    dispatch(previous, operationId) {
      assert.equal(operationId, OPERATION_IDS[previous.nextIndex])
      calls.push(`dispatch:${operationId}`)
      return { state: 'DISPATCHED', nextIndex: previous.nextIndex, pending: operationId }
    },
    databaseCapability() { return Object.freeze({}) },
    operationCapability() { return Object.freeze({}) },
    confirm(previous, value) {
      assert.match(value, /^[a-f0-9]{64}$/)
      calls.push(`confirm:${previous.pending}`)
      const nextIndex = previous.nextIndex + 1
      return { state: nextIndex === 22 ? 'FINISHED' : 'READY', nextIndex }
    },
    hold(previous) { calls.push(`hold:${previous.pending ?? 'none'}`); return { state: 'HOLD' } },
  }
  const recoveryJournal = { claim() {
    calls.push('claim:recovery')
    return { schema: 'tll-staging-generation-22-recovery-dispatch/v1', state: 'CLAIMED',
      projectRef: 'qdmvngjwkcsilzmqksme', generation: 22,
      windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543',
      expiresAt: expiry, recoveryExpiresAt: recoveryExpiry,
      runId: '5f5bf963-3d2c-4f37-b489-d5047e0ebdc9',
      createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T10:00:00.000Z',
      receiptDigest: null }
  } }
  const stageReceipt = (name, classification) => ({ status: 'STAGED', name,
    id: `env_${name.toLowerCase()}`, branch: 'codex/tll-integration', target: 'preview', classification })
  const database = { async install({ verifiers }) {
    calls.push('host:database')
    assert.equal(Object.keys(verifiers).length, 5)
    return { status: 'PASS', projectRef: 'qdmvngjwkcsilzmqksme', generation: 22,
      windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543', receiptSha256: 'a'.repeat(64) }
  } }
  const vercel = { async stageSecret({ name, value }) {
    calls.push(`host:secret:${name}`)
    if (name === failAt) throw new Error('synthetic uncertain write')
    assert.equal(typeof value, 'string')
    return stageReceipt(name, 'sensitive')
  } }
  const edge = { async stageSecret({ name, value }) {
    calls.push(`host:edge:${name}`)
    assert.equal(typeof value, 'string')
    return { status: 'STAGED', name, projectRef: 'qdmvngjwkcsilzmqksme' }
  } }
  const config = { async stageDisabled({ name, value }) {
    calls.push(`host:config:${name}`)
    assert.equal(value, DISABLED_VERCEL_CONFIGURATION[name])
    return stageReceipt(name, 'config')
  } }
  const readback = { async prove({ createdControls }) {
    calls.push('readback')
    assert.equal(Object.keys(createdControls).length, 4)
    if (failReadback) throw new Error('synthetic missing name')
    return { status: 'DISABLED_SETTINGS_VERIFIED', projectRef: 'qdmvngjwkcsilzmqksme',
      branch: 'codex/tll-integration', vercelSecretCount: 16,
      disabledControlCount: 4, edgePasswordNamePresent: true }
  } }
  return { journal, recoveryJournal, database, vercel, edge, config, readback, calls }
}

test('setup coordinator remains disconnected by default', () => {
  assert.throws(() => createStagingGeneration22SetupCoordinator(fixture()), /unavailable/)
})

test('setup never reaches a host when recovery reservation cannot be claimed', async () => {
  const { createStagingGeneration22SetupCoordinator: create } = await armed()
  const input = fixture()
  input.recoveryJournal.claim = () => { throw new Error('synthetic recovery record unavailable') }
  const result = await create({ ...input, now: () => Date.parse('2026-09-26T10:00:00.000Z') })
    .stage({ signal: new AbortController().signal })
  assert.equal(result.status, 'HOLD_RECONCILE')
  assert.deepEqual(input.calls, ['claim', 'hold:none'])
})

test('wrong-generation recovery reservation blocks setup before material or host access', async () => {
  const { createStagingGeneration22SetupCoordinator: create } = await armed()
  const input = fixture()
  const claim = input.recoveryJournal.claim
  input.recoveryJournal.claim = () => ({ ...claim(), generation: 21 })
  const result = await create({ ...input, now: () => Date.parse('2026-09-26T10:00:00.000Z') })
    .stage({ signal: new AbortController().signal })
  assert.equal(result.status, 'HOLD_RECONCILE')
  assert.deepEqual(input.calls, ['claim', 'claim:recovery', 'hold:none'])
})

test('coordinator stages all 22 writes in journal order, then reads back OFF state', async () => {
  const { createStagingGeneration22SetupCoordinator: create } = await armed()
  const input = fixture()
  const coordinator = create({ ...input, now: () => Date.parse('2026-09-26T10:00:00.000Z') })
  const result = await coordinator.stage({ signal: new AbortController().signal })
  assert.equal(result.status, 'SETTINGS_STAGED_OFF_VERIFIED', JSON.stringify(input.calls.slice(0, 6)))
  assert.equal(result.operationCount, 22)
  assert.equal(input.calls.filter(value => value.startsWith('dispatch:')).length, 22)
  assert.equal(input.calls.filter(value => value.startsWith('confirm:')).length, 22)
  assert.equal(input.calls.at(-1), 'readback')
  await assert.rejects(coordinator.stage({ signal: new AbortController().signal }), /unavailable/)
})

test('an uncertain write holds the one-use record and sends no later operation', async () => {
  const { createStagingGeneration22SetupCoordinator: create } = await armed()
  const failedName = OPERATION_IDS[5].slice('VERCEL_SECRET:'.length)
  const input = fixture({ failAt: failedName })
  const result = await create({ ...input, now: () => Date.parse('2026-09-26T10:00:00.000Z') })
    .stage({ signal: new AbortController().signal })
  assert.equal(result.status, 'HOLD_RECONCILE')
  assert.equal(result.completedCount, 5)
  assert.equal(input.calls.at(-1), `hold:VERCEL_SECRET:${failedName}`)
  assert.equal(input.calls.some(value => value.startsWith('host:edge:')), false)
  assert.equal(input.calls.includes('readback'), false)
})

test('a failed readback reports staged but unverified and cannot replay writes', async () => {
  const { createStagingGeneration22SetupCoordinator: create } = await armed()
  const input = fixture({ failReadback: true })
  const result = await create({ ...input, now: () => Date.parse('2026-09-26T10:00:00.000Z') })
    .stage({ signal: new AbortController().signal })
  assert.equal(result.status, 'SETTINGS_STAGED_UNVERIFIED')
  assert.equal(input.calls.filter(value => value.startsWith('confirm:')).length, 22)
  assert.equal(input.calls.some(value => value.startsWith('hold:')), false)
})

test('failed durable HOLD is reported as uncertain rather than held', async () => {
  const { createStagingGeneration22SetupCoordinator: create } = await armed()
  const failedName = OPERATION_IDS[5].slice('VERCEL_SECRET:'.length)
  const input = fixture({ failAt: failedName })
  input.journal.hold = () => { throw new Error('synthetic journal disk failure') }
  const result = await create({ ...input, now: () => Date.parse('2026-09-26T10:00:00.000Z') })
    .stage({ signal: new AbortController().signal })
  assert.equal(result.status, 'JOURNAL_UNCERTAIN')
  assert.equal(result.completedCount, 5)
})

test('caller cancellation aborts the first database write and stops the sequence', async () => {
  const { createStagingGeneration22SetupCoordinator: create } = await armed()
  const input = fixture()
  const parent = new AbortController()
  let reached
  const started = new Promise(resolve => { reached = resolve })
  let childSignal
  input.database.install = ({ signal }) => {
    childSignal = signal
    input.calls.push('host:database')
    reached()
    return new Promise((_, reject) => signal.addEventListener('abort',
      () => reject(new Error('synthetic database aborted')), { once: true }))
  }
  const pending = create({ ...input, now: () => Date.parse('2026-09-26T10:00:00.000Z') })
    .stage({ signal: parent.signal })
  await started
  parent.abort()
  const result = await pending
  assert.equal(childSignal.aborted, true)
  assert.equal(result.status, 'HOLD_RECONCILE')
  assert.deepEqual(input.calls.slice(-2), ['host:database', 'hold:DATABASE_CREDENTIALS'])
  assert.equal(input.calls.some(value => value.startsWith('host:secret:')), false)
})

test('coordinator composes with real journal and database capability once', async () => {
  const { createStagingGeneration22SetupCoordinator: create, journalModule,
    credentialsModule, databaseHostModule, recoveryJournalModule } = await armed()
  const now = () => Date.parse('2026-09-26T10:00:00.000Z')
  const path = join(mkdtempSync(join(tmpdir(), 'tll-gen22-setup-compose-')), 'private', 'record.json')
  const journal = journalModule.createStagingGeneration22Journal({ path, now })
  const recoveryPath = join(mkdtempSync(join(tmpdir(), 'tll-gen22-recovery-reserve-')), 'private', 'record.json')
  const recoveryJournal = recoveryJournalModule.createStagingGeneration22RecoveryJournal({ path: recoveryPath, now })
  let databaseCalls = 0
  const database = databaseHostModule.createStagingGeneration22DatabaseHost({ now,
    post: async (packet, { signal }) => {
      databaseCalls++
      assert.equal(signal.aborted, false)
      assert.match(credentialsModule.consumeStagingGeneration22PreparedSql(packet), /BEGIN;/)
      return [{ tll_generation_22_credential_receipt: { status: 'PASS',
        packageId: 'tll-staging-generation-22-credentials/v1',
        projectRef: 'qdmvngjwkcsilzmqksme', generation: 22,
        windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543', expiresAt: expiry,
        controlsEnabled: false, runtimeCount: 5 } }]
    } })
  const receipt = (name, classification) => ({ status: 'STAGED', name,
    id: `env_${name.toLowerCase()}`, branch: 'codex/tll-integration', target: 'preview', classification })
  const vercel = { async stageSecret({ name, capability }) {
    journalModule.consumeStagingGeneration22OperationCapability(capability, `VERCEL_SECRET:${name}`)
    return receipt(name, 'sensitive')
  } }
  const edge = { async stageSecret({ name, capability }) {
    journalModule.consumeStagingGeneration22OperationCapability(capability, `SUPABASE_EDGE:${name}`)
    return { status: 'STAGED', name, projectRef: 'qdmvngjwkcsilzmqksme' }
  } }
  const config = { async stageDisabled({ name, capability }) {
    journalModule.consumeStagingGeneration22OperationCapability(capability, `VERCEL_DISABLED:${name}`)
    return receipt(name, 'config')
  } }
  const readback = { async prove() { return { status: 'DISABLED_SETTINGS_VERIFIED',
    projectRef: 'qdmvngjwkcsilzmqksme', branch: 'codex/tll-integration',
    vercelSecretCount: 16, disabledControlCount: 4, edgePasswordNamePresent: true } } }
  const result = await create({ journal, recoveryJournal, database, vercel, edge, config, readback, now })
    .stage({ signal: new AbortController().signal })
  assert.equal(result.status, 'SETTINGS_STAGED_OFF_VERIFIED')
  assert.equal(databaseCalls, 1)
  assert.equal(journal.read().state, 'FINISHED')
  assert.equal(recoveryJournal.read().state, 'CLAIMED')
  assert.equal(journal.read().receiptDigests.length, 22)
  assert.doesNotMatch(readFileSync(path, 'utf8'), /SCRAM-SHA-256|vault|password/i)
})
