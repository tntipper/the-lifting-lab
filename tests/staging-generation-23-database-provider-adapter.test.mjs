import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23DatabaseProviderAdapter } from '../scripts/staging-generation-23-database-provider-adapter.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const expiresAt = '2026-09-27T12:00:00.000Z'
const deadlineAt = '2026-09-27T11:30:00.000Z'
const purposes = ['customer', 'cart', 'broker', 'provisional', 'bridge']
const values = Object.fromEntries(purposes.map((purpose, index) => [purpose, `${index}`.repeat(64)]))
const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`

async function armed() {
  let source = await readFile(new URL('staging-generation-23-database-provider-adapter.mjs', scripts), 'utf8')
  source = source.replace('STAGING_GENERATION_23_DATABASE_PROVIDER_ADAPTER_ENABLED = false',
    'STAGING_GENERATION_23_DATABASE_PROVIDER_ADAPTER_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  return (await import(data(source))).createStagingGeneration23DatabaseProviderAdapter
}

async function armedFixedComponents() {
  let source = await readFile(new URL('staging-generation-23-fixed-database-provider-components.mjs', scripts), 'utf8')
  source = source.replace('STAGING_GENERATION_23_FIXED_DATABASE_PROVIDER_COMPONENTS_ENABLED = false',
    'STAGING_GENERATION_23_FIXED_DATABASE_PROVIDER_COMPONENTS_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  return (await import(data(source))).createStagingGeneration23FixedDatabaseProviderComponents
}

function fixture(change = {}) {
  const calls = []
  const receipt = status => ({ status, receiptSha256: 'a'.repeat(64) })
  const signal = new AbortController().signal
  const adapter = change.create ?? null
  const components = {
    databaseSetup: { async run() { calls.push('setup'); return change.setup ?? receipt('SETUP_VERIFIED') } },
    restrictedConnections: { async prove() { calls.push('restricted'); return change.restricted ?? {
      status: 'PASS_RESTRICTED_CONNECTIONS', projectRef: 'qdmvngjwkcsilzmqksme', purposes: 5, controlsEnabled: false } } },
    controlsEnable: { async run() { calls.push('enable-controls'); return change.enable ?? receipt('CONTROL_ACTIVATION_VERIFIED') } },
    controlsDisable: { async run() { calls.push('disable-controls'); return change.disable ?? receipt('SHUTDOWN_VERIFIED') } },
    databaseRetire: { async run() { calls.push('retire'); return change.retire ?? receipt('RETIREMENT_VERIFIED') } },
    providerEnable: async () => { calls.push('enable-provider'); return change.providerEnable ?? {
      status: 'PROVIDER_ENABLED_VERIFIED', projectRef: 'qdmvngjwkcsilzmqksme', identifier: 'custom:test' } },
    providerDisable: async () => { calls.push('disable-provider'); return change.providerDisable ?? {
      status: 'PROVIDER_DISABLED_VERIFIED', projectRef: 'qdmvngjwkcsilzmqksme', identifier: 'custom:test' } },
    readRetiredState: async () => { calls.push('final-read'); return change.final ?? {
      status: 'RETIRED_STATE_VERIFIED', projectRef: 'qdmvngjwkcsilzmqksme', runtimeSessions: 0, controlsEnabled: false } },
  }
  const input = { expiresAt, deadlineAt, verifiers: values, passwords: values, signal }
  return { components, calls, input, adapter }
}

test('ordinary source is OFF before it accepts components', () => {
  assert.throws(() => createStagingGeneration23DatabaseProviderAdapter({}), /unavailable/)
})

test('database and provider components execute only in the safe setup-to-retirement order', async () => {
  const create = await armed(), f = fixture(), adapter = create(f.components)
  assert.deepEqual(await adapter.setup(f.input), { status: 'PASS_DATABASESETUP' })
  assert.deepEqual(await adapter.proveRestricted(f.input), { status: 'PASS_RESTRICTEDCONNECTIONS' })
  assert.deepEqual(await adapter.enableProvider(f.input), { status: 'PASS_PROVIDERENABLE' })
  assert.deepEqual(await adapter.enableControls(f.input), { status: 'PASS_DATABASEENABLE' })
  assert.deepEqual(await adapter.disableControls(f.input), { status: 'PASS_BACKENDDISABLE' })
  assert.deepEqual(await adapter.disableProvider(f.input), { status: 'PASS_PROVIDERDISABLE' })
  assert.deepEqual(await adapter.retire(f.input), { status: 'PASS_DATABASERETIRE' })
  assert.deepEqual(await adapter.readFinal(f.input), { status: 'PASS_FINALREADBACK' })
  assert.deepEqual(f.calls, ['setup', 'restricted', 'enable-provider', 'enable-controls', 'disable-controls',
    'disable-provider', 'retire', 'final-read'])
})

test('unsafe ordering, a bad component result, or a nonzero final session count fails closed', async () => {
  const create = await armed(), f = fixture(), adapter = create(f.components)
  await assert.rejects(adapter.enableProvider(f.input), /unavailable/)
  await adapter.setup(f.input)
  await assert.rejects(adapter.enableControls(f.input), /unavailable/)
  const bad = fixture({ restricted: { status: 'PASS_RESTRICTED_CONNECTIONS', projectRef: 'wrong', purposes: 5, controlsEnabled: false } })
  const badAdapter = create(bad.components)
  await badAdapter.setup(bad.input)
  await assert.rejects(badAdapter.proveRestricted(bad.input), /unavailable/)
  const sessions = fixture({ final: { status: 'RETIRED_STATE_VERIFIED', projectRef: 'qdmvngjwkcsilzmqksme', runtimeSessions: 1, controlsEnabled: false } })
  const sessionAdapter = create(sessions.components)
  await sessionAdapter.setup(sessions.input); await sessionAdapter.proveRestricted(sessions.input)
  await sessionAdapter.enableProvider(sessions.input); await sessionAdapter.enableControls(sessions.input)
  await sessionAdapter.disableControls(sessions.input); await sessionAdapter.disableProvider(sessions.input)
  await sessionAdapter.retire(sessions.input)
  await assert.rejects(sessionAdapter.readFinal(sessions.input), /unavailable/)
})

test('each component is one-use and requires a live bounded signal', async () => {
  const create = await armed(), f = fixture(), adapter = create(f.components)
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(adapter.setup({ ...f.input, signal: aborted.signal }), /unavailable/)
  await adapter.setup(f.input)
  await assert.rejects(adapter.setup(f.input), /unavailable/)
})

test('the Gen23 final observer result is accepted only after retirement', async () => {
  const create = await armed(), f = fixture({ final: { status: 'PASS_FINAL_RETIRED', projectRef: 'qdmvngjwkcsilzmqksme' } })
  const adapter = create(f.components)
  await adapter.setup(f.input); await adapter.proveRestricted(f.input)
  await adapter.enableProvider(f.input); await adapter.enableControls(f.input)
  await adapter.disableControls(f.input); await adapter.disableProvider(f.input)
  await adapter.retire(f.input)
  assert.deepEqual(await adapter.readFinal(f.input), { status: 'PASS_FINALREADBACK' })
})

test('adapter forwards the exact expiry to the fixed provider controls', async () => {
  const [createAdapter, createFixed] = await Promise.all([armed(), armedFixedComponents()])
  const providerCalls = []
  const receipt = status => ({ status, receiptSha256: 'a'.repeat(64) })
  const fixed = createFixed({
    sourceCommit: 'a'.repeat(40), expiresAt,
    credentials: { managementToken: Buffer.from(`sbp_${'a'.repeat(40)}`), vercelToken: Buffer.from('v'), previewBypass: Buffer.from('b') },
    fetch: async () => { throw Error('not called') },
    factories: {
      createSupabase: () => ({ async readProjectSecret() { return Buffer.from('s'.repeat(48)) }, dispose() {} }),
      createProviderPort: () => ({ dispose() {} }),
      createProviderJournal: ({ action }) => ({ action }),
      runProvider: async ({ action, journal, port, signal }) => {
        providerCalls.push({ action, journal: journal.action, hasPort: Boolean(port), signal })
        return { status: action === 'ENABLE' ? 'PROVIDER_ENABLED_VERIFIED' : 'PROVIDER_DISABLED_VERIFIED',
          projectRef: 'qdmvngjwkcsilzmqksme', identifier: 'custom:test' }
      },
    },
  })
  const input = { expiresAt, deadlineAt, verifiers: values, passwords: values, signal: new AbortController().signal }
  const adapter = createAdapter({
    databaseSetup: { run: async () => receipt('SETUP_VERIFIED') },
    restrictedConnections: { prove: async () => ({ status: 'PASS_RESTRICTED_CONNECTIONS',
      projectRef: 'qdmvngjwkcsilzmqksme', purposes: 5, controlsEnabled: false }) },
    providerEnable: async value => {
      assert.equal(value.expiresAt, expiresAt)
      return fixed.components.providerEnable(value)
    },
    controlsEnable: { run: async () => receipt('CONTROL_ACTIVATION_VERIFIED') },
    controlsDisable: { run: async () => receipt('SHUTDOWN_VERIFIED') },
    providerDisable: async value => {
      assert.equal(value.expiresAt, expiresAt)
      return fixed.components.providerDisable(value)
    },
    databaseRetire: { run: async () => receipt('RETIREMENT_VERIFIED') },
    readRetiredState: async () => ({ status: 'PASS_FINAL_RETIRED', projectRef: 'qdmvngjwkcsilzmqksme' }),
  })
  try {
    await adapter.setup(input); await adapter.proveRestricted(input); await adapter.enableProvider(input)
    await adapter.enableControls(input); await adapter.disableControls(input); await adapter.disableProvider(input)
    await adapter.retire(input); await adapter.readFinal(input)
    assert.deepEqual(providerCalls.map(({ action, journal, hasPort, signal: observed }) =>
      ({ action, journal, hasPort, sameSignal: observed === input.signal })), [
      { action: 'ENABLE', journal: 'ENABLE', hasPort: true, sameSignal: true },
      { action: 'DISABLE', journal: 'DISABLE', hasPort: true, sameSignal: true },
    ])
  } finally {
    fixed.dispose()
  }
})
