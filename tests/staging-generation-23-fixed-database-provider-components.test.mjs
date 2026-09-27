import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23FixedDatabaseProviderComponents } from '../scripts/staging-generation-23-fixed-database-provider-components.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const managementToken = Buffer.from(`sbp_${'a'.repeat(40)}`)
const signal = new AbortController().signal
const expiresAt = '2026-09-27T22:00:00.000Z'
async function armed() {
  let source = await readFile(new URL('staging-generation-23-fixed-database-provider-components.mjs', scripts), 'utf8')
  source = source.replace('STAGING_GENERATION_23_FIXED_DATABASE_PROVIDER_COMPONENTS_ENABLED = false',
    'STAGING_GENERATION_23_FIXED_DATABASE_PROVIDER_COMPONENTS_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`))
    .createStagingGeneration23FixedDatabaseProviderComponents
}

test('ordinary source cannot construct database or provider components', () => {
  assert.throws(() => createStagingGeneration23FixedDatabaseProviderComponents({}), /unavailable/)
})

test('fixed construction selects distinct database journals and forwards the management token only to fixed ports', async () => {
  const create = await armed(), calls = []
  const journal = ({ action }) => ({ action, claim() {}, dispatch() {}, confirm() {}, hold() {}, read() { return null } })
  const component = create({ credentials: { managementToken, vercelToken: Buffer.from('v'), previewBypass: Buffer.from('b') },
    sourceCommit: 'a'.repeat(40), expiresAt,
    fetch: async () => { throw Error('not called') },
    factories: {
      createDatabaseJournal: journal,
      createDatabaseHost: ({ action, journal: selected }) => ({ async run() {
        calls.push({ action, journal: selected.action }); return { status: action === 'SETUP' ? 'SETUP_VERIFIED'
          : action === 'SHUTDOWN' ? 'SHUTDOWN_VERIFIED' : 'RETIREMENT_VERIFIED', receiptSha256: 'a'.repeat(64) }
      } }),
      createControlHost: () => ({ run: async () => ({ status: 'CONTROL_ACTIVATION_VERIFIED', receiptSha256: 'a'.repeat(64) }) }),
      createProviderJournal: ({ action }) => ({ action }),
      runProvider: async ({ action }) => ({ status: action === 'ENABLE' ? 'PROVIDER_ENABLED_VERIFIED' : 'PROVIDER_DISABLED_VERIFIED',
        projectRef: 'qdmvngjwkcsilzmqksme', identifier: 'custom:test' }),
      createSupabase: () => ({ async readProjectSecret() { return Buffer.from('s'.repeat(48)) }, dispose() {} }),
      createProviderPort: () => ({ dispose() {} }),
      createActivation: () => ({ async activate() { return { status: 'CONTROLS_ENABLED', target: 'qdmvngjwkcsilzmqksme', generation: 23,
        windowId: 'f910c5cb-1a94-410a-8e8d-2c9704c1536a', receiptHash: 'a'.repeat(64) } } }),
      createFinalJournal: () => ({}),
      createFinal: () => ({ async observe() { return { status: 'PASS_FINAL_RETIRED', projectRef: 'qdmvngjwkcsilzmqksme' } } }),
      postFinal: async () => [], validateFinal() {},
      postDatabase: async () => [], readCa() { return { pem: 'x', sha256: 'a'.repeat(64) } },
    } })
  const input = { expiresAt: '2026-09-27T12:00:00.000Z', deadlineAt: '2026-09-27T11:30:00.000Z',
    verifiers: {}, signal }
  assert.equal((await component.components.databaseSetup.run(input)).status, 'SETUP_VERIFIED')
  assert.equal((await component.components.controlsDisable.run(input)).status, 'SHUTDOWN_VERIFIED')
  assert.equal((await component.components.databaseRetire.run(input)).status, 'RETIREMENT_VERIFIED')
  assert.deepEqual(calls, [{ action: 'SETUP', journal: 'SETUP' }, { action: 'SHUTDOWN', journal: 'SHUTDOWN' },
    { action: 'RETIRE', journal: 'RETIRE' }])
  component.dispose()
})

test('construction refuses malformed management credentials before any factory runs', async () => {
  const create = await armed(); let called = false
  assert.throws(() => create({ credentials: { managementToken: Buffer.from('bad'), vercelToken: Buffer.from('v'), previewBypass: Buffer.from('b') },
    sourceCommit: 'a'.repeat(40), expiresAt,
    fetch() { called = true }, factories: {} }), /unavailable/)
  assert.equal(called, false)
})

test('final state uses the distinct Gen23 final journal and observer', async () => {
  const create = await armed(); const calls = []
  const component = create({
    credentials: { managementToken, vercelToken: Buffer.from('v'), previewBypass: Buffer.from('b') },
    sourceCommit: 'a'.repeat(40), expiresAt,
    fetch: async () => { throw Error('not called') },
    factories: {
      createFinalJournal: () => { calls.push('final-journal'); return { final: true } },
      createFinal: ({ journal, readToken, post, validate }) => {
        calls.push({ finalObserver: journal.final, readToken: typeof readToken, post: typeof post, validate: typeof validate })
        return { async observe({ signal: observed }) { calls.push({ observe: observed === signal }); return {
          status: 'PASS_FINAL_RETIRED', projectRef: 'qdmvngjwkcsilzmqksme' } } }
      },
      postFinal: async () => [], validateFinal() {},
    },
  })
  try {
    assert.deepEqual(await component.components.readRetiredState({ signal }), {
      status: 'PASS_FINAL_RETIRED', projectRef: 'qdmvngjwkcsilzmqksme' })
    assert.deepEqual(calls, ['final-journal', { finalObserver: true, readToken: 'function', post: 'function', validate: 'function' },
      { observe: true }])
  } finally {
    component.dispose()
  }
})

test('broker consumer and held reads accept only the exact authenticated staging replies', async () => {
  const create = await armed()
  const observed = []
  const make = response => create({
    credentials: { managementToken, vercelToken: Buffer.from('v'), previewBypass: Buffer.from('b') },
    sourceCommit: 'a'.repeat(40), expiresAt,
    fetch: async (url, options) => {
      observed.push({ url, method: options.method, authorization: options.headers.authorization,
        apikey: options.headers.apikey })
      return response
    },
    factories: { createSupabase: () => ({
      async readProjectSecret() { return Buffer.from('s'.repeat(48)) }, dispose() {},
    }) },
  })
  const pass = make(new Response(JSON.stringify({ status: 'PASS',
    windowId: 'f910c5cb-1a94-410a-8e8d-2c9704c1536a', expiresAt }),
  { status: 200, headers: { 'content-type': 'application/json' } }))
  try { assert.deepEqual(await pass.components.readBrokerConsumer({ signal }), { status: 'PASS' }) }
  finally { pass.dispose() }
  const held = make(new Response(JSON.stringify({ status: 'held' }),
    { status: 404, headers: { 'content-type': 'application/json' } }))
  try { assert.deepEqual(await held.components.readBrokerHeld({ signal }), { status: 'HELD' }) }
  finally { held.dispose() }
  assert.equal(observed.length, 2)
  assert.ok(observed.every(value => value.url === 'https://qdmvngjwkcsilzmqksme.supabase.co/functions/v1/tll-broker-readiness'
    && value.method === 'GET' && value.authorization === `Bearer ${'s'.repeat(48)}`
    && value.apikey === 's'.repeat(48)))
})

test('broker diagnostic records the request status before rejecting an active 503', async () => {
  const create = await armed()
  const events = []
  let fetches = 0
  const diagnostic = {
    verified: (stage, status) => events.push(['verified', stage, status ?? null]),
    pending: stage => events.push(['pending', stage]),
  }
  const component = create({ credentials: { managementToken,
    vercelToken: Buffer.from('v'), previewBypass: Buffer.from('b') },
  sourceCommit: 'a'.repeat(40), expiresAt,
  fetch: async () => { fetches++
    return new Response(JSON.stringify({ status: 'FAIL' }),
      { status: 503, headers: { 'content-type': 'application/json' } }) },
  factories: { createSupabase: () => ({
    async readProjectSecret() { return Buffer.from('s'.repeat(48)) }, dispose() {},
  }) } })
  try {
    await assert.rejects(component.components.readBrokerConsumer({ signal, diagnostic }), /unavailable/)
    assert.equal(fetches, 1)
    assert.deepEqual(events, [
      ['verified', 'broker_service_key', null], ['pending', 'broker_request'],
      ['verified', 'broker_request', 503], ['pending', 'broker_response_validation'],
    ])
  } finally { component.dispose() }
})
