import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration22Journal, STAGING_GENERATION_22_JOURNAL_ENABLED,
  OPERATION_IDS } from '../scripts/staging-generation-22-journal.mjs'

const expiresAt = '2026-09-26T10:50:00.000Z'
const now = () => Date.parse('2026-09-26T10:00:00.000Z')
async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  let credential = await readFile(new URL('staging-generation-22-credentials.mjs', scripts), 'utf8')
  credential = credential.replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
    `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`).replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credential).toString('base64')}`
  let source = await readFile(new URL('staging-generation-22-journal.mjs', scripts), 'utf8')
  source = source.replace('export const STAGING_GENERATION_22_JOURNAL_ENABLED = false',
    'export const STAGING_GENERATION_22_JOURNAL_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
    .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const path = () => join(mkdtempSync(join(tmpdir(), 'tll-gen22-journal-')), 'record.json')

test('Gen22 one-use record is off and has the exact 22-operation order', () => {
  assert.equal(STAGING_GENERATION_22_JOURNAL_ENABLED, false)
  assert.throws(() => createStagingGeneration22Journal({ path: path() }), /unavailable/)
  assert.equal(OPERATION_IDS.length, 22)
  assert.equal(OPERATION_IDS[0], 'DATABASE_CREDENTIALS')
  assert.equal(OPERATION_IDS[17], 'SUPABASE_EDGE:TLL_STAGING_BROKER_DATABASE_PASSWORD')
  assert.equal(OPERATION_IDS[21], 'VERCEL_DISABLED:TLL_STAGING_CUSTOMER_ENABLED')
  assert.equal(new Set(OPERATION_IDS).size, OPERATION_IDS.length)
  assert.deepEqual(OPERATION_IDS.slice(18), [
    'VERCEL_DISABLED:NEXT_PUBLIC_TLL_STAGING_CART',
    'VERCEL_DISABLED:NEXT_PUBLIC_TLL_STAGING_CUSTOMER',
    'VERCEL_DISABLED:TLL_STAGING_CART_ENABLED',
    'VERCEL_DISABLED:TLL_STAGING_CUSTOMER_ENABLED',
  ])
})

test('each operation is recorded before dispatch and confirmed in strict order', async () => {
  const { createStagingGeneration22Journal: create, OPERATION_IDS: operations } = await armedFixture()
  const location = path(), journal = create({ path: location, now })
  let state = journal.claim()
  assert.equal(statSync(location).mode & 0o777, 0o600)
  assert.throws(() => create({ path: location, now }).claim(), /unavailable/)
  for (const [index, operation] of operations.entries()) {
    assert.throws(() => journal.dispatch(state, operations[index + 1] ?? 'WRONG'), /unavailable/)
    const dispatched = journal.dispatch(state, operation)
    assert.equal(dispatched.state, 'DISPATCHED')
    assert.equal(dispatched.pending, operation)
    assert.throws(() => journal.dispatch(state, operation), /unavailable/)
    assert.throws(() => journal.confirm(dispatched, 'not-a-digest'), /unavailable/)
    state = journal.confirm(dispatched, String(index + 1).padStart(64, '0'))
    assert.equal(state.nextIndex, index + 1)
  }
  assert.equal(state.state, 'FINISHED')
  assert.equal(state.receiptDigests.length, 22)
  assert.doesNotMatch(readFileSync(location, 'utf8'), /SCRAM-SHA-256|vault.key|client.secret/i)
  assert.throws(() => journal.dispatch(state, 'DATABASE_CREDENTIALS'), /unavailable/)
})

test('lost reply or altered file holds the window; no process can replay', async () => {
  const { createStagingGeneration22Journal: create } = await armedFixture()
  const location = path(), journal = create({ path: location, now })
  const claimed = journal.claim()
  const dispatched = journal.dispatch(claimed, 'DATABASE_CREDENTIALS')
  assert.throws(() => create({ path: location, now }).claim(), /unavailable/)
  assert.equal(create({ path: location, now }).read().state, 'DISPATCHED')
  const held = journal.hold(dispatched)
  assert.equal(held.state, 'HOLD')
  assert.throws(() => journal.confirm(dispatched, 'a'.repeat(64)), /unavailable/)
  assert.throws(() => create({ path: location, now }).claim(), /unavailable/)
  writeFileSync(location, '{"state":"FINISHED"}\n', { mode: 0o600 })
  assert.throws(() => create({ path: location, now }).read(), /unavailable/)
})

test('expired window is rejected before claim or another dispatch', async () => {
  const { createStagingGeneration22Journal: create } = await armedFixture()
  const expired = () => Date.parse('2026-09-26T10:51:00.000Z')
  assert.throws(() => create({ path: path(), now: expired }).claim(), /unavailable/)
  let time = now()
  const journal = create({ path: path(), now: () => time }), claimed = journal.claim()
  time = expired()
  assert.throws(() => journal.dispatch(claimed, 'DATABASE_CREDENTIALS'), /unavailable/)
})

test('a well-shaped alteration or interrupted rename cannot advance the same run', async () => {
  const { createStagingGeneration22Journal: create } = await armedFixture()
  const location = path(), journal = create({ path: location, now })
  const claimed = journal.claim(), dispatched = journal.dispatch(claimed, 'DATABASE_CREDENTIALS')
  const confirmed = journal.confirm(dispatched, 'a'.repeat(64))
  const changed = { ...confirmed, receiptDigests: ['b'.repeat(64)] }
  writeFileSync(location, JSON.stringify(changed) + '\n', { mode: 0o600 })
  assert.equal(journal.read().state, 'READY')
  assert.throws(() => journal.dispatch(confirmed, OPERATION_IDS[1]), /unavailable/)

  const failPath = path()
  const actualFs = await import('node:fs')
  const failingFs = new Proxy(actualFs, { get(target, key) {
    if (key === 'renameSync') return () => { throw new Error('injected rename failure') }
    return target[key]
  } })
  const interrupted = create({ path: failPath, fileSystem: failingFs, now })
  const start = interrupted.claim()
  assert.throws(() => interrupted.dispatch(start, OPERATION_IDS[0]), /injected rename failure/)
  assert.equal(interrupted.read().state, 'CLAIMED')
  assert.throws(() => create({ path: failPath, now }).claim(), /unavailable/)
})
