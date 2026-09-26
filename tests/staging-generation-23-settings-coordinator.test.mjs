import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration23SettingsCoordinator,
  STAGING_GENERATION_23_SETTINGS_COORDINATOR_ENABLED } from '../scripts/staging-generation-23-settings-coordinator.mjs'
import { EDGE_PASSWORD_NAME, PROJECT_REF, VERCEL_PASSWORD_NAMES } from '../scripts/staging-generation-23-password-material.mjs'

const names = VERCEL_PASSWORD_NAMES
const targets = names.map((name, index) => ({ name, id: `env_gen23_${index}`,
  branch: 'codex/tll-integration', target: 'preview', classification: 'sensitive' }))
const start = Date.parse('2026-09-26T12:00:00.000Z')
const expiresAt = new Date(start + 3_600_000).toISOString()
const passwords = () => Object.fromEntries(names.map((name, index) => [name, String(index).repeat(64)]))
const projection = () => { const vercel = passwords(); return {
  vercel, supabase: { [EDGE_PASSWORD_NAME]: vercel[EDGE_PASSWORD_NAME] },
} }

async function fixture({ failAt = -1, badReceipt = false, failEdge = false } = {}) {
  const scripts = new URL('../scripts/', import.meta.url)
  const armed = async (filename, declaration) => {
    const source = (await readFile(new URL(filename, scripts), 'utf8'))
      .replace(`export const ${declaration} = false`, `export const ${declaration} = true`)
      .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
      .replaceAll("from './", `from '${scripts.href}`)
    return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  }
  const { createStagingGeneration23SettingsJournal: createJournal } = await armed(
    'staging-generation-23-settings-journal.mjs', 'STAGING_GENERATION_23_SETTINGS_JOURNAL_ENABLED')
  const { createStagingGeneration23SettingsCoordinator: createCoordinator } = await armed(
    'staging-generation-23-settings-coordinator.mjs', 'STAGING_GENERATION_23_SETTINGS_COORDINATOR_ENABLED')
  const path = join(mkdtempSync(join(tmpdir(), 'tll-gen23-coordinator-')), 'record.json')
  const journal = createJournal({ path, now: () => start,
    makeRunId: () => '22222222-2222-4222-8222-222222222222' })
  const calls = []
  let counter = 0, edgeDisposed = false
  const coordinator = createCoordinator({ journal, now: () => start,
    makeReplacer: () => ({
      async replace(target, value) {
        const index = counter++
        calls.push({ name: target.name, value })
        if (index === failAt) throw Error('lost response')
        return { status: 'REPLACED', name: badReceipt && index === 0 ? 'WRONG' : target.name,
          id: target.id, branch: target.branch, target: 'preview', classification: 'sensitive' }
      }, dispose() { calls.push({ disposed: true }) },
    }),
    edgeHost: { async stageSecret({ name, value }) {
      calls.push({ name, value })
      if (failEdge) throw Error('lost Edge response')
      return { status: 'STAGED', name, projectRef: PROJECT_REF }
    }, dispose() { edgeDisposed = true } },
  })
  return { coordinator, journal, calls, edgeDisposed: () => edgeDisposed }
}

test('six-setting coordinator is disabled by default', () => {
  assert.equal(STAGING_GENERATION_23_SETTINGS_COORDINATOR_ENABLED, false)
  assert.throws(() => createStagingGeneration23SettingsCoordinator(), /unavailable/)
})

test('six operations dispatch and confirm in order, then clear in-memory projection', async () => {
  const { coordinator, journal, calls, edgeDisposed } = await fixture()
  const held = projection()
  assert.deepEqual(await coordinator.run({ targets, projection: held, expiresAt,
    signal: new AbortController().signal }), { status: 'SETTINGS_REPLACED_UNVERIFIED', operationCount: 6 })
  assert.equal(journal.read().state, 'FINISHED')
  assert.equal(journal.read().receiptDigests.length, 6)
  assert.deepEqual(calls.filter(call => call.name).map(call => call.name), [...names, EDGE_PASSWORD_NAME])
  assert.deepEqual(Object.values(held.vercel), Array(5).fill(undefined))
  assert.equal(held.supabase[EDGE_PASSWORD_NAME], undefined)
  assert.equal(edgeDisposed(), true)
  await assert.rejects(coordinator.run({ targets, projection: projection(), expiresAt,
    signal: new AbortController().signal }), /unavailable/)
})

test('lost or mismatched first receipt holds the journal and prevents Edge or later settings', async () => {
  for (const option of [{ failAt: 0 }, { badReceipt: true }]) {
    const { coordinator, journal, calls, edgeDisposed } = await fixture(option)
    const held = projection()
    assert.deepEqual(await coordinator.run({ targets, projection: held, expiresAt,
      signal: new AbortController().signal }), { status: 'HOLD_RECONCILE', completedCount: 0 })
    assert.equal(journal.read().state, 'HOLD')
    assert.equal(journal.read().pending, `VERCEL_PATCH:${names[0]}`)
    assert.deepEqual(calls.filter(call => call.name).map(call => call.name), [names[0]])
    assert.equal(edgeDisposed(), true)
    assert.equal(held.vercel[names[0]], undefined)
  }
})

test('uncertain Edge result retains five receipts and cannot finish or replay', async () => {
  const { coordinator, journal, calls } = await fixture({ failEdge: true })
  const held = projection()
  assert.deepEqual(await coordinator.run({ targets, projection: held, expiresAt,
    signal: new AbortController().signal }), { status: 'HOLD_RECONCILE', completedCount: 5 })
  assert.equal(journal.read().state, 'HOLD')
  assert.equal(journal.read().pending, `SUPABASE_EDGE:${EDGE_PASSWORD_NAME}`)
  assert.equal(calls.filter(call => call.name).length, 6)
  assert.equal(held.supabase[EDGE_PASSWORD_NAME], undefined)
})
