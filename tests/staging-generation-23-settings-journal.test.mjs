import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23SettingsJournal,
  STAGING_GENERATION_23_SETTINGS_JOURNAL_ENABLED } from '../scripts/staging-generation-23-settings-journal.mjs'
import { VERCEL_PASSWORD_NAMES } from '../scripts/staging-generation-23-password-material.mjs'

const names = VERCEL_PASSWORD_NAMES
const targets = names.map((name, index) => ({ name, id: `env_gen23_${index}`,
  branch: 'codex/tll-integration', target: 'preview', classification: 'sensitive' }))
const runId = '11111111-1111-4111-8111-111111111111'
const start = Date.parse('2026-09-26T12:00:00.000Z')
const expiresAt = new Date(start + 3_600_000).toISOString()
const digest = 'a'.repeat(64)

async function fixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  const source = (await readFile(new URL('staging-generation-23-settings-journal.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_SETTINGS_JOURNAL_ENABLED = false',
      'export const STAGING_GENERATION_23_SETTINGS_JOURNAL_ENABLED = true')
    .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
    .replaceAll("from './", `from '${scripts.href}`)
  const { createStagingGeneration23SettingsJournal: create, OPERATION_IDS } =
    await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  const path = join(mkdtempSync(join(tmpdir(), 'tll-gen23-settings-')), 'record.json')
  let clock = start
  const journal = create({ path, now: () => clock, makeRunId: () => runId })
  return { journal, path, OPERATION_IDS, advance: ms => { clock += ms } }
}

test('settings record is unavailable in ordinary source', () => {
  assert.equal(STAGING_GENERATION_23_SETTINGS_JOURNAL_ENABLED, false)
  assert.throws(() => createStagingGeneration23SettingsJournal(), /unavailable/)
})

test('one claim records five exact Vercel IDs and two Edge writes in order without a password', async () => {
  const { journal, path, OPERATION_IDS } = await fixture()
  assert.equal(OPERATION_IDS.length, 7)
  assert.deepEqual(OPERATION_IDS.slice(0, 5), names.map(name => `VERCEL_PATCH:${name}`))
  let current = journal.claim(targets, expiresAt)
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.equal(statSync(join(path, '..')).mode & 0o777, 0o700)
  assert.throws(() => journal.claim(targets, expiresAt), /unavailable/)
  for (const operationId of OPERATION_IDS) {
    current = journal.dispatch(current, operationId)
    assert.equal(journal.read().pending, operationId)
    current = journal.confirm(current, digest)
  }
  assert.equal(current.state, 'FINISHED')
  assert.equal(current.nextIndex, 7)
  assert.throws(() => journal.dispatch(current, OPERATION_IDS[0]), /unavailable/)
  const raw = readFileSync(path, 'utf8')
  assert.doesNotMatch(raw, /Bearer|"value"|"secret"|"password"/i)
  assert.equal(JSON.parse(raw).receiptDigests.length, 7)
})

test('a dispatched or failed setting cannot be sent again after interruption', async () => {
  const { journal, OPERATION_IDS } = await fixture()
  const ready = journal.claim(targets, expiresAt)
  const pending = journal.dispatch(ready, OPERATION_IDS[0])
  assert.throws(() => journal.dispatch(ready, OPERATION_IDS[0]), /unavailable/)
  assert.equal(journal.read().state, 'DISPATCHED')
  assert.equal(journal.read().pending, OPERATION_IDS[0])
  const held = journal.hold(pending)
  assert.equal(held.state, 'HOLD')
  assert.throws(() => journal.confirm(held, digest), /unavailable/)
  assert.throws(() => journal.claim(targets, expiresAt), /unavailable/)
})

test('target drift, expiry, stale record and journal tampering fail closed', async () => {
  const { journal, path, OPERATION_IDS, advance } = await fixture()
  assert.throws(() => journal.claim([{ ...targets[0], branch: 'main' }, ...targets.slice(1)], expiresAt), /unavailable/)
  assert.throws(() => journal.claim(targets, new Date(start + 3_600_001).toISOString()), /unavailable/)
  let current = journal.claim(targets, expiresAt)
  assert.throws(() => journal.dispatch(current, OPERATION_IDS[1]), /unavailable/)
  current = journal.dispatch(current, OPERATION_IDS[0])
  assert.throws(() => journal.confirm(current, 'wrong'), /unavailable/)
  advance(3_600_000)
  assert.throws(() => journal.confirm(current, digest), /unavailable/)
  assert.equal(journal.hold(current).state, 'HOLD')
  const altered = JSON.parse(readFileSync(path, 'utf8'))
  altered.targets[0].branch = 'main'
  writeFileSync(path, JSON.stringify(altered), { mode: 0o600 })
  assert.throws(() => journal.read(), /unavailable/)
})
