import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STAGING_BROKER_PROVIDER, PROVIDER_IDENTIFIER, STAGING_PROVIDER_TARGET,
  STAGING_PROJECT_REF } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import { runStagingGeneration23ProviderControl } from '../scripts/staging-generation-23-provider-control.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const start = '2026-09-26T12:00:00.000Z'
const before = () => ({
  id: 'synthetic-staging-provider', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER,
  name: STAGING_PROVIDER_NAME, client_id: STAGING_BROKER_PROVIDER.clientId,
  acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl,
  token_url: STAGING_BROKER_PROVIDER.tokenUrl, userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl,
  jwks_uri: STAGING_BROKER_PROVIDER.jwksUrl, discovery_document: null,
  created_at: start, updated_at: start,
})

async function armed() {
  let source = await readFile(new URL('staging-generation-23-provider-control.mjs', scripts), 'utf8')
  assert.equal(source.split('export const STAGING_GENERATION_23_PROVIDER_CONTROL_ENABLED = false').length, 2)
  source = source.replace('export const STAGING_GENERATION_23_PROVIDER_CONTROL_ENABLED = false',
    'export const STAGING_GENERATION_23_PROVIDER_CONTROL_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
    .replaceAll('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scripts))},`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

function fixture(api, { loseReply = false, drift = false, backendEnabled = false,
  runtimeSessions = 0 } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-gen23-provider-'))
  let current = before(), writes = 0, sessions = runtimeSessions
  const port = {
    async readBackendState(target) {
      assert.deepEqual(target, STAGING_PROVIDER_TARGET)
      return { projectRef: STAGING_PROJECT_REF, controlsEnabled: backendEnabled,
        runtimeSessions: sessions }
    },
    async readProvider(target) { assert.deepEqual(target, STAGING_PROVIDER_TARGET); return { ...current } },
    async updateProvider(target, identifier, patch) {
      assert.deepEqual(target, STAGING_PROVIDER_TARGET)
      assert.equal(identifier, PROVIDER_IDENTIFIER)
      assert.deepEqual(patch, { enabled: !current.enabled })
      writes++
      current = { ...current, enabled: patch.enabled, updated_at: '2026-09-26T12:00:01.000Z',
        ...(drift ? { scopes: ['openid'] } : {}) }
      if (loseReply) throw Error('synthetic lost reply')
      return { status: 'UPDATED_NEEDS_READBACK', projectRef: STAGING_PROJECT_REF, identifier }
    },
  }
  const journal = action => api.createStagingGeneration23ProviderJournal({ action,
    path: join(directory, `${action.toLowerCase()}.json`),
    makeRunId: () => action === 'ENABLE' ? 'e45d1f62-76cf-4b8d-a27e-0c39af85fe7e'
      : '39e55b60-4858-4b2e-a861-c978d8fe07af', now: () => Date.parse(start) })
  return { port, journal, get writes() { return writes },
    setRuntimeSessions(value) { sessions = value }, directory }
}

test('ordinary source has no provider update authority', async () => {
  await assert.rejects(runStagingGeneration23ProviderControl({}), /unavailable/)
})

test('one enable and one separate disable preserve every other provider field', async () => {
  const api = await armed(), f = fixture(api), signal = new AbortController().signal
  const enable = f.journal('ENABLE')
  assert.equal((await api.runStagingGeneration23ProviderControl({ action: 'ENABLE',
    port: f.port, journal: enable, signal })).status, 'PROVIDER_ENABLED_VERIFIED')
  assert.equal(enable.read().state, 'VERIFIED')
  assert.equal((await api.runStagingGeneration23ProviderControl({ action: 'ENABLE',
    port: f.port, journal: enable, signal })).status, 'REPLAY_REJECTED')
  const disable = f.journal('DISABLE')
  assert.equal((await api.runStagingGeneration23ProviderControl({ action: 'DISABLE',
    port: f.port, journal: disable, signal })).status, 'PROVIDER_DISABLED_VERIFIED')
  assert.equal(disable.read().state, 'VERIFIED')
  assert.equal(f.writes, 2)
  for (const action of ['enable', 'disable']) {
    const path = join(f.directory, `${action}.json`)
    assert.equal(statSync(path).mode & 0o777, 0o600)
    assert.doesNotMatch(readFileSync(path, 'utf8'), /client_secret|authorization_url|jwks_uri/i)
  }
})

test('lost reply or changed provider field consumes only its one-use record', async () => {
  const api = await armed(), signal = new AbortController().signal
  for (const options of [{ loseReply: true }, { drift: true }]) {
    const f = fixture(api, options), journal = f.journal('ENABLE')
    assert.equal((await api.runStagingGeneration23ProviderControl({ action: 'ENABLE',
      port: f.port, journal, signal })).status, 'HOLD_RECONCILE')
    assert.equal(journal.read().state, 'HOLD')
    assert.equal((await api.runStagingGeneration23ProviderControl({ action: 'ENABLE',
      port: f.port, journal, signal })).status, 'REPLAY_REJECTED')
    assert.equal(f.writes, 1)
  }
})

test('wrong target state stops before record or update', async () => {
  const api = await armed(), f = fixture(api, { backendEnabled: true }), journal = f.journal('ENABLE')
  const result = await api.runStagingGeneration23ProviderControl({ action: 'ENABLE',
    port: f.port, journal, signal: new AbortController().signal })
  assert.equal(result.status, 'STOPPED_BEFORE_DISPATCH')
  assert.equal(journal.read(), null)
  assert.equal(f.writes, 0)
})

test('enable requires drained sessions but disable proceeds after backend OFF with a session still open', async () => {
  const api = await armed(), signal = new AbortController().signal
  const blocked = fixture(api, { runtimeSessions: 1 }), blockedJournal = blocked.journal('ENABLE')
  assert.equal((await api.runStagingGeneration23ProviderControl({ action: 'ENABLE',
    port: blocked.port, journal: blockedJournal, signal })).status, 'STOPPED_BEFORE_DISPATCH')
  assert.equal(blockedJournal.read(), null)

  const f = fixture(api), enabled = f.journal('ENABLE')
  assert.equal((await api.runStagingGeneration23ProviderControl({ action: 'ENABLE',
    port: f.port, journal: enabled, signal })).status, 'PROVIDER_ENABLED_VERIFIED')
  f.setRuntimeSessions(1)
  const disabled = f.journal('DISABLE')
  assert.equal((await api.runStagingGeneration23ProviderControl({ action: 'DISABLE',
    port: f.port, journal: disabled, signal })).status, 'PROVIDER_DISABLED_VERIFIED')
  assert.equal(disabled.read().state, 'VERIFIED')
  assert.equal(f.writes, 2)
})
