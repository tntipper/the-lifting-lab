#!/usr/bin/env node
/** Source-bound build/check for the read-only fixture metadata diagnostic. Never runs it. */
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const source = resolve(import.meta.dirname, 'staging-provider-keychain-fixture-metadata-diagnostic.swift')
const privateRoot = resolve(root, '../implementation-state')
const directory = resolve(privateRoot, 'staging')
const name = 'tll-provider-keychain-fixture-metadata-armed-v1'
const binary = resolve(directory, name)
const receipt = `${binary}.build.json`
const fail = () => { throw Error('Fixture metadata build unavailable') }
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fileHash = path => sha(fs.readFileSync(path))
const environment = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' })

function privateDirectory(path) {
  const stat = fs.lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || (stat.mode & 0o777) !== 0o700) fail()
}

export function armedMetadataSource(body) {
  const securityCalls = typeof body === 'string'
    ? [...body.matchAll(/\b(Sec[A-Za-z0-9_]+)\s*\(/g)].map(match => match[1]) : []
  const allowed = new Set(['SecKeychainCopyDefault', 'SecKeychainCopySearchList',
    'SecKeychainGetPath', 'SecKeychainGetTypeID'])
  return typeof body === 'string'
    && (body.match(/\btllMetadataDiagnosticEnabled\s*=\s*(?:true|false)\b/g) ?? []).length === 1
    && /\btllMetadataDiagnosticEnabled\s*=\s*true\b/.test(body)
    && securityCalls.every(name => allowed.has(name))
    && !/\b(?:unlink|removeItem|URLSession)\b/.test(body)
}

function inspectBinary(path) {
  const options = { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000, maxBuffer: 4_096 }
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
    if (arch !== 'arm64' || identifier !== name || signingKind !== 'adhoc') fail()
    return Object.freeze({ architecture: arch, signingIdentifier: identifier, signingKind })
  } finally {
    architecture.stdout?.fill?.(0); architecture.stderr?.fill?.(0)
    signature.stdout?.fill?.(0); signature.stderr?.fill?.(0)
    verified.stdout?.fill?.(0); verified.stderr?.fill?.(0)
  }
}

/** Open without following links; reject wrong objects before reading any bytes. */
export function readVerifiedArtifact(path, permissions, maxBytes, io = fs) {
  if (typeof path !== 'string' || !path || ![0o700, 0o600].includes(permissions)
    || !Number.isSafeInteger(maxBytes) || maxBytes < 1
    || !Number.isInteger(io.constants.O_NOFOLLOW) || !Number.isInteger(io.constants.O_NONBLOCK)) fail()
  let fd, bytes
  try {
    fd = io.openSync(path, io.constants.O_RDONLY | io.constants.O_NOFOLLOW
      | io.constants.O_NONBLOCK | io.constants.O_CLOEXEC)
    const stat = io.fstatSync(fd)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid()
      || stat.nlink !== 1 || (stat.mode & 0o777) !== permissions
      || stat.size < 1 || stat.size > maxBytes) fail()
    bytes = Buffer.alloc(stat.size)
    for (let offset = 0; offset < bytes.length;) {
      const read = io.readSync(fd, bytes, offset, bytes.length - offset, offset)
      if (!Number.isSafeInteger(read) || read <= 0 || read > bytes.length - offset) fail()
      offset += read
    }
    const after = io.fstatSync(fd), named = io.lstatSync(path)
    for (const current of [after, named]) {
      if (!current.isFile() || current.isSymbolicLink() || current.dev !== stat.dev
        || current.ino !== stat.ino || current.uid !== stat.uid
        || current.nlink !== stat.nlink || current.size !== stat.size
        || (current.mode & 0o777) !== permissions) fail()
    }
    const result = { bytes, stat }
    bytes = undefined
    return result
  } finally {
    if (fd !== undefined) io.closeSync(fd)
    bytes?.fill(0)
  }
}

export function validMetadataArtifact(record, actual, binaryStat, receiptStat, uid) {
  return record && typeof record === 'object' && !Array.isArray(record)
    && Object.keys(record).sort().join('|') === ['schema', 'sourceSha256',
      'binarySha256', 'architecture', 'signingIdentifier', 'signingKind'].sort().join('|')
    && record.schema === 'tll-fixture-metadata-armed-build/v1'
    && record.sourceSha256 === actual?.sourceSha256
    && record.binarySha256 === actual?.binarySha256
    && record.architecture === actual?.architecture && record.architecture === 'arm64'
    && record.signingIdentifier === actual?.signingIdentifier && record.signingIdentifier === name
    && record.signingKind === actual?.signingKind && record.signingKind === 'adhoc'
    && binaryStat?.isFile() && !binaryStat.isSymbolicLink()
    && binaryStat.uid === uid && binaryStat.nlink === 1 && (binaryStat.mode & 0o777) === 0o700
    && receiptStat?.isFile() && !receiptStat.isSymbolicLink()
    && receiptStat.uid === uid && receiptStat.nlink === 1 && (receiptStat.mode & 0o777) === 0o600
}

function check() {
  privateDirectory(privateRoot); privateDirectory(directory)
  if (!armedMetadataSource(fs.readFileSync(source, 'utf8'))) fail()
  let receiptArtifact, binaryArtifact, scratch
  try {
    receiptArtifact = readVerifiedArtifact(receipt, 0o600, 4_096)
    binaryArtifact = readVerifiedArtifact(binary, 0o700, 32_000_000)
    scratch = resolve(directory, `.tll-fixture-metadata-check-${randomUUID()}`)
    fs.mkdirSync(scratch, { mode: 0o700 })
    const record = JSON.parse(receiptArtifact.bytes.toString('utf8'))
    const snapshot = resolve(scratch, name)
    fs.writeFileSync(snapshot, binaryArtifact.bytes, { flag: 'wx', mode: 0o700 })
    const actual = { sourceSha256: fileHash(source), binarySha256: sha(binaryArtifact.bytes),
      ...inspectBinary(snapshot) }
    if (!validMetadataArtifact(record, actual, binaryArtifact.stat, receiptArtifact.stat,
      process.getuid())) fail()
    return Object.freeze({ status: 'ARMED_METADATA_BINARY_VERIFIED', ...record })
  } finally {
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true })
    receiptArtifact?.bytes.fill(0); binaryArtifact?.bytes.fill(0)
  }
}

function build() {
  privateDirectory(privateRoot); privateDirectory(directory)
  const bytes = fs.readFileSync(source)
  if (!armedMetadataSource(bytes.toString('utf8')) || fs.existsSync(binary)
    || fs.existsSync(receipt)) fail()
  const scratch = resolve(directory, `.tll-fixture-metadata-build-${randomUUID()}`)
  fs.mkdirSync(scratch, { mode: 0o700 })
  const snapshot = resolve(scratch, 'source.swift')
  const temporary = resolve(scratch, name)
  try {
    fs.writeFileSync(snapshot, bytes, { flag: 'wx', mode: 0o600 })
    const sourceSha256 = sha(bytes)
    const result = spawnSync('/usr/bin/swiftc', ['-parse-as-library', snapshot, '-o', temporary], {
      cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000, maxBuffer: 65_536 })
    try { if (result.error || result.signal || result.status !== 0) fail() }
    finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
    if (fileHash(snapshot) !== sourceSha256 || fileHash(source) !== sourceSha256) fail()
    fs.chmodSync(temporary, 0o700)
    const record = Object.freeze({ schema: 'tll-fixture-metadata-armed-build/v1',
      sourceSha256, binarySha256: fileHash(temporary), ...inspectBinary(temporary) })
    fs.linkSync(temporary, binary); fs.unlinkSync(temporary)
    fs.writeFileSync(receipt, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 })
    return check()
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); bytes.fill(0) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || !['--build-armed', '--check-armed'].includes(process.argv[2])) fail()
    process.stdout.write(`${JSON.stringify(process.argv[2] === '--build-armed' ? build() : check())}\n`)
  } catch { process.stdout.write('{"status":"HOLD"}\n'); process.exitCode = 2 }
}
