import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23VercelInventoryReader } from '../scripts/staging-generation-23-vercel-inventory-reader.mjs'

const names = ['BRIDGE', 'BROKER', 'CART', 'CUSTOMER', 'PROVISIONAL']
const token = Buffer.from('vercel-test-token-only')
const response = (overrides = {}) => new Response(JSON.stringify({ envs: names.map((purpose, index) => ({
  id: `env_gen23_${index}`, key: `TLL_STAGING_${purpose}_DATABASE_PASSWORD`,
  target: ['preview'], gitBranch: 'codex/tll-integration', type: 'sensitive', visibility: 'secret',
  value: 'discard-this-sensitive-value',
})), ...overrides }), { status: 200, headers: { 'content-type': 'application/json' } })

async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  const targets = (await readFile(new URL('staging-generation-23-vercel-targets.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_VERCEL_TARGETS_ENABLED = false',
      'export const STAGING_GENERATION_23_VERCEL_TARGETS_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  const targetsUrl = `data:text/javascript;base64,${Buffer.from(targets).toString('base64')}`
  const source = (await readFile(new URL('staging-generation-23-vercel-inventory-reader.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_VERCEL_INVENTORY_READER_ENABLED = false',
      'export const STAGING_GENERATION_23_VERCEL_INVENTORY_READER_ENABLED = true')
    .replace("from './staging-generation-23-vercel-targets.mjs'", `from '${targetsUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('the inventory reader is disconnected by default', () => {
  assert.throws(() => createStagingGeneration23VercelInventoryReader({ fetch: async () => {}, token }), /unavailable/)
})

test('one fixed staging GET returns only IDs and never returned values', async () => {
  const { createStagingGeneration23VercelInventoryReader: create } = await armedFixture()
  const calls = []
  const reader = create({ token, fetch: async (url, options) => {
    calls.push({ url, options })
    return response()
  } })
  const result = await reader.readTargets({ signal: new AbortController().signal })
  assert.equal(result.length, 5)
  assert.equal(result[0].id, 'env_gen23_0')
  assert.doesNotMatch(JSON.stringify(result), /discard-this-sensitive-value|value/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.vercel.com/v10/projects/prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4/env?limit=100&teamId=team_gf7cgIkkoeMLtODFDDT5MrW4')
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls[0].options.redirect, 'error')
  await assert.rejects(reader.readTargets({ signal: new AbortController().signal }), /unavailable/)
  reader.dispose()
})

test('an incomplete or wrong-scope inventory fails closed and cannot be reread', async () => {
  const { createStagingGeneration23VercelInventoryReader: create } = await armedFixture()
  let calls = 0
  const reader = create({ token, fetch: async () => { calls++; return response({ pagination: { next: 'more' } }) } })
  await assert.rejects(reader.readTargets({ signal: new AbortController().signal }), /unavailable/)
  await assert.rejects(reader.readTargets({ signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 1)
  reader.dispose()
})

test('timeout aborts a stuck request and does not permit a second call', async () => {
  const { createStagingGeneration23VercelInventoryReader: create } = await armedFixture()
  let calls = 0
  const reader = create({ token, requestTimeoutMs: 10,
    fetch: async () => { calls++; return new Promise(() => {}) } })
  await assert.rejects(reader.readTargets({ signal: new AbortController().signal }), /unavailable/)
  await assert.rejects(reader.readTargets({ signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 1)
  reader.dispose()
})
