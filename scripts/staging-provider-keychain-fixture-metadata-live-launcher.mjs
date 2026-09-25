#!/usr/bin/env node
/** Disabled fixed-target, read-only observation of the preserved synthetic fixture. */
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { userInfo } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFixtureMetadataJournal } from './staging-provider-keychain-fixture-metadata-journal.mjs'
import { runMetadataSession } from './staging-provider-keychain-fixture-metadata-session.mjs'

export const TLL_FIXTURE_METADATA_LIVE_ENABLED = false
const root = resolve(import.meta.dirname, '..')
const privateRoot = resolve(root, '../implementation-state')
const directory = resolve(privateRoot, 'staging')
const journalPath = resolve(directory, 'tll-provider-keychain-fixture-metadata-v1.json')
const binary = resolve(directory, 'tll-provider-keychain-fixture-metadata-armed-v1')
const builder = resolve(import.meta.dirname, 'staging-provider-keychain-fixture-metadata-build.mjs')
const manifest = resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs')
const fixtureDirectory = resolve(userInfo().homedir, 'Library/Caches/tll-stage3-keychain-fixture')
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

function fixtureIdentity() {
  const expected = [
    [fixtureDirectory, 144003366, 0o700, 'directory', null, null],
    [resolve(fixtureDirectory, 'tll-stage3-fixture.keychain-db'),
      144003379, 0o644, 'file', 1, 20460],
    [resolve(fixtureDirectory, '.flA673ACC0'), 144003377, 0o444, 'file', 1, 0],
  ]
  for (const [path, inode, permissions, kind, links, size] of expected) {
    const stat = fs.lstatSync(path)
    if (stat.isSymbolicLink() || stat.dev !== 16777234 || stat.ino !== inode
      || stat.uid !== 501 || (stat.mode & 0o777) !== permissions
      || (kind === 'directory' ? !stat.isDirectory() : !stat.isFile())
      || (links !== null && stat.nlink !== links)
      || (size !== null && stat.size !== size)) return false
  }
  const names = fs.readdirSync(fixtureDirectory).sort()
  return names.join('|') === '.flA673ACC0|tll-stage3-fixture.keychain-db'
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
    return record.status === 'ARMED_METADATA_BINARY_VERIFIED'
      && /^[a-f0-9]{64}$/.test(record.sourceSha256)
      && /^[a-f0-9]{64}$/.test(record.binarySha256)
      ? Object.freeze({ sourceSha256: record.sourceSha256, binarySha256: record.binarySha256 }) : null
  } catch { return null }
  finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
}

function runNative() {
  return spawnSync(binary, ['--read-only'], {
    cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 8_000, maxBuffer: 128 })
}

function runOnce() {
  if (TLL_FIXTURE_METADATA_LIVE_ENABLED !== true) return fixed('DIAGNOSTIC_DISABLED')
  try {
    if (process.argv.length !== 2 || !privateDirectories() || !fixtureIdentity()
      || !manifestCurrent()) return fixed('HOLD', 'PREFLIGHT')
    const identity = buildIdentity()
    if (!identity) return fixed('HOLD', 'PREFLIGHT')
    const journal = createFixtureMetadataJournal({ path: journalPath })
    if (journal.read()) return fixed('HOLD', 'PREFLIGHT')
    return runMetadataSession({ journal, identity,
      preflight: () => privateDirectories() && fixtureIdentity()
        && manifestCurrent() && JSON.stringify(buildIdentity()) === JSON.stringify(identity),
      runNative,
    })
  } catch { return fixed('HOLD', 'PREFLIGHT') }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(runOnce())}\n`)
}
