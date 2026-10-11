#!/usr/bin/env node
/** Disabled, bounded parent and child for two separate one-use staging reads. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptSupervisorPipe, terminateProcessGroup } from './staging-provider-broker-recovery-process-control.mjs'
import { runBoundedBrokerRotationWorker } from './staging-provider-broker-rotation-process-control.mjs'
import { assertStagingGeneration22DispatchRecordsAbsent,
  createStagingGeneration22PreflightJournal } from './staging-generation-22-preflight-journal.mjs'
import { stagingGeneration22PreflightExitCode } from './staging-generation-22-preflight-assessment.mjs'
import { runStagingGeneration22PreflightVercelObservation } from './staging-generation-22-preflight-observer.mjs'
import { runStagingMinimumConfigurationObservation } from './staging-minimum-configuration-observer.mjs'
import { createStagingAccountHostedBaselineSupabaseBinding,
  HOSTED_BASELINE_SUPABASE_BINDING_ENABLED } from './staging-account-hosted-baseline-supabase.mjs'
import { createStagingAccountHostedBaselineVercelBinding,
  HOSTED_BASELINE_VERCEL_BINDING_ENABLED } from './staging-account-hosted-baseline-vercel.mjs'
import { readStagingGeneration22Credential,
  STAGING_GENERATION_22_KEYCHAIN_READER_ENABLED } from './staging-generation-22-keychain-reader.mjs'

export const STAGING_GENERATION_22_PREFLIGHT_LIVE_LAUNCHER_ENABLED = false
const ROOT = resolve(import.meta.dirname, '..')
const PROOF = 'TLL_GENERATION_22_READ_ONLY_PREFLIGHT_V1'
const ENV = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' })
const TARGETS = Object.freeze({ supabase: 'qdmvngjwkcsilzmqksme',
  vercel: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4' })
const GOOD = Object.freeze({ supabase: 'DISABLED_BASELINE_OBSERVED',
  vercel: 'GENERATION_22_NAMES_ABSENT' })
const unavailable = () => { throw Error('Generation 22 preflight live read unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function checkArming(mode) {
  if (!Object.hasOwn(TARGETS, mode) || !STAGING_GENERATION_22_PREFLIGHT_LIVE_LAUNCHER_ENABLED
    || !STAGING_GENERATION_22_KEYCHAIN_READER_ENABLED
    || (mode === 'supabase' ? !HOSTED_BASELINE_SUPABASE_BINDING_ENABLED : !HOSTED_BASELINE_VERCEL_BINDING_ENABLED)
    || process.platform !== 'darwin' || typeof globalThis.fetch !== 'function') unavailable()
  for (const name of ['staging-account-activation-manifest.mjs', 'staging-account-hosted-baseline-manifest.mjs']) {
    const result = spawnSync(process.execPath, [resolve(import.meta.dirname, name), '--check'], {
      cwd: ROOT, env: ENV, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer: 4096,
    })
    try { if (result.error || result.status !== 0 || result.signal || result.stdout?.length !== 0) unavailable() }
    finally { result.stdout?.fill?.(0) }
  }
  if (createStagingGeneration22PreflightJournal({ mode }).read()) unavailable()
  assertStagingGeneration22DispatchRecordsAbsent()
}

async function observe(mode) {
  checkArming(mode)
  const readCredential = ({ signal }) => readStagingGeneration22Credential({ selector: mode,
    signal, stopWorkerGroup: () => terminateProcessGroup(process.pid) })
  const journal = createStagingGeneration22PreflightJournal({ mode })
  if (mode === 'supabase') return runStagingMinimumConfigurationObservation({ journal, readCredential,
    openSupabase: managementToken => createStagingAccountHostedBaselineSupabaseBinding({
      fetch: globalThis.fetch, managementToken,
    }),
  })
  return runStagingGeneration22PreflightVercelObservation({ journal, readCredential,
    openVercel: vercelToken => createStagingAccountHostedBaselineVercelBinding({
      fetch: globalThis.fetch, vercelToken,
    }),
  })
}

export async function runStagingGeneration22PreflightOnce(mode) {
  checkArming(mode)
  const result = await runBoundedBrokerRotationWorker({ executable: process.execPath,
    args: [fileURLToPath(import.meta.url), '--worker', mode], cwd: ROOT, env: ENV,
    proof: PROOF, deadlineMs: 70_000, maxOutputBytes: 4096, strictGroupCleanup: true })
  try {
    if (result.status !== 'EXITED' || result.code !== 0 || !result.output) unavailable()
    const value = JSON.parse(result.output.toString('utf8'))
    const record = createStagingGeneration22PreflightJournal({ mode }).read()
    const targetField = mode === 'supabase' ? 'projectRef' : 'projectId'
    if (!exact(value, ['status', targetField, 'assessment'])
      || ![GOOD[mode], 'HOLD'].includes(value.status)
      || value.assessment?.status !== value.status || value[targetField] !== TARGETS[mode]
      || record?.state !== 'FINISHED' || record.outcome !== value.status
      || createHash('sha256').update(JSON.stringify(value.assessment)).digest('hex') !== record.resultSha256) unavailable()
    return Object.freeze({ status: value.status, target: TARGETS[mode], assessment: value.assessment })
  } catch { return Object.freeze({ status: 'RECONCILIATION_REQUIRED', target: TARGETS[mode] }) }
  finally { result.output?.fill(0) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv.at(-1)
  if (!STAGING_GENERATION_22_PREFLIGHT_LIVE_LAUNCHER_ENABLED) {
    process.stdout.write(`${JSON.stringify({ status: 'GENERATION_22_PREFLIGHT_DISABLED' })}\n`)
  } else {
    try {
      if (process.argv.length === 3) {
        const result = await runStagingGeneration22PreflightOnce(mode)
        process.stdout.write(`${JSON.stringify(result)}\n`)
        process.exitCode = stagingGeneration22PreflightExitCode(mode, result.status)
      } else if (process.argv.length === 4 && process.argv[2] === '--worker') {
        const release = await acceptSupervisorPipe({ proof: PROOF })
        try { process.stdout.write(`${JSON.stringify(await observe(mode))}\n`) }
        finally { release() }
      } else unavailable()
    } catch { process.stdout.write(`${JSON.stringify({ status: 'RECONCILIATION_REQUIRED' })}\n`); process.exitCode = 1 }
  }
}
