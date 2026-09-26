#!/usr/bin/env node
/** Disabled, dedicated local-only Keychain readiness entry point. */
import { spawnSync } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CREDENTIAL_READINESS_LIVE_ENABLED = false
const root = resolve(import.meta.dirname, '..')
const privateRoot = resolve(root, '../implementation-state')
const privateDirectory = resolve(privateRoot, 'staging')
const helper = resolve(import.meta.dirname, 'staging-provider-normalization-keychain.py')
const environment = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' })
const unavailable = () => { throw Error('Staging credential readiness unavailable') }
const disabled = () => Object.freeze({ status: 'CREDENTIAL_READINESS_DISABLED', category: null, elapsedSeconds: null })

function assertPrivateState() {
  for (const path of [privateRoot, privateDirectory]) {
    const stat = lstatSync(path)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700
      || stat.uid !== process.getuid()) unavailable()
  }
  for (const filename of ['tll-provider-normalization-phase-v1.json', 'tll-provider-normalization-v1.json']) {
    try { lstatSync(resolve(privateDirectory, filename)); unavailable() }
    catch (error) { if (error?.code !== 'ENOENT') unavailable() }
  }
}

function checkManifest() {
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs'), '--check'], {
    cwd: root, env: environment, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer: 4_096,
  })
  try { if (result.error || result.status !== 0 || result.signal || result.stdout?.length !== 0) unavailable() }
  finally { result.stdout?.fill?.(0) }
}

export async function runCredentialReadinessLiveOnce() {
  if (CREDENTIAL_READINESS_LIVE_ENABLED !== true) return disabled()
  try {
    assertPrivateState()
    checkManifest()
    const { createCredentialReadinessPhaseJournal } = await import('./staging-provider-credential-readiness-phase-journal.mjs')
    const { runCredentialReadinessSession } = await import('./staging-provider-credential-readiness-session.mjs')
    const { createCredentialReadinessNative } = await import('./staging-provider-credential-readiness-native.mjs')
    const readCredential = createCredentialReadinessNative({ spawnChild: spawnSync, root, helper })
    return runCredentialReadinessSession({ readCredential, phaseJournal: createCredentialReadinessPhaseJournal() })
  } catch { return Object.freeze({ status: 'HOLD', category: 'INTERNAL', elapsedSeconds: null }) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runCredentialReadinessLiveOnce())}\n`)
}
