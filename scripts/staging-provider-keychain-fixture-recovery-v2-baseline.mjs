/** Validates a private, full V2 baseline file without returning or printing paths. */
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const SCHEMA = 'tll-stage3-fixture-recovery-baseline/v2'
const SHA = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f-]{36}$/
const NUMBER = /^(?:0|[1-9][0-9]{0,19})$/
const MAX_DEVICE = 2_147_483_647n
const MAX_INODE = 18_446_744_073_709_551_615n
const LOGIN = resolve(homedir(), 'Library/Keychains/login.keychain-db')
const FIXTURE_IDENTITIES = new Set(['16777234:144003379', '16777234:144003377'])
const fail = () => { throw Error('V2 recovery baseline unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function entry(value) {
  return exact(value, ['path', 'device', 'inode'])
    && typeof value.path === 'string' && value.path.startsWith('/')
    && Buffer.byteLength(value.path, 'utf8') > 1
    && Buffer.byteLength(value.path, 'utf8') <= 4096
    && !value.path.includes('\0') && NUMBER.test(value.device) && NUMBER.test(value.inode)
    && BigInt(value.device) <= MAX_DEVICE && BigInt(value.inode) <= MAX_INODE
}

export function validV2BaselinePayload(value, expected) {
  if (!exact(value, ['schema', 'runId', 'sourceSha256', 'binarySha256', 'domain',
    'defaultPath', 'effectiveSearch', 'userSearch'])
    || !exact(expected, ['runId', 'sourceSha256', 'binarySha256'])
    || value.schema !== SCHEMA || !UUID.test(value.runId)
    || !SHA.test(value.sourceSha256) || !SHA.test(value.binarySha256)
    || value.runId !== expected.runId || value.sourceSha256 !== expected.sourceSha256
    || value.binarySha256 !== expected.binarySha256
    || value.domain !== 'USER' || value.defaultPath !== LOGIN
    || !Array.isArray(value.effectiveSearch) || !Array.isArray(value.userSearch)
    || value.effectiveSearch.length < 1 || value.effectiveSearch.length > 32
    || value.userSearch.length !== 1
    || !value.effectiveSearch.every(entry) || !value.userSearch.every(entry)) return false
  const login = value.userSearch[0]
  if (login.path !== LOGIN) return false
  const identities = value.effectiveSearch.map(item => `${item.device}:${item.inode}`)
  return value.effectiveSearch.filter(item => item.path === LOGIN
      && item.device === login.device && item.inode === login.inode).length === 1
    && identities.filter(item => item === `${login.device}:${login.inode}`).length === 1
    && value.effectiveSearch.every(item => !FIXTURE_IDENTITIES.has(`${item.device}:${item.inode}`))
    && new Set(value.effectiveSearch.map(item => item.path)).size === value.effectiveSearch.length
    && new Set(identities).size === identities.length
}

function readPrivate(path, io) {
  let descriptor, bytes
  try {
    const named = io.lstatSync(path)
    if (!named.isFile() || named.isSymbolicLink() || named.uid !== process.getuid()
      || named.nlink !== 1 || (named.mode & 0o777) !== 0o600
      || named.size < 1 || named.size > 524_288) fail()
    descriptor = io.openSync(path, io.constants.O_RDONLY | io.constants.O_NOFOLLOW
      | io.constants.O_NONBLOCK | io.constants.O_CLOEXEC)
    const opened = io.fstatSync(descriptor)
    if (!opened.isFile() || opened.isSymbolicLink() || opened.dev !== named.dev
      || opened.ino !== named.ino || opened.uid !== named.uid || opened.nlink !== 1
      || opened.size !== named.size || (opened.mode & 0o777) !== 0o600) fail()
    bytes = Buffer.alloc(opened.size)
    for (let offset = 0; offset < bytes.length;) {
      const count = io.readSync(descriptor, bytes, offset, bytes.length - offset, offset)
      if (!Number.isSafeInteger(count) || count <= 0 || count > bytes.length - offset) fail()
      offset += count
    }
    const after = io.fstatSync(descriptor), stillNamed = io.lstatSync(path)
    for (const value of [after, stillNamed]) {
      if (!value.isFile() || value.isSymbolicLink() || value.dev !== named.dev
        || value.ino !== named.ino || value.uid !== named.uid || value.nlink !== 1
        || value.size !== named.size || (value.mode & 0o777) !== 0o600) fail()
    }
    const digest = createHash('sha256').update(bytes).digest('hex')
    const value = JSON.parse(bytes.toString('utf8'))
    return { digest, value }
  } catch { fail() }
  finally { if (descriptor !== undefined) io.closeSync(descriptor); bytes?.fill(0) }
}

export function readPinnedV2Baseline({ path, expected, digest = null, io = fs } = {}) {
  if (typeof path !== 'string' || !path || !exact(expected,
    ['runId', 'sourceSha256', 'binarySha256'])) fail()
  const { digest: actual, value } = readPrivate(path, io)
  if (!validV2BaselinePayload(value, expected)
    || (digest !== null && (!SHA.test(digest) || digest !== actual))) fail()
  return Object.freeze({ sha256: actual, effectiveCount: value.effectiveSearch.length })
}
