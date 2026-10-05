#!/usr/bin/env node
/** Build/check a disabled native reader. This never invokes it with real items. */
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = resolve(import.meta.dirname, 'staging-provider-noninteractive-keychain.swift')
const privateRoot = resolve(root, '../implementation-state')
const directory = resolve(privateRoot, 'staging')
const filename = 'tll-provider-noninteractive-keychain-disabled-v2'
const binary = resolve(directory, filename)
const receipt = resolve(directory, `${filename}.build.json`)
const unavailable = () => { throw Error('Disabled native Keychain build unavailable') }
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const hash = path => sha256(fs.readFileSync(path))
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function assertPrivateDirectory(path) {
  const stat = fs.lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || (stat.mode & 0o777) !== 0o700) unavailable()
}

function assertDisabledSource(body) {
  if ((body.match(/\bTLL_NATIVE_READER_ENABLED\s*=\s*false\b/g) ?? []).length !== 1
    || /\bTLL_NATIVE_READER_ENABLED\s*=\s*true\b/.test(body)) unavailable()
}

function inspectBinary(path) {
  const options = { cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000, maxBuffer: 4_096 }
  const architecture = spawnSync('/usr/bin/lipo', ['-archs', path], options)
  const signature = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=2', path], options)
  try {
    if (architecture.error || architecture.signal || architecture.status !== 0
      || signature.error || signature.signal || signature.status !== 0) unavailable()
    const arch = architecture.stdout.toString('utf8').trim()
    const metadata = signature.stderr.toString('utf8')
    const identifier = /^Identifier=([^\r\n]+)$/m.exec(metadata)?.[1]
    const kind = /^Signature=([^\r\n]+)$/m.exec(metadata)?.[1]
    if (arch !== 'arm64' || identifier !== filename || kind !== 'adhoc') unavailable()
    return Object.freeze({ architecture: arch, signingIdentifier: identifier, signingKind: kind })
  } finally {
    architecture.stdout?.fill?.(0); architecture.stderr?.fill?.(0)
    signature.stdout?.fill?.(0); signature.stderr?.fill?.(0)
  }
}

function check() {
  assertPrivateDirectory(privateRoot)
  assertPrivateDirectory(directory)
  assertDisabledSource(fs.readFileSync(source, 'utf8'))
  const record = JSON.parse(fs.readFileSync(receipt, 'utf8'))
  const stat = fs.lstatSync(binary)
  const receiptStat = fs.lstatSync(receipt)
  const identity = inspectBinary(binary)
  if (!exact(record, ['schema', 'sourceSha256', 'binarySha256', 'architecture', 'signingIdentifier', 'signingKind'])
    || record.schema !== 'tll-disabled-native-keychain-build/v2'
    || record.sourceSha256 !== hash(source) || record.binarySha256 !== hash(binary)
    || record.architecture !== identity.architecture
    || record.signingIdentifier !== identity.signingIdentifier || record.signingKind !== identity.signingKind
    || !stat.isFile() || stat.isSymbolicLink()
    || stat.uid !== process.getuid() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o700
    || !receiptStat.isFile() || receiptStat.isSymbolicLink() || receiptStat.uid !== process.getuid()
    || receiptStat.nlink !== 1 || (receiptStat.mode & 0o777) !== 0o600) unavailable()
  return Object.freeze({ status: 'DISABLED_BINARY_VERIFIED', sourceSha256: record.sourceSha256,
    binarySha256: record.binarySha256, architecture: record.architecture,
    signingIdentifier: record.signingIdentifier, signingKind: record.signingKind })
}

function build() {
  assertPrivateDirectory(privateRoot)
  assertPrivateDirectory(directory)
  const sourceBytes = fs.readFileSync(source)
  assertDisabledSource(sourceBytes.toString('utf8'))
  if (fs.existsSync(binary) || fs.existsSync(receipt)) unavailable()
  const buildDirectory = resolve(directory, `.tll-disabled-keychain-build-${randomUUID()}`)
  fs.mkdirSync(buildDirectory, { mode: 0o700 })
  const snapshot = resolve(buildDirectory, 'source.swift')
  const temporary = resolve(buildDirectory, filename)
  try {
    fs.writeFileSync(snapshot, sourceBytes, { flag: 'wx', mode: 0o600 })
    const snapshotSha256 = sha256(sourceBytes)
    const result = spawnSync('/usr/bin/swiftc', ['-parse-as-library', snapshot, '-o', temporary], {
      cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 8_192,
    })
    try { if (result.error || result.signal || result.status !== 0) unavailable() }
    finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
    if (hash(snapshot) !== snapshotSha256 || hash(source) !== snapshotSha256) unavailable()
    fs.chmodSync(temporary, 0o700)
    const identity = inspectBinary(temporary)
    const record = Object.freeze({ schema: 'tll-disabled-native-keychain-build/v2',
      sourceSha256: snapshotSha256, binarySha256: hash(temporary), ...identity })
    // Linking fails if the fixed target already exists; no existing build is replaced.
    fs.linkSync(temporary, binary)
    fs.unlinkSync(temporary)
    fs.writeFileSync(receipt, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 })
    return check()
  } finally {
    fs.rmSync(buildDirectory, { recursive: true, force: true })
    sourceBytes.fill(0)
  }
}

try {
  const result = process.argv.length === 3 && process.argv[2] === '--build' ? build()
    : process.argv.length === 3 && process.argv[2] === '--check' ? check() : unavailable()
  process.stdout.write(`${JSON.stringify(result)}\n`)
} catch {
  process.stdout.write('{"status":"HOLD"}\n')
  process.exitCode = 2
}
