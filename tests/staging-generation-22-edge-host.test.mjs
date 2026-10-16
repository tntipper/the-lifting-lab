import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration22EdgeHost } from '../scripts/staging-generation-22-edge-host.mjs'

const expiresAt = '2026-09-26T10:50:00.000Z'
const now = () => Date.parse('2026-09-26T10:00:00.000Z')
const token = Buffer.from('supabase-test-token-only')
const password = Buffer.alloc(48, 1).toString('base64url')

async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  let credential = await readFile(new URL('staging-generation-22-credentials.mjs', scripts), 'utf8')
  credential = credential.replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
    `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`).replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credential).toString('base64')}`
  let journal = await readFile(new URL('staging-generation-22-journal.mjs', scripts), 'utf8')
  journal = journal.replace('export const STAGING_GENERATION_22_JOURNAL_ENABLED = false',
    'export const STAGING_GENERATION_22_JOURNAL_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
    .replace('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  const journalUrl = `data:text/javascript;base64,${Buffer.from(journal).toString('base64')}`
  let host = await readFile(new URL('staging-generation-22-edge-host.mjs', scripts), 'utf8')
  host = host.replace('export const STAGING_GENERATION_22_EDGE_HOST_ENABLED = false',
    'export const STAGING_GENERATION_22_EDGE_HOST_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replace("from './staging-generation-22-journal.mjs'", `from '${journalUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return { host: await import(`data:text/javascript;base64,${Buffer.from(host).toString('base64')}`),
    journal: await import(journalUrl) }
}

function capabilityFor(journalModule) {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-gen22-edge-')), 'journal.json')
  const journal = journalModule.createStagingGeneration22Journal({ path, now })
  let state = journal.claim()
  for (let index = 0; index < 17; index++) {
    state = journal.dispatch(state, journalModule.OPERATION_IDS[index])
    state = journal.confirm(state, 'a'.repeat(64))
  }
  const operationId = journalModule.OPERATION_IDS[17]
  const pending = journal.dispatch(state, operationId)
  return { name: operationId.split(':')[1], capability: journal.operationCapability(pending) }
}

test('Edge host is disconnected by default', () => {
  assert.throws(() => createStagingGeneration22EdgeHost({ fetch: async () => {}, token }), /unavailable/)
})

test('one journal-bound password reaches only the staging Supabase project', async () => {
  const { host: { createStagingGeneration22EdgeHost: create }, journal } = await armedFixture()
  const { name, capability } = capabilityFor(journal)
  const calls = []
  const host = create({ token, now, fetch: async (url, options) => {
    calls.push({ url, options })
    return new Response('{}', { status: 201 })
  } })
  const receipt = await host.stageSecret({ name, value: password, capability, signal: new AbortController().signal })
  assert.deepEqual(receipt, { status: 'STAGED', name, projectRef: 'qdmvngjwkcsilzmqksme' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.supabase.com/v1/projects/qdmvngjwkcsilzmqksme/secrets')
  assert.deepEqual(JSON.parse(calls[0].options.body), [{ name, value: password }])
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.redirect, 'error')
  await assert.rejects(host.stageSecret({ name, value: password, capability, signal: new AbortController().signal }), /unavailable/)
  host.dispose()
})

test('invalid material and copied capabilities make no request', async () => {
  const { host: { createStagingGeneration22EdgeHost: create }, journal } = await armedFixture()
  const { name, capability } = capabilityFor(journal)
  let calls = 0
  const host = create({ token, now, fetch: async () => { calls++; return null } })
  await assert.rejects(host.stageSecret({ name, value: 'short', capability,
    signal: new AbortController().signal }), /unavailable/)
  await assert.rejects(host.stageSecret({ name, value: password, capability: { ...capability },
    signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 0)
  await assert.rejects(host.stageSecret({ name, value: password, capability,
    signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 1)
  await assert.rejects(create({ token, now, fetch: async () => { calls++; return null } })
    .stageSecret({ name, value: password, capability, signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 1)
})

test('nonempty success body and stalled request remain uncertain', async () => {
  const { host: { createStagingGeneration22EdgeHost: create }, journal } = await armedFixture()
  const first = capabilityFor(journal)
  const bad = create({ token, now, fetch: async () => new Response('{"error":"unexpected"}', { status: 201 }) })
  await assert.rejects(bad.stageSecret({ name: first.name, value: password, capability: first.capability,
    signal: new AbortController().signal }), /unavailable/)
  const second = capabilityFor(journal)
  const stalled = create({ token, now, requestTimeoutMs: 10, fetch: async () => new Promise(() => {}) })
  await assert.rejects(stalled.stageSecret({ name: second.name, value: password, capability: second.capability,
    signal: new AbortController().signal }), /unavailable/)
})

test('aborting before the queued fetch sends nothing', async () => {
  const { host: { createStagingGeneration22EdgeHost: create }, journal } = await armedFixture()
  const { name, capability } = capabilityFor(journal)
  const upstream = new AbortController()
  let calls = 0
  const host = create({ token, now, fetch: async () => { calls++; return null } })
  const pending = host.stageSecret({ name, value: password, capability, signal: upstream.signal })
  upstream.abort()
  await assert.rejects(pending, /unavailable/)
  assert.equal(calls, 0)
})

test('late response and late body chunks are discarded after abort', async () => {
  const { host: { createStagingGeneration22EdgeHost: create }, journal } = await armedFixture()
  const first = capabilityFor(journal)
  const upstream = new AbortController()
  let finishFetch, fetchStarted, cancellations = 0
  const started = new Promise(resolve => { fetchStarted = resolve })
  const host = create({ token, now, fetch: () => {
    fetchStarted()
    return new Promise(resolve => { finishFetch = resolve })
  } })
  const pending = host.stageSecret({ name: first.name, value: password, capability: first.capability,
    signal: upstream.signal })
  await started
  upstream.abort()
  await assert.rejects(pending, /unavailable/)
  finishFetch({ body: { cancel: () => { cancellations++; return Promise.resolve() } } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(cancellations, 1)

  const second = capabilityFor(journal)
  const anotherAbort = new AbortController()
  const delayed = Buffer.from('secret-response')
  let releaseRead, readingStarted
  const reading = new Promise(resolve => { readingStarted = resolve })
  const bodyHost = create({ token, now, fetch: async () => ({ status: 201,
    headers: { get: () => null }, body: {
      getReader: () => ({ read: () => { readingStarted(); return new Promise(resolve => { releaseRead = resolve }) },
        cancel: () => Promise.resolve(), releaseLock: () => {} }), cancel: () => Promise.resolve(),
    } }) })
  const bodyPending = bodyHost.stageSecret({ name: second.name, value: password,
    capability: second.capability, signal: anotherAbort.signal })
  await reading
  anotherAbort.abort()
  await assert.rejects(bodyPending, /unavailable/)
  releaseRead({ done: false, value: delayed })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(delayed, Buffer.alloc(delayed.length))
})
