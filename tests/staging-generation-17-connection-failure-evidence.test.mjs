import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  CONNECTION_FAILURE_EVIDENCE_SCHEMA,
  CONNECTION_FAILURE_HOST,
  CONNECTION_FAILURE_PORT,
  extractLauncherTerminalFromStdout,
  persistConnectionFailureEvidence,
  projectSecretFreeConnectionFailure,
  secretFreeLauncherTerminal,
} from '../scripts/staging-generation-17-connection-failure-evidence.mjs'

const failure = Object.freeze({
  status: 'FAIL',
  reason: 'connection_verification_failed',
  purpose: 'bridge',
  check: 'own_probe',
  expectedMode: 'error',
  sqlstate: '22023',
  purposesPassed: 4,
})

test('projectSecretFreeConnectionFailure keeps core fields plus allow-listed extras', () => {
  const projected = projectSecretFreeConnectionFailure(failure)
  assert.equal(projected.status, 'FAIL')
  assert.equal(projected.purpose, 'bridge')
  assert.equal(projected.check, 'own_probe')
  assert.equal(projected.expectedMode, 'error')
  assert.equal(projected.sqlstate, '22023')
  assert.equal(projected.purposesPassed, 4)
  assert.equal(projected.host, CONNECTION_FAILURE_HOST)
  assert.equal(projected.port, CONNECTION_FAILURE_PORT)
  assert.equal(projectSecretFreeConnectionFailure({ ...failure, password: 'SECRET' }), undefined)
  assert.equal(projectSecretFreeConnectionFailure({ ...failure, purpose: 'SECRET' }), undefined)
  assert.equal(projectSecretFreeConnectionFailure({ ...failure, check: 'sql_dump' }), undefined)
  assert.equal(projectSecretFreeConnectionFailure({ ...failure, sqlstate: 'DROP TABLE' }), undefined)
})

test('secretFreeLauncherTerminal includes enriched connectionFailure without secrets', () => {
  const terminal = secretFreeLauncherTerminal({
    status: 'RECOVERY_VERIFIED',
    target: 'qdmvngjwkcsilzmqksme',
    generation: 17,
    windowId: '5728d807-701a-486b-a8c5-34bf89238275',
    phase: 'CONNECTION_VERIFICATION',
    nextAction: 'NO_RETRY_RECONCILE',
    connectionFailure: failure,
    passwords: { customer: 'SECRET_PASSWORD' },
  })
  assert.deepEqual(terminal.connectionFailure, projectSecretFreeConnectionFailure(failure))
  assert.equal(terminal.status, 'RECOVERY_VERIFIED')
  assert.equal(terminal.generation, 17)
  assert.equal(terminal.connectionFailurePresent, true)
  assert.equal('passwords' in terminal, false)
  assert.doesNotMatch(JSON.stringify(terminal), /SECRET_PASSWORD|BEGIN;|scram-sha|password\s*:/i)
})

test('persistConnectionFailureEvidence writes mode-0600 secret-free record with extras', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-conn-fail-'))
  const path = join(directory, 'evidence.json')
  const written = persistConnectionFailureEvidence({
    status: 'RECOVERY_VERIFIED',
    target: 'qdmvngjwkcsilzmqksme',
    generation: 17,
    windowId: '5728d807-701a-486b-a8c5-34bf89238275',
    phase: 'CONNECTION_VERIFICATION',
    connectionFailure: failure,
  }, { path, now: () => Date.parse('2026-09-21T05:00:00.000Z') })
  assert.equal(written, path)
  assert.equal(statSync(path).mode & 0o777, 0o600)
  const record = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(record.schema, CONNECTION_FAILURE_EVIDENCE_SCHEMA)
  assert.equal(record.connectionFailure.sqlstate, '22023')
  assert.equal(record.connectionFailure.expectedMode, 'error')
  assert.equal(record.connectionFailure.host, CONNECTION_FAILURE_HOST)
  assert.equal(record.connectionFailure.port, CONNECTION_FAILURE_PORT)
  assert.doesNotMatch(JSON.stringify(record), /SECRET_PASSWORD|token|BEGIN;/i)
  // Recovery terminals must persist even without connectionFailure (Gen 15 live gap).
  const recoveryOnly = persistConnectionFailureEvidence({
    status: 'RECOVERY_REQUIRED',
    target: 'qdmvngjwkcsilzmqksme',
    generation: 17,
    windowId: '5728d807-701a-486b-a8c5-34bf89238275',
    phase: 'SUPABASE_CLEANUP',
    failedPhase: 'CONNECTION_VERIFICATION',
    recoveryOutcome: 'RECOVERY_REQUIRED',
    connectionFailurePresent: false,
    failureStep: 'zero_sessions',
    failureReason: 'runtime_sessions_remain',
    managementStatusCode: 400,
    zeroSessionsAttempts: 5,
  }, { path, now: () => Date.parse('2026-09-21T06:56:00.000Z') })
  assert.equal(recoveryOnly, path)
  const recoveryRecord = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(recoveryRecord.connectionFailurePresent, false)
  assert.equal(recoveryRecord.failedPhase, 'CONNECTION_VERIFICATION')
  assert.equal(recoveryRecord.recoveryOutcome, 'RECOVERY_REQUIRED')
  assert.equal(recoveryRecord.failureStep, 'zero_sessions')
  assert.equal(recoveryRecord.failureReason, 'runtime_sessions_remain')
  assert.equal(recoveryRecord.managementStatusCode, 400)
  assert.equal(recoveryRecord.zeroSessionsAttempts, 5)
  assert.equal('connectionFailure' in recoveryRecord, false)
  assert.equal(persistConnectionFailureEvidence({ status: 'CREDENTIALS_VERIFIED_CONTROLS_DISABLED' }, { path }), null)
  rmSync(directory, { recursive: true, force: true })
})

test('extractLauncherTerminalFromStdout recovers enriched connectionFailure from launcher line', () => {
  const stdout = [
    '{"event":"run-live-once-start","generation":17}',
    JSON.stringify(secretFreeLauncherTerminal({
      status: 'RECOVERY_VERIFIED',
      target: 'qdmvngjwkcsilzmqksme',
      generation: 17,
      windowId: '5728d807-701a-486b-a8c5-34bf89238275',
      phase: 'CONNECTION_VERIFICATION',
      nextAction: 'NO_RETRY_RECONCILE',
      connectionFailure: failure,
    })),
    '',
  ].join('\n')
  const terminal = extractLauncherTerminalFromStdout(stdout)
  assert.equal(terminal.status, 'RECOVERY_VERIFIED')
  assert.equal(terminal.connectionFailure.sqlstate, '22023')
  assert.equal(extractLauncherTerminalFromStdout('not-json\n'), null)
})

test('generation 17 live launcher and run-live-once wire secret-free evidence persistence', () => {
  const launcher = readFileSync('scripts/staging-generation-17-live-launcher.mjs', 'utf8')
  const runOnce = readFileSync('scripts/staging-generation-17-run-live-once.mjs', 'utf8')
  assert.match(launcher, /secretFreeLauncherTerminal/)
  assert.match(launcher, /persistConnectionFailureEvidence/)
  assert.match(launcher, /failureStep = 'zero_sessions'/)
  assert.match(launcher, /verifyGeneration17ZeroSessionsAfterPoolerDrain/)
  assert.match(launcher, /failureReason/)
  assert.match(runOnce, /extractLauncherTerminalFromStdout/)
  assert.match(runOnce, /connectionFailure/)
  assert.match(runOnce, /launcherFailedPhase|failedPhase/)
  assert.match(runOnce, /connectionFailurePresent/)
})
