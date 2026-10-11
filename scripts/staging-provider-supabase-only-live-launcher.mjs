#!/usr/bin/env node
/** Disabled one-shot entry for the exact staging provider disable. Never production. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SUPABASE_ONLY_PROVIDER_LIVE_ENABLED = false
export const SUPABASE_ONLY_PROVIDER_JOURNAL = fileURLToPath(new URL('../../implementation-state/staging/tll-provider-supabase-only-v1.json', import.meta.url))
export const SUPABASE_ONLY_PROVIDER_PHASE_JOURNAL = fileURLToPath(new URL('../../implementation-state/staging/tll-provider-supabase-only-phase-v1.json', import.meta.url))
const root = resolve(import.meta.dirname, '..')
const helper = resolve(import.meta.dirname, 'staging-provider-normalization-keychain.py')
const python = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
const pythonSha256 = 'ac60cfe0268614638d0ffa35f3b0284fc7b3a11482723793455e17eeb278509e'
const priorJournals = Object.freeze([
  resolve(dirname(SUPABASE_ONLY_PROVIDER_JOURNAL), 'tll-provider-normalization-phase-v1.json'),
  resolve(dirname(SUPABASE_ONLY_PROVIDER_JOURNAL), 'tll-provider-normalization-v1.json'),
])
const unavailable = () => { throw new Error('Staging Supabase-only provider launcher unavailable') }
const disabled = () => Object.freeze({ status: 'SUPABASE_ONLY_PROVIDER_LIVE_DISABLED', nativeAccessApproved: false })

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

function checkDisabledSourceAndPrivateState() {
  if (process.platform !== 'darwin') unavailable()
  const output = checkedChild(process.execPath, [resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs'), '--check'], 4_096)
  try { if (!Buffer.isBuffer(output) || output.length !== 0) unavailable() }
  finally { output?.fill?.(0) }
  const interpreter = readFileSync(python)
  try { if (createHash('sha256').update(interpreter).digest('hex') !== pythonSha256) unavailable() }
  finally { interpreter.fill(0) }
  const directory = dirname(SUPABASE_ONLY_PROVIDER_JOURNAL)
  const info = lstatSync(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid()
    || (info.mode & 0o777) !== 0o700) unavailable()
  for (const path of [...priorJournals, SUPABASE_ONLY_PROVIDER_JOURNAL, SUPABASE_ONLY_PROVIDER_PHASE_JOURNAL]) {
    try { lstatSync(path); unavailable() }
    catch (error) { if (error?.code !== 'ENOENT') unavailable() }
  }
}

function readManagementCredential() {
  const output = checkedChild(python, ['-I', '-S', helper, 'supabase'], 4_097)
  try {
    if (!Buffer.isBuffer(output) || output.length < 8 || output.length > 4_096 || output.includes(0)) unavailable()
    return Buffer.from(output)
  } finally { output?.fill?.(0) }
}

/** The false gate precedes manifest, Keychain, journal, and network access. */
export async function runSupabaseOnlyProviderLiveOnce() {
  if (SUPABASE_ONLY_PROVIDER_LIVE_ENABLED !== true) return disabled()
  checkDisabledSourceAndPrivateState()
  const [oldLauncher, session, supabase, native, bounded, journalModule, phaseModule] = await Promise.all([
    import('./staging-provider-normalization-live-launcher.mjs'),
    import('./staging-provider-supabase-only-session.mjs'),
    import('./staging-account-hosted-baseline-supabase.mjs'),
    import('./staging-provider-normalization-native-port.mjs'),
    import('./staging-bounded-executor.mjs'),
    import('./staging-provider-normalization-journal.mjs'),
    import('./staging-provider-normalization-phase-journal.mjs'),
  ])
  if (oldLauncher.PROVIDER_NORMALIZATION_LIVE_ENABLED !== false || typeof globalThis.fetch !== 'function') unavailable()
  const execute = bounded.createStagingBoundedExecutor()
  return session.runSupabaseOnlyProviderSession({
    readManagementCredential,
    openSupabase: managementToken => supabase.createStagingAccountHostedBaselineSupabaseBinding({
      fetch: globalThis.fetch, managementToken,
    }),
    makeNativePort: ({ projectSecret }) => native.createStagingProviderNormalizationNativePort({
      projectSecret, execute, fetcher: globalThis.fetch,
    }),
    execute,
    journal: journalModule.createProviderNormalizationJournal({ path: SUPABASE_ONLY_PROVIDER_JOURNAL }),
    phaseJournal: phaseModule.createProviderNormalizationPhaseJournal({ path: SUPABASE_ONLY_PROVIDER_PHASE_JOURNAL }),
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await runSupabaseOnlyProviderLiveOnce())}\n`) }
  catch { process.stdout.write(`${JSON.stringify({ status: 'RECONCILIATION_REQUIRED' })}\n`); process.exitCode = 1 }
}
