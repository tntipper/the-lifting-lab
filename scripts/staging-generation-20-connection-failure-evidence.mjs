/**
 * Secret-free Generation 20 connection-failure / recovery evidence helpers.
 *
 * No passwords, SQL, tokens, or provider payloads. Used by the live launcher
 * stdout/path persistence and by run-live-once session summaries so ANY path
 * to RECOVERY_REQUIRED / RECOVERY_VERIFIED retains failedPhase, whether
 * connectionFailure was present, and recoveryOutcome — even when probes passed
 * and a later step (for example zero_sessions) failed without a probe report.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CONNECTION_FAILURE_EVIDENCE_SCHEMA = 'tll-generation-20-connection-failure/v1'
export const DEFAULT_CONNECTION_FAILURE_EVIDENCE_PATH = fileURLToPath(
  new URL('../../implementation-state/staging/tll-generation-20-connection-failure.json', import.meta.url),
)

/** Non-secret staging pooler constants only — never passwords or SQL. */
export const CONNECTION_FAILURE_HOST = 'aws-0-eu-west-2.pooler.supabase.com'
export const CONNECTION_FAILURE_PORT = 6543

const connectionFailureChecks = new Set([
  'input', 'factory', 'connect', 'connect_wait', 'factory_retry', 'connect_retry',
  'identity', 'membership', 'matrix', 'own_probe', 'table_denial', 'release', 'close',
])
const connectionFailurePurposes = new Set(['customer', 'cart', 'broker', 'provisional', 'bridge'])
const optionalKeys = new Set(['sqlstate', 'expectedMode', 'purposesPassed', 'host', 'port', 'recoverySubOutcome'])
const recoverySubOutcomes = new Set(['RECOVERY_COMMITTED', 'RECOVERY_POSTCOMMIT_FAILED', 'RECOVERY_REQUIRED'])
const recoveryTerminalStatuses = new Set(['RECOVERY_REQUIRED', 'RECOVERY_VERIFIED'])
/** Also persist secret-free evidence for entry-baseline stops (Gen 18 live ENTRY_BASELINE_FAILED). */
const entryBaselineTerminalStatuses = new Set(['ENTRY_BASELINE_FAILED'])
const allowedFailureSteps = new Set([
  'zero_sessions', 'connection_verification', 'provider', 'preflight', 'journal', 'dispatch', 'recovery',
])
const allowedFailureReasons = new Set([
  'runtime_sessions_remain', 'control_enabled', 'receipt_mismatch', 'unavailable',
  'entry_operator_mismatch', 'entry_environment_mismatch', 'entry_predecessor_mismatch',
  'entry_predecessor_marker_malformed', 'entry_predecessor_marker_invalid', 'entry_predecessor_marker_mismatch',
  'entry_control_enabled',
])
const allowedFailedPhases = new Set([
  'ENTRY_PREFLIGHT', 'ENTRY_PREFLIGHT_RETRY', 'JOURNAL_INTENT', 'MATERIAL_GENERATION',
  'VERCEL_STAGE', 'SUPABASE_STAGE', 'PROVIDER_READBACK', 'DATABASE_PACKAGE', 'DATABASE_DISPATCH',
  'CONNECTION_VERIFICATION', 'JOURNAL_FINALIZE', 'DATABASE_RECOVERY', 'VERCEL_CLEANUP', 'SUPABASE_CLEANUP',
])

/** Secret-free allow-listed projection of a connectionFailure object. */
export function projectSecretFreeConnectionFailure(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const keys = Object.keys(value)
  if (!['status', 'reason', 'purpose', 'check'].every(key => keys.includes(key))) return undefined
  if (keys.some(key => !['status', 'reason', 'purpose', 'check'].includes(key) && !optionalKeys.has(key))) return undefined
  if (value.status !== 'FAIL' || value.reason !== 'connection_verification_failed') return undefined
  if (!connectionFailurePurposes.has(value.purpose) || !connectionFailureChecks.has(value.check)) return undefined

  const projected = {
    status: value.status,
    reason: value.reason,
    purpose: value.purpose,
    check: value.check,
  }

  if (value.sqlstate !== undefined) {
    if (typeof value.sqlstate !== 'string' || !/^[0-9A-Z]{5}$/.test(value.sqlstate)) return undefined
    projected.sqlstate = value.sqlstate
  }
  if (value.expectedMode !== undefined) {
    if (value.expectedMode !== 'rejected' && value.expectedMode !== 'error') return undefined
    projected.expectedMode = value.expectedMode
  }
  if (value.purposesPassed !== undefined) {
    if (!Number.isInteger(value.purposesPassed) || value.purposesPassed < 0 || value.purposesPassed > 5) return undefined
    projected.purposesPassed = value.purposesPassed
  }
  if (value.host !== undefined) {
    if (value.host !== CONNECTION_FAILURE_HOST) return undefined
    projected.host = value.host
  }
  if (value.port !== undefined) {
    if (value.port !== CONNECTION_FAILURE_PORT) return undefined
    projected.port = value.port
  }
  if (value.recoverySubOutcome !== undefined) {
    if (!recoverySubOutcomes.has(value.recoverySubOutcome)) return undefined
    projected.recoverySubOutcome = value.recoverySubOutcome
  }

  // Always stamp non-secret pooler endpoint constants when projecting Gen20 evidence.
  if (projected.host === undefined) projected.host = CONNECTION_FAILURE_HOST
  if (projected.port === undefined) projected.port = CONNECTION_FAILURE_PORT

  return Object.freeze(projected)
}

function projectFailedPhase(value) {
  return typeof value === 'string' && allowedFailedPhases.has(value) ? value : null
}

function projectRecoveryOutcome(value) {
  return value === 'NOT_REQUIRED' || value === 'RECOVERY_VERIFIED' || value === 'RECOVERY_REQUIRED'
    ? value
    : null
}

function projectFailureStep(value) {
  return typeof value === 'string' && allowedFailureSteps.has(value) ? value : null
}

function projectFailureReason(value) {
  return typeof value === 'string' && allowedFailureReasons.has(value) ? value : null
}

function projectManagementStatusCode(value){
  if(Number.isInteger(value)&&value>=100&&value<=599)return value
  return undefined
}

function projectZeroSessionsAttempts(value){
  if(Number.isInteger(value)&&value>=1&&value<=8)return value
  return undefined
}

/** Secret-free launcher stdout / summary payload. Never includes passwords or SQL. */
export function secretFreeLauncherTerminal(result) {
  const connectionFailure = projectSecretFreeConnectionFailure(result?.connectionFailure)
  const failedPhase = projectFailedPhase(result?.failedPhase)
  const recoveryOutcome = projectRecoveryOutcome(result?.recoveryOutcome)
  const failureStep = projectFailureStep(result?.failureStep)
  const failureReason = projectFailureReason(result?.failureReason)
  const payload = {
    status: result?.status ?? null,
    target: result?.target ?? null,
    generation: result?.generation ?? null,
    windowId: result?.windowId ?? null,
    phase: result?.phase ?? null,
    nextAction: result?.nextAction ?? null,
    failedPhase,
    recoveryOutcome,
    connectionFailurePresent: Boolean(connectionFailure) || result?.connectionFailurePresent === true,
  }
  if (failureStep) payload.failureStep = failureStep
  if (failureReason) payload.failureReason = failureReason
  const managementStatusCode = projectManagementStatusCode(result?.managementStatusCode)
  if (managementStatusCode !== undefined) payload.managementStatusCode = managementStatusCode
  const zeroSessionsAttempts = projectZeroSessionsAttempts(result?.zeroSessionsAttempts)
  if (zeroSessionsAttempts !== undefined) payload.zeroSessionsAttempts = zeroSessionsAttempts
  if (connectionFailure) payload.connectionFailure = connectionFailure
  return Object.freeze(payload)
}

/**
 * Persist secret-free evidence under implementation-state.
 * Writes for any RECOVERY_* terminal even when connectionFailure is absent —
 * uses Gen20 RECOVERY_* evidence fields and adds failureReason for zero-sessions.
 */
export function persistConnectionFailureEvidence(result, {
  path = DEFAULT_CONNECTION_FAILURE_EVIDENCE_PATH,
  now = Date.now,
} = {}) {
  const connectionFailure = projectSecretFreeConnectionFailure(result?.connectionFailure)
  const recoveryTerminal = recoveryTerminalStatuses.has(result?.status)
  const entryBaselineTerminal = entryBaselineTerminalStatuses.has(result?.status)
  if (!connectionFailure && !recoveryTerminal && !entryBaselineTerminal) return null
  const failedPhase = projectFailedPhase(result?.failedPhase)
  const recoveryOutcome = projectRecoveryOutcome(result?.recoveryOutcome)
  const failureStep = projectFailureStep(result?.failureStep)
  const failureReason = projectFailureReason(result?.failureReason)
  const zeroSessionsAttempts = projectZeroSessionsAttempts(result?.zeroSessionsAttempts)
  const record = Object.freeze({
    schema: CONNECTION_FAILURE_EVIDENCE_SCHEMA,
    generation: result.generation,
    windowId: result.windowId,
    target: result.target,
    phase: result.phase ?? null,
    failedPhase,
    status: result.status,
    recoveryOutcome,
    connectionFailurePresent: Boolean(connectionFailure),
    ...(failureStep ? { failureStep } : {}),
    ...(failureReason ? { failureReason } : {}),
    ...(projectManagementStatusCode(result?.managementStatusCode) !== undefined
      ? { managementStatusCode: projectManagementStatusCode(result?.managementStatusCode) }
      : {}),
    ...(zeroSessionsAttempts !== undefined ? { zeroSessionsAttempts } : {}),
    ...(connectionFailure ? { connectionFailure } : {}),
    recordedAt: new Date(now()).toISOString(),
  })
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 })
  return path
}

/** Parse the last secret-free launcher terminal JSON line from captured stdout. */
export function extractLauncherTerminalFromStdout(stdout) {
  const lines = String(stdout ?? '').split('\n').map(line => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index])
      if (!value || typeof value !== 'object' || typeof value.status !== 'string') continue
      return secretFreeLauncherTerminal(value)
    } catch { /* keep scanning earlier lines */ }
  }
  return null
}
