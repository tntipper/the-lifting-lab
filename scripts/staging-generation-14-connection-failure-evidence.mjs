/**
 * Secret-free Generation 14 connection-failure evidence helpers.
 *
 * No passwords, SQL, tokens, or provider payloads. Used by the live launcher
 * stdout/path persistence and by run-live-once session summaries so the next
 * live attempt cannot lose {purpose,check,status,reason}.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CONNECTION_FAILURE_EVIDENCE_SCHEMA = 'tll-generation-14-connection-failure/v1'
export const DEFAULT_CONNECTION_FAILURE_EVIDENCE_PATH = fileURLToPath(
  new URL('../../implementation-state/staging/tll-generation-14-connection-failure.json', import.meta.url),
)

const connectionFailureChecks = new Set([
  'input', 'factory', 'connect', 'connect_wait', 'factory_retry', 'connect_retry',
  'identity', 'membership', 'matrix', 'own_probe', 'table_denial', 'release', 'close',
])
const connectionFailurePurposes = new Set(['customer', 'cart', 'broker', 'provisional', 'bridge'])

/** Secret-free allow-listed projection of a connectionFailure object. */
export function projectSecretFreeConnectionFailure(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const keys = Object.keys(value).sort().join('|')
  if (keys !== 'check|purpose|reason|status') return undefined
  if (value.status !== 'FAIL' || value.reason !== 'connection_verification_failed') return undefined
  if (!connectionFailurePurposes.has(value.purpose) || !connectionFailureChecks.has(value.check)) return undefined
  return Object.freeze({
    status: value.status,
    reason: value.reason,
    purpose: value.purpose,
    check: value.check,
  })
}

/** Secret-free launcher stdout / summary payload. Never includes passwords or SQL. */
export function secretFreeLauncherTerminal(result) {
  const payload = {
    status: result?.status ?? null,
    target: result?.target ?? null,
    generation: result?.generation ?? null,
    windowId: result?.windowId ?? null,
    phase: result?.phase ?? null,
    nextAction: result?.nextAction ?? null,
  }
  const connectionFailure = projectSecretFreeConnectionFailure(result?.connectionFailure)
  if (connectionFailure) payload.connectionFailure = connectionFailure
  return Object.freeze(payload)
}

/** Persist secret-free connectionFailure evidence under implementation-state. */
export function persistConnectionFailureEvidence(result, {
  path = DEFAULT_CONNECTION_FAILURE_EVIDENCE_PATH,
  now = Date.now,
} = {}) {
  const connectionFailure = projectSecretFreeConnectionFailure(result?.connectionFailure)
  if (!connectionFailure) return null
  const record = Object.freeze({
    schema: CONNECTION_FAILURE_EVIDENCE_SCHEMA,
    generation: result.generation,
    windowId: result.windowId,
    target: result.target,
    phase: result.phase ?? 'CONNECTION_VERIFICATION',
    status: result.status,
    connectionFailure,
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
