import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createBrokerPhaseJournal } from '../scripts/staging-provider-broker-phase-journal.mjs'
import { BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, RETAINED_STAGING_JWKS_URI, STAGING_BROKER_PROVIDER,
  STAGING_PROVIDER_TARGET, createProviderBrokerRotationJournal } from '../scripts/staging-provider-broker-rotation.mjs'
import { runPhasedBrokerRotation } from '../scripts/staging-provider-broker-phased-session.mjs'
import { createStagingProviderBrokerNativeBinding } from '../scripts/staging-provider-broker-native-binding.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import { createStagingProviderBrokerRotationReadiness } from '../scripts/staging-provider-broker-rotation-readiness.mjs'
import { createStagingBoundedExecutor } from '../scripts/staging-bounded-executor.mjs'

const rawProvider = scopes => ({
  id: 'synthetic-provider', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER, name: STAGING_PROVIDER_NAME,
  client_id: STAGING_BROKER_PROVIDER.clientId, acceptable_client_ids: [], scopes, pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: RETAINED_STAGING_JWKS_URI,
  discovery_document: null, created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z',
})

test('real disabled components fit together in one synthetic rotation and reject replay', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-rotation-composition-'))
  const runId = randomUUID(), now = Date.now
  const phaseJournal = createBrokerPhaseJournal({ path: join(directory, 'phase.json'), makeRunId: () => runId, now })
  const rotationJournal = createProviderBrokerRotationJournal({ path: join(directory, 'rotation.json'), makeRunId: () => runId })
  const calls = [], staged = { vercel: false, supabase: false }
  let provider = rawProvider([]), disposed = false
  const baseline = () => ({ target: STAGING_PROVIDER_TARGET, observedAt: new Date(now()).toISOString(),
    controls: { customer: false, cart: false, broker: false, provisional: false, bridge: false },
    runtimeSessions: 0, edgeEnabled: false, privateEnabled: false, publicEnabled: false,
    supabaseBrokerSecretNames: [], vercelBrokerSecretNames: [] })
  const readFrozenState = createStagingProviderBrokerRotationReadiness({
    openPreflight: signal => ({
      preflight: async () => { assert.equal(signal.aborted, false); calls.push('baseline'); return baseline() },
      readProvider: async () => { assert.equal(signal.aborted, false); calls.push('baseline-provider'); return provider },
    }),
  })
  const runVercel = async (args, _input, _fd, { signal }) => {
    assert.equal(signal.aborted, false)
    const command = args.join(' '); calls.push(command)
    if (command.includes(' env add ')) staged.vercel = true
    if (command.includes(' env rm ')) staged.vercel = false
    if (command.includes(' env ls ')) return JSON.stringify({ envs: staged.vercel
      ? [{ key: BROKER_SECRET_NAME, gitBranch: STAGING_PROVIDER_TARGET.branch, target: ['preview'] }] : [] })
    return ''
  }
  const runSupabase = async (args, _input, _fd, { signal }) => {
    assert.equal(signal.aborted, false)
    const command = args.join(' '); calls.push(command)
    if (command.startsWith('secrets set ')) staged.supabase = true
    if (command.startsWith('secrets unset ')) staged.supabase = false
    if (command.startsWith('secrets list ')) return JSON.stringify(staged.supabase ? [{ name: BROKER_SECRET_NAME }] : [])
    return ''
  }
  const fetcher = async (_url, options) => {
    calls.push(`provider-${options.method ?? 'GET'}`)
    if (options.method === 'PUT') provider = rawProvider(['subject'])
    return new Response(JSON.stringify(provider), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const acquirePorts = async () => {
    assert.equal(phaseJournal.read().phase, 'LAUNCH_STARTED')
    const projectSecret = Buffer.from('s'.repeat(48))
    const native = createStagingProviderBrokerNativeBinding({ projectSecret, readFrozenState,
      execute: createStagingBoundedExecutor(), fetcher, runVercel, runSupabase })
    return Object.freeze({ ...native, dispose: () => { projectSecret.fill(0); disposed = true } })
  }
  const run = () => runPhasedBrokerRotation({ acquirePorts, phaseJournal, rotationJournal,
    randomBytes: size => Buffer.alloc(size, 7), now })
  const result = await run()
  assert.equal(result.status, 'ROTATION_VERIFIED')
  assert.equal(result.phaseOutcome, 'VERIFIED')
  assert.equal(phaseJournal.read().outcome, 'VERIFIED')
  assert.equal(rotationJournal.read().state, 'ROTATION_VERIFIED')
  assert.deepEqual(staged, { vercel: true, supabase: true })
  assert.equal(disposed, true)
  assert.ok(calls.indexOf('baseline') < calls.indexOf('provider-GET'))
  assert.equal((await run()).status, 'REPLAY_REJECTED')
})
