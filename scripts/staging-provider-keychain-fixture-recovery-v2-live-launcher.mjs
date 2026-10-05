#!/usr/bin/env node
/** Disabled, distinct one-use V2 recovery. No V1 journal can be replayed here. */
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPinnedV2Baseline } from './staging-provider-keychain-fixture-recovery-v2-baseline.mjs'
import { createFixtureRecoveryV2Journal } from './staging-provider-keychain-fixture-recovery-v2-journal.mjs'
import { observeV2Recovery, parseRecoveryV2BuildIdentity } from './staging-provider-keychain-fixture-recovery-v2-preflight.mjs'
import { runFixtureRecoveryV2Session } from './staging-provider-keychain-fixture-recovery-v2-session.mjs'
import { readVerifiedArtifact } from './staging-provider-keychain-fixture-metadata-build.mjs'

export const TLL_FIXTURE_RECOVERY_V2_LIVE_ENABLED = false
const root = resolve(import.meta.dirname, '..')
const privateRoot = resolve(root, '../implementation-state')
const state = resolve(privateRoot, 'staging')
const journalPath = resolve(state, 'tll-provider-keychain-fixture-recovery-v2.json')
const baselinePath = resolve(state, 'tll-provider-keychain-fixture-recovery-v2-baseline.json')
const binaryPath = resolve(state, 'tll-provider-keychain-fixture-recovery-v2-armed')
const builder = resolve(import.meta.dirname, 'staging-provider-keychain-fixture-recovery-v2-build.mjs')
const manifest = resolve(import.meta.dirname, 'staging-account-activation-manifest.mjs')
const environment = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' })
const fixed = (status, category = null) => Object.freeze({ status, category })
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

function privateDirectories() {
  for (const path of [privateRoot, state]) {
    const stat = fs.lstatSync(path)
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
      || (stat.mode & 0o777) !== 0o700) return false
  }
  return true
}

function absent(path) {
  try { fs.lstatSync(path); return false }
  catch (error) { return error?.code === 'ENOENT' }
}

function checkCommand(command, args, maximum = 4096) {
  const result = spawnSync(command, args, { cwd: root, env: environment,
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, maxBuffer: maximum })
  try {
    return !result.error && !result.signal && result.status === 0
      && result.stderr?.length === 0 ? result.stdout?.toString('utf8') : null
  } finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
}

function buildIdentity() {
  try {
    const output = checkCommand(process.execPath, [builder, '--check-armed'])
    return output === null ? null : parseRecoveryV2BuildIdentity(JSON.parse(output), 'armed')
  } catch { return null }
}

function manifestCurrent() {
  return checkCommand(process.execPath, [manifest, '--check'], 1024) === ''
}

function createRunCopy(identity) {
  const artifact = readVerifiedArtifact(binaryPath, 0o700, 32_000_000)
  const directory = resolve(state, `.tll-fixture-recovery-v2-run-${randomUUID()}`)
  let directoryIdentity, copyIdentity
  try {
    if (sha(artifact.bytes) !== identity.binarySha256) throw Error('V2 binary changed')
    fs.mkdirSync(directory, { mode: 0o700 })
    const created = fs.lstatSync(directory)
    directoryIdentity = { dev: created.dev, ino: created.ino }
    const copy = resolve(directory, 'recovery')
    fs.writeFileSync(copy, artifact.bytes, { flag: 'wx', mode: 0o700 })
    const verified = readVerifiedArtifact(copy, 0o700, 32_000_000)
    try {
      if (sha(verified.bytes) !== identity.binarySha256) throw Error('V2 run copy changed')
      copyIdentity = { dev: verified.stat.dev, ino: verified.stat.ino }
    } finally { verified.bytes.fill(0) }
    return Object.freeze({ directory, copy, directoryIdentity, copyIdentity })
  } catch (error) {
    if (directoryIdentity) {
      if (copyIdentity) removeRunCopy({ directory, copy: resolve(directory, 'recovery'),
        directoryIdentity, copyIdentity })
      else {
        const named = fs.lstatSync(directory)
        if (named.isDirectory() && !named.isSymbolicLink()
          && named.dev === directoryIdentity.dev && named.ino === directoryIdentity.ino
          && named.uid === process.getuid() && (named.mode & 0o777) === 0o700
          && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory)
      }
    }
    throw error
  } finally { artifact.bytes.fill(0) }
}

function removeRunCopy(copy) {
  const directory = fs.lstatSync(copy.directory), executable = fs.lstatSync(copy.copy)
  if (!directory.isDirectory() || directory.isSymbolicLink()
    || directory.uid !== process.getuid() || (directory.mode & 0o777) !== 0o700
    || directory.dev !== copy.directoryIdentity.dev || directory.ino !== copy.directoryIdentity.ino
    || !executable.isFile() || executable.isSymbolicLink()
    || executable.uid !== process.getuid() || executable.nlink !== 1
    || (executable.mode & 0o777) !== 0o700
    || executable.dev !== copy.copyIdentity.dev || executable.ino !== copy.copyIdentity.ino
    || fs.readdirSync(copy.directory).join('|') !== 'recovery') {
    throw Error('V2 run copy changed')
  }
  fs.unlinkSync(copy.copy)
  fs.rmdirSync(copy.directory)
}

function classifyChild(result, phase) {
  try {
    return !result.error && !result.signal && result.status === 0
      && Buffer.isBuffer(result.stdout) && Buffer.isBuffer(result.stderr)
      && result.stderr.length === 0 && result.stdout.length <= 128
      && result.stdout.toString('utf8') === `${phase}_PASS\n`
      ? fixed('PASS') : fixed('HOLD', 'NATIVE')
  } finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
}

async function runOnce() {
  if (TLL_FIXTURE_RECOVERY_V2_LIVE_ENABLED !== true) return fixed('RECOVERY_DISABLED')
  let copy
  const execute = () => {
    if (process.argv.length !== 2 || !privateDirectories() || !absent(journalPath)
      || !absent(baselinePath) || !manifestCurrent()
      || !observeV2Recovery('initial')) return fixed('HOLD', 'PREFLIGHT')
    const identity = buildIdentity()
    if (!identity) return fixed('HOLD', 'BUILD')
    copy = createRunCopy(identity)
    const journal = createFixtureRecoveryV2Journal({ path: journalPath })
    const runNative = (phase, timeout) => classifyChild(spawnSync(copy.copy, [phase], {
      cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
      timeout, maxBuffer: 256 }), phase)
    let recordIdentity
    return runFixtureRecoveryV2Session({ journal, identity,
      preflight: () => privateDirectories() && manifestCurrent()
        && observeV2Recovery('initial'),
      captureBaseline: () => {
        const child = runNative('CAPTURE_BASELINE', 8_000)
        if (child.status !== 'PASS') return child
        const record = journal.read()
        recordIdentity = { runId: record.runId, ...identity }
        return { status: 'PASS', sha256: readPinnedV2Baseline({
          path: baselinePath, expected: recordIdentity }).sha256 }
      },
      verifyBaseline: digest => {
        try { return readPinnedV2Baseline({ path: baselinePath,
          expected: recordIdentity, digest }).sha256 === digest } catch { return false }
      },
      preDispatch: () => {
        const current = buildIdentity()
        return !!current && current.sourceSha256 === identity.sourceSha256
          && current.binarySha256 === identity.binarySha256
          && privateDirectories() && manifestCurrent()
      },
      runNative,
      reconcileMain: () => observeV2Recovery('afterApi'),
      reconcileSidecar: () => observeV2Recovery('afterSidecar'),
      reconcileFinal: () => observeV2Recovery('final'),
    })
  }
  let outcome
  try { outcome = execute() } catch { outcome = fixed('HOLD', 'PREFLIGHT') }
  if (copy) {
    try { removeRunCopy(copy) } catch { return fixed('UNCERTAIN', 'SCRATCH') }
  }
  return outcome
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await runOnce())}\n`)
}
