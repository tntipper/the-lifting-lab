#!/usr/bin/env node
/** Disabled fixed-target, read-only observation of Keychain search-list metadata. */
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSearchDomainJournal } from './staging-provider-keychain-search-domain-journal.mjs'
import { runSearchDomainSession } from './staging-provider-keychain-search-domain-session.mjs'
import { readVerifiedArtifact } from './staging-provider-keychain-search-domain-build.mjs'

export const TLL_SEARCH_DOMAIN_LIVE_ENABLED = false
const root = resolve(import.meta.dirname, '..')
const privateRoot = resolve(root, '../implementation-state')
const directory = resolve(privateRoot, 'staging')
const journalPath = resolve(directory, 'tll-provider-keychain-search-domain-v1.json')
const binary = resolve(directory, 'tll-provider-keychain-search-domain-armed-v1')
const builder = resolve(import.meta.dirname, 'staging-provider-keychain-search-domain-build.mjs')
const manifest = resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs')
const environment = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' })
const fixed = (status, category = null) => Object.freeze({ status, category })

function privateDirectories() {
  for (const path of [privateRoot, directory]) {
    const stat = fs.lstatSync(path)
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
      || (stat.mode & 0o777) !== 0o700) return false
  }
  return true
}

function manifestCurrent() {
  const result = spawnSync(process.execPath, [manifest, '--check'], {
    cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15_000, maxBuffer: 1_024 })
  try { return !result.error && !result.signal && result.status === 0
    && result.stdout?.length === 0 && result.stderr?.length === 0 }
  finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
}

function buildIdentity() {
  const result = spawnSync(process.execPath, [builder, '--check-armed'], {
    cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15_000, maxBuffer: 1_024 })
  try {
    if (result.error || result.signal || result.status !== 0 || result.stderr?.length !== 0) return null
    const record = JSON.parse(result.stdout.toString('utf8'))
    return record.status === 'ARMED_SEARCH_DOMAIN_BINARY_VERIFIED'
      && /^[a-f0-9]{64}$/.test(record.sourceSha256)
      && /^[a-f0-9]{64}$/.test(record.binarySha256)
      ? Object.freeze({ sourceSha256: record.sourceSha256, binarySha256: record.binarySha256 }) : null
  } catch { return null }
  finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
}

function runNative(identity) {
  // Execute a private copy of the exact verified bytes, so pathname replacement
  // between build check and child dispatch cannot redirect the diagnostic.
  const artifact = readVerifiedArtifact(binary, 0o700, 32_000_000)
  let scratch
  try {
    const digest = createHash('sha256').update(artifact.bytes).digest('hex')
    if (digest !== identity.binarySha256) throw Error('Binary identity changed')
    scratch = resolve(directory, `.tll-search-domain-run-${randomUUID()}`)
    fs.mkdirSync(scratch, { mode: 0o700 })
    const snapshot = resolve(scratch, 'tll-provider-keychain-search-domain-armed-v1')
    fs.writeFileSync(snapshot, artifact.bytes, { flag: 'wx', mode: 0o700 })
    return spawnSync(snapshot, ['--read-only'], {
      cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 8_000, maxBuffer: 256 })
  } finally {
    artifact.bytes.fill(0)
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true })
  }
}

function runOnce() {
  if (TLL_SEARCH_DOMAIN_LIVE_ENABLED !== true) return fixed('DIAGNOSTIC_DISABLED')
  try {
    if (process.argv.length !== 2 || !privateDirectories() || !manifestCurrent())
      return fixed('HOLD', 'PREFLIGHT')
    const identity = buildIdentity()
    if (!identity) return fixed('HOLD', 'PREFLIGHT')
    const journal = createSearchDomainJournal({ path: journalPath })
    if (journal.read()) return fixed('HOLD', 'PREFLIGHT')
    return runSearchDomainSession({ journal, identity,
      // No native read occurs before the journal records dispatch intent.
      preflight: () => privateDirectories() && manifestCurrent()
        && JSON.stringify(buildIdentity()) === JSON.stringify(identity),
      runNative: () => runNative(identity),
    })
  } catch { return fixed('HOLD', 'PREFLIGHT') }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(runOnce())}\n`)
}
