import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBrokerPhaseJournal } from '../scripts/staging-provider-broker-phase-journal.mjs'
import { BROKER_CLIENT_ID, BROKER_SECRET_NAME, PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER,
  STAGING_PROJECT_REF, STAGING_PROVIDER_TARGET, createProviderBrokerRotationJournal } from '../scripts/staging-provider-broker-rotation.mjs'
import { BROKER_RECONCILIATION_ENABLED, assessBrokerRecovery } from '../scripts/staging-provider-broker-reconciliation.mjs'
import { STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from '../scripts/staging-account-hosted-baseline-database.mjs'
import { PREVIEW_READINESS_TARGET } from '../scripts/staging-provider-preview-readiness-session.mjs'

const nowMs = Date.parse('2026-09-25T12:00:00.000Z')
const path = () => join(mkdtempSync(join(tmpdir(), 'tll-broker-recovery-')), 'journal.json')
const phaseJournal = () => createBrokerPhaseJournal({ path: path(), makeRunId: () => 'd80746e1-7a8b-4b1a-9c2d-22cd94aaaf31', now: () => nowMs })
const rotationJournal = runId => createProviderBrokerRotationJournal({ path: path(), makeRunId: () => runId })
const advance = (journal, phases) => phases.reduce((record, phase) => journal.record(record, phase), journal.start())
const initial = ['PREFLIGHT', 'PROVIDER_PREREAD']
const provider = () => ({ id: 'custom-provider-id', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER,
  name: 'TLL staging subject broker', client_id: BROKER_CLIENT_ID, acceptable_client_ids: [], scopes: [],
  pkce_enabled: true, attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: STAGING_BROKER_PROVIDER.jwksUrl,
  discovery_document: null, created_at: '2026-09-22T10:00:00.000Z', updated_at: '2026-09-22T10:00:00.000Z' })
const evidence = () => ({ provider: provider(), names: { target: STAGING_PROVIDER_TARGET, supabase: [], vercel: [] },
  database: { status: 'PASS', target: STAGING_PROJECT_REF, queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID,
    receiptHash: 'a'.repeat(64), counts: { migrations: 15, controlsEnabled: 0, runtimeRoles: 5,
      runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 } },
  preview: { deploymentId: PREVIEW_READINESS_TARGET.deploymentId,
    immutableUrl: PREVIEW_READINESS_TARGET.immutableUrl, projectRef: STAGING_PROJECT_REF,
    branch: PREVIEW_READINESS_TARGET.branch, privateCustomer: false, privateCart: false,
    publicCustomer: false, publicCart: false } })
const assess = (phase, rotation, observed = evidence()) => assessBrokerRecovery({ phase, rotation, evidence: observed, nowMs })

test('disabled assessor recognises a verified safe holding configuration without any live access', () => {
  assert.equal(BROKER_RECONCILIATION_ENABLED, false)
  const journal = phaseJournal(), phase = journal.finish(advance(journal, initial), 'STOPPED_BEFORE_UPDATE')
  assert.deepEqual(assess(phase, null), { status: 'SAFE_HELD_CONFIGURATION_OBSERVED',
    projectRef: STAGING_PROJECT_REF, providerIdentifier: PROVIDER_IDENTIFIER })
})

test('a pre-provider staged-secret cleanup is safe only with both host removals and strict readback', () => {
  const journal = phaseJournal(), staged = advance(journal, [...initial, 'INTENT_RECORDED',
    'VERCEL_STAGE_DISPATCH', 'VERCEL_STAGE_ACK', 'SUPABASE_STAGE_DISPATCH', 'SUPABASE_STAGE_ACK'])
  const cleaned = journal.finish(['VERCEL_REMOVE_DISPATCH', 'VERCEL_REMOVE_ACK', 'SUPABASE_REMOVE_DISPATCH',
    'SUPABASE_REMOVE_ACK', 'REMOVAL_READBACK'].reduce((record, phase) => journal.record(record, phase), staged), 'STOPPED_BEFORE_UPDATE')
  const rotation = rotationJournal(cleaned.runId), intent = rotation.recordIntent({ nowMs })
  rotation.transition(intent, 'STOPPED_BEFORE_PROVIDER_UPDATE')
  assert.equal(assess(cleaned, rotation.read()).status, 'SAFE_HELD_CONFIGURATION_OBSERVED')
  const lingering = evidence(); lingering.names.supabase = [BROKER_SECRET_NAME]
  assert.equal(assess(cleaned, rotation.read(), lingering).status, 'RECONCILIATION_REQUIRED')
  for (const unrelated of [
    { ...rotation.read(), runId: 'f80746e1-7a8b-4b1a-9c2d-22cd94aaaf31' },
    { ...rotation.read(), createdAt: '2020-01-01T00:00:00.000Z' },
    { ...rotation.read(), createdAt: '2030-01-01T00:00:00.000Z' },
  ]) assert.equal(assess(cleaned, unrelated).status, 'RECONCILIATION_REQUIRED')
})

test('a provider update never proves the write-only secret by readback alone', () => {
  const journal = phaseJournal(), phases = [...initial, 'INTENT_RECORDED', 'VERCEL_STAGE_DISPATCH',
    'VERCEL_STAGE_ACK', 'SUPABASE_STAGE_DISPATCH', 'SUPABASE_STAGE_ACK', 'PROVIDER_UPDATE_DISPATCH',
    'PROVIDER_UPDATE_ACK', 'PROVIDER_POSTREAD', 'HOST_NAMES_READBACK']
  const phase = journal.finish(advance(journal, phases), 'VERIFIED')
  const rotation = rotationJournal(phase.runId), intent = rotation.recordIntent({ nowMs })
  rotation.transition(intent, 'ROTATION_VERIFIED')
  const observed = evidence(); observed.provider.scopes = ['subject']
  observed.names.supabase = [BROKER_SECRET_NAME]; observed.names.vercel = [BROKER_SECRET_NAME]
  assert.equal(assess(phase, rotation.read(), observed).status, 'CONFIGURATION_CONSISTENT_SECRET_UNPROVEN')
  assert.equal(assess(phase, null, observed).status, 'RECONCILIATION_REQUIRED')
  observed.provider.name = BROKER_CLIENT_ID
  assert.equal(assess(phase, rotation.read(), observed).status, 'RECONCILIATION_REQUIRED')
  observed.provider.name = 'TLL staging subject broker'
  observed.provider.jwks_uri = 'https://other.example/jwks.json'
  assert.equal(assess(phase, rotation.read(), observed).status, 'RECONCILIATION_REQUIRED')
})

test('active, stale and uncertain windows refuse evidence-based conclusions', () => {
  const journal = phaseJournal(), active = journal.start()
  const doNotRead = { get provider() { throw Error('evidence must not be inspected') } }
  assert.equal(assess(active, null, doNotRead).status, 'ACTIVE_WINDOW_HOLD')
  assert.equal(assessBrokerRecovery({ phase: active, rotation: null, evidence: doNotRead,
    nowMs: nowMs + 60_001 }).status, 'STALE_WINDOW_STOP_REQUIRED')
  assert.equal(journal.finish(active, 'RECONCILIATION_REQUIRED').outcome, 'RECONCILIATION_REQUIRED')
  assert.equal(assess(journal.read(), null, doNotRead).status, 'RECONCILIATION_REQUIRED')
  assert.equal(assess(null, null).status, 'PHASE_RECORD_UNAVAILABLE')
})

test('safe-held assessment rejects changed provider, database and Preview controls', () => {
  const journal = phaseJournal(), phase = journal.finish(advance(journal, initial), 'STOPPED_BEFORE_UPDATE')
  for (const change of [
    value => { value.provider.enabled = true },
    value => { value.provider.scopes = ['other'] },
    value => { value.provider.token_url = 'https://other.example/token' },
    value => { value.provider.discovery_document = {} },
    value => { value.database.counts.controlsEnabled = 1 },
    value => { value.preview.publicCart = true },
    value => { value.preview.deploymentId = 'dpl_other' },
    value => { value.names.vercel = [BROKER_SECRET_NAME] },
    value => { value.names.target = { ...STAGING_PROVIDER_TARGET, branch: 'main' } },
  ]) {
    const observed = evidence(); change(observed)
    assert.equal(assess(phase, null, observed).status, 'RECONCILIATION_REQUIRED')
  }
})
