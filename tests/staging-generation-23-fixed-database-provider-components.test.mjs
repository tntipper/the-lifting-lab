import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23FixedDatabaseProviderComponents } from '../scripts/staging-generation-23-fixed-database-provider-components.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const managementToken = Buffer.from(`sbp_${'a'.repeat(40)}`)
const signal = new AbortController().signal
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
        windowId: '7d0e8f17-eac4-40e1-a5b5-8a8597d502a9', receiptHash: 'a'.repeat(64) } } }),
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
    fetch() { called = true }, factories: {} }), /unavailable/)
  assert.equal(called, false)
})

test('final state uses the distinct Gen23 final journal and observer', async () => {
  const create = await armed(); const calls = []
  const component = create({
    credentials: { managementToken, vercelToken: Buffer.from('v'), previewBypass: Buffer.from('b') },
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
