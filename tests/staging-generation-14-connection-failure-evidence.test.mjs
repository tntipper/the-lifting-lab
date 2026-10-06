import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  CONNECTION_FAILURE_EVIDENCE_SCHEMA,
  extractLauncherTerminalFromStdout,
  persistConnectionFailureEvidence,
  projectSecretFreeConnectionFailure,
  secretFreeLauncherTerminal,
} from '../scripts/staging-generation-14-connection-failure-evidence.mjs'

const failure = Object.freeze({
  status: 'FAIL',
  reason: 'connection_verification_failed',
  purpose: 'customer',
  check: 'connect_retry',
})

test('projectSecretFreeConnectionFailure keeps only allow-listed fields', () => {
  assert.deepEqual(projectSecretFreeConnectionFailure(failure), failure)
  assert.equal(projectSecretFreeConnectionFailure({ ...failure, password: 'PRIVATE' }), undefined)
  assert.equal(projectSecretFreeConnectionFailure({ ...failure, purpose: 'PRIVATE' }), undefined)
  assert.equal(projectSecretFreeConnectionFailure({ ...failure, check: 'sql_dump' }), undefined)
})

test('secretFreeLauncherTerminal includes connectionFailure without secrets', () => {
  const terminal = secretFreeLauncherTerminal({
    status: 'RECOVERY_VERIFIED',
    target: 'qdmvngjwkcsilzmqksme',
    generation: 14,
    windowId: 'a8955fc3-2347-4544-b04e-55a2cb6fe7aa',
    phase: 'CONNECTION_VERIFICATION',
    nextAction: 'NO_RETRY_RECONCILE',
    connectionFailure: failure,
    passwords: { customer: 'PRIVATE_PASSWORD' },
  })
  assert.deepEqual(terminal.connectionFailure, failure)
  assert.equal(terminal.status, 'RECOVERY_VERIFIED')
  assert.equal(terminal.phase, 'CONNECTION_VERIFICATION')
  assert.equal('passwords' in terminal, false)
  assert.doesNotMatch(JSON.stringify(terminal), /PRIVATE|PASSWORD|sql/i)
})

test('persistConnectionFailureEvidence writes mode-0600 secret-free record', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-conn-fail-'))
  const path = join(directory, 'evidence.json')
  const written = persistConnectionFailureEvidence({
    status: 'RECOVERY_VERIFIED',
    target: 'qdmvngjwkcsilzmqksme',
    generation: 14,
    windowId: 'a8955fc3-2347-4544-b04e-55a2cb6fe7aa',
    phase: 'CONNECTION_VERIFICATION',
    connectionFailure: failure,
  }, { path, now: () => Date.parse('2026-09-21T05:00:00.000Z') })
  assert.equal(written, path)
  assert.equal(statSync(path).mode & 0o777, 0o600)
  const record = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(record.schema, CONNECTION_FAILURE_EVIDENCE_SCHEMA)
  assert.deepEqual(record.connectionFailure, failure)
  assert.equal(record.phase, 'CONNECTION_VERIFICATION')
  assert.doesNotMatch(JSON.stringify(record), /PRIVATE|PASSWORD|token|sql/i)
  assert.equal(persistConnectionFailureEvidence({ status: 'RECOVERY_VERIFIED' }, { path }), null)
  rmSync(directory, { recursive: true, force: true })
})

test('extractLauncherTerminalFromStdout recovers connectionFailure from launcher line', () => {
  const stdout = [
    '{"event":"run-live-once-start","generation":13}',
    JSON.stringify(secretFreeLauncherTerminal({
      status: 'RECOVERY_VERIFIED',
      target: 'qdmvngjwkcsilzmqksme',
      generation: 14,
      windowId: 'a8955fc3-2347-4544-b04e-55a2cb6fe7aa',
      phase: 'CONNECTION_VERIFICATION',
      nextAction: 'NO_RETRY_RECONCILE',
      connectionFailure: failure,
    })),
    '',
  ].join('\n')
  const terminal = extractLauncherTerminalFromStdout(stdout)
  assert.equal(terminal.status, 'RECOVERY_VERIFIED')
  assert.deepEqual(terminal.connectionFailure, failure)
  assert.equal(extractLauncherTerminalFromStdout('not-json\n'), null)
})

test('generation 14 live launcher and run-live-once wire secret-free evidence persistence', () => {
  const launcher = readFileSync('scripts/staging-generation-14-live-launcher.mjs', 'utf8')
  const runOnce = readFileSync('scripts/staging-generation-14-run-live-once.mjs', 'utf8')
  assert.match(launcher, /secretFreeLauncherTerminal/)
  assert.match(launcher, /persistConnectionFailureEvidence/)
  assert.match(runOnce, /extractLauncherTerminalFromStdout/)
  assert.match(runOnce, /connectionFailure/)
  assert.match(runOnce, /launcherPhase/)
})
