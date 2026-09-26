import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration22RecoveryHost } from '../scripts/staging-generation-22-recovery-host.mjs'

const expiresAt = '2026-09-26T10:50:00.000Z'
const recoveryDeadline = '2026-09-26T11:30:00.000Z'
const receipt = { status: 'PASS_RETIRED', recoveryId: 'tll-staging-generation-22-recovery/v1',
  projectRef: 'qdmvngjwkcsilzmqksme', generation: 22,
  windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543', expiresAt,
  controlsEnabled: false, runtimeCount: 5 }
const rows = [{ tll_generation_22_recovery_receipt: receipt }]
const scripts = new URL('../scripts/', import.meta.url)
async function fixture() {
  const moduleUrl = async (name, edits = []) => {
    let source = await readFile(new URL(name, scripts), 'utf8')
    for (const [before, after] of edits) source = source.replace(before, after)
    source = source.replaceAll("from './", `from '${scripts.href}`)
      .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
    return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  }
  const credentials = await moduleUrl('staging-generation-22-credentials.mjs', [
    ["export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`],
  ])
  const recovery = await moduleUrl('staging-generation-22-recovery.mjs', [
    ['export const STAGING_GENERATION_22_RECOVERY_ENABLED = false',
      'export const STAGING_GENERATION_22_RECOVERY_ENABLED = true'],
    ["from './staging-generation-22-credentials.mjs'", `from '${credentials}'`],
  ])
  const journal = await moduleUrl('staging-generation-22-recovery-journal.mjs', [
    ['export const STAGING_GENERATION_22_RECOVERY_JOURNAL_ENABLED = false',
      'export const STAGING_GENERATION_22_RECOVERY_JOURNAL_ENABLED = true'],
    ["export const RECOVERY_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const RECOVERY_WINDOW_EXPIRES_AT = '${recoveryDeadline}'`],
    ["from './staging-generation-22-credentials.mjs'", `from '${credentials}'`],
  ])
  const host = await moduleUrl('staging-generation-22-recovery-host.mjs', [
    ['export const STAGING_GENERATION_22_RECOVERY_HOST_ENABLED = false',
      'export const STAGING_GENERATION_22_RECOVERY_HOST_ENABLED = true'],
    ["from './staging-generation-22-credentials.mjs'", `from '${credentials}'`],
    ["from './staging-generation-22-recovery-journal.mjs'", `from '${journal}'`],
    ["from './staging-generation-22-recovery.mjs'", `from '${recovery}'`],
  ])
  const query = await moduleUrl('staging-generation-22-recovery-query.mjs', [
    ['export const STAGING_GENERATION_22_RECOVERY_QUERY_ENABLED = false',
      'export const STAGING_GENERATION_22_RECOVERY_QUERY_ENABLED = true'],
    ["from './staging-generation-22-recovery.mjs'", `from '${recovery}'`],
  ])
  return { create: (await import(host)).createStagingGeneration22RecoveryHost,
    journal: await import(journal), query: await import(query) }
}
function makeJournal(module, now) {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-gen22-recovery-host-')), 'private', 'record.json')
  const journal = module.createStagingGeneration22RecoveryJournal({ path, now })
  return { journal, pending: journal.dispatch(journal.claim()) }
}

test('recovery host is disconnected by default', () => {
  assert.throws(() => createStagingGeneration22RecoveryHost({ post() {} }), /unavailable/)
})

test('recovery host consumes one journal permission and validates exact retirement receipt', async () => {
  const { create, journal: module } = await fixture()
  let clock = Date.parse('2026-09-26T10:00:00.000Z')
  const now = () => clock
  const { journal, pending } = makeJournal(module, now)
  clock = Date.parse('2026-09-26T11:00:00.000Z')
  let calls = 0
  const host = create({ now, post: async (packet, { signal }) => {
    calls++
    assert.deepEqual(Object.keys(packet), [])
    assert.equal(signal.aborted, false)
    return rows
  } })
  const result = await host.retire({ capability: journal.capability(pending), expiresAt })
  assert.equal(result.status, 'PASS_RETIRED')
  assert.equal(journal.confirm(pending, result.receiptSha256).state, 'FINISHED')
  await assert.rejects(host.retire({ capability: {}, expiresAt }), /unavailable/)
  assert.equal(calls, 1)
})

test('failed and stalled retirement cannot retry; journal remains holdable', async () => {
  const { create, journal: module } = await fixture()
  const now = () => Date.parse('2026-09-26T10:00:00.000Z')
  const { journal, pending } = makeJournal(module, now)
  let release
  const host = create({ now, requestTimeoutMs: 5, post: () => new Promise(resolve => { release = resolve }) })
  await assert.rejects(host.retire({ capability: journal.capability(pending), expiresAt }), /unavailable/)
  release(rows)
  await assert.rejects(host.retire({ capability: {}, expiresAt }), /unavailable/)
  assert.equal(journal.hold(pending).state, 'HOLD')
})

test('recovery host rejects expired and wrong receipts without replay', async () => {
  const { create, journal: module } = await fixture()
  let clock = Date.parse('2026-09-26T10:00:00.000Z')
  const now = () => clock
  const { journal, pending } = makeJournal(module, now)
  const host = create({ now, post: async () => [{ tll_generation_22_recovery_receipt:
    { ...receipt, projectRef: 'wrhgscovsgsudtedbljr' } }] })
  await assert.rejects(host.retire({ capability: journal.capability(pending), expiresAt }), /unavailable/)
  assert.equal(journal.hold(pending).state, 'HOLD')
  clock = Date.parse(recoveryDeadline)
  const expired = create({ now, post: async () => rows })
  await assert.rejects(expired.retire({ capability: {}, expiresAt }), /unavailable/)
})

test('clock turning invalid after capability use cannot start recovery network call', async () => {
  const { create, journal: module } = await fixture()
  let clock = Date.parse('2026-09-26T10:00:00.000Z')
  let reads = 0, flip = false, posts = 0
  const now = () => {
    reads++
    if (flip && reads === 2) {
      const previous = clock
      clock = Number.NaN
      return previous
    }
    return clock
  }
  const { journal, pending } = makeJournal(module, now)
  const capability = journal.capability(pending)
  reads = 0; flip = true
  const host = create({ now, post: async () => { posts++; return rows } })
  await assert.rejects(host.retire({ capability, expiresAt }), /unavailable/)
  assert.equal(posts, 0)
  clock = Date.parse('2026-09-26T10:00:00.000Z')
  assert.equal(journal.hold(pending).state, 'HOLD')
})

test('recovery journal, host and fixed Supabase query compose once', async () => {
  const { create, journal: module, query } = await fixture()
  const now = () => Date.parse('2026-09-26T10:00:00.000Z')
  const { journal, pending } = makeJournal(module, now)
  const calls = []
  const request = (options, callback) => {
    const req = new EventEmitter()
    req.destroy = () => {}
    req.end = body => {
      calls.push({ options, body: Buffer.from(body) })
      queueMicrotask(() => {
        const res = new EventEmitter()
        res.statusCode = 201
        res.headers = { 'content-type': 'application/json' }
        res.destroy = () => {}
        callback(res)
        res.emit('data', Buffer.from(JSON.stringify(rows)))
        res.emit('end')
      })
    }
    return req
  }
  const token = Buffer.from(`sbp_${'a'.repeat(40)}`)
  const host = create({ now, post: (packet, { signal }) =>
    query.postStagingGeneration22RecoverySql(packet, { token, signal, request }) })
  const result = await host.retire({ capability: journal.capability(pending), expiresAt })
  assert.equal(result.status, 'PASS_RETIRED')
  assert.equal(journal.confirm(pending, result.receiptSha256).state, 'FINISHED')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.path, '/v1/projects/qdmvngjwkcsilzmqksme/database/query')
  assert.match(JSON.parse(calls[0].body.toString()).query, /REVOKE tll_customer_executor FROM tll_customer_runtime/)
})
