import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BROKER_SECRET_NAME, createProviderBrokerRotationJournal, PROVIDER_IDENTIFIER, rotateStagingProviderBroker, STAGING_BROKER_PROVIDER, STAGING_PROJECT_REF, STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'

const journal = () => createProviderBrokerRotationJournal({ path: join(mkdtempSync(join(tmpdir(), 'tll-provider-rotation-')), 'journal.json'), makeRunId: () => 'reviewed-rotation-run' })
const provider = ({ jwksUrl = STAGING_BROKER_PROVIDER.jwksUrl } = {}) => ({ ...STAGING_BROKER_PROVIDER, scopes: [...STAGING_BROKER_PROVIDER.scopes], jwksUrl })

function fixture({ failAt, afterUpdateReadback } = {}) {
  const events = [], staged = { vercel: false, supabase: false }, copies = []
  const target = value => assert.deepEqual(value, STAGING_PROVIDER_TARGET)
  const receipt = (status, name = BROKER_SECRET_NAME) => ({ status, target: STAGING_PROVIDER_TARGET, name })
  const ports = {
    preflight: async value => { events.push('preflight'); target(value); if (failAt === 'preflight') throw Error('held'); return { target: STAGING_PROVIDER_TARGET,
      providerIdentifier: PROVIDER_IDENTIFIER, providerEnabled: false, edgeEnabled: false, privateEnabled: false, publicEnabled: false, supabase: [], vercel: [] } },
    getProvider: async (value, identifier) => { events.push('getProvider'); target(value); assert.equal(identifier, PROVIDER_IDENTIFIER); if (failAt === 'get') throw Error('held'); return { target: STAGING_PROVIDER_TARGET, provider: provider() } },
    stageVercelBrokerSecret: async (value, name, material) => { events.push('stageVercel'); target(value); assert.equal(name, BROKER_SECRET_NAME); copies.push(Buffer.from(material)); staged.vercel = true; if (failAt === 'vercel') throw Error('lost acknowledgement'); return receipt('STAGED') },
    stageSupabaseBrokerSecret: async (value, name, material) => { events.push('stageSupabase'); target(value); assert.equal(name, BROKER_SECRET_NAME); copies.push(Buffer.from(material)); staged.supabase = true; if (failAt === 'supabase') throw Error('lost acknowledgement'); return receipt('STAGED') },
    updateProvider: async (value, settings, material) => { events.push('updateProvider'); target(value); assert.deepEqual(settings, STAGING_BROKER_PROVIDER); copies.push(Buffer.from(material)); if (failAt === 'update') throw Error('lost response'); return { status: 'UPDATED', target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER } },
    readProvider: async (value, identifier) => { events.push('readProvider'); target(value); assert.equal(identifier, PROVIDER_IDENTIFIER); if (failAt === 'providerRead') throw Error('held'); return { target: STAGING_PROVIDER_TARGET, provider: provider() } },
    removeVercelBrokerSecret: async (value, name) => { events.push('removeVercel'); target(value); assert.equal(name, BROKER_SECRET_NAME); staged.vercel = false; return receipt('REMOVED') },
    removeSupabaseBrokerSecret: async (value, name) => { events.push('removeSupabase'); target(value); assert.equal(name, BROKER_SECRET_NAME); staged.supabase = false; return receipt('REMOVED') },
    readbackSecretNames: async value => { events.push('readbackNames'); target(value); if (failAt === 'nameRead') throw Error('held'); return afterUpdateReadback ?? { target: STAGING_PROVIDER_TARGET, vercel: staged.vercel ? [BROKER_SECRET_NAME] : [], supabase: staged.supabase ? [BROKER_SECRET_NAME] : [] } },
  }
  return { events, staged, copies, ports }
}

test('rotates one in-memory value across the exact disabled staging provider settings and returns only nonsecret evidence', async () => {
  const f = fixture(), j = journal(), generated = Buffer.alloc(48, 7)
  const result = await rotateStagingProviderBroker({ ports: f.ports, journal: j, randomBytes: size => { assert.equal(size, 48); return generated }, now: () => 1_789_000_000_000 })
  assert.equal(result.status, 'ROTATION_VERIFIED'); assert.equal(result.target, STAGING_PROJECT_REF); assert.equal(result.providerIdentifier, PROVIDER_IDENTIFIER)
  assert.deepEqual(result.provider, provider()); assert.doesNotMatch(JSON.stringify(result), /secret|BwcH/i)
  assert.deepEqual(f.events, ['preflight', 'getProvider', 'stageVercel', 'stageSupabase', 'updateProvider', 'readProvider', 'readbackNames'])
  assert.equal(f.copies.length, 3); assert.ok(f.copies.every(value => value.equals(f.copies[0]))); assert.ok(generated.every(byte => byte === 0))
  assert.equal(j.read().state, 'ROTATION_VERIFIED'); assert.throws(() => j.recordIntent(), /unavailable/)
})

test('the exclusive journal is mode 0600, nonsecret, and only transitions once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-provider-journal-')), path = join(directory, 'rotation.json')
  const j = createProviderBrokerRotationJournal({ path, makeRunId: () => 'reviewed-rotation-run' }), intent = j.recordIntent({ nowMs: 1_789_000_000_000 })
  assert.equal(statSync(path).mode & 0o777, 0o600); assert.doesNotMatch(readFileSync(path, 'utf8'), /secret|password|token/i)
  assert.equal(j.transition(intent, 'STOPPED_BEFORE_PROVIDER_UPDATE').state, 'STOPPED_BEFORE_PROVIDER_UPDATE')
  assert.throws(() => j.transition(intent, 'RECONCILIATION_REQUIRED'), /unavailable/)
})

test('a pre-provider failure removes every possibly staged host entry, verifies their absence, and consumes the journal', async () => {
  const f = fixture({ failAt: 'supabase' }), j = journal()
  const result = await rotateStagingProviderBroker({ ports: f.ports, journal: j, randomBytes: size => Buffer.alloc(size, 8) })
  assert.equal(result.status, 'STOPPED_BEFORE_PROVIDER_UPDATE'); assert.deepEqual(f.events, ['preflight', 'getProvider', 'stageVercel', 'stageSupabase', 'removeVercel', 'removeSupabase', 'readbackNames'])
  assert.equal(j.read().state, 'STOPPED_BEFORE_PROVIDER_UPDATE'); assert.equal(f.staged.vercel, false); assert.equal(f.staged.supabase, false)
})

test('a provider-update or post-update readback uncertainty retains values and requires reconciliation', async () => {
  for (const failure of ['update', 'providerRead', 'nameRead']) {
    const f = fixture({ failAt: failure }), j = journal()
    const result = await rotateStagingProviderBroker({ ports: f.ports, journal: j, randomBytes: size => Buffer.alloc(size, 9) })
    assert.equal(result.status, 'RECONCILIATION_REQUIRED'); assert.equal(j.read().state, 'RECONCILIATION_REQUIRED')
    assert.ok(f.staged.vercel && f.staged.supabase); assert.ok(!f.events.includes('removeVercel')); assert.ok(!f.events.includes('removeSupabase'))
  }
})

test('missing or unexpected JWKS is held before generating, journaling, or staging a value', async () => {
  for (const jwksUrl of ['', 'https://unexpected.example/jwks.json', `${STAGING_BROKER_PROVIDER.jwksUrl}/`]) {
    const f = fixture(); f.ports.getProvider = async () => ({ target: STAGING_PROVIDER_TARGET, provider: provider({ jwksUrl }) })
    const j = journal(); const result = await rotateStagingProviderBroker({ ports: f.ports, journal: j, randomBytes: () => { throw Error('must not generate') } })
    assert.equal(result.status, 'STOPPED_BEFORE_PROVIDER_UPDATE'); assert.deepEqual(f.events, ['preflight']); assert.equal(j.read(), null)
  }
})

test('readback requires one exact name per staging surface and the exact disabled provider projection', async () => {
  const f = fixture({ afterUpdateReadback: { target: STAGING_PROVIDER_TARGET, vercel: [BROKER_SECRET_NAME, 'OTHER'], supabase: [BROKER_SECRET_NAME] } }), j = journal()
  const result = await rotateStagingProviderBroker({ ports: f.ports, journal: j, randomBytes: size => Buffer.alloc(size, 4) })
  assert.equal(result.status, 'RECONCILIATION_REQUIRED'); assert.equal(j.read().state, 'RECONCILIATION_REQUIRED')
  assert.ok(!f.events.includes('removeVercel'))
})

test('changed JWKS after update requires reconciliation and retains staged host values', async () => {
  const f = fixture(), j = journal()
  f.ports.readProvider = async () => ({ target: STAGING_PROVIDER_TARGET, provider: provider({ jwksUrl: 'https://unexpected.example/jwks.json' }) })
  const result = await rotateStagingProviderBroker({ ports: f.ports, journal: j, randomBytes: size => Buffer.alloc(size, 4) })
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(j.read().state, 'RECONCILIATION_REQUIRED')
  assert.ok(f.staged.vercel && f.staged.supabase)
  assert.ok(!f.events.includes('removeVercel') && !f.events.includes('removeSupabase'))
})

test('preflight rejects existing entries, active surfaces and target drift before generating or journaling', async () => {
  for (const override of [
    { vercel: [BROKER_SECRET_NAME] }, { supabase: [BROKER_SECRET_NAME] }, { edgeEnabled: true },
    { target: { ...STAGING_PROVIDER_TARGET, projectRef: 'wrhgscovsgsudtedbljr' } },
    { target: { ...STAGING_PROVIDER_TARGET, branch: 'main' } },
  ]) {
    const f = fixture(), j = journal(); f.ports.preflight = async () => ({ target: STAGING_PROVIDER_TARGET,
      providerIdentifier: PROVIDER_IDENTIFIER, providerEnabled: false, edgeEnabled: false, privateEnabled: false, publicEnabled: false,
      supabase: [], vercel: [], ...override })
    const result = await rotateStagingProviderBroker({ ports: f.ports, journal: j, randomBytes: () => { throw Error('must not generate') } })
    assert.equal(result.status, 'STOPPED_BEFORE_PROVIDER_UPDATE'); assert.equal(j.read(), null); assert.deepEqual(f.events, [])
  }
})

test('journal replay preserves unresolved reconciliation and distinctly rejects consumed operations', async () => {
  for (const state of ['INTENT_RECORDED', 'RECONCILIATION_REQUIRED', 'ROTATION_VERIFIED', 'STOPPED_BEFORE_PROVIDER_UPDATE']) {
    const j = journal(), intent = j.recordIntent({ nowMs: 1_789_000_000_000 })
    if (state !== 'INTENT_RECORDED') j.transition(intent, state)
    const f = fixture(), result = await rotateStagingProviderBroker({ ports: f.ports, journal: j, randomBytes: () => { throw Error('must not generate') } })
    assert.equal(result.status, ['INTENT_RECORDED', 'RECONCILIATION_REQUIRED'].includes(state) ? 'RECONCILIATION_REQUIRED' : 'REPLAY_REJECTED')
    assert.deepEqual(f.events, [])
  }
})

test('a concurrent journal winner is never downgraded to a safe pre-update stop', async () => {
  const f = fixture(); let reads = 0
  const competingJournal = {
    read: () => reads++ === 0 ? null : { state: 'INTENT_RECORDED' },
    recordIntent: () => { throw Error('exclusive journal already created') },
    transition: () => { throw Error('not owned') },
  }
  const result = await rotateStagingProviderBroker({ ports: f.ports, journal: competingJournal, randomBytes: size => Buffer.alloc(size, 2) })
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.deepEqual(f.events, ['preflight', 'getProvider'])
})

test('provider evidence contradicting the frozen preflight stops before generation or writes', async () => {
  const f = fixture(); let generations = 0
  f.ports.getProvider = async () => ({ target: STAGING_PROVIDER_TARGET, provider: { ...provider(), enabled: true } })
  const j = journal(), result = await rotateStagingProviderBroker({ ports: f.ports, journal: j, randomBytes: size => { generations++; return Buffer.alloc(size) } })
  assert.equal(result.status, 'STOPPED_BEFORE_PROVIDER_UPDATE'); assert.equal(generations, 0); assert.equal(j.read(), null); assert.deepEqual(f.events, ['preflight'])
})
