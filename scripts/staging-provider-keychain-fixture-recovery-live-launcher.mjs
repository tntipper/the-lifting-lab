#!/usr/bin/env node
/** Disabled entry point for one identity-bound V1 synthetic Keychain cleanup. */
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFixtureRecoveryJournal } from './staging-provider-keychain-fixture-recovery-journal.mjs'
import { assessRecoverySnapshot, captureRecoverySnapshot,
  parseRecoveryBuildIdentity } from './staging-provider-keychain-fixture-recovery-preflight.mjs'
import { classifyRecoveryChild,
  runFixtureRecoverySession } from './staging-provider-keychain-fixture-recovery-session.mjs'

export const TLL_FIXTURE_RECOVERY_LIVE_ENABLED = true
const root = resolve(import.meta.dirname, '..')
const privateRoot = resolve(root, '../implementation-state')
const privateDirectory = resolve(privateRoot, 'staging')
const journalPath = resolve(privateDirectory, 'tll-provider-keychain-fixture-recovery-v1.json')
const binary = resolve(privateDirectory, 'tll-provider-keychain-fixture-recovery-armed-v1')
const builder = resolve(import.meta.dirname, 'staging-provider-keychain-fixture-recovery-build.mjs')
const environment = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' })
const fixed = (status, category = null) => Object.freeze({ status, category })

function privateDirectories() {
  for (const path of [privateRoot, privateDirectory]) {
    const stat = fs.lstatSync(path)
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
      || (stat.mode & 0o777) !== 0o700) return false
  }
  return true
}

function journalAbsent() {
  try { fs.lstatSync(journalPath); return false }
  catch (error) { return error?.code === 'ENOENT' }
}

function buildIdentity() {
  const result = spawnSync(process.execPath, [builder, '--check-armed'], { cwd: root,
    env: environment, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, maxBuffer: 4_096 })
  try {
    if (result.error || result.signal || result.status !== 0 || result.stderr.length !== 0) return null
    return parseRecoveryBuildIdentity(JSON.parse(result.stdout.toString('utf8')), 'armed')
  } catch { return null }
  finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
}

function manifestCurrent() {
  const result = spawnSync(process.execPath,
    [resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs'), '--check'], {
      cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, maxBuffer: 1_024 })
  try { return !result.error && !result.signal && result.status === 0
    && result.stdout?.length === 0 && result.stderr?.length === 0 }
  finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
}

function runNative(phase, timeout) {
  const result = spawnSync(binary, [phase], { cwd: root, env: environment,
    stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: 256 })
  try { return classifyRecoveryChild(result, phase) }
  finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
}

function observe(phase) {
  try { return assessRecoverySnapshot(captureRecoverySnapshot(), phase) }
  catch { return false }
}

async function runOnce() {
  if (TLL_FIXTURE_RECOVERY_LIVE_ENABLED !== true) return fixed('RECOVERY_DISABLED')
  try {
    if (process.argv.length !== 2 || !privateDirectories() || !journalAbsent()
      || !manifestCurrent()) return fixed('HOLD', 'PREFLIGHT')
    const identity = buildIdentity()
    if (!identity) return fixed('HOLD', 'BUILD')
    return runFixtureRecoverySession({ journal: createFixtureRecoveryJournal({ path: journalPath }),
      identity, preflight: () => privateDirectories() && observe('initial'),
      preDispatch: () => {
        const current = buildIdentity()
        return !!current && current.sourceSha256 === identity.sourceSha256
          && current.binarySha256 === identity.binarySha256
      },
      runNative,
      reconcileMain: () => observe('afterApi'),
      reconcileSidecar: () => observe('afterSidecar'),
      reconcileFinal: () => observe('final') })
  } catch { return fixed('HOLD', 'PREFLIGHT') }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runOnce())}\n`)
}
