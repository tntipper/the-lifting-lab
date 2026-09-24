#!/usr/bin/env node
/** Disabled one-use entry point for a wholly local, synthetic Keychain fixture. */
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TLL_FIXTURE_LIVE_ENABLED = false
const root = resolve(import.meta.dirname, '..')
const privateRoot = resolve(root, '../implementation-state')
const privateDirectory = resolve(privateRoot, 'staging')
const journalPath = resolve(privateDirectory, 'tll-provider-keychain-fixture-v1.json')
const nativeJournalPath = resolve(privateDirectory, 'tll-provider-keychain-fixture-native-v1.json')
const binary = resolve(privateDirectory, 'tll-provider-keychain-fixture-disabled-v1')
const fixtureDirectory = resolve(homedir(), 'Library/Caches/tll-stage3-keychain-fixture')
const environment = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' })
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const held = () => Object.freeze({ status: 'HOLD', category: 'PREFLIGHT' })

function privateState() {
  for (const path of [privateRoot, privateDirectory]) {
    const stat = fs.lstatSync(path)
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
      || (stat.mode & 0o777) !== 0o700) return false
  }
  return true
}

function fixtureAbsent() {
  try { fs.lstatSync(fixtureDirectory); return false }
  catch (error) { return error?.code === 'ENOENT' }
}

function nativeReceiptAbsent() {
  try { fs.lstatSync(nativeJournalPath); return false }
  catch (error) { return error?.code === 'ENOENT' }
}

function fixtureClean() {
  try {
    const stat = fs.lstatSync(fixtureDirectory)
    return stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid()
      && (stat.mode & 0o777) === 0o700 && fs.readdirSync(fixtureDirectory).length === 0
  } catch (error) { return error?.code === 'ENOENT' }
}

function nativeReceipt(parent, assess) {
  try {
    const stat = fs.lstatSync(nativeJournalPath)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid()
      || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 4_096) return 'HOLD'
    return assess(JSON.parse(fs.readFileSync(nativeJournalPath, 'utf8')), parent)
  } catch { return 'HOLD' }
}

function checkedCommand(path, args) {
  const result = spawnSync(path, args, { cwd: root, env: environment,
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, maxBuffer: 4_096 })
  try {
    return !result.error && !result.signal && result.status === 0
      && result.stderr?.length === 0
  } finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
}

function buildIdentity() {
  const result = spawnSync(process.execPath,
    [resolve(import.meta.dirname, 'staging-provider-keychain-fixture-build.mjs'), '--check'],
    { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, maxBuffer: 4_096 })
  try {
    if (result.error || result.signal || result.status !== 0 || result.stderr?.length !== 0) return null
    const value = JSON.parse(result.stdout.toString('utf8'))
    if (!exact(value, ['status', 'schema', 'sourceSha256', 'fixtureSha256', 'binarySha256',
      'architecture', 'signingIdentifier', 'signingKind'])
      || value.status !== 'DISABLED_FIXTURE_BINARY_VERIFIED'
      || value.schema !== 'tll-disabled-disposable-keychain-build/v1'
      || value.architecture !== 'arm64' || value.signingKind !== 'adhoc'
      || value.signingIdentifier !== 'tll-provider-keychain-fixture-disabled-v1'
      || [value.sourceSha256, value.fixtureSha256, value.binarySha256]
        .some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) return null
    return Object.freeze({ sourceSha256: value.sourceSha256,
      fixtureSha256: value.fixtureSha256, binarySha256: value.binarySha256 })
  } catch { return null }
  finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
}

function runNative(classify) {
  fs.mkdirSync(fixtureDirectory, { mode: 0o700 })
  const fixtureStat = fs.lstatSync(fixtureDirectory)
  if (!fixtureStat.isDirectory() || fixtureStat.isSymbolicLink()
    || fixtureStat.uid !== process.getuid() || (fixtureStat.mode & 0o777) !== 0o700
    || fs.readdirSync(fixtureDirectory).length !== 0) return Object.freeze({ status: 'UNCERTAIN' })
  const result = spawnSync(binary, [], { cwd: root, env: environment,
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 2_048 })
  try {
    return classify(result)
  } finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
}

export async function runFixtureLiveOnce() {
  if (TLL_FIXTURE_LIVE_ENABLED !== true) return Object.freeze({ status: 'FIXTURE_DISABLED', category: null })
  try {
    if (!privateState() || !fixtureAbsent() || !nativeReceiptAbsent()
      || !checkedCommand(process.execPath, [resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs'), '--check'])) return held()
    const identity = buildIdentity()
    if (!identity) return held()
    const { createFixturePhaseJournal } = await import('./staging-provider-keychain-fixture-phase-journal.mjs')
    const { runFixtureSession, classifyFixtureNative, assessFixtureNativeReceipt } =
      await import('./staging-provider-keychain-fixture-session.mjs')
    return runFixtureSession({ journal: createFixturePhaseJournal({ path: journalPath }), identity,
      preflight: () => privateState() && fixtureAbsent() && nativeReceiptAbsent(),
      runNative: () => runNative(classifyFixtureNative),
      reconcile: (parent, result) => fixtureClean()
        && (result.status === 'HOLD' || nativeReceipt(parent, assessFixtureNativeReceipt) === 'PASS') })
  } catch { return held() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runFixtureLiveOnce())}\n`)
}
