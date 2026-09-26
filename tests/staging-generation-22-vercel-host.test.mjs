import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration22VercelHost } from '../scripts/staging-generation-22-vercel-host.mjs'

const expiresAt = '2026-09-26T10:50:00.000Z'
const now = () => Date.parse('2026-09-26T10:00:00.000Z')
const token = Buffer.from('vercel-test-token-only')
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
  let host = await readFile(new URL('staging-generation-22-vercel-host.mjs', scripts), 'utf8')
  host = host.replace('export const STAGING_GENERATION_22_VERCEL_HOST_ENABLED = false',
    'export const STAGING_GENERATION_22_VERCEL_HOST_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replace("from './staging-generation-22-journal.mjs'", `from '${journalUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return { host: await import(`data:text/javascript;base64,${Buffer.from(host).toString('base64')}`),
    journal: await import(journalUrl) }
}

function capabilityFor(journalModule, targetIndex = 1) {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-gen22-vercel-')), 'journal.json')
  const journal = journalModule.createStagingGeneration22Journal({ path, now })
  let state = journal.claim()
  for (let index = 0; index < targetIndex; index++) {
    state = journal.dispatch(state, journalModule.OPERATION_IDS[index])
    state = journal.confirm(state, 'a'.repeat(64))
  }
  const operationId = journalModule.OPERATION_IDS[targetIndex]
  const pending = journal.dispatch(state, operationId)
  return { name: operationId.split(':')[1], capability: journal.operationCapability(pending) }
}

function created(name, overrides = {}) {
  return { failed: [], created: { id: 'env_gen22_secret_123', key: name,
    gitBranch: 'codex/tll-integration', target: ['preview'], type: 'sensitive', visibility: 'secret', ...overrides } }
}

test('Vercel host is disconnected by default', () => {
  assert.throws(() => createStagingGeneration22VercelHost({ fetch: async () => {}, token }), /unavailable/)
})

test('one journal-bound secret reaches only the pinned Preview branch', async () => {
  const { host: { createStagingGeneration22VercelHost: create }, journal } = await armedFixture()
  const { name, capability } = capabilityFor(journal)
  const calls = []
  const host = create({ token, now, fetch: async (url, options) => {
    calls.push({ url, options })
    return new Response(JSON.stringify(created(name)), { status: 201,
      headers: { 'content-type': 'application/json' } })
  } })
  const result = await host.stageSecret({ name, value: password, capability, signal: new AbortController().signal })
  assert.equal(result.status, 'STAGED')
  assert.equal(result.name, name)
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /^https:\/\/api\.vercel\.com\/v10\/projects\//)
  assert.deepEqual(JSON.parse(calls[0].options.body), { key: name, value: password,
    type: 'sensitive', visibility: 'secret', target: ['preview'], gitBranch: 'codex/tll-integration' })
  assert.equal(calls[0].options.redirect, 'error')
  await assert.rejects(host.stageSecret({ name, value: password, capability, signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls.length, 1)
  host.dispose()
})

test('copied, wrong-name and reused capabilities never create a second secret', async () => {
  const { host: { createStagingGeneration22VercelHost: create }, journal } = await armedFixture()
  const { name, capability } = capabilityFor(journal)
  let calls = 0
  const fetcher = async () => { calls++; throw new Error('lost reply') }
  const first = create({ token, now, fetch: fetcher })
  await assert.rejects(first.stageSecret({ name, value: password, capability: { ...capability },
    signal: new AbortController().signal }), /unavailable/)
  await assert.rejects(first.stageSecret({ name: 'TLL_STAGING_CUSTOMER_DATABASE_PASSWORD', value: password,
    capability, signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 0)
  await assert.rejects(first.stageSecret({ name, value: password, capability,
    signal: new AbortController().signal }), /unavailable/)
  const second = create({ token, now, fetch: fetcher })
  await assert.rejects(second.stageSecret({ name, value: password, capability,
    signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 1)
})

test('wrong Vercel classification and stalled fetch are uncertain with no repeat', async () => {
  const { host: { createStagingGeneration22VercelHost: create }, journal } = await armedFixture()
  const first = capabilityFor(journal)
  const bad = create({ token, now, fetch: async () => new Response(JSON.stringify(created(first.name,
    { gitBranch: 'main' })), { status: 201 }) })
  await assert.rejects(bad.stageSecret({ name: first.name, value: password, capability: first.capability,
    signal: new AbortController().signal }), /unavailable/)

  const second = capabilityFor(journal)
  let calls = 0
  const stalled = create({ token, now, requestTimeoutMs: 10,
    fetch: async (_url, { signal }) => { calls++; assert.equal(typeof signal.aborted, 'boolean'); return new Promise(() => {}) } })
  await assert.rejects(stalled.stageSecret({ name: second.name, value: password, capability: second.capability,
    signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 1)
  await assert.rejects(create({ token, now, fetch: async () => { calls++; return null } })
    .stageSecret({ name: second.name, value: password, capability: second.capability,
      signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 1)
})

test('a delayed response chunk is wiped when abort wins during body read', async () => {
  const { host: { createStagingGeneration22VercelHost: create }, journal } = await armedFixture()
  const { name, capability } = capabilityFor(journal)
  const upstream = new AbortController()
  const delayed = Buffer.from('sensitive-response-value')
  let releaseRead
  let readingStarted
  const started = new Promise(resolve => { readingStarted = resolve })
  const host = create({ token, now, fetch: async () => ({
    status: 201,
    redirected: false,
    headers: { get: () => null },
    body: {
      getReader: () => ({
        read: () => { readingStarted(); return new Promise(resolve => { releaseRead = resolve }) },
        cancel: () => Promise.resolve(),
        releaseLock: () => {},
      }),
      cancel: () => Promise.resolve(),
    },
  }) })
  const pending = host.stageSecret({ name, value: password, capability, signal: upstream.signal })
  await started
  upstream.abort()
  await assert.rejects(pending, /unavailable/)
  releaseRead({ done: false, value: delayed })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(delayed, Buffer.alloc(delayed.length))
  host.dispose()
})
