#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  HOSTED_BASELINE_SESSION_DEADLINE_MS,
  HOSTED_BASELINE_SESSION_PRODUCTION_EXCLUDED,
  HOSTED_BASELINE_SESSION_TARGET,
} from './staging-account-hosted-baseline-session.mjs'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'config/staging-account-hosted-baseline-manifest.json')
const sources = [
  'scripts/staging-account-hosted-baseline.mjs',
  'scripts/staging-account-hosted-baseline-database.mjs',
  'scripts/staging-generation-21-credentials.mjs',
  'scripts/staging-account-hosted-baseline-supabase.mjs',
  'scripts/staging-account-hosted-baseline-vercel.mjs',
  'scripts/staging-account-hosted-baseline-surface.mjs',
  'scripts/staging-account-hosted-baseline-composition.mjs',
  'scripts/staging-provider-broker-native-binding.mjs',
  'scripts/staging-provider-broker-native-adapter.mjs',
  'scripts/staging-provider-broker-rotation.mjs',
  'scripts/staging-surface-activation-transport.mjs',
  'scripts/staging-surface-activation-native-binding.mjs',
  'scripts/staging-surface-activation-native-adapter.mjs',
  'scripts/staging-account-hosted-baseline-session.mjs',
  'scripts/staging-account-hosted-baseline-live-launcher.mjs',
  'scripts/staging-account-hosted-baseline-keychain.py',
  'scripts/staging-account-hosted-baseline-manifest.mjs',
  'tests/staging-account-hosted-baseline-session.test.mjs',
  'tests/staging-account-hosted-baseline-composition.test.mjs',
  'tests/staging-account-hosted-baseline-manifest.test.mjs',
  'package.json',
  'package-lock.json',
  'docs/ops/stage-plans/2026-09-22-fresh-readonly-hosted-baseline.md',
]
const hash = async path => createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')
const sourcePins = await Promise.all(sources.map(async path => ({ path, sha256: await hash(path) })))
// Read the pinned gate as data. Importing the live entry point here deadlocks
// its own top-level await when it dynamically imports this manifest.
const launcher = await readFile(resolve(root, 'scripts/staging-account-hosted-baseline-live-launcher.mjs'), 'utf8')
const launcherApproval = /^export const HOSTED_BASELINE_LIVE_ENABLED = (true|false)$/m.exec(launcher)?.[1]
const helper = await readFile(resolve(root, 'scripts/staging-account-hosted-baseline-keychain.py'), 'utf8')
const helperApproval = /^APPROVED_NATIVE_READ = (True|False)$/m.exec(helper)?.[1]
if (launcherApproval === undefined || helperApproval === undefined || (helperApproval === 'True') !== (launcherApproval === 'true')) throw Error('hosted-baseline native gates disagree')

export const hostedBaselineManifest = Object.freeze({
  schema: 'tll-staging-hosted-baseline-manifest/v1',
  target: { projectRef: HOSTED_BASELINE_SESSION_TARGET, productionProjectRefExcluded: HOSTED_BASELINE_SESSION_PRODUCTION_EXCLUDED },
  nativeAccessApproved: launcherApproval === 'true',
  sources: sourcePins,
  keychain: { supabase: { service: 'Supabase CLI', account: 'supabase' }, vercel: { service: 'TLL Hosted Baseline Vercel API', account: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4' }, vercelBypass: { service: 'TLL Hosted Baseline Preview Bypass', account: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4' } },
  endpoints: { supabaseManagement: `https://api.supabase.com/v1/projects/${HOSTED_BASELINE_SESSION_TARGET}`, vercel: 'https://api.vercel.com', surface: `https://${HOSTED_BASELINE_SESSION_TARGET}.supabase.co` },
  journal: { path: '../implementation-state/staging/tll-hosted-baseline-observation-v5.json', exclusive: true, mode: '0600' },
  execution: { deadlineMs: HOSTED_BASELINE_SESSION_DEADLINE_MS, retries: 0, observationOnly: true },
})
const serialized = `${JSON.stringify(hostedBaselineManifest, null, 2)}\n`
export async function assertCurrentHostedBaselineManifest () {
  const current = await readFile(output, 'utf8')
  if (current !== serialized) throw Error('Staging hosted baseline manifest is stale')
  return hostedBaselineManifest
}
if (process.argv.includes('--check')) {
  try { await assertCurrentHostedBaselineManifest() } catch { process.exitCode = 1 }
} else if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await writeFile(output, serialized, { mode: 0o644 })
