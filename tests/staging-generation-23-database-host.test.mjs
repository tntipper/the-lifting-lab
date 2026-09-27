import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration23DatabaseJournal } from '../scripts/staging-generation-23-database-journal.mjs'
import { createStagingGeneration23DatabaseHost } from '../scripts/staging-generation-23-database-host.mjs'
import { PASSWORD_PURPOSES } from '../scripts/staging-generation-22-material.mjs'
import { deriveScramVerifier } from '../scripts/staging-generation-6-transport.mjs'
import { GENERATION, PROJECT_REF } from '../scripts/staging-generation-23-password-material.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const start = Date.parse('2026-09-26T12:00:00.000Z')
const expiresAt = new Date(start + 40 * 60_000).toISOString()
const deadlineAt = new Date(start + 35 * 60_000).toISOString()
const windowId = '1e8c4f1d-0dde-4329-a9c6-e17223905a77'
const verifiers = Object.fromEntries(PASSWORD_PURPOSES.map((purpose, index) => [purpose,
  deriveScramVerifier(String(index + 1).repeat(64), Buffer.alloc(18, index + 1))]))
const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`

async function arm(filename, flag, replacements = []) {
  let source = await readFile(new URL(filename, scripts), 'utf8')
  const declaration = `export const ${flag} = false`
  assert.equal(source.split(declaration).length, 2)
  source = source.replace(declaration, `export const ${flag} = true`)
  for (const [from, to] of replacements) source = source.replace(from, to)
  source = source.replaceAll("from './", `from '${scripts.href}`)
    .replaceAll('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  return { url: data(source), module: await import(data(source)) }
}

async function fixture(action, post, requestTimeoutMs = 1000) {
  const credentials = await arm('staging-generation-23-credentials.mjs',
    'STAGING_GENERATION_23_CREDENTIALS_ENABLED', [[
      "export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`,
    ]])
  const recovery = await arm('staging-generation-23-recovery.mjs',
    'STAGING_GENERATION_23_RECOVERY_ENABLED', [[
      "from './staging-generation-23-credentials.mjs'", `from '${credentials.url}'`,
    ]])
  const shutdown = await arm('staging-generation-23-control-shutdown.mjs',
    'STAGING_GENERATION_23_CONTROL_SHUTDOWN_ENABLED', [[
      "from './staging-generation-23-credentials.mjs'", `from '${credentials.url}'`,
    ]])
  const journalModule = await arm('staging-generation-23-database-journal.mjs',
    'STAGING_GENERATION_23_DATABASE_JOURNAL_ENABLED')
  const host = await arm('staging-generation-23-database-host.mjs',
    'STAGING_GENERATION_23_DATABASE_HOST_ENABLED', [
      ["from './staging-generation-23-credentials.mjs'", `from '${credentials.url}'`],
      ["from './staging-generation-23-recovery.mjs'", `from '${recovery.url}'`],
      ["from './staging-generation-23-control-shutdown.mjs'", `from '${shutdown.url}'`],
    ])
  const path = join(mkdtempSync(join(tmpdir(), 'tll-gen23-database-journal-')), `${action}.json`)
  const journal = journalModule.module.createStagingGeneration23DatabaseJournal({ action, path,
    now: () => start, makeRunId: () => 'aa72c04b-a1fe-467b-a5a6-4ce94525744a' })
  const fresh = () => host.module.createStagingGeneration23DatabaseHost({ action, journal,
    post, now: () => start, requestTimeoutMs })
  return { instance: fresh(), fresh, journal, credentials: credentials.module,
    recovery: recovery.module, shutdown: shutdown.module }
}

const setupReceipt = { status: 'PASS', packageId: 'tll-staging-generation-23-credentials/v1',
  projectRef: PROJECT_REF, generation: GENERATION, windowId, expiresAt,
  controlsEnabled: false, runtimeCount: 5 }
const retirementReceipt = { status: 'PASS_RETIRED', recoveryId: 'tll-staging-generation-23-recovery/v1',
  projectRef: PROJECT_REF, generation: GENERATION, windowId, expiresAt,
  controlsEnabled: false, runtimeCount: 5 }
const shutdownReceipt = { status: 'PASS_CONTROLS_DISABLED',
  shutdownId: 'tll-staging-generation-23-control-shutdown/v1',
  projectRef: PROJECT_REF, generation: GENERATION, windowId, expiresAt,
  controlsEnabled: 0 }

test('database journal and host are both off in ordinary source', () => {
  assert.throws(() => createStagingGeneration23DatabaseJournal({ action: 'SETUP' }), /unavailable/)
  assert.throws(() => createStagingGeneration23DatabaseHost({ action: 'SETUP' }), /unavailable/)
})

test('setup and retirement use separate durable records and exact opaque SQL packets', async () => {
  let setupCalls = 0
  const setup = await fixture('SETUP', async packet => {
    setupCalls++
    assert.match(setup.credentials.consumeStagingGeneration23PreparedSql(packet), /BEGIN;/)
    return [{ tll_generation_23_credential_receipt: setupReceipt }]
  })
  assert.deepEqual(await setup.instance.run({ expiresAt, deadlineAt, verifiers,
    signal: new AbortController().signal }), { status: 'SETUP_VERIFIED',
    receiptSha256: setup.journal.read()?.receiptDigest })
  assert.equal(setup.journal.read().state, 'FINISHED')
  await assert.rejects(setup.instance.run({ expiresAt, deadlineAt, verifiers,
    signal: new AbortController().signal }), /unavailable/)
  assert.equal(setupCalls, 1)

  let retirementCalls = 0
  const retirement = await fixture('RETIRE', async packet => {
    retirementCalls++
    assert.match(retirement.recovery.consumeStagingGeneration23PreparedRecoverySql(packet).sql, /BEGIN;/)
    return [{ tll_generation_23_recovery_receipt: retirementReceipt }]
  })
  assert.deepEqual(await retirement.instance.run({ expiresAt, deadlineAt,
    signal: new AbortController().signal }), { status: 'RETIREMENT_VERIFIED',
    receiptSha256: retirement.journal.read()?.receiptDigest })
  assert.equal(retirement.journal.read().state, 'FINISHED')
  assert.equal(retirementCalls, 1)
})

test('lost setup reply leaves a one-use HOLD and cannot dispatch again', async () => {
  let calls = 0
  const { instance, journal } = await fixture('SETUP', async () => { calls++; throw Error('lost reply') })
  assert.deepEqual(await instance.run({ expiresAt, deadlineAt, verifiers,
    signal: new AbortController().signal }), { status: 'HOLD_RECONCILE', action: 'SETUP' })
  assert.equal(journal.read().state, 'HOLD')
  assert.equal(calls, 1)
  await assert.rejects(instance.run({ expiresAt, deadlineAt, verifiers,
    signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 1)
})

test('a mismatched receipt cannot be labelled installed or retired', async () => {
  const { instance, journal } = await fixture('RETIRE', async () => [{
    tll_generation_23_recovery_receipt: { ...retirementReceipt, controlsEnabled: true },
  }])
  assert.deepEqual(await instance.run({ expiresAt, deadlineAt,
    signal: new AbortController().signal }), { status: 'HOLD_RECONCILE', action: 'RETIRE' })
  assert.equal(journal.read().state, 'HOLD')
})

test('shutdown has its own exact packet, record and lost-reply HOLD', async () => {
  let calls = 0
  const shutdown = await fixture('SHUTDOWN', async packet => {
    calls++
    assert.match(shutdown.shutdown.consumeStagingGeneration23PreparedShutdownSql(packet),
      /operator_set_enabled\(false/)
    return [{ tll_generation_23_control_shutdown: shutdownReceipt }]
  })
  assert.equal((await shutdown.instance.run({ expiresAt, deadlineAt,
    signal: new AbortController().signal })).status, 'SHUTDOWN_VERIFIED')
  assert.equal(shutdown.journal.read().state, 'FINISHED')
  assert.equal(calls, 1)

  let lostCalls = 0
  const lost = await fixture('SHUTDOWN', async () => { lostCalls++; throw Error('lost reply') })
  assert.deepEqual(await lost.instance.run({ expiresAt, deadlineAt,
    signal: new AbortController().signal }), { status: 'HOLD_RECONCILE', action: 'SHUTDOWN' })
  assert.equal(lost.journal.read().state, 'HOLD')
  assert.deepEqual(await lost.fresh().run({ expiresAt, deadlineAt,
    signal: new AbortController().signal }), { status: 'HOLD_RECONCILE', action: 'SHUTDOWN' })
  assert.equal(lostCalls, 1)
})

test('a never-replying setup request times out, aborts and cannot be replayed', async () => {
  let calls = 0, childSignal
  const { instance, fresh, journal } = await fixture('SETUP', async (_packet, { signal }) => {
    calls++
    childSignal = signal
    return new Promise(() => {})
  }, 15)
  assert.deepEqual(await instance.run({ expiresAt, deadlineAt, verifiers,
    signal: new AbortController().signal }), { status: 'HOLD_RECONCILE', action: 'SETUP' })
  assert.equal(childSignal.aborted, true)
  assert.equal(journal.read().state, 'HOLD')
  assert.deepEqual(await fresh().run({ expiresAt, deadlineAt, verifiers,
    signal: new AbortController().signal }), { status: 'HOLD_RECONCILE', action: 'SETUP' })
  assert.equal(calls, 1)
})

test('parent cancellation after dispatch leaves setup on HOLD', async () => {
  let calls = 0, childSignal
  const parent = new AbortController()
  const { instance, journal } = await fixture('SETUP', async (_packet, { signal }) => {
    calls++
    childSignal = signal
    parent.abort()
    return new Promise(() => {})
  })
  assert.deepEqual(await instance.run({ expiresAt, deadlineAt, verifiers,
    signal: parent.signal }), { status: 'HOLD_RECONCILE', action: 'SETUP' })
  assert.equal(childSignal.aborted, true)
  assert.equal(journal.read().state, 'HOLD')
  assert.equal(calls, 1)
})

test('a reply arriving after timeout cannot change HOLD to FINISHED', async () => {
  let calls = 0, lateReply
  const { instance, fresh, journal } = await fixture('RETIRE', async () => {
    calls++
    return new Promise(resolve => { lateReply = resolve })
  }, 15)
  assert.deepEqual(await instance.run({ expiresAt, deadlineAt,
    signal: new AbortController().signal }), { status: 'HOLD_RECONCILE', action: 'RETIRE' })
  lateReply([{ tll_generation_23_recovery_receipt: retirementReceipt }])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(journal.read().state, 'HOLD')
  assert.deepEqual(await fresh().run({ expiresAt, deadlineAt,
    signal: new AbortController().signal }), { status: 'HOLD_RECONCILE', action: 'RETIRE' })
  assert.equal(calls, 1)
})
