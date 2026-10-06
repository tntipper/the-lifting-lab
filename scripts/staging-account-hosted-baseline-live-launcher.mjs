#!/usr/bin/env node
/**
 * Deliberately disabled entry point for the one-shot hosted baseline.
 * No command-line argument or environment value can arm this module.
 */
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  createStagingWindowPhaseJournal,
  createHostedBaselineCompositionFromFactories,
  HOSTED_BASELINE_SESSION_JOURNAL_PATH,
  HOSTED_BASELINE_SESSION_TARGET,
  runHostedBaselineSession,
} from './staging-account-hosted-baseline-session.mjs'

export const HOSTED_BASELINE_LIVE_ENABLED = false
export const HOSTED_BASELINE_LIVE_HELPER_PATH = resolve(import.meta.dirname, 'staging-account-hosted-baseline-keychain.py')
export const HOSTED_BASELINE_LIVE_JOURNAL_PATH = HOSTED_BASELINE_SESSION_JOURNAL_PATH

const disabled = () => Object.freeze({ status: 'HOSTED_BASELINE_LIVE_DISABLED', target: HOSTED_BASELINE_SESSION_TARGET, nativeAccessApproved: false })

async function createFutureApprovedComposition ({ supabaseCredential, vercelCredential, protectionBypassCredential, signal }) {
  const [
    { createStagingAccountHostedBaselineSupabaseBinding },
    { createStagingAccountHostedBaselineVercelBinding },
    { createStagingAccountHostedBaselineSurfaceBinding },
    { createStagingAccountHostedBaselineComposition },
  ] = await Promise.all([
    import('./staging-account-hosted-baseline-supabase.mjs'),
    import('./staging-account-hosted-baseline-vercel.mjs'),
    import('./staging-account-hosted-baseline-surface.mjs'),
    import('./staging-account-hosted-baseline-composition.mjs'),
  ])
  if (signal.aborted) throw Error('Staging hosted baseline unavailable')
  return createHostedBaselineCompositionFromFactories({
    factories: Object.freeze({ supabase: createStagingAccountHostedBaselineSupabaseBinding, vercel: createStagingAccountHostedBaselineVercelBinding,
      surface: createStagingAccountHostedBaselineSurfaceBinding, composition: createStagingAccountHostedBaselineComposition }),
    supabaseCredential, vercelCredential, protectionBypassCredential, fetch: globalThis.fetch,
  })
}

async function readFutureApprovedCredential (selector) {
  const { spawnSync } = await import('node:child_process')
  const result = spawnSync('/usr/bin/python3', ['-I', '-S', HOSTED_BASELINE_LIVE_HELPER_PATH, selector], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer: 4097,
  })
  const output = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0)
  try {
    if (result.status !== 0 || output.length < 8 || output.length > 4096) throw Error('Staging hosted baseline credential unavailable')
    return Buffer.from(output)
  } finally { output.fill(0) }
}

/** This remains fail-closed until a minimal, independently reviewed arming diff. */
export async function runHostedBaselineLiveOnce () {
  // This check intentionally precedes dynamic imports of the Keychain helper,
  // network bindings, and global fetch use.
  if (HOSTED_BASELINE_LIVE_ENABLED !== true) return disabled()
  const { assertCurrentHostedBaselineManifest } = await import('./staging-account-hosted-baseline-manifest.mjs')
  return runHostedBaselineSession({
    verifyManifest: assertCurrentHostedBaselineManifest,
    journal: createStagingWindowPhaseJournal({ path: HOSTED_BASELINE_LIVE_JOURNAL_PATH }),
    readCredential: readFutureApprovedCredential,
    createComposition: createFutureApprovedComposition,
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runHostedBaselineLiveOnce()
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
