#!/usr/bin/env node
/** Disabled entry for a single read-only staging provider reconciliation. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROVIDER_SAFE_HELD_LIVE_ENABLED = false
export const PROVIDER_SAFE_HELD_JOURNAL = fileURLToPath(new URL('../../implementation-state/staging/tll-provider-safe-held-read-v1.json', import.meta.url))
const root = resolve(import.meta.dirname, '..')
const helper = resolve(import.meta.dirname, 'staging-provider-normalization-keychain.py')
const python = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
const pythonSha256 = 'ac60cfe0268614638d0ffa35f3b0284fc7b3a11482723793455e17eeb278509e'
const unavailable = () => { throw new Error('Staging provider read-only reconciliation launcher unavailable') }

function checkedChild(executable, args, maxBuffer) {
  const result = spawnSync(executable, args, { cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer })
  if (result.error || result.status !== 0 || result.signal || !Buffer.isBuffer(result.stdout)) {
    result.stdout?.fill?.(0); unavailable()
  }
  return result.stdout
}

function preflight() {
  if (process.platform !== 'darwin') unavailable()
  const output = checkedChild(process.execPath, [resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs'), '--check'], 4_096)
  try { if (output.length !== 0) unavailable() } finally { output.fill(0) }
  const interpreter = readFileSync(python)
  try { if (createHash('sha256').update(interpreter).digest('hex') !== pythonSha256) unavailable() }
  finally { interpreter.fill(0) }
  const info = lstatSync(dirname(PROVIDER_SAFE_HELD_JOURNAL))
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid()
    || (info.mode & 0o777) !== 0o700) unavailable()
  try { lstatSync(PROVIDER_SAFE_HELD_JOURNAL); unavailable() }
  catch (error) { if (error?.code !== 'ENOENT') unavailable() }
}

function readCredential() {
  const output = checkedChild(python, ['-I', '-S', helper, 'supabase'], 4_097)
  try {
    if (output.length < 8 || output.length > 4_096 || output.includes(0)) unavailable()
    return Buffer.from(output)
  } finally { output.fill(0) }
}

/** False gate precedes manifest, journal, Keychain and all network access. */
export async function runSafeHeldProviderLiveOnce() {
  if (PROVIDER_SAFE_HELD_LIVE_ENABLED !== true) return Object.freeze({ status: 'PROVIDER_SAFE_HELD_LIVE_DISABLED' })
  preflight()
  const [session, supabase, bounded, phaseModule, mutationModule, oldLauncher, newLauncher] = await Promise.all([
    import('./staging-provider-safe-held-reconciliation.mjs'),
    import('./staging-account-hosted-baseline-supabase.mjs'),
    import('./staging-bounded-executor.mjs'),
    import('./staging-provider-normalization-phase-journal.mjs'),
    import('./staging-provider-normalization-journal.mjs'),
    import('./staging-provider-normalization-live-launcher.mjs'),
    import('./staging-provider-supabase-only-live-launcher.mjs'),
  ])
  if (oldLauncher.PROVIDER_NORMALIZATION_LIVE_ENABLED !== false
    || newLauncher.SUPABASE_ONLY_PROVIDER_LIVE_ENABLED !== false || typeof globalThis.fetch !== 'function') unavailable()
  const mutationPath = resolve(dirname(PROVIDER_SAFE_HELD_JOURNAL), 'tll-provider-supabase-only-v1.json')
  const mutationPhasePath = resolve(dirname(PROVIDER_SAFE_HELD_JOURNAL), 'tll-provider-supabase-only-phase-v1.json')
  const mutation = mutationModule.createProviderNormalizationJournal({ path: mutationPath }).read()
  const mutationPhase = phaseModule.createProviderNormalizationPhaseJournal({ path: mutationPhasePath }).read()
  if (mutation?.state !== 'RECONCILIATION_REQUIRED' || mutationPhase?.phase !== 'UPDATE_DISPATCH'
    || mutationPhase.outcome !== 'RECONCILIATION_REQUIRED') unavailable()
  return session.reconcileSafeHeldProviderOnce({ readCredential,
    openSupabase: managementToken => supabase.createStagingAccountHostedBaselineSupabaseBinding({
      fetch: globalThis.fetch, managementToken,
    }),
    execute: bounded.createStagingBoundedExecutor(),
    journal: phaseModule.createProviderNormalizationPhaseJournal({ path: PROVIDER_SAFE_HELD_JOURNAL }),
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runSafeHeldProviderLiveOnce())}\n`) }
  catch { process.stdout.write(`${JSON.stringify({ status: 'RECONCILIATION_REQUIRED' })}\n`); process.exitCode = 1 }
}
