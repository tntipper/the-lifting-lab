import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBrokerPhaseJournal } from '../scripts/staging-provider-broker-phase-journal.mjs'
import { createBrokerRecoveryCollection, BROKER_RECOVERY_COLLECTION_ENABLED,
  BROKER_RECOVERY_EXPECTED_SOURCE } from '../scripts/staging-provider-broker-recovery-collection.mjs'
import { BROKER_CLIENT_ID, PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER,
  STAGING_PROJECT_REF } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from '../scripts/staging-account-hosted-baseline-database.mjs'
import { PREVIEW_READINESS_TARGET } from '../scripts/staging-provider-preview-readiness-session.mjs'

const nowMs = Date.parse('2026-09-25T12:00:00.000Z')
const journal = () => createBrokerPhaseJournal({ path: join(mkdtempSync(join(tmpdir(), 'tll-recovery-collection-')), 'phase.json'),
  makeRunId: () => 'd80746e1-7a8b-4b1a-9c2d-22cd94aaaf31', now: () => nowMs })
const safePhase = () => { const j = journal(); return j.finish(j.record(j.record(j.start(), 'PREFLIGHT'), 'PROVIDER_PREREAD'), 'STOPPED_BEFORE_UPDATE') }
const provider = () => ({ id: 'custom-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER,
  name: 'TLL staging subject broker', client_id: BROKER_CLIENT_ID, acceptable_client_ids: [], scopes: [],
  pkce_enabled: true, attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: STAGING_BROKER_PROVIDER.jwksUrl,
  discovery_document: null, created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z' })
const preview = () => ({ deploymentId: PREVIEW_READINESS_TARGET.deploymentId,
  immutableUrl: PREVIEW_READINESS_TARGET.immutableUrl, projectRef: STAGING_PROJECT_REF,
  branch: PREVIEW_READINESS_TARGET.branch, privateCustomer: false, privateCart: false,
  publicCustomer: false, publicCart: false })
const database = () => ({ status: 'PASS', target: STAGING_PROJECT_REF,
  queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID, receiptHash: 'a'.repeat(64),
  counts: { migrations: 15, controlsEnabled: 0, runtimeRoles: 5,
    runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 } })
const pinned = () => ({ preview: preview(), deployment: {
  deploymentId: PREVIEW_READINESS_TARGET.deploymentId, immutableUrl: PREVIEW_READINESS_TARGET.immutableUrl,
  gitSourceCommit: BROKER_RECOVERY_EXPECTED_SOURCE } })
const make = ({ phase = safePhase(), surface = pinned(), delay } = {}) => {
  const calls = []
  const collector = createBrokerRecoveryCollection({ now: () => nowMs, timeoutMs: 20,
    readPhase: () => { calls.push('phase'); return phase },
    readRotation: () => { calls.push('rotation'); return null },
    readPinnedPreview: async ({ signal, expectedDeployment }) => {
      calls.push('preview')
      assert.equal(signal.aborted, false)
      assert.equal(expectedDeployment.gitSourceCommit, BROKER_RECOVERY_EXPECTED_SOURCE)
      assert.deepEqual(Object.keys(expectedDeployment).sort(), ['deploymentId', 'gitSourceCommit', 'immutableUrl'])
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      return surface
    },
    readProvider: () => { calls.push('provider'); return provider() },
    readSupabaseNames: () => { calls.push('supabase'); return [] },
    readVercelNames: () => { calls.push('vercel'); return [] },
    readDatabase: () => { calls.push('database'); return database() },
  })
  return { collector, calls }
}

test('disabled collection checks receipts before hosted ports and reads pinned Preview first', async () => {
  assert.equal(BROKER_RECOVERY_COLLECTION_ENABLED, false)
  const safe = make()
  assert.equal((await safe.collector.observe()).status, 'SAFE_HELD_CONFIGURATION_OBSERVED')
  assert.deepEqual(safe.calls, ['phase', 'rotation', 'preview', 'provider', 'supabase', 'vercel', 'database'])
  assert.equal((await safe.collector.observe()).status, 'REPLAY_REJECTED')
  const active = make({ phase: journal().start() })
  assert.equal((await active.collector.observe()).status, 'ACTIVE_WINDOW_HOLD')
  assert.deepEqual(active.calls, ['phase', 'rotation'])
  const malformed = make({ phase: { outcome: 'STOPPED_BEFORE_UPDATE' } })
  assert.equal((await malformed.collector.observe()).status, 'PHASE_RECORD_UNAVAILABLE')
  assert.deepEqual(malformed.calls, ['phase', 'rotation'])
})

test('changed Preview source or elapsed deadline blocks all later hosted reads', async () => {
  const surface = pinned(); surface.deployment.gitSourceCommit = 'b'.repeat(40)
  const drift = make({ surface })
  assert.equal((await drift.collector.observe()).status, 'PREVIEW_IDENTITY_CHANGED')
  assert.deepEqual(drift.calls, ['phase', 'rotation', 'preview'])
  const late = make({ delay: 35 })
  assert.equal((await late.collector.observe()).status, 'READ_UNAVAILABLE')
  assert.deepEqual(late.calls, ['phase', 'rotation', 'preview'])
})

test('a non-returning protected Preview reader is bounded by the deadline', async () => {
  const calls = []
  const collector = createBrokerRecoveryCollection({ timeoutMs: 10, now: () => nowMs,
    readPhase: () => safePhase(), readRotation: () => null,
    readPinnedPreview: () => { calls.push('preview'); return new Promise(() => {}) },
    readProvider: () => { calls.push('provider'); return provider() },
    readSupabaseNames: () => [], readVercelNames: () => [], readDatabase: () => database(),
  })
  assert.equal((await collector.observe()).status, 'READ_UNAVAILABLE')
  assert.deepEqual(calls, ['preview'])
})

test('parent cancellation during receipt reads never reaches Preview', async () => {
  const parent = new AbortController(), calls = [], record = safePhase()
  const collector = createBrokerRecoveryCollection({ timeoutMs: 10, now: () => nowMs,
    readPhase: () => { calls.push('phase'); parent.abort(); return record },
    readRotation: () => { calls.push('rotation'); return null },
    readPinnedPreview: () => { calls.push('preview'); return new Promise(() => {}) },
    readProvider: () => provider(), readSupabaseNames: () => [],
    readVercelNames: () => [], readDatabase: () => database(),
  })
  assert.equal((await collector.observe({ signal: parent.signal })).status, 'READ_UNAVAILABLE')
  assert.deepEqual(calls, ['phase'])
})

test('a non-returning receipt read is also bounded before any hosted port', async () => {
  const calls = []
  const collector = createBrokerRecoveryCollection({ timeoutMs: 10, now: () => nowMs,
    readPhase: () => new Promise(() => {}), readRotation: () => null,
    readPinnedPreview: () => { calls.push('preview') },
    readProvider: () => provider(), readSupabaseNames: () => [],
    readVercelNames: () => [], readDatabase: () => database(),
  })
  assert.equal((await collector.observe()).status, 'READ_UNAVAILABLE')
  assert.deepEqual(calls, [])
})
