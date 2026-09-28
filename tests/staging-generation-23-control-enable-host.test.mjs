import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration23DatabaseJournal } from '../scripts/staging-generation-23-database-journal.mjs'
import { createStagingGeneration23ControlEnableHost } from '../scripts/staging-generation-23-control-enable-host.mjs'
import { PROJECT_REF } from '../scripts/staging-generation-23-password-material.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const start = Date.parse('2026-09-26T12:00:00.000Z')
const expiresAt = new Date(start + 40 * 60_000).toISOString()
const deadlineAt = new Date(start + 35 * 60_000).toISOString()
const windowId = '5a1502a5-0ddd-4da3-a375-d9b34aba6ed9'
const signal = new AbortController().signal
const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`

async function arm(name, flag, replacements = []) {
  let source = readFileSync(new URL(name, scripts), 'utf8')
  const declaration = `export const ${flag} = false`
  assert.equal(source.split(declaration).length, 2)
  source = source.replace(declaration, `export const ${flag} = true`)
  for (const [from, to] of replacements) {
    assert.ok(source.includes(from), `missing ${from}`)
    source = source.replace(from, to)
  }
  source = source.replaceAll("from './", `from '${scripts.href}`)
    .replaceAll('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  return { url: data(source), module: await import(data(source)) }
}

async function fixture(execute, path) {
  const credentials = await arm('staging-generation-23-credentials.mjs',
    'STAGING_GENERATION_23_CREDENTIALS_ENABLED', [[
      "export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`,
    ]])
  const journalModule = await arm('staging-generation-23-database-journal.mjs',
    'STAGING_GENERATION_23_DATABASE_JOURNAL_ENABLED')
  const hostModule = await arm('staging-generation-23-control-enable-host.mjs',
    'STAGING_GENERATION_23_CONTROL_ENABLE_HOST_ENABLED', [[
      "from './staging-generation-23-credentials.mjs'", `from '${credentials.url}'`,
    ]])
  path ??= join(mkdtempSync(join(tmpdir(), 'tll-gen23-activate-')), 'activate.json')
  const journal = journalModule.module.createStagingGeneration23DatabaseJournal({
    action: 'ACTIVATE', path, now: () => start,
    makeRunId: () => 'aa72c04b-a1fe-467b-a5a6-4ce94525744a',
  })
  const host = () => hostModule.module.createStagingGeneration23ControlEnableHost({
    journal, execute, now: () => start,
  })
  return { host, journal, path }
}

const receipt = { status: 'CONTROLS_ENABLED', target: PROJECT_REF,
  generation: 23, windowId, receiptHash: 'a'.repeat(64) }
const args = { expiresAt, deadlineAt, signal }

test('control enable and ACTIVATE journal are off in ordinary source', () => {
  assert.throws(() => createStagingGeneration23DatabaseJournal({ action: 'ACTIVATE' }), /unavailable/)
  assert.throws(() => createStagingGeneration23ControlEnableHost({}), /unavailable/)
})

test('one exact activation is recorded and a fresh host cannot replay it', async () => {
  let calls = 0
  const { host, journal } = await fixture(async ({ context, signal: received }) => {
    calls++
    assert.deepEqual(context, { generation: 23, windowId, expiresAt })
    assert.equal(received, signal)
    return receipt
  })
  assert.deepEqual(await host().run(args), { status: 'CONTROL_ACTIVATION_VERIFIED',
    receiptSha256: receipt.receiptHash })
  assert.equal(journal.read().state, 'FINISHED')
  assert.deepEqual(await host().run(args), { status: 'HOLD_RECONCILE', action: 'ACTIVATE' })
  assert.equal(calls, 1)
})

test('lost reply leaves ACTIVATE on HOLD and blocks replay', async () => {
  let calls = 0
  const { host, journal } = await fixture(async () => { calls++; throw Error('lost reply') })
  assert.deepEqual(await host().run(args), { status: 'HOLD_RECONCILE', action: 'ACTIVATE' })
  assert.equal(journal.read().state, 'HOLD')
  assert.deepEqual(await host().run(args), { status: 'HOLD_RECONCILE', action: 'ACTIVATE' })
  assert.equal(calls, 1)
})

test('wrong activation receipt cannot be reported as enabled', async () => {
  const { host, journal } = await fixture(async () => ({ ...receipt, target: 'wrong-project' }))
  assert.deepEqual(await host().run(args), { status: 'HOLD_RECONCILE', action: 'ACTIVATE' })
  assert.equal(journal.read().state, 'HOLD')
})

test('invalid window or aborted signal cannot claim an activation', async () => {
  let calls = 0
  const { host, journal } = await fixture(async () => { calls++; return receipt })
  await assert.rejects(host().run({ ...args, deadlineAt: new Date(start + 50 * 60_000).toISOString() }), /unavailable/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(host().run({ ...args, signal: controller.signal }), /unavailable/)
  assert.equal(journal.read(), null)
  assert.equal(calls, 0)
})
