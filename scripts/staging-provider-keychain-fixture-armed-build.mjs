#!/usr/bin/env node
/** Build/check only the separately armed disposable-fixture executable. Never run it. */
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const sourcePaths = Object.freeze([
  resolve(import.meta.dirname, 'staging-provider-noninteractive-keychain.swift'),
  resolve(import.meta.dirname, 'staging-provider-keychain-fixture-native.swift'),
])
const privateRoot = resolve(root, '../implementation-state')
const directory = resolve(privateRoot, 'staging')
const name = 'tll-provider-keychain-fixture-armed-v1'
const binary = resolve(directory, name)
const receipt = resolve(directory, `${name}.build.json`)
const fail = () => { throw Error('Armed Keychain fixture build unavailable') }
const sha = value => createHash('sha256').update(value).digest('hex')
const fileHash = path => sha(fs.readFileSync(path))
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function privateDirectory(path) {
  const stat = fs.lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || (stat.mode & 0o777) !== 0o700) fail()
}

export function armedSources(bodies) {
  if (!Array.isArray(bodies) || bodies.length !== 2
    || bodies.some(body => typeof body !== 'string')
    || !/\bTLL_NATIVE_READER_ENABLED\s*=\s*false\b/.test(bodies[0])
    || /\bTLL_NATIVE_READER_ENABLED\s*=\s*true\b/.test(bodies[0])
    || !/\bTLL_FIXTURE_NATIVE_ENABLED\s*=\s*true\b/.test(bodies[1])
    || /\bTLL_FIXTURE_NATIVE_ENABLED\s*=\s*false\b/.test(bodies[1])) fail()
}

export function validArmedFixtureArtifact(record, hashes, inspected, binaryStat, receiptStat, uid) {
  return exact(record, ['schema', 'sourceSha256', 'fixtureSha256', 'binarySha256',
    'architecture', 'signingIdentifier', 'signingKind'])
    && record.schema === 'tll-armed-disposable-keychain-build/v1'
    && Array.isArray(hashes) && hashes.length === 3
    && record.sourceSha256 === hashes[0]
    && record.fixtureSha256 === hashes[1]
    && record.binarySha256 === hashes[2]
    && record.architecture === inspected?.architecture
    && record.signingIdentifier === inspected?.signingIdentifier
    && record.signingKind === inspected?.signingKind
    && record.architecture === 'arm64'
    && record.signingIdentifier === name && record.signingKind === 'adhoc'
    && binaryStat?.isFile() && !binaryStat.isSymbolicLink()
    && binaryStat.uid === uid && binaryStat.nlink === 1 && (binaryStat.mode & 0o777) === 0o700
    && receiptStat?.isFile() && !receiptStat.isSymbolicLink()
    && receiptStat.uid === uid && receiptStat.nlink === 1 && (receiptStat.mode & 0o777) === 0o600
}

function identity(path) {
  const options = { cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000, maxBuffer: 4_096 }
  const architecture = spawnSync('/usr/bin/lipo', ['-archs', path], options)
  const signature = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=2', path], options)
  try {
    if (architecture.error || architecture.signal || architecture.status !== 0
      || signature.error || signature.signal || signature.status !== 0) fail()
    const arch = architecture.stdout.toString('utf8').trim()
    const metadata = signature.stderr.toString('utf8')
    const identifier = /^Identifier=([^\r\n]+)$/m.exec(metadata)?.[1]
    const kind = /^Signature=([^\r\n]+)$/m.exec(metadata)?.[1]
    if (arch !== 'arm64' || identifier !== name || kind !== 'adhoc') fail()
    return Object.freeze({ architecture: arch, signingIdentifier: identifier, signingKind: kind })
  } finally {
    architecture.stdout?.fill?.(0); architecture.stderr?.fill?.(0)
    signature.stdout?.fill?.(0); signature.stderr?.fill?.(0)
  }
}

function check() {
  privateDirectory(privateRoot); privateDirectory(directory)
  const bodies = sourcePaths.map(path => fs.readFileSync(path, 'utf8'))
  armedSources(bodies)
  const record = JSON.parse(fs.readFileSync(receipt, 'utf8'))
  const binaryStat = fs.lstatSync(binary), receiptStat = fs.lstatSync(receipt)
  const inspected = identity(binary)
  if (!validArmedFixtureArtifact(record, [...sourcePaths.map(fileHash), fileHash(binary)],
    inspected, binaryStat, receiptStat, process.getuid())) fail()
  return Object.freeze({ status: 'ARMED_FIXTURE_BINARY_VERIFIED', ...record })
}

function build() {
  privateDirectory(privateRoot); privateDirectory(directory)
  const bytes = sourcePaths.map(path => fs.readFileSync(path))
  armedSources(bytes.map(value => value.toString('utf8')))
  if (fs.existsSync(binary) || fs.existsSync(receipt)) fail()
  const scratch = resolve(directory, `.tll-armed-fixture-build-${randomUUID()}`)
  fs.mkdirSync(scratch, { mode: 0o700 })
  const snapshots = sourcePaths.map((_, index) => resolve(scratch, `source-${index}.swift`))
  const temporary = resolve(scratch, name)
  try {
    snapshots.forEach((path, index) => fs.writeFileSync(path, bytes[index], { flag: 'wx', mode: 0o600 }))
    const hashes = bytes.map(sha)
    const result = spawnSync('/usr/bin/swiftc', ['-parse-as-library', '-D', 'TLL_KEYCHAIN_FIXTURE',
      ...snapshots, '-o', temporary], { cwd: root, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 65_536 })
    try { if (result.error || result.signal || result.status !== 0) fail() }
    finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
    if (snapshots.some((path, index) => fileHash(path) !== hashes[index]
      || fileHash(sourcePaths[index]) !== hashes[index])) fail()
    fs.chmodSync(temporary, 0o700)
    const inspected = identity(temporary)
    const record = Object.freeze({ schema: 'tll-armed-disposable-keychain-build/v1',
      sourceSha256: hashes[0], fixtureSha256: hashes[1], binarySha256: fileHash(temporary), ...inspected })
    fs.linkSync(temporary, binary)
    fs.unlinkSync(temporary)
    fs.writeFileSync(receipt, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 })
    return check()
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
    bytes.forEach(value => value.fill(0))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = process.argv.length === 3 && process.argv[2] === '--build' ? build()
      : process.argv.length === 3 && process.argv[2] === '--check' ? check() : fail()
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch {
    process.stdout.write('{"status":"HOLD"}\n')
    process.exitCode = 2
  }
}
