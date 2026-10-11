import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration22DatabaseHost } from '../scripts/staging-generation-22-database-host.mjs'
import { PASSWORD_PURPOSES } from '../scripts/staging-generation-22-material.mjs'

const expiresAt = '2026-09-26T10:50:00.000Z'
const now = () => Date.parse('2026-09-26T10:00:00.000Z')
const pending = Object.freeze({ projectRef: 'qdmvngjwkcsilzmqksme', windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543',
  expiresAt, state: 'DISPATCHED', pending: 'DATABASE_CREDENTIALS', nextIndex: 0, receiptDigests: [] })
const verifiers = Object.fromEntries(PASSWORD_PURPOSES.map((purpose, index) => {
  const value = Buffer.from(`fixture-${purpose}-${index}`).toString('base64')
  return [purpose, `SCRAM-SHA-256$4096:${value}$${value}:${value}`]
}))
const receipt = { status: 'PASS', packageId: 'tll-staging-generation-22-credentials/v1',
  projectRef: pending.projectRef, generation: 22, windowId: pending.windowId,
  expiresAt, controlsEnabled: false, runtimeCount: 5 }
const path = () => join(mkdtempSync(join(tmpdir(), 'tll-gen22-db-host-')), 'journal.json')

async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  let credential = await readFile(new URL('staging-generation-22-credentials.mjs', scripts), 'utf8')
  credential = credential
    .replace('export const STAGING_GENERATION_22_CREDENTIALS_ENABLED = false', 'export const STAGING_GENERATION_22_CREDENTIALS_ENABLED = true')
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'", `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credential).toString('base64')}`
  let journal = await readFile(new URL('staging-generation-22-journal.mjs', scripts), 'utf8')
  journal = journal.replace('export const STAGING_GENERATION_22_JOURNAL_ENABLED = false',
    'export const STAGING_GENERATION_22_JOURNAL_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
    .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  const journalUrl = `data:text/javascript;base64,${Buffer.from(journal).toString('base64')}`
  let source = await readFile(new URL('staging-generation-22-database-host.mjs', scripts), 'utf8')
  source = source.replace('export const STAGING_GENERATION_22_DATABASE_HOST_ENABLED = false',
    'export const STAGING_GENERATION_22_DATABASE_HOST_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replace("from './staging-generation-22-journal.mjs'", `from '${journalUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return { host: await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`),
    journal: await import(journalUrl), credentials: await import(credentialUrl) }
}

function dispatchedCapability(createJournal) {
  const journal = createJournal({ path: path(), now })
  const claimed = journal.claim()
  const pending = journal.dispatch(claimed, 'DATABASE_CREDENTIALS')
  return { journal, pending, capability: journal.databaseCapability(pending) }
}

test('database host is disconnected and refuses creation by default', () => {
  assert.throws(() => createStagingGeneration22DatabaseHost({ post: async () => [] }), /unavailable/)
})

test('synthetic host accepts only dispatched Gen22 SQL and exact receipt, once', async () => {
  const { host: { createStagingGeneration22DatabaseHost: create },
    journal: { createStagingGeneration22Journal: createJournal }, credentials } = await armedFixture()
  const { capability } = dispatchedCapability(createJournal)
  const calls = []
  const host = create({ post: async packet => { calls.push(credentials.consumeStagingGeneration22PreparedSql(packet)); return [{ tll_generation_22_credential_receipt: receipt }] }, now })
  await assert.rejects(host.install({ capability: { ...pending }, verifiers, expiresAt }), /unavailable/)
  assert.equal(calls.length, 0)
  const result = await host.install({ capability, verifiers, expiresAt })
  assert.equal(result.status, 'PASS')
  assert.equal(result.projectRef, pending.projectRef)
  assert.match(calls[0], /^BEGIN;\nSET LOCAL lock_timeout='5s';/)
  assert.match(calls[0], /COMMIT;\nSELECT jsonb_build_object/)
  await assert.rejects(host.install({ capability, verifiers, expiresAt }), /unavailable/)
  assert.equal(calls.length, 1)
})

test('unexpected response is uncertain and cannot be dispatched again', async () => {
  const { host: { createStagingGeneration22DatabaseHost: create },
    journal: { createStagingGeneration22Journal: createJournal } } = await armedFixture()
  const { capability } = dispatchedCapability(createJournal)
  let calls = 0
  const host = create({ post: async () => { calls++; return [{ tll_generation_22_credential_receipt: { ...receipt, generation: 21 } }] }, now })
  await assert.rejects(host.install({ capability, verifiers, expiresAt }), /unavailable/)
  await assert.rejects(host.install({ capability, verifiers, expiresAt }), /unavailable/)
  assert.equal(calls, 1)
})

test('new host cannot resend after lost reply; a stalled request expires once', async () => {
  const { host: { createStagingGeneration22DatabaseHost: create },
    journal: { createStagingGeneration22Journal: createJournal } } = await armedFixture()
  const { capability } = dispatchedCapability(createJournal)
  let firstCalls = 0, secondCalls = 0
  const first = create({ post: async () => { firstCalls++; throw new Error('lost reply') }, now })
  await assert.rejects(first.install({ capability, verifiers, expiresAt }), /unavailable/)
  const second = create({ post: async () => { secondCalls++; return [] }, now })
  await assert.rejects(second.install({ capability, verifiers, expiresAt }), /unavailable/)
  assert.equal(firstCalls, 1)
  assert.equal(secondCalls, 0)

  const another = dispatchedCapability(createJournal)
  let stalledCalls = 0
  const stalled = create({ post: async (_sql, { signal }) => {
    stalledCalls++
    assert.equal(typeof signal.aborted, 'boolean')
    return new Promise(() => {})
  }, now, requestTimeoutMs: 10 })
  await assert.rejects(stalled.install({ capability: another.capability, verifiers, expiresAt }), /unavailable/)
  assert.equal(stalledCalls, 1)
  await assert.rejects(create({ post: async () => { secondCalls++; return [] }, now })
    .install({ capability: another.capability, verifiers, expiresAt }), /unavailable/)
  assert.equal(secondCalls, 0)
})

test('an expired clock stops before consuming capability or calling transport', async () => {
  const { host: { createStagingGeneration22DatabaseHost: create },
    journal: { createStagingGeneration22Journal: createJournal } } = await armedFixture()
  const { capability } = dispatchedCapability(createJournal)
  let calls = 0
  const expired = create({ post: async () => { calls++; return [] },
    now: () => Date.parse('2026-09-26T10:51:00.000Z') })
  await assert.rejects(expired.install({ capability, verifiers, expiresAt }), /unavailable/)
  assert.equal(calls, 0)
})

test('caller cancellation reaches a stalled database request', async () => {
  const { host: { createStagingGeneration22DatabaseHost: create },
    journal: { createStagingGeneration22Journal: createJournal } } = await armedFixture()
  const { capability } = dispatchedCapability(createJournal)
  const parent = new AbortController()
  let reached, started
  started = new Promise(resolve => { reached = resolve })
  let childSignal
  const host = create({ now, post: (_packet, { signal }) => {
    childSignal = signal
    reached()
    return new Promise(() => {})
  } })
  const pending = host.install({ capability, verifiers, expiresAt, signal: parent.signal })
  await started
  parent.abort()
  await assert.rejects(pending, /unavailable/)
  assert.equal(childSignal.aborted, true)
  await assert.rejects(host.install({ capability, verifiers, expiresAt,
    signal: new AbortController().signal }), /unavailable/)
})
