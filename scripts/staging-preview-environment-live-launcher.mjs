#!/usr/bin/env node
/** Disabled one-use staging Preview variable-name reader; no values leave the worker. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptSupervisorPipe } from './staging-provider-broker-recovery-process-control.mjs'
import { runBoundedDetachedWorker } from './staging-provider-broker-recovery-process-control.mjs'
import { createStagingPreviewEnvironmentJournal } from './staging-preview-environment-journal.mjs'

export const STAGING_PREVIEW_ENVIRONMENT_LIVE_ENABLED = false
const ROOT = resolve(import.meta.dirname, '..')
const HELPER = resolve(import.meta.dirname, 'staging-preview-environment-keychain.py')
const PROOF = 'TLL_STAGING_PREVIEW_ENV_INVENTORY_V1'
const unavailable = () => { throw new Error('Staging Preview environment live read unavailable') }
const disabled = () => Object.freeze({ status: 'STAGING_PREVIEW_ENVIRONMENT_LIVE_DISABLED' })
const env = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' })

function checkArming() {
  if (process.platform !== 'darwin' || typeof globalThis.fetch !== 'function') unavailable()
  const source = readFileSync(HELPER, 'utf8')
  if ((source.match(/^APPROVED_PREVIEW_ENVIRONMENT_READ = (True|False)$/gm) ?? []).join('|')
    !== 'APPROVED_PREVIEW_ENVIRONMENT_READ = True') unavailable()
  for (const name of ['staging-account-activation-manifest.mjs', 'staging-account-hosted-baseline-manifest.mjs']) {
    const result = spawnSync(process.execPath, [resolve(import.meta.dirname, name), '--check'], {
      cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer: 4096,
    })
    try { if (result.error || result.status !== 0 || result.signal || result.stdout?.length !== 0) unavailable() }
    finally { result.stdout?.fill?.(0) }
  }
}

function readCredential({ signal }) {
  if (signal.aborted) unavailable()
  const result = spawnSync('/usr/bin/python3', ['-I', '-S', HELPER], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer: 4097,
  })
  const output = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0)
  try {
    if (signal.aborted || result.error || result.status !== 0 || result.signal
      || output.length < 8 || output.length > 4096 || output.includes(0)) unavailable()
    return Buffer.from(output)
  } finally { output.fill(0) }
}

async function runWorker() {
  checkArming()
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'config/staging-account-activation-manifest.json'), 'utf8'))
  const [observer, vercel] = await Promise.all([
    import('./staging-preview-environment-observer.mjs'),
    import('./staging-account-hosted-baseline-vercel.mjs'),
  ])
  return observer.runStagingPreviewEnvironmentObservation({
    journal: createStagingPreviewEnvironmentJournal(), readCredential,
    openVercel: vercelToken => vercel.createStagingAccountHostedBaselineVercelBinding({ fetch: globalThis.fetch, vercelToken }),
    requiredSecrets: manifest.runtime?.vercelSecrets,
    requiredConfiguration: manifest.runtime?.vercelConfiguration,
  })
}

async function superviseOnce() {
  checkArming()
  const result = await runBoundedDetachedWorker({ executable: process.execPath,
    args: [fileURLToPath(import.meta.url), '--worker'], cwd: ROOT, env, proof: PROOF,
    deadlineMs: 60_000, maxOutputBytes: 4096 })
  try {
    if (result.status !== 'EXITED' || result.code !== 0 || !result.output) unavailable()
    const value = JSON.parse(result.output.toString('utf8'))
    const record = createStagingPreviewEnvironmentJournal().read()
    if (!['HOLD', 'NAMES_PRESENT'].includes(value?.status) || value.assessment?.status !== value.status
      || value.projectId !== record?.projectId || record?.state !== 'FINISHED' || record.outcome !== value.status
      || createHash('sha256').update(JSON.stringify(value.assessment)).digest('hex') !== record.resultSha256) unavailable()
    return Object.freeze({ status: value.status, assessment: value.assessment })
  } catch { return Object.freeze({ status: 'RECONCILIATION_REQUIRED' }) }
  finally { result.output?.fill(0) }
}

export async function runStagingPreviewEnvironmentLiveOnce() {
  if (STAGING_PREVIEW_ENVIRONMENT_LIVE_ENABLED !== true) return disabled()
  return superviseOnce()
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (STAGING_PREVIEW_ENVIRONMENT_LIVE_ENABLED !== true) process.stdout.write(`${JSON.stringify(disabled())}\n`)
    else if (process.argv.length === 2) process.stdout.write(`${JSON.stringify(await superviseOnce())}\n`)
    else if (process.argv.length === 3 && process.argv[2] === '--worker') {
      const release = await acceptSupervisorPipe({ proof: PROOF })
      let result
      try { result = await runWorker() } finally { release() }
      process.stdout.write(`${JSON.stringify(result)}\n`)
    } else unavailable()
  } catch { process.stdout.write(`${JSON.stringify({ status: 'RECONCILIATION_REQUIRED' })}\n`); process.exitCode = 1 }
}
