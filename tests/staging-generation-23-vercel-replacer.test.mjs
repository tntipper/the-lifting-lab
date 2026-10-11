import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23VercelReplacer,
  STAGING_GENERATION_23_VERCEL_REPLACER_ENABLED } from '../scripts/staging-generation-23-vercel-replacer.mjs'

const token = Buffer.from('offline-vercel-token')
const password = 'a'.repeat(64)
const selected = Object.freeze({ name: 'TLL_STAGING_BROKER_DATABASE_PASSWORD', id: 'env_gen23_broker',
  branch: 'codex/tll-integration', target: 'preview', classification: 'sensitive' })
const receipt = overrides => new Response(JSON.stringify({ id: selected.id, key: selected.name,
  gitBranch: selected.branch, target: ['preview'], type: 'sensitive', visibility: 'secret',
  value: 'must-not-return', ...overrides }), { status: 200,
  headers: { 'content-type': 'application/json' } })

async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  const targets = (await readFile(new URL('staging-generation-23-vercel-targets.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_VERCEL_TARGETS_ENABLED = false',
      'export const STAGING_GENERATION_23_VERCEL_TARGETS_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  const targetsUrl = `data:text/javascript;base64,${Buffer.from(targets).toString('base64')}`
  const source = (await readFile(new URL('staging-generation-23-vercel-replacer.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_VERCEL_REPLACER_ENABLED = false',
      'export const STAGING_GENERATION_23_VERCEL_REPLACER_ENABLED = true')
    .replace("from './staging-generation-23-vercel-targets.mjs'", `from '${targetsUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('the exact-ID replacement transport is disabled by default', () => {
  assert.equal(STAGING_GENERATION_23_VERCEL_REPLACER_ENABLED, false)
  assert.throws(() => createStagingGeneration23VercelReplacer({ fetch: async () => {}, token }), /unavailable/)
})

test('one existing Secret is patched by ID with value alone and returns no secret', async () => {
  const { createStagingGeneration23VercelReplacer: create } = await armedFixture()
  const calls = []
  const replacer = create({ token, fetch: async (url, options) => {
    calls.push({ url, method: options.method, redirect: options.redirect,
      body: JSON.parse(options.body.toString('utf8')) })
    return receipt()
  } })
  const result = await replacer.replace(selected, password, { signal: new AbortController().signal })
  assert.deepEqual(calls, [{
    url: 'https://api.vercel.com/v9/projects/prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4/env/env_gen23_broker?teamId=team_gf7cgIkkoeMLtODFDDT5MrW4',
    method: 'PATCH', redirect: 'error', body: { value: password },
  }])
  assert.equal(result.status, 'REPLACED')
  assert.equal(result.id, selected.id)
  assert.doesNotMatch(JSON.stringify(result), /must-not-return|"value"|a{64}/i)
  await assert.rejects(replacer.replace(selected, password, { signal: new AbortController().signal }), /unavailable/)
  replacer.dispose()
})

test('wrong branch, broadened receipt, failure and timeout cannot become success or replay', async () => {
  const { createStagingGeneration23VercelReplacer: create } = await armedFixture()
  let calls = 0
  const bad = create({ token, fetch: async () => { calls++; return receipt({ target: ['production'] }) } })
  await assert.rejects(bad.replace(selected, password, { signal: new AbortController().signal }), /unavailable/)
  await assert.rejects(bad.replace(selected, password, { signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 1)
  bad.dispose()

  const rejected = create({ token, fetch: async () => { calls++; return new Response('{}', { status: 403,
    headers: { 'content-type': 'application/json' } }) } })
  await assert.rejects(rejected.replace(selected, password, { signal: new AbortController().signal }), /unavailable/)
  rejected.dispose()

  const held = create({ token, timeoutMs: 10, fetch: async () => { calls++; return new Promise(() => {}) } })
  await assert.rejects(held.replace(selected, password, { signal: new AbortController().signal }), /unavailable/)
  await assert.rejects(held.replace(selected, password, { signal: new AbortController().signal }), /unavailable/)
  held.dispose()
  assert.equal(calls, 3)

  const noDispatch = create({ token, fetch: async () => { calls++; return receipt() } })
  await assert.rejects(noDispatch.replace({ ...selected, branch: 'main' }, password,
    { signal: new AbortController().signal }), /unavailable/)
  assert.equal(calls, 3)
  noDispatch.dispose()
})

test('redirects, oversized replies and caller aborts fail closed after at most one PATCH', async () => {
  const { createStagingGeneration23VercelReplacer: create } = await armedFixture()
  for (const answer of [
    () => ({ status: 200, redirected: true, body: new Response('{}').body,
      headers: new Headers({ 'content-type': 'application/json' }) }),
    () => new Response('x'.repeat(65_537), { status: 200,
      headers: { 'content-type': 'application/json', 'content-length': '65537' } }),
  ]) {
    let calls = 0
    const replacer = create({ token, fetch: async () => { calls++; return answer() } })
    await assert.rejects(replacer.replace(selected, password, { signal: new AbortController().signal }), /unavailable/)
    await assert.rejects(replacer.replace(selected, password, { signal: new AbortController().signal }), /unavailable/)
    assert.equal(calls, 1)
    replacer.dispose()
  }
  const controller = new AbortController()
  const replacer = create({ token, fetch: async () => {
    controller.abort()
    return receipt()
  } })
  await assert.rejects(replacer.replace(selected, password, { signal: controller.signal }), /unavailable/)
  replacer.dispose()
})
