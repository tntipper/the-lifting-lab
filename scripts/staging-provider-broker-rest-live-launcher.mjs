#!/usr/bin/env node
/** Disabled one-use staging broker rotation launcher. No live gate is armed. */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptSupervisorPipe, terminateProcessGroup } from './staging-provider-broker-recovery-process-control.mjs'
import { runBoundedBrokerRotationWorker } from './staging-provider-broker-rotation-process-control.mjs'

export const STAGING_BROKER_REST_LIVE_ENABLED = false
export const STAGING_BROKER_REST_WORKER_DEADLINE_MS = 600_000
const WORKER_PROOF = 'TLL_STAGING_BROKER_REST_SUPERVISOR_V1'
const ROOT = resolve(import.meta.dirname, '..')
const HELPER = resolve(import.meta.dirname, 'staging-provider-broker-rotation-keychain.py')
const unavailable = () => { throw Error('Staging broker REST live launcher unavailable') }
const disabled = () => Object.freeze({ status: 'STAGING_BROKER_REST_LIVE_DISABLED' })

function checkSources() {
  if (process.platform !== 'darwin' || typeof globalThis.fetch !== 'function') unavailable()
  const source = readFileSync(HELPER, 'utf8')
  const assignments = source.match(/^[ \t]*APPROVED_BROKER_ROTATION[ \t]*=.*$/gm) ?? []
  if (assignments.length !== 1 || assignments[0] !== 'APPROVED_BROKER_ROTATION = True') unavailable()
  execFileSync(process.execPath, [resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs'), '--check'], {
    cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: 'ignore', timeout: 5_000,
  })
}

/** Only the supervised worker may call this, after the fd-3 proof succeeds. */
async function runWorkerOnce() {
  checkSources()
  const [{ createStagingBoundedExecutor }, { runStagingProviderBrokerRestWorker, createStagingProviderBrokerRestJournals },
    { readStagingBrokerRotationCredentials }] = await Promise.all([
    import('./staging-bounded-executor.mjs'),
    import('./staging-provider-broker-rest-worker-core.mjs'),
    import('./staging-provider-broker-rest-credential-reader.mjs'),
  ])
  const stopWorkerGroup = () => terminateProcessGroup(process.pid)
  const controller = new AbortController()
  const { phaseJournal, rotationJournal } = createStagingProviderBrokerRestJournals()
  const result = await runStagingProviderBrokerRestWorker({
    phaseJournal, rotationJournal,
    acquireCredentials: () => readStagingBrokerRotationCredentials({ signal: controller.signal, stopWorkerGroup }),
    fetch: globalThis.fetch, stopWorkerGroup, execute: createStagingBoundedExecutor(),
  })
  return Object.freeze({ status: result.status })
}

async function superviseOnce() {
  const result = await runBoundedBrokerRotationWorker({ executable: process.execPath,
    args: [fileURLToPath(import.meta.url), '--worker'], cwd: ROOT,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, proof: WORKER_PROOF,
    deadlineMs: STAGING_BROKER_REST_WORKER_DEADLINE_MS })
  let status = 'RECONCILIATION_REQUIRED'
  try {
    const parsed = result.status === 'EXITED' && result.code === 0 && result.output
      ? JSON.parse(result.output.toString('utf8')) : null
    if (parsed && Object.keys(parsed).length === 1 &&
      ['ROTATION_VERIFIED', 'STOPPED_BEFORE_PROVIDER_UPDATE', 'RECONCILIATION_REQUIRED', 'REPLAY_REJECTED']
        .includes(parsed.status)) status = parsed.status
  } catch { /* Unexpected worker output is uncertain. */ }
  finally { result.output?.fill(0) }
  return Object.freeze({ status })
}

export async function runStagingProviderBrokerRestLiveOnce() {
  if (STAGING_BROKER_REST_LIVE_ENABLED !== true) return disabled()
  return superviseOnce()
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (STAGING_BROKER_REST_LIVE_ENABLED !== true) process.stdout.write(`${JSON.stringify(disabled())}\n`)
    else if (process.argv.length === 2) process.stdout.write(`${JSON.stringify(await superviseOnce())}\n`)
    else if (process.argv.length === 3 && process.argv[2] === '--worker') {
      const releaseSupervisorPipe = await acceptSupervisorPipe({ proof: WORKER_PROOF })
      let result
      try { result = await runWorkerOnce() }
      finally { releaseSupervisorPipe() }
      process.stdout.write(`${JSON.stringify(result)}\n`)
    } else unavailable()
  } catch {
    process.stdout.write(`${JSON.stringify({ status: 'RECONCILIATION_REQUIRED' })}\n`)
    process.exitCode = 1
  }
}
