#!/usr/bin/env node
/** Source-bound build/check for the fixed-target synthetic fixture recovery. Never runs it. */
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readVerifiedArtifact } from './staging-provider-keychain-fixture-metadata-build.mjs'

const root = resolve(import.meta.dirname, '..')
const source = resolve(import.meta.dirname, 'staging-provider-keychain-fixture-recovery-v2-native.swift')
const privateRoot = resolve(root, '../implementation-state')
const directory = resolve(privateRoot, 'staging')
const fail = () => { throw Error('V2 synthetic fixture recovery build unavailable') }
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fileHash = path => sha(fs.readFileSync(path))
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const name = kind => `tll-provider-keychain-fixture-recovery-v2-${kind}`
const schema = kind => `tll-fixture-recovery-v2-${kind}-build/v2`
const status = kind => `${kind.toUpperCase()}_RECOVERY_BINARY_VERIFIED`

function privateDirectory(path) {
  const stat = fs.lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || (stat.mode & 0o777) !== 0o700) fail()
}

function newScratch(prefix) {
  const path = resolve(directory, `.${prefix}-${randomUUID()}`)
  fs.mkdirSync(path, { mode: 0o700 })
  const stat = fs.lstatSync(path)
  return { path, dev: stat.dev, ino: stat.ino, leaves: new Map() }
}

function remember(scratch, path) {
  const stat = fs.lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || stat.nlink !== 1) fail()
  scratch.leaves.set(path, { dev: stat.dev, ino: stat.ino })
}

function removeScratch(scratch) {
  if (!scratch) return
  const directoryStat = fs.lstatSync(scratch.path)
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()
    || directoryStat.uid !== process.getuid() || (directoryStat.mode & 0o777) !== 0o700
    || directoryStat.dev !== scratch.dev || directoryStat.ino !== scratch.ino) fail()
  const expected = [...scratch.leaves.keys()]
  if (fs.readdirSync(scratch.path).sort().join('|') !== expected.map(path => path.split('/').at(-1)).sort().join('|')) fail()
  for (const path of expected) {
    const stat = fs.lstatSync(path), identity = scratch.leaves.get(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid()
      || stat.nlink !== 1 || stat.dev !== identity.dev || stat.ino !== identity.ino) fail()
    fs.unlinkSync(path)
  }
  fs.rmdirSync(scratch.path)
}

export function sourceForKind(body, kind) {
  if (typeof body !== 'string' || !['disabled', 'armed'].includes(kind)
    || (body.match(/\bTLL_FIXTURE_RECOVERY_V2_ENABLED\s*=\s*(?:false|true)\b/g) ?? []).length !== 1
    || !new RegExp(`\\bTLL_FIXTURE_RECOVERY_V2_ENABLED\\s*=\\s*${kind === 'armed' ? 'true' : 'false'}\\b`).test(body)) fail()
}

export function validRecoveryArtifact(record, actual, binaryStat, receiptStat, uid, kind) {
  return ['disabled', 'armed'].includes(kind)
    && exact(record, ['schema', 'sourceSha256', 'binarySha256', 'architecture',
      'signingIdentifier', 'signingKind'])
    && record.schema === schema(kind) && record.sourceSha256 === actual?.sourceSha256
    && record.binarySha256 === actual?.binarySha256 && record.architecture === 'arm64'
    && record.signingIdentifier === name(kind) && record.signingKind === 'adhoc'
    && actual.architecture === 'arm64' && actual.signingIdentifier === name(kind)
    && actual.signingKind === 'adhoc'
    && binaryStat?.isFile() && !binaryStat.isSymbolicLink()
    && binaryStat.uid === uid && binaryStat.nlink === 1 && (binaryStat.mode & 0o777) === 0o700
    && receiptStat?.isFile() && !receiptStat.isSymbolicLink()
    && receiptStat.uid === uid && receiptStat.nlink === 1 && (receiptStat.mode & 0o777) === 0o600
}

function inspectBinary(path, kind) {
  const options = { cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000, maxBuffer: 4_096 }
  const architecture = spawnSync('/usr/bin/lipo', ['-archs', path], options)
  const signature = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=2', path], options)
  const verified = spawnSync('/usr/bin/codesign', ['--verify', '--strict', path], options)
  try {
    if (architecture.error || architecture.signal || architecture.status !== 0
      || signature.error || signature.signal || signature.status !== 0
      || verified.error || verified.signal || verified.status !== 0) fail()
    const arch = architecture.stdout.toString('utf8').trim()
    const metadata = signature.stderr.toString('utf8')
    const identifier = /^Identifier=([^\r\n]+)$/m.exec(metadata)?.[1]
    const signingKind = /^Signature=([^\r\n]+)$/m.exec(metadata)?.[1]
    if (arch !== 'arm64' || identifier !== name(kind) || signingKind !== 'adhoc') fail()
    return Object.freeze({ architecture: arch, signingIdentifier: identifier, signingKind })
  } finally {
    architecture.stdout?.fill?.(0); architecture.stderr?.fill?.(0)
    signature.stdout?.fill?.(0); signature.stderr?.fill?.(0)
    verified.stdout?.fill?.(0); verified.stderr?.fill?.(0)
  }
}

function check(kind) {
  privateDirectory(privateRoot); privateDirectory(directory)
  sourceForKind(fs.readFileSync(source, 'utf8'), kind)
  const binary = resolve(directory, name(kind)), receipt = `${binary}.build.json`
  let binaryArtifact, receiptArtifact, scratch
  try {
    receiptArtifact = readVerifiedArtifact(receipt, 0o600, 4_096)
    binaryArtifact = readVerifiedArtifact(binary, 0o700, 32_000_000)
    scratch = newScratch('tll-fixture-recovery-v2-check')
    const record = JSON.parse(receiptArtifact.bytes.toString('utf8'))
    const snapshot = resolve(scratch.path, name(kind))
    fs.writeFileSync(snapshot, binaryArtifact.bytes, { flag: 'wx', mode: 0o700 })
    remember(scratch, snapshot)
    const inspected = inspectBinary(snapshot, kind)
    const actual = { sourceSha256: fileHash(source),
      binarySha256: sha(binaryArtifact.bytes), ...inspected }
    if (!validRecoveryArtifact(record, actual, binaryArtifact.stat,
      receiptArtifact.stat, process.getuid(), kind)) fail()
    return Object.freeze({ status: status(kind), ...record })
  } finally {
    removeScratch(scratch)
    binaryArtifact?.bytes.fill(0); receiptArtifact?.bytes.fill(0)
  }
}

function build(kind) {
  privateDirectory(privateRoot); privateDirectory(directory)
  const bytes = fs.readFileSync(source)
  sourceForKind(bytes.toString('utf8'), kind)
  const binary = resolve(directory, name(kind)), receipt = `${binary}.build.json`
  if (fs.existsSync(binary) || fs.existsSync(receipt)) fail()
  const scratch = newScratch('tll-fixture-recovery-v2-build')
  const snapshot = resolve(scratch.path, 'source.swift'), temporary = resolve(scratch.path, name(kind))
  try {
    fs.writeFileSync(snapshot, bytes, { flag: 'wx', mode: 0o600 })
    remember(scratch, snapshot)
    const sourceSha256 = sha(bytes)
    const result = spawnSync('/usr/bin/swiftc', ['-parse-as-library', '-D',
      'TLL_KEYCHAIN_FIXTURE_RECOVERY_V2', snapshot, '-o', temporary], {
      cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 65_536 })
    try { if (result.error || result.signal || result.status !== 0) fail() }
    finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
    remember(scratch, temporary)
    if (fileHash(snapshot) !== sourceSha256 || fileHash(source) !== sourceSha256) fail()
    fs.chmodSync(temporary, 0o700)
    const inspected = inspectBinary(temporary, kind)
    const record = Object.freeze({ schema: schema(kind), sourceSha256,
      binarySha256: fileHash(temporary), ...inspected })
    fs.linkSync(temporary, binary); fs.unlinkSync(temporary)
    scratch.leaves.delete(temporary)
    fs.writeFileSync(receipt, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 })
    return check(kind)
  } finally { removeScratch(scratch); bytes.fill(0) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const arg = process.argv.length === 3 ? process.argv[2] : ''
    const matched = /^--(build|check)-(disabled|armed)$/.exec(arg)
    if (!matched) fail()
    process.stdout.write(`${JSON.stringify(matched[1] === 'build' ? build(matched[2]) : check(matched[2]))}\n`)
  } catch { process.stdout.write('{"status":"HOLD"}\n'); process.exitCode = 2 }
}
