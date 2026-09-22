import test from 'node:test'
import assert from 'node:assert/strict'
import { createProviderBrokerRotationJournal, BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, rotateStagingProviderBroker, STAGING_BROKER_PROVIDER, STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStagingProviderBrokerNativeAdapter, NATIVE_STAGING_PROVIDER_BROKER_ADAPTER_ENABLED, projectOfficialProviderSchema, projectOfficialStagingProvider, STAGING_AUTH_URL, STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'

const projectSecret = Buffer.alloc(48, 3)
const rawProvider = ({ enabled = false, ...override } = {}) => ({
  id: 'custom-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER, name: STAGING_PROVIDER_NAME,
  client_id: STAGING_BROKER_PROVIDER.clientId, acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled, email_optional: true, issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: '', discovery_document: null,
  created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z', ...override,
})

const completedExecutor = async operation => ({ status: 'COMPLETED', value: await operation(new AbortController().signal) })

function fixture({ provider = rawProvider(), hostFailure, clientFailure, disableUpdateStale = false, execute = completedExecutor } = {}) {
  const calls = []; const seenBrokerMaterials = []; const hostNames = { supabase: new Set(), vercel: new Set() }; let seenProjectSecret; let currentProvider = provider
  const host = name => ({
    stage: async (target, secretName, material, { signal }) => { calls.push(`${name}:stage`); assert.deepEqual(target, STAGING_PROVIDER_TARGET); assert.equal(secretName, BROKER_SECRET_NAME); assert.ok(Buffer.isBuffer(material)); assert.equal(signal.aborted, false); seenBrokerMaterials.push(material); hostNames[name].add(secretName); if (hostFailure === `${name}:stage`) throw Error('raw secret output'); return { status: 'STAGED', target, name: secretName } },
    remove: async (target, secretName, { signal }) => { calls.push(`${name}:remove`); assert.deepEqual(target, STAGING_PROVIDER_TARGET); assert.equal(secretName, BROKER_SECRET_NAME); assert.equal(signal.aborted, false); hostNames[name].delete(secretName); return { status: 'REMOVED', target, name: secretName } },
    readNames: async (target, { signal }) => { calls.push(`${name}:read`); assert.deepEqual(target, STAGING_PROVIDER_TARGET); assert.equal(signal.aborted, false); return [...hostNames[name]] },
  })
  const createProviderClient = input => {
    calls.push('client'); assert.equal(input.authUrl, STAGING_AUTH_URL); assert.deepEqual(input.target, STAGING_PROVIDER_TARGET); assert.ok(Buffer.isBuffer(input.projectSecret)); assert.equal(input.signal.aborted, false); seenProjectSecret = input.projectSecret
    return { auth: { admin: { customProviders: {
      getProvider: async id => { calls.push('get'); assert.equal(id, PROVIDER_IDENTIFIER); if (clientFailure === 'get') throw Error('private response'); return { data: currentProvider, error: null } },
      updateProvider: async (id, payload) => { calls.push('update'); assert.equal(id, PROVIDER_IDENTIFIER); if (clientFailure === 'update') return { data: null, error: { message: 'private provider response' } }; if (Object.keys(payload).length === 1) { assert.equal(payload.enabled, false); if (!disableUpdateStale) currentProvider = { ...currentProvider, enabled: false } } else { assert.equal(payload.client_secret.includes('private'), false); assert.deepEqual(payload.scopes, ['subject']); assert.equal(payload.enabled, false); currentProvider = { ...rawProvider(), id: currentProvider.id, created_at: currentProvider.created_at, updated_at: currentProvider.updated_at } } return { data: currentProvider, error: null } },
    } } } }
  }
  const adapter = createStagingProviderBrokerNativeAdapter({ projectSecret, createProviderClient,
    readFrozenState: async (target, { signal }) => { assert.equal(signal.aborted, false); return { target, providerIdentifier: PROVIDER_IDENTIFIER, providerEnabled: false, edgeEnabled: false, privateEnabled: false, publicEnabled: false, supabase: [], vercel: [] } },
    vercel: host('vercel'), supabase: host('supabase'), execute })
  return { adapter, calls, seenBrokerMaterials, get seenProjectSecret () { return seenProjectSecret } }
}

test('native adapter remains disabled and uses only injected official admin-client and host boundaries', async () => {
  assert.equal(NATIVE_STAGING_PROVIDER_BROKER_ADAPTER_ENABLED, false)
  const f = fixture(), result = await f.adapter.getProvider(STAGING_PROVIDER_TARGET, PROVIDER_IDENTIFIER)
  assert.equal(result.provider.identifier, PROVIDER_IDENTIFIER); assert.equal(result.provider.clientId, STAGING_BROKER_PROVIDER.clientId); assert.ok(f.seenProjectSecret.every(byte => byte === 0))
  assert.doesNotMatch(JSON.stringify(result), /client_secret|private/i)
  await f.adapter.stageVercelBrokerSecret(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, Buffer.from('b'.repeat(48)))
  await f.adapter.stageSupabaseBrokerSecret(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, Buffer.from('c'.repeat(48)))
  assert.ok(f.seenBrokerMaterials.every(material => material.every(byte => byte === 0)))
  assert.deepEqual(await f.adapter.readbackSecretNames(STAGING_PROVIDER_TARGET), { target: STAGING_PROVIDER_TARGET, supabase: [BROKER_SECRET_NAME], vercel: [BROKER_SECRET_NAME] })
})

test('strict rotation projection maps the documented snake_case desired state and rejects credentials, unknown fields, blank scopes, enabled state and JWKS', () => {
  const projected = projectOfficialStagingProvider(rawProvider())
  assert.equal(projected.clientId, STAGING_BROKER_PROVIDER.clientId); assert.equal(projected.authorizationUrl, STAGING_BROKER_PROVIDER.authorizationUrl)
  for (const override of [{ client_secret: 'must-never-accept' }, { unknown: true }, { scopes: [] }, { enabled: true }, { jwks_uri: 'https://bad.example/jwks' }, { authorization_params: { secret: 'bad' } }]) {
    assert.throws(() => projectOfficialStagingProvider(rawProvider(override)), /unavailable/)
  }
})

test('provider readback accepts only an empty custom claims allowlist', () => {
  const baseline = projectOfficialProviderSchema(rawProvider({ custom_claims_allowlist: [] }))
  assert.equal(baseline.identifier, PROVIDER_IDENTIFIER)
  assert.equal(Object.hasOwn(baseline, 'customClaimsAllowlist'), false)
  for (const custom_claims_allowlist of [null, {}, ['role'], [1]]) {
    assert.throws(() => projectOfficialProviderSchema(rawProvider({ custom_claims_allowlist })), /unavailable/)
  }
})

test('target, identifier, settings and host receipts are exact before a provider or host operation', async () => {
  const f = fixture(), drift = { ...STAGING_PROVIDER_TARGET, branch: 'main' }
  await assert.rejects(() => f.adapter.getProvider(drift, PROVIDER_IDENTIFIER), /unavailable/)
  await assert.rejects(() => f.adapter.getProvider(STAGING_PROVIDER_TARGET, 'custom:other'), /unavailable/)
  await assert.rejects(() => f.adapter.updateProvider(STAGING_PROVIDER_TARGET, { ...STAGING_BROKER_PROVIDER, enabled: true }, Buffer.alloc(48, 4)), /unavailable/)
  assert.deepEqual(f.calls, [])
  const broken = fixture({ hostFailure: 'vercel:stage' })
  await assert.rejects(() => broken.adapter.stageVercelBrokerSecret(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, Buffer.alloc(48, 4)), /unavailable/)
})

test('provider mutations use a copied Buffer, redact failures and do not retain the caller material', async () => {
  const f = fixture(), material = Buffer.from('a'.repeat(48), 'utf8')
  const result = await f.adapter.updateProvider(STAGING_PROVIDER_TARGET, STAGING_BROKER_PROVIDER, material)
  assert.deepEqual(result, { status: 'UPDATED', target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER })
  assert.equal(material.toString('utf8'), 'a'.repeat(48)); assert.ok(f.seenProjectSecret.every(byte => byte === 0))
  const failure = fixture({ clientFailure: 'update' }), printable = Buffer.from('d'.repeat(48))
  await assert.rejects(() => failure.adapter.updateProvider(STAGING_PROVIDER_TARGET, STAGING_BROKER_PROVIDER, printable), error => error.message === 'Staging provider native adapter unavailable')
  assert.equal(failure.calls.filter(call => call === 'update').length, 1)
  const factoryFailure = createStagingProviderBrokerNativeAdapter({ projectSecret, createProviderClient: () => { throw Error('private factory diagnostic') },
    readFrozenState: async target => ({ target, providerIdentifier: PROVIDER_IDENTIFIER, providerEnabled: false, edgeEnabled: false, privateEnabled: false, publicEnabled: false, supabase: [], vercel: [] }),
    vercel: { stage: async () => ({ status: 'STAGED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME }), remove: async () => ({ status: 'REMOVED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME }), readNames: async () => [] },
    supabase: { stage: async () => ({ status: 'STAGED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME }), remove: async () => ({ status: 'REMOVED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME }), readNames: async () => [] }, execute: completedExecutor })
  await assert.rejects(() => factoryFailure.getProvider(STAGING_PROVIDER_TARGET, PROVIDER_IDENTIFIER), error => error.message === 'Staging provider native adapter unavailable')
})

test('separate disablement inspects a blank-scope enabled baseline, sends exactly one small official update and returns a complete redacted actual readback', async () => {
  const f = fixture(), result = await f.adapter.disableProviderAndReadback(STAGING_PROVIDER_TARGET)
  assert.equal(result.status, 'PROVIDER_DISABLED_VERIFIED'); assert.equal(result.provider.enabled, false)
  const enabled = fixture({ provider: rawProvider({ enabled: true, scopes: [], jwks_uri: 'https://existing.example/jwks' }) })
  const corrected = await enabled.adapter.disableProviderAndReadback(STAGING_PROVIDER_TARGET)
  assert.equal(corrected.status, 'PROVIDER_DISABLED_VERIFIED'); assert.equal(corrected.provider.enabled, false)
  assert.deepEqual(corrected.provider.scopes, []); assert.equal(corrected.provider.jwksUrl, 'https://existing.example/jwks')
  assert.equal(enabled.calls.filter(call => call === 'update').length, 1)
  const broken = fixture({ clientFailure: 'get' })
  const held = await broken.adapter.disableProviderAndReadback(STAGING_PROVIDER_TARGET)
  assert.deepEqual(held, { status: 'RECONCILIATION_REQUIRED', target: STAGING_PROVIDER_TARGET.projectRef, providerIdentifier: PROVIDER_IDENTIFIER })
  const stale = fixture({ provider: rawProvider({ enabled: true }), disableUpdateStale: true })
  const raced = await stale.adapter.disableProviderAndReadback(STAGING_PROVIDER_TARGET)
  assert.deepEqual(raced, { status: 'RECONCILIATION_REQUIRED', target: STAGING_PROVIDER_TARGET.projectRef, providerIdentifier: PROVIDER_IDENTIFIER })
})

test('a bounded executor settles a cancelled host mutation before its copied broker buffer is wiped', async () => {
  const execute = async operation => {
    const controller = new AbortController(), pending = operation(controller.signal)
    controller.abort(); await pending
    return { status: 'CANCELLED', value: null }
  }
  const stalled = Buffer.from('e'.repeat(48)); let seen
  const host = {
    stage: async (_target, _name, material, { signal }) => new Promise(resolve => { seen = material; signal.addEventListener('abort', () => resolve({ status: 'STAGED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME }), { once: true }) }),
    remove: async () => ({ status: 'REMOVED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME }), readNames: async () => [],
  }
  const adapter = createStagingProviderBrokerNativeAdapter({ projectSecret, execute, createProviderClient: () => { throw Error('not reached') }, readFrozenState: async () => { throw Error('not reached') }, vercel: host, supabase: host })
  await assert.rejects(() => adapter.stageVercelBrokerSecret(STAGING_PROVIDER_TARGET, BROKER_SECRET_NAME, stalled), /unavailable/)
  assert.ok(seen.every(byte => byte === 0)); assert.equal(stalled.toString('utf8'), 'e'.repeat(48))
})

test('a bounded executor also holds a stalled official provider read after cancellation', async () => {
  const execute = async operation => {
    const controller = new AbortController(), pending = operation(controller.signal)
    controller.abort(); await pending
    return { status: 'CANCELLED', value: null }
  }
  const client = ({ signal }) => ({ auth: { admin: { customProviders: {
    getProvider: async () => new Promise(resolve => signal.addEventListener('abort', () => resolve({ data: rawProvider(), error: null }), { once: true })),
    updateProvider: async () => ({ data: rawProvider(), error: null }),
  } } } })
  const host = { stage: async () => ({ status: 'STAGED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME }), remove: async () => ({ status: 'REMOVED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME }), readNames: async () => [] }
  const adapter = createStagingProviderBrokerNativeAdapter({ projectSecret, execute, createProviderClient: client, readFrozenState: async () => ({ target: STAGING_PROVIDER_TARGET, providerIdentifier: PROVIDER_IDENTIFIER, providerEnabled: false, edgeEnabled: false, privateEnabled: false, publicEnabled: false, supabase: [], vercel: [] }), vercel: host, supabase: host })
  await assert.rejects(() => adapter.getProvider(STAGING_PROVIDER_TARGET, PROVIDER_IDENTIFIER), /unavailable/)
})

test('adapter-composed rotation holds staged hosts and consumes its journal after one uncertain provider update', async () => {
  const f = fixture({ clientFailure: 'update' })
  const journal = createProviderBrokerRotationJournal({ path: join(mkdtempSync(join(tmpdir(), 'tll-provider-adapter-')), 'journal.json'), makeRunId: () => 'adapter-review-run' })
  const result = await rotateStagingProviderBroker({ ports: f.adapter, journal, randomBytes: size => Buffer.from('f'.repeat(size)), now: () => 1_789_000_000_000 })
  assert.equal(result.status, 'RECONCILIATION_REQUIRED'); assert.equal(journal.read().state, 'RECONCILIATION_REQUIRED')
  assert.deepEqual(f.calls.filter(call => /:(stage|remove)$/.test(call)), ['vercel:stage', 'supabase:stage'])
  assert.equal(f.calls.filter(call => call === 'update').length, 1)
})

test('adapter-composed rotation repairs a disabled blank-scope provider only after exact preconditions, while unexpected JWKS stops before secret generation', async () => {
  const repaired = fixture({ provider: rawProvider({ scopes: [] }) })
  const journal = createProviderBrokerRotationJournal({ path: join(mkdtempSync(join(tmpdir(), 'tll-provider-repair-')), 'journal.json'), makeRunId: () => 'adapter-repair-run' })
  const success = await rotateStagingProviderBroker({ ports: repaired.adapter, journal, randomBytes: size => Buffer.from('g'.repeat(size)), now: () => 1_789_000_000_000 })
  assert.equal(success.status, 'ROTATION_VERIFIED'); assert.equal(repaired.calls.filter(call => call === 'update').length, 1)
  assert.deepEqual(repaired.calls.filter(call => /:(stage|remove)$/.test(call)), ['vercel:stage', 'supabase:stage'])

  const jwks = fixture({ provider: rawProvider({ jwks_uri: 'https://existing.example/jwks' }) }); let generated = 0
  const heldJournal = createProviderBrokerRotationJournal({ path: join(mkdtempSync(join(tmpdir(), 'tll-provider-jwks-')), 'journal.json'), makeRunId: () => 'adapter-jwks-run' })
  const held = await rotateStagingProviderBroker({ ports: jwks.adapter, journal: heldJournal, randomBytes: size => { generated++; return Buffer.from('h'.repeat(size)) } })
  assert.equal(held.status, 'STOPPED_BEFORE_PROVIDER_UPDATE'); assert.equal(generated, 0); assert.equal(heldJournal.read(), null)
  assert.deepEqual(jwks.calls.filter(call => /:(stage|remove)$/.test(call)), [])
})

test('module has no ambient live defaults, launchers, Keychain access or environment secret path', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../scripts/staging-provider-broker-native-adapter.mjs', import.meta.url), 'utf8'))
  assert.doesNotMatch(source, /child_process|spawn\(|exec\(|keychain|process\.env|createClient\(/i)
})
