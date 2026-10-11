import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration22VercelConfigHost } from '../scripts/staging-generation-22-vercel-config-host.mjs'
import { DISABLED_VERCEL_CONFIGURATION } from '../scripts/staging-generation-22-material.mjs'

const expiresAt = '2026-09-26T10:50:00.000Z'
const now = () => Date.parse('2026-09-26T10:00:00.000Z')
const token = Buffer.from('vercel-config-test-token')

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
  let host = await readFile(new URL('staging-generation-22-vercel-config-host.mjs', scripts), 'utf8')
  host = host.replace('export const STAGING_GENERATION_22_VERCEL_CONFIG_HOST_ENABLED = false',
    'export const STAGING_GENERATION_22_VERCEL_CONFIG_HOST_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replace("from './staging-generation-22-journal.mjs'", `from '${journalUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return { host: await import(`data:text/javascript;base64,${Buffer.from(host).toString('base64')}`),
    journal: await import(journalUrl) }
}

function capabilityFor(journalModule, index) {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-gen22-config-')), 'journal.json')
  const journal = journalModule.createStagingGeneration22Journal({ path, now })
  let state = journal.claim()
  for (let n = 0; n < index; n++) {
    state = journal.dispatch(state, journalModule.OPERATION_IDS[n])
    state = journal.confirm(state, 'a'.repeat(64))
  }
  const operationId = journalModule.OPERATION_IDS[index]
  const pending = journal.dispatch(state, operationId)
  return { name: operationId.split(':')[1], capability: journal.operationCapability(pending) }
}

function created(name, overrides = {}) {
  return { failed: [], created: { id: 'env_gen22_config_123', key: name,
    gitBranch: 'codex/tll-integration', target: ['preview'], type: 'encrypted', visibility: 'config', ...overrides } }
}

test('Vercel config host is disconnected by default', () => {
  assert.throws(() => createStagingGeneration22VercelConfigHost({ fetch: async () => {}, token }), /unavailable/)
})

test('all four controls can be staged only with their OFF values on the pinned Preview branch', async () => {
  const { host: { createStagingGeneration22VercelConfigHost: create }, journal } = await armedFixture()
  const names = Object.keys(DISABLED_VERCEL_CONFIGURATION).sort()
  for (let offset = 0; offset < names.length; offset++) {
    const { name, capability } = capabilityFor(journal, 18 + offset)
    assert.equal(name, names[offset])
    const calls = []
    const host = create({ token, now, fetch: async (url, options) => {
      calls.push({ url, options })
      return new Response(JSON.stringify(created(name)), { status: 201 })
    } })
    const value = DISABLED_VERCEL_CONFIGURATION[name]
    const receipt = await host.stageDisabled({ name, value, capability, signal: new AbortController().signal })
    assert.equal(receipt.status, 'STAGED')
    assert.equal(calls.length, 1)
    assert.match(calls[0].url, /^https:\/\/api\.vercel\.com\/v10\/projects\//)
    assert.deepEqual(JSON.parse(calls[0].options.body), { key: name, value, type: 'encrypted',
      visibility: 'config', target: ['preview'], gitBranch: 'codex/tll-integration' })
    assert.equal(calls[0].options.redirect, 'error')
    await assert.rejects(host.stageDisabled({ name, value, capability,
      signal: new AbortController().signal }), /unavailable/)
    host.dispose()
  }
})

test('enabled values, wrong capabilities and wrong classification make no accepted write', async () => {
  const { host: { createStagingGeneration22VercelConfigHost: create }, journal } = await armedFixture()
  const { name, capability } = capabilityFor(journal, 18)
  let calls = 0
  const host = create({ token, now, fetch: async () => { calls++; return null } })
  await assert.rejects(host.stageDisabled({ name, value: 'enabled', capability,
    signal: new AbortController().signal }), /unavailable/)
  await assert.rejects(host.stageDisabled({ name, value: DISABLED_VERCEL_CONFIGURATION[name],
    capability: { ...capability }, signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 0)
  const validValue = DISABLED_VERCEL_CONFIGURATION[name]
  const bad = create({ token, now, fetch: async () => new Response(JSON.stringify(created(name,
    { gitBranch: 'main' })), { status: 201 }) })
  await assert.rejects(bad.stageDisabled({ name, value: validValue, capability,
    signal: new AbortController().signal }), /unavailable/)
})

test('abort before a queued config write sends no request', async () => {
  const { host: { createStagingGeneration22VercelConfigHost: create }, journal } = await armedFixture()
  const { name, capability } = capabilityFor(journal, 18)
  const upstream = new AbortController()
  let calls = 0
  const host = create({ token, now, fetch: async () => { calls++; return null } })
  const pending = host.stageDisabled({ name, value: DISABLED_VERCEL_CONFIGURATION[name], capability,
    signal: upstream.signal })
  upstream.abort()
  await assert.rejects(pending, /unavailable/)
  assert.equal(calls, 0)
})

test('readback can only fetch an ID this host actually created for an OFF control', async () => {
  const { host: { createStagingGeneration22VercelConfigHost: create }, journal } = await armedFixture()
  const { name, capability } = capabilityFor(journal, 18)
  const id = created(name).created.id
  const calls = []
  const host = create({ token, now, fetch: async (url, options) => {
    calls.push({ url, options })
    return options.method === 'POST'
      ? new Response(JSON.stringify(created(name)), { status: 201 })
      : new Response(JSON.stringify({ id, key: name, value: DISABLED_VERCEL_CONFIGURATION[name],
        decrypted: true, gitBranch: 'codex/tll-integration', target: ['preview'],
        type: 'encrypted', visibility: 'config' }), { status: 200 })
  } })
  const signal = new AbortController().signal
  await assert.rejects(host.readDisabled({ name, signal }), /unavailable/)
  await assert.rejects(host.readDisabled({ name: 'TLL_STAGING_CUSTOMER_DATABASE_PASSWORD',
    id: 'env_other_secret', signal }), /unavailable/)
  assert.equal(calls.length, 0)
  await host.stageDisabled({ name, value: DISABLED_VERCEL_CONFIGURATION[name], capability, signal })
  const result = await host.readDisabled({ name, id: 'env_other_secret', signal })
  assert.deepEqual(result, { id, key: name, value: DISABLED_VERCEL_CONFIGURATION[name],
    decrypted: true, gitBranch: 'codex/tll-integration', target: 'preview',
    type: 'encrypted', visibility: 'config' })
  assert.equal(calls.length, 2)
  assert.match(calls[1].url, new RegExp(`/v1/projects/.*/env/${id}\\?teamId=`))
  assert.equal(calls[1].options.method, 'GET')
  await assert.rejects(host.readDisabled({ name, signal }), /unavailable/)
  assert.equal(calls.length, 2)
  host.dispose()
})

test('readback rejects missing or enabled value and never retries that ID', async () => {
  const { host: { createStagingGeneration22VercelConfigHost: create }, journal } = await armedFixture()
  const { name, capability } = capabilityFor(journal, 18)
  let reads = 0
  const host = create({ token, now, fetch: async (_url, options) => {
    if (options.method === 'POST') return new Response(JSON.stringify(created(name)), { status: 201 })
    reads++
    return new Response(JSON.stringify({ ...created(name).created, decrypted: true,
      value: 'enabled' }), { status: 200 })
  } })
  const signal = new AbortController().signal
  await host.stageDisabled({ name, value: DISABLED_VERCEL_CONFIGURATION[name], capability, signal })
  await assert.rejects(host.readDisabled({ name, signal }), /unavailable/)
  await assert.rejects(host.readDisabled({ name, signal }), /unavailable/)
  assert.equal(reads, 1)
  host.dispose()
})

test('aborted queued readback sends no GET and an oversized response is wiped', async () => {
  const { host: { createStagingGeneration22VercelConfigHost: create }, journal } = await armedFixture()
  const { name, capability } = capabilityFor(journal, 18)
  let reads = 0
  const host = create({ token, now, fetch: async (_url, options) => {
    if (options.method === 'POST') return new Response(JSON.stringify(created(name)), { status: 201 })
    reads++
    return null
  } })
  await host.stageDisabled({ name, value: DISABLED_VERCEL_CONFIGURATION[name], capability,
    signal: new AbortController().signal })
  const controller = new AbortController()
  const pending = host.readDisabled({ name, signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, /unavailable/)
  assert.equal(reads, 0)

  const second = capabilityFor(journal, 18)
  const bytes = Buffer.alloc(65_537, 65)
  let readCount = 0
  const oversized = create({ token, now, fetch: async (_url, options) => options.method === 'POST'
    ? new Response(JSON.stringify(created(second.name)), { status: 201 })
    : { status: 200, headers: { get: () => null }, body: { getReader: () => ({
      read: async () => readCount++ ? { done: true } : { done: false, value: bytes },
      cancel: () => Promise.resolve(), releaseLock: () => {},
    }) } } })
  await oversized.stageDisabled({ name: second.name, value: DISABLED_VERCEL_CONFIGURATION[second.name],
    capability: second.capability, signal: new AbortController().signal })
  await assert.rejects(oversized.readDisabled({ name: second.name,
    signal: new AbortController().signal }), /unavailable/)
  assert.deepEqual(bytes, Buffer.alloc(bytes.length))
})
