import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23EdgeReplacer,
  STAGING_GENERATION_23_EDGE_REPLACER_ENABLED } from '../scripts/staging-generation-23-edge-replacer.mjs'
import { EDGE_PASSWORD_NAME, PROJECT_REF } from '../scripts/staging-generation-23-password-material.mjs'

const token = Buffer.from('offline-supabase-token')
const value = 'a'.repeat(64)
const now = Date.parse('2026-09-26T12:00:00.000Z')
const expiresAt = new Date(now + 3_600_000).toISOString()
const success = () => new Response('{}', { status: 201,
  headers: { 'content-type': 'application/json' } })

async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  const source = (await readFile(new URL('staging-generation-23-edge-replacer.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_EDGE_REPLACER_ENABLED = false',
      'export const STAGING_GENERATION_23_EDGE_REPLACER_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('Edge replacement is unavailable in ordinary source', () => {
  assert.equal(STAGING_GENERATION_23_EDGE_REPLACER_ENABLED, false)
  assert.throws(() => createStagingGeneration23EdgeReplacer({ fetch: async () => {}, token,
    expiresAt }), /unavailable/)
})

test('one exact staging Edge value is sent and result contains no value', async () => {
  const { createStagingGeneration23EdgeReplacer: create } = await armedFixture()
  const calls = []
  const host = create({ token, expiresAt, now: () => now, fetch: async (url, options) => {
    calls.push({ url, method: options.method, redirect: options.redirect,
      body: JSON.parse(options.body.toString('utf8')) })
    return success()
  } })
  assert.deepEqual(await host.stageSecret({ name: EDGE_PASSWORD_NAME, value,
    signal: new AbortController().signal }), {
    status: 'STAGED', name: EDGE_PASSWORD_NAME, projectRef: PROJECT_REF,
  })
  assert.deepEqual(calls, [{ url: `https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`,
    method: 'POST', redirect: 'error', body: [{ name: EDGE_PASSWORD_NAME, value }] }])
  await assert.rejects(host.stageSecret({ name: EDGE_PASSWORD_NAME, value,
    signal: new AbortController().signal }), /unavailable/)
  host.dispose()
})

test('wrong name, stale window, HTTP failure and uncertain response never retry', async () => {
  const { createStagingGeneration23EdgeReplacer: create } = await armedFixture()
  let calls = 0
  const host = create({ token, expiresAt, now: () => now, fetch: async () => { calls++; return success() } })
  await assert.rejects(host.stageSecret({ name: 'OTHER', value,
    signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 0)
  host.dispose()
  assert.throws(() => create({ token, expiresAt, now: () => now + 3_600_000,
    fetch: async () => success() }), /unavailable/)
  for (const answer of [
    async () => new Response('{}', { status: 403 }),
    async () => new Response('not empty', { status: 201 }),
    async () => new Promise(() => {}),
  ]) {
    const failing = create({ token, expiresAt, now: () => now, timeoutMs: 10,
      fetch: async () => { calls++; return answer() } })
    await assert.rejects(failing.stageSecret({ name: EDGE_PASSWORD_NAME, value,
      signal: new AbortController().signal }), /unavailable/)
    await assert.rejects(failing.stageSecret({ name: EDGE_PASSWORD_NAME, value,
      signal: new AbortController().signal }), /unavailable/)
    failing.dispose()
  }
  assert.equal(calls, 3)
})
