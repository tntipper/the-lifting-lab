#!/usr/bin/env node
/** One fixed parent entry for the complete protected Generation 23 staging run. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACTIVE_WINDOW_EXPIRES_AT } from './staging-generation-23-credentials.mjs'
import { JOURNAL_PATH as WHOLE_ROUTE_JOURNAL_PATH } from './staging-generation-23-whole-route-journal.mjs'
import { STAGING_GENERATION_23_PROCESS_BINDING_ENABLED,
  runBoundedStagingGeneration23WholeWorker } from './staging-generation-23-process-binding.mjs'

export const STAGING_GENERATION_23_LIVE_LAUNCHER_ENABLED = false
export const GENERATION_23_LAUNCH_BRANCH = 'codex/tll-integration'
export const GENERATION_23_LAUNCH_MIN_REMAINING_MS = 45 * 60 * 1000
const ROOT = resolve(import.meta.dirname, '..')
const STATE = resolve(ROOT, '../implementation-state/staging')
export const GENERATION_23_PRIOR_HOLD_NAME = 'tll-generation-23-whole-route-v7.json'
export const GENERATION_23_PRIOR_HOLD_SHA256 = '2f7a328c610d0fc5e9b84f2ef6dd61003790baf39ca47f8de72889dcc28e7deb'
export const GENERATION_23_PRIOR_RETIRE_NAME = 'tll-generation-23-database-retire-v7.json'
export const GENERATION_23_PRIOR_RETIRE_SHA256 = '74b4f19ad2dd4a0fcff49280fe7b4dc5cfe43cacac7cdc4e1db75fe659bac56c'
export const GENERATION_23_PRIOR_GATE_NAME = 'tll-generation-23-broker-gate-retire-v7.json'
export const GENERATION_23_PRIOR_GATE_SHA256 = '243c953ea5ff5ad14d3ff31976e1dfb7ff580326c4d7ebf91ab024048182912c'
// Each of these is a one-use record owned by a fixed Gen23 component. A
// previous or uncertain attempt closes this entry before any credential read.
export const GENERATION_23_LAUNCH_RECORD_NAMES = Object.freeze([
  'tll-generation-23-whole-route-v8.json',
  'tll-generation-23-predecessor-read-v8.json',
  'tll-generation-23-database-setup-v8.json',
  'tll-generation-23-database-activate-v8.json',
  'tll-generation-23-database-shutdown-v8.json',
  'tll-generation-23-database-retire-v8.json',
  'tll-generation-23-provider-enable-v8.json',
  'tll-generation-23-provider-disable-v8.json',
  'tll-generation-23-settings-v8.json',
  'tll-generation-23-surface-enable-v8.json',
  'tll-generation-23-surface-freeze-v8.json',
  'tll-generation-23-checkout-enable-v8.json',
  'tll-generation-23-checkout-freeze-v8.json',
  'tll-generation-23-preview-enabled-v8.json',
  'tll-generation-23-preview-held-v8.json',
  'tll-generation-23-preview-consumer-v8.json',
  'tll-generation-23-consumer-diagnostic-v8.json',
  'tll-generation-23-broker-gate-retire-v8.json',
  'tll-generation-23-final-read-v8.json',
  'tll-generation-23-restricted-connections-v8.json',
])
const result = status => Object.freeze({ status })
let used = false

function fixedBranch() {
  try {
    const value = execFileSync('/usr/bin/git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C', GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' },
      encoding: 'utf8', timeout: 5_000, maxBuffer: 128, stdio: ['ignore', 'pipe', 'ignore'],
    })
    return value === `${GENERATION_23_LAUNCH_BRANCH}\n`
  } catch { return false }
}

function recordsUnused() {
  if (resolve(STATE, GENERATION_23_LAUNCH_RECORD_NAMES[0]) !== WHOLE_ROUTE_JOURNAL_PATH) return false
  for (const [name, expectedSha256] of [[GENERATION_23_PRIOR_HOLD_NAME, GENERATION_23_PRIOR_HOLD_SHA256],
    [GENERATION_23_PRIOR_RETIRE_NAME, GENERATION_23_PRIOR_RETIRE_SHA256],
    [GENERATION_23_PRIOR_GATE_NAME, GENERATION_23_PRIOR_GATE_SHA256]]) {
    try {
      const path = resolve(STATE, name), stat = lstatSync(path)
      if (!priorHoldVerified({ stat, bytes: readFileSync(path), expectedSha256 })) return false
    } catch { return false }
  }
  for (const name of GENERATION_23_LAUNCH_RECORD_NAMES) {
    if (!name.endsWith('-v8.json')) return false
    try { lstatSync(resolve(STATE, name)); return false }
    catch (error) { if (error?.code !== 'ENOENT') return false }
  }
  return true
}

/** The prior stopped attempt is evidence, not a record that may be cleared. */
export function priorHoldVerified({ stat, bytes, expectedSha256 = GENERATION_23_PRIOR_HOLD_SHA256 } = {}) {
  return stat?.isFile?.() === true && stat?.isSymbolicLink?.() === false
    && stat.nlink === 1 && (stat.mode & 0o777) === 0o600
    && Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 8192
    && stat.size === bytes.length && /^[a-f0-9]{64}$/.test(expectedSha256)
    && createHash('sha256').update(bytes).digest('hex') === expectedSha256
}

/** Pure gate used by the launcher and offline tests; source proof is repeated in the child. */
export function assessStagingGeneration23LaunchGate({ branchOk, recordsUnused: unused,
  expiresAt, nowMs } = {}) {
  if (branchOk !== true || unused !== true || typeof expiresAt !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(expiresAt)) return false
  const expiry = Date.parse(expiresAt)
  return Number.isSafeInteger(nowMs) && Number.isFinite(expiry)
    && new Date(expiry).toISOString() === expiresAt
    && expiry - nowMs >= GENERATION_23_LAUNCH_MIN_REMAINING_MS
    && expiry - nowMs <= 60 * 60 * 1000
}

/** The only hosted entry. It never sees a token or chooses a worker argument. */
export async function runStagingGeneration23LiveOnce({ spawnProcess } = {}) {
  if (STAGING_GENERATION_23_LIVE_LAUNCHER_ENABLED !== true
    || STAGING_GENERATION_23_PROCESS_BINDING_ENABLED !== true || used) {
    return result('STAGING_RUN_DISABLED')
  }
  used = true
  if (!assessStagingGeneration23LaunchGate({ branchOk: fixedBranch(),
    recordsUnused: recordsUnused(), expiresAt: ACTIVE_WINDOW_EXPIRES_AT, nowMs: Date.now() })) {
    return result('ARMING_GATE_CLOSED')
  }
  try {
    const observed = await runBoundedStagingGeneration23WholeWorker(
      ...(spawnProcess ? [{ spawnProcess }] : []))
    // The parent never promotes a local rehearsal or an uncertain child to a
    // hosted success. The child owns exact published-source/manifest proof,
    // credentials, all phase journals, and the final held-state observations.
    return result(observed?.status === 'VERIFIED_STAGING_WHOLE_PROCESS'
      ? 'VERIFIED_STAGING_WHOLE_PROCESS'
      : observed?.status === 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED'
        ? 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED' : 'RECONCILIATION_REQUIRED')
  } catch { return result('RECONCILIATION_REQUIRED') }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const answer = process.argv.length === 2
    ? await runStagingGeneration23LiveOnce() : result('STAGING_RUN_DISABLED')
  process.stdout.write(`${JSON.stringify(answer)}\n`)
  if (answer.status !== 'VERIFIED_STAGING_WHOLE_PROCESS') process.exitCode = 1
}
