#!/usr/bin/env node
/** Disabled parent/child boundary for one supervised Gen22-retired staging read. */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedBrokerRotationWorker } from './staging-provider-broker-rotation-process-control.mjs'
import { acceptSupervisorPipe } from './staging-provider-broker-recovery-process-control.mjs'
import { createStagingGeneration23PredecessorJournal } from './staging-generation-23-predecessor-journal.mjs'
import { createStagingGeneration23PredecessorObserver,
  STAGING_GENERATION_23_PREDECESSOR_OBSERVER_ENABLED } from './staging-generation-23-predecessor-observer.mjs'
import { postStagingGeneration23PredecessorCheck,
  STAGING_GENERATION_23_PREDECESSOR_QUERY_ENABLED } from './staging-generation-23-predecessor-query.mjs'
import { validateStagingGeneration23PredecessorCheck,
  STAGING_GENERATION_23_PREDECESSOR_CHECK_ENABLED } from './staging-generation-23-predecessor-check.mjs'
import { PROJECT_REF } from './staging-generation-23-password-material.mjs'

export const STAGING_GENERATION_23_PREDECESSOR_LIVE_ENABLED = false
const ENTRY = fileURLToPath(import.meta.url)
const ROOT = resolve(import.meta.dirname, '..')
const PROOF = 'TLL_GEN23_PREDECESSOR_READ_V1'
const ENV = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' })
const PYTHON = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
const HELPER = resolve(import.meta.dirname, 'staging-provider-normalization-keychain.py')
const unavailable = () => { throw new Error('Generation 23 predecessor live read unavailable') }

function checkArming() {
  if (!STAGING_GENERATION_23_PREDECESSOR_LIVE_ENABLED
    || !STAGING_GENERATION_23_PREDECESSOR_OBSERVER_ENABLED
    || !STAGING_GENERATION_23_PREDECESSOR_QUERY_ENABLED
    || !STAGING_GENERATION_23_PREDECESSOR_CHECK_ENABLED || process.platform !== 'darwin') unavailable()
  const helper = readFileSync(HELPER, 'utf8')
  if (!helper.includes('APPROVED_NATIVE_READ = True')
    || !helper.includes('selector != "supabase"')) unavailable()
  const checked = spawnSync(process.execPath,
    [resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs'), '--check'],
    { cwd: ROOT, env: ENV, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer: 4096 })
  try { if (checked.error || checked.status !== 0 || checked.signal || checked.stdout?.length !== 0) unavailable() }
  finally { checked.stdout?.fill?.(0) }
  if (createStagingGeneration23PredecessorJournal().read()) unavailable()
}

function readToken() {
  const child = spawnSync(PYTHON, ['-I', '-S', HELPER, 'supabase'],
    { cwd: ROOT, env: ENV, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer: 1024 })
  if (child.error || child.status !== 0 || child.signal || !Buffer.isBuffer(child.stdout)) {
    child.stdout?.fill?.(0); unavailable()
  }
  const token = Buffer.from(child.stdout)
  child.stdout.fill(0)
  if (!/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(token.toString('utf8'))) { token.fill(0); unavailable() }
  return token
}

async function childRead() {
  checkArming()
  const journal = createStagingGeneration23PredecessorJournal()
  const observer = createStagingGeneration23PredecessorObserver({ journal, readToken,
    post: ({ token, signal }) => postStagingGeneration23PredecessorCheck({ token, signal }),
    validate: validateStagingGeneration23PredecessorCheck })
  return observer.observe({ signal: new AbortController().signal })
}

export async function runStagingGeneration23PredecessorLiveOnce({ runWorker = runBoundedBrokerRotationWorker } = {}) {
  if (!STAGING_GENERATION_23_PREDECESSOR_LIVE_ENABLED)
    return Object.freeze({ status: 'GENERATION_23_PREDECESSOR_LIVE_DISABLED' })
  checkArming()
  if (typeof runWorker !== 'function') unavailable()
  const result = await runWorker({ executable: process.execPath, args: [ENTRY, '--child'], cwd: ROOT,
    env: ENV, proof: PROOF, deadlineMs: 70_000, maxOutputBytes: 256, strictGroupCleanup: true })
  try {
    if (result?.status !== 'EXITED' || result.code !== 0 || !Buffer.isBuffer(result.output)) unavailable()
    const value = JSON.parse(result.output.toString('utf8'))
    const record = createStagingGeneration23PredecessorJournal().read()
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('|') !== 'projectRef|status'
      || value.status !== 'PASS_RETIRED' || value.projectRef !== PROJECT_REF
      || record?.state !== 'FINISHED' || record.outcome !== 'PASS_RETIRED'
      || !/^[a-f0-9]{64}$/.test(record.receiptSha256)) unavailable()
    return Object.freeze({ status: 'PASS_RETIRED', projectRef: PROJECT_REF })
  } catch { return Object.freeze({ status: 'RECONCILIATION_REQUIRED', projectRef: PROJECT_REF }) }
  finally { result?.output?.fill?.(0) }
}

if (process.argv[1] && resolve(process.argv[1]) === ENTRY) {
  if (!STAGING_GENERATION_23_PREDECESSOR_LIVE_ENABLED) {
    process.stdout.write(`${JSON.stringify({ status: 'GENERATION_23_PREDECESSOR_LIVE_DISABLED' })}\n`)
  } else {
    try {
      if (process.argv.length === 2) {
        const value = await runStagingGeneration23PredecessorLiveOnce()
        process.stdout.write(`${JSON.stringify(value)}\n`)
        if (value.status !== 'PASS_RETIRED') process.exitCode = 1
      } else if (process.argv.length === 3 && process.argv[2] === '--child') {
        const release = await acceptSupervisorPipe({ proof: PROOF })
        try { process.stdout.write(`${JSON.stringify(await childRead())}\n`) }
        finally { release() }
      } else unavailable()
    } catch {
      process.stdout.write(`${JSON.stringify({ status: 'RECONCILIATION_REQUIRED' })}\n`)
      process.exitCode = 1
    }
  }
}
