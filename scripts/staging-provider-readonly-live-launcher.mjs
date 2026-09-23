#!/usr/bin/env node
/** Disabled entry for one focused, staging-only Supabase provider read. */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STAGING_PROVIDER_READONLY_LIVE_ENABLED = true
const root = resolve(import.meta.dirname, '..')
const helper = resolve(import.meta.dirname, 'staging-provider-normalization-keychain.py')
const journalPath = resolve(root, '../implementation-state/staging/tll-provider-readonly-probe-v1.json')
const unavailable = () => { throw new Error('Staging provider read-only launcher unavailable') }

function checkedChild(executable, args, maxBuffer) {
  const result = spawnSync(executable, args, {
    cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer,
  })
  if (result.error || result.status !== 0 || result.signal) { result.stdout?.fill?.(0); unavailable() }
  return result.stdout
}

function checkManifest() {
  const output = checkedChild(process.execPath, [resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs'), '--check'], 4_096)
  try { if (!Buffer.isBuffer(output) || output.length !== 0) unavailable() }
  finally { output?.fill?.(0) }
}

function readCredential({ signal }) {
  if (signal.aborted) unavailable()
  const output = checkedChild('/usr/bin/python3', ['-I', '-S', helper, 'supabase'], 4_097)
  try {
    if (signal.aborted || !Buffer.isBuffer(output) || output.length < 8 || output.length > 4_096 || output.includes(0)) unavailable()
    return Buffer.from(output)
  } finally { output?.fill?.(0) }
}

/** False gate precedes manifest, journal, Keychain, dynamic imports and fetch. */
export async function runStagingProviderReadOnlyLiveOnce() {
  if (STAGING_PROVIDER_READONLY_LIVE_ENABLED !== true) return Object.freeze({ status: 'STAGING_PROVIDER_READONLY_LIVE_DISABLED', nativeAccessApproved: false })
  checkManifest()
  const [probe, phase, supabase] = await Promise.all([
    import('./staging-provider-readonly-probe.mjs'),
    import('./staging-provider-normalization-phase-journal.mjs'),
    import('./staging-account-hosted-baseline-supabase.mjs'),
  ])
  if (typeof globalThis.fetch !== 'function') unavailable()
  return probe.runStagingProviderReadOnlyProbe({
    readCredential,
    openSupabase: managementToken => supabase.createStagingAccountHostedBaselineSupabaseBinding({ fetch: globalThis.fetch, managementToken }),
    journal: phase.createProviderNormalizationPhaseJournal({ path: journalPath }),
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runStagingProviderReadOnlyLiveOnce())}\n`) }
  catch { process.stdout.write(`${JSON.stringify({ status: 'READONLY_UNAVAILABLE' })}\n`); process.exitCode = 1 }
}
