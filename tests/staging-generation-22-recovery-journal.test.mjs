import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration22RecoveryJournal } from '../scripts/staging-generation-22-recovery-journal.mjs'

const now = () => Date.parse('2026-09-26T10:00:00.000Z')
async function armed() {
  const scripts = new URL('../scripts/', import.meta.url)
  let credential = await readFile(new URL('staging-generation-22-credentials.mjs', scripts), 'utf8')
  credential = credential.replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
    "export const ACTIVE_WINDOW_EXPIRES_AT = '2026-09-26T10:50:00.000Z'")
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credential).toString('base64')}`
  let source = await readFile(new URL('staging-generation-22-recovery-journal.mjs', scripts), 'utf8')
  source = source.replace('export const STAGING_GENERATION_22_RECOVERY_JOURNAL_ENABLED = false',
    'export const STAGING_GENERATION_22_RECOVERY_JOURNAL_ENABLED = true')
    .replace("export const RECOVERY_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      "export const RECOVERY_WINDOW_EXPIRES_AT = '2026-09-26T11:30:00.000Z'")
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
    .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
function path() { return join(mkdtempSync(join(tmpdir(), 'tll-gen22-recovery-')), 'private', 'record.json') }

test('recovery journal is disconnected by default', () => {
  assert.throws(() => createStagingGeneration22RecoveryJournal({ path: path() }), /unavailable/)
})

test('recovery is durably dispatched before a single opaque capability is usable', async () => {
  const { createStagingGeneration22RecoveryJournal: create,
    consumeStagingGeneration22RecoveryCapability: consume } = await armed()
  const file = path(), journal = create({ path: file, now })
  const claimed = journal.claim()
  assert.equal(claimed.state, 'CLAIMED')
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.equal(statSync(join(file, '..')).mode & 0o777, 0o700)
  assert.throws(() => journal.capability(claimed), /unavailable/)
  const pending = journal.dispatch(claimed)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).state, 'DISPATCHED')
  const capability = journal.capability(pending)
  assert.throws(() => consume({ ...capability }), /unavailable/)
  consume(capability)
  assert.throws(() => consume(capability), /unavailable/)
  assert.throws(() => journal.capability(pending), /unavailable/)
  const finished = journal.confirm(pending, 'a'.repeat(64))
  assert.equal(finished.state, 'FINISHED')
  assert.equal(journal.read().receiptDigest, 'a'.repeat(64))
  assert.throws(() => create({ path: file, now }).claim(), /unavailable/)
})

test('lost reply can be held but not redispatched or claimed again', async () => {
  const { createStagingGeneration22RecoveryJournal: create,
    consumeStagingGeneration22RecoveryCapability: consume } = await armed()
  const file = path(), journal = create({ path: file, now })
  const pending = journal.dispatch(journal.claim())
  const capability = journal.capability(pending)
  const held = journal.hold(pending)
  assert.equal(held.state, 'HOLD')
  assert.throws(() => journal.dispatch(held), /unavailable/)
  assert.throws(() => journal.confirm(held, 'a'.repeat(64)), /unavailable/)
  assert.throws(() => create({ path: file, now }).claim(), /unavailable/)
  assert.throws(() => consume(capability), /unavailable/)
})

test('altered or permission-weakened records fail closed', async () => {
  const { createStagingGeneration22RecoveryJournal: create } = await armed()
  const file = path(), journal = create({ path: file, now })
  journal.claim()
  const forged = JSON.parse(readFileSync(file, 'utf8'))
  forged.projectRef = 'wrhgscovsgsudtedbljr'
  writeFileSync(file, JSON.stringify(forged))
  assert.throws(() => journal.read(), /unavailable/)
  chmodSync(file, 0o644)
  assert.throws(() => journal.read(), /unavailable/)
})

test('recovery cannot start after the setup window or its own deadline', async () => {
  const { createStagingGeneration22RecoveryJournal: create } = await armed()
  assert.throws(() => create({ path: path(), now: () => Date.parse('2026-09-26T10:50:00.000Z') }).claim(), /unavailable/)
  assert.throws(() => create({ path: path(), now: () => Date.parse('2026-09-26T11:30:00.000Z') }).claim(), /unavailable/)
})

test('recovery may dispatch after setup credentials expire but not after recovery deadline', async () => {
  const { createStagingGeneration22RecoveryJournal: create } = await armed()
  let clock = now()
  const journal = create({ path: path(), now: () => clock })
  const claimed = journal.claim()
  clock = Date.parse('2026-09-26T11:00:00.000Z')
  const pending = journal.dispatch(claimed)
  assert.equal(pending.state, 'DISPATCHED')
  clock = Date.parse('2026-09-26T11:30:00.000Z')
  assert.throws(() => journal.capability(pending), /unavailable/)
  assert.equal(journal.hold(pending).state, 'HOLD')
})

test('dispatch and capability consumption stop at the recovery deadline', async () => {
  const { createStagingGeneration22RecoveryJournal: create,
    consumeStagingGeneration22RecoveryCapability: consume } = await armed()
  let clock = now()
  const first = create({ path: path(), now: () => clock })
  const claimed = first.claim()
  clock = Date.parse('2026-09-26T11:30:00.000Z')
  assert.throws(() => first.dispatch(claimed), /unavailable/)
  assert.equal(first.hold(claimed).state, 'HOLD')

  clock = now()
  const second = create({ path: path(), now: () => clock })
  const pending = second.dispatch(second.claim())
  const capability = second.capability(pending)
  clock = Date.parse('2026-09-26T11:30:00.000Z')
  assert.throws(() => consume(capability), /unavailable/)
  assert.equal(second.hold(pending).state, 'HOLD')
})

test('an invalid clock cannot consume a previously issued recovery capability', async () => {
  const { createStagingGeneration22RecoveryJournal: create,
    consumeStagingGeneration22RecoveryCapability: consume } = await armed()
  let clock = now()
  const journal = create({ path: path(), now: () => clock })
  const pending = journal.dispatch(journal.claim())
  const capability = journal.capability(pending)
  clock = Number.NaN
  assert.throws(() => consume(capability), /unavailable/)
  clock = now()
  consume(capability)
  assert.throws(() => consume(capability), /unavailable/)
})
