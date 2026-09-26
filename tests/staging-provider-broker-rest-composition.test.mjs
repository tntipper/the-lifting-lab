import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBrokerPhaseJournal } from '../scripts/staging-provider-broker-phase-journal.mjs'
import { createProviderBrokerRotationJournal, BROKER_SECRET_NAME, PROVIDER_IDENTIFIER,
  RETAINED_STAGING_JWKS_URI, STAGING_BROKER_PROVIDER, STAGING_PROVIDER_TARGET } from '../scripts/staging-provider-broker-rotation.mjs'
import { createStagingProviderBrokerNativeAdapter, STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import { createStagingProviderBrokerVercelRestHost } from '../scripts/staging-provider-broker-vercel-rest-host.mjs'
import { createStagingProviderBrokerSupabaseRestHost } from '../scripts/staging-provider-broker-supabase-rest-host.mjs'
import { createStagingProviderBrokerRotationReadiness } from '../scripts/staging-provider-broker-rotation-readiness.mjs'
import { runPhasedBrokerRotation } from '../scripts/staging-provider-broker-phased-session.mjs'

const provider = {
  id: 'synthetic-provider', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER, name: STAGING_PROVIDER_NAME,
  client_id: STAGING_BROKER_PROVIDER.clientId, acceptable_client_ids: [], scopes: [], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: RETAINED_STAGING_JWKS_URI,
  discovery_document: null, created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z',
}

test('lost Supabase write leaves durable dispatch and cannot start Vercel cleanup', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-rest-composition-'))
  const runId = randomUUID(), now = Date.now
  const phaseJournal = createBrokerPhaseJournal({ path: join(directory, 'phase.json'), makeRunId: () => runId, now })
  const rotationJournal = createProviderBrokerRotationJournal({ path: join(directory, 'rotation.json'), makeRunId: () => runId })
  const calls = []
  let stops = 0
  let syntheticSupabaseAccepted = false
  let dispose
  t.after(() => { dispose?.(); rmSync(directory, { recursive: true, force: true }) })
  const secret = Buffer.from('s'.repeat(48))
  const baseline = () => ({ target: STAGING_PROVIDER_TARGET, observedAt: new Date(now()).toISOString(),
    controls: { customer: false, cart: false, broker: false, provisional: false, bridge: false },
    runtimeSessions: 0, edgeEnabled: false, privateEnabled: false, publicEnabled: false,
    supabaseBrokerSecretNames: [], vercelBrokerSecretNames: [] })
  const readFrozenState = createStagingProviderBrokerRotationReadiness({ openPreflight: () => ({
    preflight: async () => baseline(), readProvider: async () => provider,
  }) })
  const vercelFetch = async (url, options) => {
    calls.push(`vercel-${options.method}`)
    if (options.method === 'GET') return new Response(JSON.stringify({ envs: [] }), { status: 200 })
    if (options.method === 'POST') return new Response(JSON.stringify({ created: {
      id: 'icfg_fixture1234', key: BROKER_SECRET_NAME, gitBranch: STAGING_PROVIDER_TARGET.branch,
      target: ['preview'], type: 'sensitive', visibility: 'secret',
    }, failed: [] }), { status: 201 })
    throw Error(`unexpected Vercel request ${url}`)
  }
  const supabaseFetch = async (url, options) => {
    calls.push(`supabase-${options.method}`)
    if (options.method === 'GET') return new Response(JSON.stringify([{ name: 'OTHER_STAGING_SECRET' }]), { status: 200 })
    if (options.method === 'POST') { syntheticSupabaseAccepted = true; throw Error('reply lost after remote acceptance') }
    throw Error(`unexpected Supabase request ${url}`)
  }
  const acquirePorts = async () => {
    const vercel = createStagingProviderBrokerVercelRestHost({ fetch: vercelFetch,
      vercelToken: Buffer.from('fixture-vercel-token'), stopWorkerGroup() { stops++ } })
    const supabase = createStagingProviderBrokerSupabaseRestHost({ fetch: supabaseFetch,
      managementToken: Buffer.from('fixture-supabase-token'), stopWorkerGroup() { stops++ } })
    const adapter = createStagingProviderBrokerNativeAdapter({ projectSecret: secret, readFrozenState, vercel, supabase,
      execute: async operation => ({ status: 'COMPLETED', value: await operation(new AbortController().signal) }),
      createProviderClient: () => ({ auth: { admin: { customProviders: {
        getProvider: async () => ({ data: provider, error: null }), updateProvider: async () => { throw Error('must not update') },
      } } } }) })
    dispose = () => { vercel.dispose(); supabase.dispose(); secret.fill(0) }
    return Object.freeze({ ...adapter, dispose })
  }
  const pending = runPhasedBrokerRotation({ acquirePorts, phaseJournal, rotationJournal,
    randomBytes: size => Buffer.alloc(size, 7), now })
  for (let attempt = 0; attempt < 20 && stops === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(stops, 1)
  const phase = phaseJournal.read()
  assert.equal(phase.phase, 'SUPABASE_STAGE_DISPATCH')
  assert.ok(phase.history.some(event => event.phase === 'VERCEL_STAGE_ACK'))
  assert.equal(phase.history.some(event => event.phase.includes('REMOVE')), false)
  assert.equal(rotationJournal.read().state, 'INTENT_RECORDED')
  assert.ok(calls.includes('vercel-POST'))
  assert.ok(calls.includes('supabase-POST'))
  assert.equal(syntheticSupabaseAccepted, true)
  assert.equal(calls.some(call => call.endsWith('DELETE') || call.includes('PUT')), false)
  assert.equal(await Promise.race([pending.then(() => 'SETTLED', () => 'SETTLED'),
    new Promise(resolve => setTimeout(() => resolve('PENDING'), 5))]), 'PENDING')
})
