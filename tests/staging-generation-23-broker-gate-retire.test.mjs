import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EDGE_READINESS_WINDOW_NAME } from '../scripts/staging-generation-23-password-material.mjs'

const script = new URL('../scripts/staging-generation-23-broker-gate-retire.mjs', import.meta.url)
const source = await readFile(script, 'utf8')
const armed = await import(`data:text/javascript;base64,${Buffer.from(source
  .replace('export const STAGING_GENERATION_23_BROKER_GATE_RETIRE_ENABLED = false',
    'export const STAGING_GENERATION_23_BROKER_GATE_RETIRE_ENABLED = true')
  .replace('import.meta.dirname', JSON.stringify(fileURLToPath(new URL('../scripts/', import.meta.url))))
  .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)).toString('base64')}`)
const token = Buffer.from(`sbp_${'a'.repeat(40)}`)
const runId = 'c5dd421a-74e7-4cee-89bc-8b2e006b9338'
const reply = (status = 200) => new Response('{}', { status, headers: { 'content-type': 'application/json' } })

async function workspace(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'tll-gate-retire-'))
  try { return await fn(join(dir, 'journal.json')) } finally { await rm(dir, { recursive: true, force: true }) }
}

test('ordinary broker gate retirement is unavailable', async () => {
  const ordinary = await import(`${script.href}?ordinary=${Date.now()}`)
  assert.throws(() => ordinary.createStagingGeneration23BrokerGateRetire({}), /unavailable/)
})

test('one exact staging gate delete is verified by name readback and cannot replay', () => workspace(async path => {
  const calls = []
  const retire = armed.createStagingGeneration23BrokerGateRetire({ token, path, makeRunId: () => runId,
    async fetch(url, request) {
      calls.push({ url, method: request.method, body: request.body })
      assert.equal(request.redirect, 'error')
      return reply()
    },
    async readNames() { return ['TLL_STAGING_BROKER_DATABASE_PASSWORD'] },
  })
  assert.deepEqual(await retire.retire({ signal: new AbortController().signal }),
    { status: 'BROKER_GATE_RETIRED_VERIFIED' })
  assert.deepEqual(calls, [{ url: 'https://api.supabase.com/v1/projects/qdmvngjwkcsilzmqksme/secrets',
    method: 'DELETE', body: JSON.stringify([EDGE_READINESS_WINDOW_NAME]) }])
  assert.equal(JSON.parse(await readFile(path, 'utf8')).state, 'VERIFIED')
  await assert.rejects(retire.retire({ signal: new AbortController().signal }), /unavailable/)
  assert.throws(() => armed.createStagingGeneration23BrokerGateRetire({ token, path,
    fetch: async () => reply(), readNames: async () => [] }), /unavailable/)
}))

test('uncertain delete response holds the one-use record', () => workspace(async path => {
  const retire = armed.createStagingGeneration23BrokerGateRetire({ token, path, makeRunId: () => runId,
    fetch: async () => reply(503), readNames: async () => assert.fail('no read after uncertain delete') })
  await assert.rejects(retire.retire({ signal: new AbortController().signal }), /unavailable/)
  assert.equal(JSON.parse(await readFile(path, 'utf8')).state, 'HOLD')
}))

test('an uncooperative network promise stops when the window is cancelled', () => workspace(async path => {
  const controller = new AbortController()
  const retire = armed.createStagingGeneration23BrokerGateRetire({ token, path, makeRunId: () => runId,
    fetch: () => new Promise(() => {}), readNames: async () => assert.fail('no name read') })
  const run = retire.retire({ signal: controller.signal })
  controller.abort()
  await assert.rejects(run, /unavailable/)
  assert.equal(JSON.parse(await readFile(path, 'utf8')).state, 'HOLD')
}))
