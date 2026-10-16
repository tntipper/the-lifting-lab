#!/usr/bin/env node
/** Disabled one-run entry for a new protected staging Preview only. */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptSupervisorPipe, terminateProcessGroup } from './staging-provider-broker-recovery-process-control.mjs'
import { createStagingPreviewDeploymentJournal } from './staging-surface-preview-deployment-journal.mjs'
import { readStagingPreviewDeploymentCredentials,
  STAGING_PREVIEW_DEPLOYMENT_KEYCHAIN_HELPER } from './staging-surface-preview-deployment-credentials.mjs'
import { runBoundedStagingPreviewDeploymentWorker } from './staging-surface-preview-deployment-supervisor.mjs'

export const STAGING_PREVIEW_DEPLOYMENT_LIVE_ENABLED = false
export const STAGING_PREVIEW_DEPLOYMENT_SOURCE_COMMIT = ''
export const STAGING_PREVIEW_DEPLOYMENT_MANIFEST_SHA256 = ''
export const STAGING_PREVIEW_DEPLOYMENT_PUBLIC_CUSTOMER = false
export const STAGING_PREVIEW_DEPLOYMENT_PUBLIC_CART = false
const WORKER_PROOF = 'TLL_STAGING_PREVIEW_DEPLOYMENT_V1'
const ROOT = resolve(import.meta.dirname, '..')
const unavailable = () => { throw new Error('Staging Preview deployment live launcher unavailable') }
const disabled = () => Object.freeze({ status: 'STAGING_PREVIEW_DEPLOYMENT_LIVE_DISABLED' })

function pinnedInput() {
  if (!/^[a-f0-9]{40}$/.test(STAGING_PREVIEW_DEPLOYMENT_SOURCE_COMMIT)
    || !/^[a-f0-9]{64}$/.test(STAGING_PREVIEW_DEPLOYMENT_MANIFEST_SHA256)
    || typeof STAGING_PREVIEW_DEPLOYMENT_PUBLIC_CUSTOMER !== 'boolean'
    || STAGING_PREVIEW_DEPLOYMENT_PUBLIC_CUSTOMER !== STAGING_PREVIEW_DEPLOYMENT_PUBLIC_CART) unavailable()
  return Object.freeze({ branch: 'codex/tll-integration',
    sourceCommit: STAGING_PREVIEW_DEPLOYMENT_SOURCE_COMMIT,
    manifestSha256: STAGING_PREVIEW_DEPLOYMENT_MANIFEST_SHA256,
    publicCustomer: STAGING_PREVIEW_DEPLOYMENT_PUBLIC_CUSTOMER,
    publicCart: STAGING_PREVIEW_DEPLOYMENT_PUBLIC_CART })
}

function checkArming() {
  if (process.platform !== 'darwin' || typeof globalThis.fetch !== 'function') unavailable()
  const source = readFileSync(STAGING_PREVIEW_DEPLOYMENT_KEYCHAIN_HELPER, 'utf8')
  const assignments = source.match(/^[ \t]*APPROVED_PREVIEW_DEPLOYMENT_READ[ \t]*=.*$/gm) ?? []
  if (assignments.length !== 1 || assignments[0] !== 'APPROVED_PREVIEW_DEPLOYMENT_READ = True') unavailable()
  execFileSync(process.execPath, [resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs'), '--check'], {
    cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: 'ignore', timeout: 5_000,
  })
  return pinnedInput()
}

async function runWorkerOnce() {
  const input = checkArming()
  const { runStagingPreviewDeploymentWorker } = await import('./staging-surface-preview-deployment-worker.mjs')
  const stopWorkerGroup = () => terminateProcessGroup(process.pid)
  const controller = new AbortController()
  const result = await runStagingPreviewDeploymentWorker({ input,
    journal: createStagingPreviewDeploymentJournal(),
    acquireCredentials: readStagingPreviewDeploymentCredentials,
    fetch: globalThis.fetch,
    runCli: async () => unavailable(),
    stopWorkerGroup, signal: controller.signal,
  })
  return Object.freeze({ status: result.status, deploymentId: result.deploymentId,
    sourceCommit: result.sourceCommit, manifestSha256: result.manifestSha256,
    customerEnabled: result.customerEnabled, cartEnabled: result.cartEnabled })
}

async function superviseOnce() {
  const input = checkArming()
  const result = await runBoundedStagingPreviewDeploymentWorker({ executable: process.execPath,
    args: [fileURLToPath(import.meta.url), '--worker'], cwd: ROOT,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, proof: WORKER_PROOF })
  try {
    const value = result.status === 'EXITED' && result.output
      ? JSON.parse(result.output.toString('utf8')) : null
    const record = createStagingPreviewDeploymentJournal().read()
    if (value?.status !== 'PROTECTED_PREVIEW_VERIFIED' || record?.phase !== 'VERIFIED'
      || value.deploymentId !== record.deploymentId || value.sourceCommit !== input.sourceCommit
      || value.manifestSha256 !== input.manifestSha256 || value.customerEnabled !== input.publicCustomer
      || value.cartEnabled !== input.publicCart) unavailable()
    return Object.freeze({ status: 'PROTECTED_PREVIEW_VERIFIED', deploymentId: value.deploymentId })
  } catch { return Object.freeze({ status: 'RECONCILIATION_REQUIRED' }) }
  finally { result.output?.fill(0) }
}

export async function runStagingPreviewDeploymentLiveOnce() {
  if (STAGING_PREVIEW_DEPLOYMENT_LIVE_ENABLED !== true) return disabled()
  return superviseOnce()
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (STAGING_PREVIEW_DEPLOYMENT_LIVE_ENABLED !== true) process.stdout.write(`${JSON.stringify(disabled())}\n`)
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
