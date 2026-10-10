import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { postStagingGeneration22CredentialSql } from '../scripts/staging-generation-22-supabase-query.mjs'

const token = Buffer.from(`sbp_${'a'.repeat(40)}`)
const rows = [{ tll_generation_22_credential_receipt: { status: 'PASS' } }]
async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  let credentials = await readFile(new URL('staging-generation-22-credentials.mjs', scripts), 'utf8')
  credentials = credentials
    .replace('export const STAGING_GENERATION_22_CREDENTIALS_ENABLED = false',
      'export const STAGING_GENERATION_22_CREDENTIALS_ENABLED = true')
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      "export const ACTIVE_WINDOW_EXPIRES_AT = '2026-09-26T10:50:00.000Z'")
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credentials).toString('base64')}`
  const credentialModule = await import(credentialUrl)
  const source = (await readFile(new URL('staging-generation-22-supabase-query.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_22_SUPABASE_QUERY_ENABLED = false',
      'export const STAGING_GENERATION_22_SUPABASE_QUERY_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const input = {
      expiresAt: '2026-09-26T10:50:00.000Z', nowMs: Date.parse('2026-09-26T10:00:00.000Z'),
      verifiers: Object.fromEntries(['customer', 'cart', 'broker', 'provisional', 'bridge'].map((purpose, index) => {
        const value = Buffer.from(`fixture-${purpose}-${index}`).toString('base64')
        return [purpose, `SCRAM-SHA-256$4096:${value}$${value}:${value}`]
      })),
    }
  return { credentialUrl, transport: await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`),
    prepare: () => credentialModule.prepareStagingGeneration22CredentialSql(input),
    expectedSql: credentialModule.buildStagingGeneration22CredentialSql(input) }
}
function fakeRequest({ status = 201, payload = rows, stall = false, partial = false, headers = {} } = {}) {
  const calls = []
  const request = (options, callback) => {
    const req = new EventEmitter()
    req.destroyed = false
    req.destroy = () => { req.destroyed = true }
    req.end = body => {
      calls.push({ options, body: Buffer.from(body), req })
      if (stall) return
      queueMicrotask(() => {
        const res = new EventEmitter()
        res.statusCode = status
        res.headers = { 'content-type': 'application/json', ...headers }
        res.destroy = () => { res.destroyed = true }
        calls.at(-1).response = res
        callback(res)
        if (res.destroyed) return
        res.emit('data', Buffer.from(JSON.stringify(payload)))
        if (!partial) res.emit('end')
      })
    }
    return req
  }
  return { request, calls }
}

test('Supabase query transport stays disconnected by default', async () => {
  await assert.rejects(postStagingGeneration22CredentialSql(null,
    { token, signal: new AbortController().signal, request: () => {} }), /unavailable/)
})

test('synthetic transport pins Supabase staging target, request and bounded response', async () => {
  const { transport: { postStagingGeneration22CredentialSql: post }, prepare, expectedSql } = await armedFixture()
  const packet = prepare()
  const fake = fakeRequest()
  const result = await post(packet, { token, signal: new AbortController().signal, request: fake.request })
  assert.deepEqual(result, rows)
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].options.hostname, 'api.supabase.com')
  assert.equal(fake.calls[0].options.path, '/v1/projects/qdmvngjwkcsilzmqksme/database/query')
  assert.equal(fake.calls[0].options.method, 'POST')
  assert.equal(fake.calls[0].options.rejectUnauthorized, true)
  assert.equal(JSON.parse(fake.calls[0].body.toString('utf8')).read_only, false)
  assert.equal(JSON.parse(fake.calls[0].body.toString('utf8')).query, expectedSql)
  assert.equal(fake.calls[0].req.destroyed, false)
})

test('abort destroys the in-flight request and cannot return success', async () => {
  const { transport: { postStagingGeneration22CredentialSql: post }, prepare } = await armedFixture()
  const fake = fakeRequest({ stall: true })
  const controller = new AbortController()
  const pending = post(prepare(), { token, signal: controller.signal, request: fake.request })
  controller.abort()
  await assert.rejects(pending, /unavailable/)
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].req.destroyed, true)
})

test('abort after response starts destroys both sides and rejects late success', async () => {
  const { transport: { postStagingGeneration22CredentialSql: post }, prepare } = await armedFixture()
  const fake = fakeRequest({ partial: true })
  const controller = new AbortController()
  const pending = post(prepare(), { token, signal: controller.signal, request: fake.request })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fake.calls.length, 1)
  assert.ok(fake.calls[0].response)
  controller.abort()
  fake.calls[0].response.emit('end')
  await assert.rejects(pending, /unavailable/)
  assert.equal(fake.calls[0].req.destroyed, true)
  assert.equal(fake.calls[0].response.destroyed, true)
})

test('bad status, oversized body and unexpected JSON fail closed', async () => {
  const { transport: { postStagingGeneration22CredentialSql: post }, prepare } = await armedFixture()
  for (const setup of [{ status: 403 }, { headers: { 'content-length': '65537' } }, { payload: { wrong: true } }]) {
    const fake = fakeRequest(setup)
    await assert.rejects(post(prepare(), { token, signal: new AbortController().signal, request: fake.request }), /unavailable/)
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0].req.destroyed, true)
  }
})

test('edited SQL and copied packets cannot reach Supabase', async () => {
  const { transport: { postStagingGeneration22CredentialSql: post }, prepare, expectedSql } = await armedFixture()
  for (const extra of ['SELECT 123;', 'ALTER ROLE postgres SUPERUSER;', 'COMMIT; BEGIN;']) {
    const packet = prepare(), fake = fakeRequest()
    await assert.rejects(post({ ...packet, sql: expectedSql.replace('COMMIT;', `${extra}\nCOMMIT;`) },
      { token, signal: new AbortController().signal, request: fake.request }), /unavailable/)
    assert.equal(fake.calls.length, 0)
  }
  const packet = prepare(), fake = fakeRequest()
  assert.deepEqual(Object.keys(packet), [])
  await assert.rejects(post({ ...packet }, { token, signal: new AbortController().signal, request: fake.request }), /unavailable/)
  assert.equal(fake.calls.length, 0)
  await post(packet, { token, signal: new AbortController().signal, request: fake.request })
  await assert.rejects(post(packet, { token, signal: new AbortController().signal, request: fake.request }), /unavailable/)
  assert.equal(fake.calls.length, 1)
})

test('journal, database host and exact Supabase transport compose once', async () => {
  const { credentialUrl, transport } = await armedFixture()
  const scripts = new URL('../scripts/', import.meta.url)
  let journalSource = await readFile(new URL('staging-generation-22-journal.mjs', scripts), 'utf8')
  journalSource = journalSource.replace('export const STAGING_GENERATION_22_JOURNAL_ENABLED = false',
    'export const STAGING_GENERATION_22_JOURNAL_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
    .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  const journalUrl = `data:text/javascript;base64,${Buffer.from(journalSource).toString('base64')}`
  const journalModule = await import(journalUrl)
  let hostSource = await readFile(new URL('staging-generation-22-database-host.mjs', scripts), 'utf8')
  hostSource = hostSource.replace('export const STAGING_GENERATION_22_DATABASE_HOST_ENABLED = false',
    'export const STAGING_GENERATION_22_DATABASE_HOST_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replace("from './staging-generation-22-journal.mjs'", `from '${journalUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const hostModule = await import(`data:text/javascript;base64,${Buffer.from(hostSource).toString('base64')}`)
  const now = () => Date.parse('2026-09-26T10:00:00.000Z')
  const path = join(mkdtempSync(join(tmpdir(), 'tll-gen22-compose-')), 'journal.json')
  const journal = journalModule.createStagingGeneration22Journal({ path, now })
  const dispatched = journal.dispatch(journal.claim(), 'DATABASE_CREDENTIALS')
  const capability = journal.databaseCapability(dispatched)
  const expected = { status: 'PASS', packageId: 'tll-staging-generation-22-credentials/v1',
    projectRef: 'qdmvngjwkcsilzmqksme', generation: 22,
    windowId: '9a539def-bf3c-442c-bf06-c4bd1df39543',
    expiresAt: '2026-09-26T10:50:00.000Z', controlsEnabled: false, runtimeCount: 5 }
  const fake = fakeRequest({ payload: [{ tll_generation_22_credential_receipt: expected }] })
  const host = hostModule.createStagingGeneration22DatabaseHost({ now,
    post: (packet, { signal }) => transport.postStagingGeneration22CredentialSql(packet,
      { token, signal, request: fake.request }) })
  const verifiers = Object.fromEntries(['customer', 'cart', 'broker', 'provisional', 'bridge']
    .map((purpose, index) => {
      const value = Buffer.from(`fixture-${purpose}-${index}`).toString('base64')
      return [purpose, `SCRAM-SHA-256$4096:${value}$${value}:${value}`]
    }))
  const result = await host.install({ capability, verifiers, expiresAt: expected.expiresAt })
  assert.equal(result.status, 'PASS')
  assert.equal(fake.calls.length, 1)
  assert.match(JSON.parse(fake.calls[0].body.toString('utf8')).query, /Generation 22 credential window expired before commit/)
  await assert.rejects(host.install({ capability, verifiers, expiresAt: expected.expiresAt }), /unavailable/)
  assert.equal(fake.calls.length, 1)
})
