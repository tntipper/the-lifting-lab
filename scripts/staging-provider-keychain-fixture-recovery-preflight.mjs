/** Exact, synthetic-only V1 recovery identity checks; no mutation or credential read. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const directoryPath = resolve(homedir(), 'Library/Caches/tll-stage3-keychain-fixture')
const mainPath = resolve(directoryPath, 'tll-stage3-fixture.keychain-db')
const sidecarPath = resolve(directoryPath, '.flA673ACC0')
const privateJournalDirectory = resolve(import.meta.dirname, '../..', 'implementation-state/staging')
const parentJournalPath = resolve(privateJournalDirectory, 'tll-provider-keychain-fixture-v1.json')
const nativeJournalPath = resolve(privateJournalDirectory, 'tll-provider-keychain-fixture-native-v1.json')
export const RECOVERY_V1 = Object.freeze({
  runId: 'c02a3356-3c57-4d1f-adee-eb940cf1f87a',
  directory: Object.freeze({ dev: 16777234, ino: 144003366, uid: 501, mode: 0o700 }),
  main: Object.freeze({ dev: 16777234, ino: 144003379, uid: 501, mode: 0o644,
    size: 20460, sha256: 'eaf94db34cc0094496532ee781babd1a551ce248abe6815792f1f1a0b79b3c42' }),
  sidecar: Object.freeze({ dev: 16777234, ino: 144003377, uid: 501, mode: 0o444,
    size: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }),
  names: Object.freeze(['.flA673ACC0', 'tll-stage3-fixture.keychain-db']),
})
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const same = (value, expected) => exact(value, Object.keys(expected))
  && Object.entries(expected).every(([key, answer]) => value[key] === answer)

function statFile(path, { hash = false } = {}) {
  let stat
  try { stat = fs.lstatSync(path) }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error }
  if (stat.isSymbolicLink()) throw Error('Fixture recovery path is a symlink')
  const value = { dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: stat.mode & 0o777 }
  if (hash) {
    if (!stat.isFile() || stat.nlink !== 1) throw Error('Fixture recovery leaf is not a single file')
    if (stat.size > 65_536) throw Error('Fixture recovery leaf is oversized')
    const descriptor = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    try {
      const opened = fs.fstatSync(descriptor)
      if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino
        || opened.uid !== stat.uid || opened.nlink !== stat.nlink
        || (opened.mode & 0o777) !== (stat.mode & 0o777) || opened.size !== stat.size) {
        throw Error('Fixture recovery leaf changed before read')
      }
      const bytes = fs.readFileSync(descriptor)
      try {
        const after = fs.fstatSync(descriptor), named = fs.lstatSync(path)
        if (after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size
          || named.dev !== stat.dev || named.ino !== stat.ino || named.isSymbolicLink()) {
          throw Error('Fixture recovery leaf changed during read')
        }
        value.size = stat.size
        value.sha256 = createHash('sha256').update(bytes).digest('hex')
      } finally { bytes.fill(0) }
    } finally { fs.closeSync(descriptor) }
  } else if (!stat.isDirectory()) throw Error('Fixture recovery path is not a directory')
  return value
}

function readTerminalJournal(path, fields) {
  const stat = fs.lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 4_096) {
    throw Error('Fixture V1 journal identity mismatch')
  }
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'))
  return Object.fromEntries(fields.map(field => [field, raw[field]]))
}

function securityRead(argument) {
  const result = spawnSync('/usr/bin/security', [argument, '-d', 'user'], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5_000, maxBuffer: 1_024,
  })
  try {
    if (result.error || result.signal || result.status !== 0 || result.stderr.length !== 0) {
      throw Error('Keychain metadata read unavailable')
    }
    return result.stdout.toString('utf8').trim().split(/\r?\n/).map(line => line.trim())
  } finally { result.stdout?.fill?.(0); result.stderr?.fill?.(0) }
}

export function captureRecoverySnapshot() {
  const login = `"${resolve(homedir(), 'Library/Keychains/login.keychain-db')}"`
  const defaultRows = securityRead('default-keychain')
  const searchRows = securityRead('list-keychains')
  const directory = statFile(directoryPath)
  return Object.freeze({ directory,
    main: directory ? statFile(mainPath, { hash: true }) : null,
    sidecar: directory ? statFile(sidecarPath, { hash: true }) : null,
    entries: directory ? fs.readdirSync(directoryPath).sort() : [],
    defaultKeychain: defaultRows.length === 1 && defaultRows[0] === login ? 'login-keychain' : 'other',
    searchList: searchRows.map(row => row === login ? 'login-keychain' : 'other'),
    parentJournal: readTerminalJournal(parentJournalPath, ['runId', 'phase', 'outcome']),
    nativeJournal: readTerminalJournal(nativeJournalPath,
      ['runId', 'operation', 'status', 'outcome', 'sequence']),
  })
}

export function parseRecoveryBuildIdentity(value, kind = 'disabled') {
  if (!['disabled', 'armed'].includes(kind)
    || !exact(value, ['status', 'schema', 'sourceSha256', 'binarySha256',
      'architecture', 'signingIdentifier', 'signingKind'])
    || value.status !== `${kind.toUpperCase()}_RECOVERY_BINARY_VERIFIED`
    || value.schema !== `tll-fixture-recovery-${kind}-build/v1`
    || value.architecture !== 'arm64' || value.signingKind !== 'adhoc'
    || value.signingIdentifier !== `tll-provider-keychain-fixture-recovery-${kind}-v1`
    || [value.sourceSha256, value.binarySha256]
      .some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) return null
  return Object.freeze({ sourceSha256: value.sourceSha256, binarySha256: value.binarySha256 })
}

export function assessRecoverySnapshot(value, phase) {
  if (!exact(value, ['directory', 'main', 'sidecar', 'entries', 'defaultKeychain',
    'searchList', 'parentJournal', 'nativeJournal'])
    || !Array.isArray(value.entries) || !Array.isArray(value.searchList)
    || value.defaultKeychain !== 'login-keychain'
    || value.searchList.length !== 1 || value.searchList[0] !== 'login-keychain'
    || !exact(value.parentJournal, ['runId', 'phase', 'outcome'])
    || value.parentJournal.runId !== RECOVERY_V1.runId
    || value.parentJournal.phase !== 'LOCAL_RECONCILIATION'
    || value.parentJournal.outcome !== 'HOLD'
    || !exact(value.nativeJournal, ['runId', 'operation', 'status', 'outcome', 'sequence'])
    || value.nativeJournal.runId !== RECOVERY_V1.runId
    || value.nativeJournal.operation !== 'CREATE'
    || value.nativeJournal.status !== 'COMPLETE'
    || value.nativeJournal.outcome !== 'HOLD'
    || value.nativeJournal.sequence !== 1) return false
  if (phase === 'final') return value.directory === null && value.main === null
    && value.sidecar === null && value.entries.length === 0
  if (!same(value.directory, RECOVERY_V1.directory)) return false
  const entries = [...value.entries].sort()
  if (phase === 'initial') return same(value.main, RECOVERY_V1.main)
    && same(value.sidecar, RECOVERY_V1.sidecar)
    && entries.join('|') === [...RECOVERY_V1.names].sort().join('|')
  if (phase === 'afterApi') return value.main === null
    && (value.sidecar === null || same(value.sidecar, RECOVERY_V1.sidecar))
    && entries.join('|') === (value.sidecar === null ? '' : '.flA673ACC0')
  if (phase === 'afterSidecar') return value.main === null && value.sidecar === null
    && entries.length === 0
  return false
}
