import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBrokerPhaseJournal } from '../scripts/staging-provider-broker-phase-journal.mjs'
import { createBrokerRecoveryReadJournal } from '../scripts/staging-provider-broker-recovery-read-journal.mjs'
import { BROKER_RECOVERY_READ_SESSION_ENABLED, createBrokerRecoveryReadSession } from '../scripts/staging-provider-broker-recovery-read-session.mjs'
import { BROKER_CLIENT_ID, PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER,
  STAGING_PROJECT_REF } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from '../scripts/staging-account-hosted-baseline-database.mjs'
import { PREVIEW_READINESS_TARGET } from '../scripts/staging-provider-preview-readiness-session.mjs'
import { BROKER_RECOVERY_EXPECTED_SOURCE } from '../scripts/staging-provider-broker-recovery-collection.mjs'

const nowMs = Date.parse('2026-09-25T12:00:00.000Z')
const id = 'd80746e1-7a8b-4b1a-9c2d-22cd94aaaf31'
const folder = () => mkdtempSync(join(tmpdir(), 'tll-recovery-session-'))
const phase = (directory, active = false) => {
  const j = createBrokerPhaseJournal({ path: join(directory, 'phase.json'), makeRunId: () => id, now: () => nowMs })
  const started = j.start()
  return active ? started : j.finish(j.record(j.record(started, 'PREFLIGHT'), 'PROVIDER_PREREAD'), 'STOPPED_BEFORE_UPDATE')
}
const provider = () => ({ id: 'custom-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER,
  name: 'TLL staging subject broker', client_id: BROKER_CLIENT_ID, acceptable_client_ids: [], scopes: [],
  pkce_enabled: true, attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: STAGING_BROKER_PROVIDER.jwksUrl,
  discovery_document: null, created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z' })
const database = () => ({ status: 'PASS', target: STAGING_PROJECT_REF,
  queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID, receiptHash: 'a'.repeat(64),
  counts: { migrations: 15, controlsEnabled: 0, runtimeRoles: 5,
    runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 } })
const bindings = calls => ({
  readPinnedPreview: () => {
    calls.push('preview')
    return { preview: { deploymentId: PREVIEW_READINESS_TARGET.deploymentId,
      immutableUrl: PREVIEW_READINESS_TARGET.immutableUrl, projectRef: STAGING_PROJECT_REF,
      branch: PREVIEW_READINESS_TARGET.branch, privateCustomer: false, privateCart: false,
      publicCustomer: false, publicCart: false },
    deployment: { deploymentId: PREVIEW_READINESS_TARGET.deploymentId,
      immutableUrl: PREVIEW_READINESS_TARGET.immutableUrl, gitSourceCommit: BROKER_RECOVERY_EXPECTED_SOURCE } }
  },
  readProvider: () => provider(), readSupabaseNames: () => [], readVercelNames: () => [],
  readDatabase: () => database(), dispose: () => { calls.push('dispose') },
})

test('journal claim precedes binding acquisition; one safe read is recorded and cannot replay', async () => {
  assert.equal(BROKER_RECOVERY_READ_SESSION_ENABLED, false)
  const dir = folder(), record = phase(dir), journal = createBrokerRecoveryReadJournal({
    path: join(dir, 'read.jsonl'), makeRunId: () => 'b80746e1-7a8b-4b1a-9c2d-22cd94aaaf31', now: () => nowMs })
  const calls = []
  const session = createBrokerRecoveryReadSession({ readPhase: () => record, readRotation: () => null,
    journal, now: () => nowMs, acquireBindings: () => {
      assert.equal(journal.read().intent.phaseRunId, record.runId)
      calls.push('acquire'); return bindings(calls)
    } })
  assert.equal((await session.run()).status, 'SAFE_HELD_CONFIGURATION_OBSERVED')
  assert.deepEqual(calls, ['acquire', 'preview', 'dispose'])
  assert.equal(journal.read().terminal.status, 'SAFE_HELD_CONFIGURATION_OBSERVED')
  assert.equal((await session.run()).status, 'REPLAY_REJECTED')
})

test('active phase never claims a journal or acquires bindings', async () => {
  const dir = folder(), record = phase(dir, true), journal = createBrokerRecoveryReadJournal({ path: join(dir, 'read.jsonl') })
  let acquired = false
  const session = createBrokerRecoveryReadSession({ readPhase: () => record, readRotation: () => null,
    journal, now: () => nowMs, acquireBindings: () => { acquired = true; throw Error('unexpected') } })
  assert.equal((await session.run()).status, 'ACTIVE_WINDOW_HOLD')
  assert.equal(acquired, false)
  assert.equal(journal.read(), null)
})

test('failed or hanging acquisition consumes the journal without a retry', async () => {
  for (const acquireBindings of [() => { throw Error('offline failure') }, () => new Promise(() => {})]) {
    const dir = folder(), record = phase(dir), journal = createBrokerRecoveryReadJournal({
      path: join(dir, 'read.jsonl'), now: () => nowMs })
    const session = createBrokerRecoveryReadSession({ readPhase: () => record, readRotation: () => null,
      journal, now: () => nowMs, deadlineMs: 10, acquireBindings })
    assert.equal((await session.run()).status, 'READ_UNAVAILABLE')
    assert.equal(journal.read().terminal.status, 'READ_UNAVAILABLE')
    assert.equal((await session.run()).status, 'REPLAY_REJECTED')
  }
})

test('a binding arriving after timeout is disposed without starting a hosted read', async () => {
  const dir = folder(), record = phase(dir), journal = createBrokerRecoveryReadJournal({
    path: join(dir, 'read.jsonl'), now: () => nowMs })
  let resolveBinding; const calls = []
  const session = createBrokerRecoveryReadSession({ readPhase: () => record, readRotation: () => null,
    journal, now: () => nowMs, deadlineMs: 10,
    acquireBindings: () => new Promise(resolve => { resolveBinding = resolve }),
  })
  assert.equal((await session.run()).status, 'READ_UNAVAILABLE')
  resolveBinding(bindings(calls))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(calls, ['dispose'])
})

test('failed binding disposal cannot report a safe configuration', async () => {
  const dir = folder(), record = phase(dir), journal = createBrokerRecoveryReadJournal({
    path: join(dir, 'read.jsonl'), now: () => nowMs })
  const session = createBrokerRecoveryReadSession({ readPhase: () => record, readRotation: () => null,
    journal, now: () => nowMs, acquireBindings: () => ({ ...bindings([]), dispose: () => { throw Error('teardown failed') } }),
  })
  assert.equal((await session.run()).status, 'READ_UNAVAILABLE')
  assert.equal(journal.read().terminal.status, 'READ_UNAVAILABLE')
})
