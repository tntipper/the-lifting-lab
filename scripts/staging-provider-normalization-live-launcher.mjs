#!/usr/bin/env node
/** Disabled, dedicated entry point for one staging provider normalization. */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROVIDER_NORMALIZATION_LIVE_ENABLED = false
const root = resolve(import.meta.dirname, '..')
const helper = resolve(import.meta.dirname, 'staging-provider-normalization-keychain.py')
const unavailable = () => { throw new Error('Staging provider normalization live launcher unavailable') }
const disabled = () => Object.freeze({ status: 'PROVIDER_NORMALIZATION_LIVE_DISABLED', nativeAccessApproved: false })

function checkedChild(executable, args, maxBuffer) {
  const result = spawnSync(executable, args, {
    cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer,
  })
  if (result.error || result.status !== 0 || result.signal) {
    result.stdout?.fill?.(0)
    unavailable()
  }
  return result.stdout
}

function checkManifests() {
  for (const name of ['staging-account-activation-manifest.mjs']) {
    const output = checkedChild(process.execPath, [resolve(import.meta.dirname, name), '--check'], 4_096)
    try { if (!Buffer.isBuffer(output) || output.length !== 0) unavailable() }
    finally { output?.fill?.(0) }
  }
}

function readCredential(selector) {
  const output = checkedChild('/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
    ['-I', '-S', helper, selector], 4_097)
  try {
    if (!Buffer.isBuffer(output) || output.length < 8 || output.length > 4_096 || output.includes(0)) unavailable()
    return Buffer.from(output)
  } finally { output?.fill?.(0) }
}

function readCredentials({ signal }) {
  const owned = {}
  try {
    for (const [name, selector] of [['supabase', 'supabase'], ['vercel', 'vercel'], ['bypass', 'vercel-bypass']]) {
      if (signal.aborted) unavailable()
      owned[name] = readCredential(selector)
    }
    if (signal.aborted) unavailable()
    return owned
  } catch {
    for (const value of Object.values(owned)) value.fill(0)
    unavailable()
  }
}

/** The false gate precedes manifest checks, imports, journals, Keychain and network. */
export async function runStagingProviderNormalizationLiveOnce() {
  if (PROVIDER_NORMALIZATION_LIVE_ENABLED !== true) return disabled()
  checkManifests()
  const [session, phase, intent, supabase, vercel, surface, native] = await Promise.all([
    import('./staging-provider-normalization-session.mjs'),
    import('./staging-provider-normalization-phase-journal.mjs'),
    import('./staging-provider-normalization-journal.mjs'),
    import('./staging-account-hosted-baseline-supabase.mjs'),
    import('./staging-account-hosted-baseline-vercel.mjs'),
    import('./staging-account-hosted-baseline-surface.mjs'),
    import('./staging-provider-normalization-native-port.mjs'),
  ])
  const fetcher = globalThis.fetch
  if (typeof fetcher !== 'function') unavailable()
  return session.runStagingProviderNormalizationSession({
    readCredentials,
    openSupabase: managementToken => supabase.createStagingAccountHostedBaselineSupabaseBinding({ fetch: fetcher, managementToken }),
    openVercel: vercelToken => vercel.createStagingAccountHostedBaselineVercelBinding({ fetch: fetcher, vercelToken }),
    openSurface: (vercelToken, protectionBypassToken) => surface.createStagingAccountHostedBaselineSurfaceBinding({ fetch: fetcher, vercelToken, protectionBypassToken }),
    makeNativePort: ({ projectSecret, execute }) => native.createStagingProviderNormalizationNativePort({ projectSecret, execute, fetcher }),
    phaseJournal: phase.createProviderNormalizationPhaseJournal(),
    intentJournal: intent.createProviderNormalizationJournal(),
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runStagingProviderNormalizationLiveOnce())}\n`) }
  catch { process.stdout.write(`${JSON.stringify({ status: 'RECONCILIATION_REQUIRED' })}\n`); process.exitCode = 1 }
}
