/**
 * One deliberately disabled transport for the reviewed staging-only upgrade.
 * It has no caller-supplied SQL, URL, headers, retry path, or production path.
 */
import https from 'node:https'
import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { INSTALL_ID, PROJECT_REF, PRODUCTION_PROJECT_REF, buildPackage } from './staging-disabled-migrations-012-016.prepare.mjs'
export { INSTALL_ID, PROJECT_REF, PRODUCTION_PROJECT_REF } from './staging-disabled-migrations-012-016.prepare.mjs'

// This must stay false in committed source. The keychain helper has the same
// independent flag, so a one-sided edit cannot create a usable transport.
export const NATIVE_ACCESS_APPROVED = false
export const KEYCHAIN_SERVICE = 'Supabase CLI'
export const KEYCHAIN_ACCOUNT = 'supabase'
export const ENDPOINT = Object.freeze({ hostname: 'api.supabase.com', path: `/v1/projects/${PROJECT_REF}/database/query`, method: 'POST' })
export const MAX_AGE_MS = 60_000
export const MAX_REQUESTS = 1
const MAX_RESPONSE_BYTES = 16_384
const sha256 = value => createHash('sha256').update(value).digest('hex')
const unavailable = () => { throw new Error('Disabled staging migration install unavailable') }
const packageSpec = buildPackage()
export const FIXED_QUERY = packageSpec.sql
export const DEFAULT_JOURNAL_PATH = fileURLToPath(new URL('../../implementation-state/staging/tll-disabled-migrations-012-016-dispatch.json', import.meta.url))

function fsyncDirectory (directory, fileSystem) {
  let descriptor
  try { descriptor = fileSystem.openSync(directory, 'r'); fileSystem.fsyncSync(descriptor) } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor) }
}

function durableClaim (path, record, { fileSystem = fs } = {}) {
  const directory = dirname(path)
  const data = Buffer.from(JSON.stringify(record) + '\n', 'utf8')
  let descriptor
  try {
    fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 })
    // The journal itself is the exclusive, durable claim. A losing process
    // gets EEXIST and cannot overwrite or reach the request boundary.
    descriptor = fileSystem.openSync(path, 'wx', 0o600)
    fileSystem.writeSync(descriptor, data)
    fileSystem.fsyncSync(descriptor)
    fileSystem.closeSync(descriptor); descriptor = undefined
    fsyncDirectory(directory, fileSystem)
  } finally {
    if (descriptor !== undefined) fileSystem.closeSync(descriptor)
    data.fill(0)
  }
}

function transitionLockPath (path) { return `${path}.transition-lock` }

function durableTransition (path, intent, record, { fileSystem = fs } = {}) {
  const directory = dirname(path)
  const lockPath = transitionLockPath(path)
  const temporary = resolve(directory, `.${INSTALL_ID.replace(/[^a-z0-9]/gi, '_')}.${intent.runId}.tmp`)
  const data = Buffer.from(JSON.stringify(record) + '\n', 'utf8')
  let lockDescriptor; let descriptor; let ownsLock = false
  try {
    // The lock serializes the read/verify/replace sequence. It is created
    // exclusively and never removes or replaces the original intent claim.
    lockDescriptor = fileSystem.openSync(lockPath, 'wx', 0o600)
    ownsLock = true
    fileSystem.fsyncSync(lockDescriptor)
    fileSystem.closeSync(lockDescriptor); lockDescriptor = undefined
    const current = readJournal(path, fileSystem)
    if (!current || current.runId !== intent.runId || current.state !== 'INTENT_RECORDED') unavailable()
    descriptor = fileSystem.openSync(temporary, 'wx', 0o600)
    fileSystem.writeSync(descriptor, data)
    fileSystem.fsyncSync(descriptor)
    fileSystem.closeSync(descriptor); descriptor = undefined
    fileSystem.renameSync(temporary, path)
    fsyncDirectory(directory, fileSystem)
  } finally {
    if (descriptor !== undefined) fileSystem.closeSync(descriptor)
    if (lockDescriptor !== undefined) fileSystem.closeSync(lockDescriptor)
    if (ownsLock) try { fileSystem.unlinkSync(lockPath); fsyncDirectory(directory, fileSystem) } catch { /* retained lock fails closed */ }
    data.fill(0)
  }
}

function readJournal (path, fileSystem) {
  try {
    const parsed = JSON.parse(fileSystem.readFileSync(path, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.installId !== INSTALL_ID || parsed.target !== PROJECT_REF || typeof parsed.state !== 'string') unavailable()
    return parsed
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    unavailable()
  }
}

function journalSourcePins (manifest) {
  const pins = [...manifest.sourcePins, ...manifest.sourcePinsForTransport].map(({ path, version, sha256: hash }) => Object.freeze({ ...(path ? { path } : {}), ...(version ? { version } : {}), sha256: hash }))
  if (pins.length !== 7 || pins.some(pin => !/^[a-f0-9]{64}$/.test(pin.sha256))) unavailable()
  return Object.freeze(pins)
}

function validateJournalReceipt (receipt) {
  const expected = { status: 'PASS', target: PROJECT_REF, installId: INSTALL_ID, migrationCount: 5, transactionSha256: sha256(FIXED_QUERY) }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || Object.keys(receipt).sort().join('|') !== Object.keys(expected).sort().join('|')) unavailable()
  for (const [key, value] of Object.entries(expected)) if (receipt[key] !== value) unavailable()
  return Object.freeze(expected)
}

/**
 * A nonsecret, durable dispatch ledger. It deliberately contains no query,
 * provider response, token, role or customer data. The journal is local
 * evidence, not a substitute for the separate read-only reconciliation path.
 */
export function createDispatchJournal ({ path = DEFAULT_JOURNAL_PATH, fileSystem = fs, makeRunId = randomUUID } = {}) {
  const existing = () => readJournal(path, fileSystem)
  let ownedRunId
  return Object.freeze({
    path,
    recordIntent ({ manifest, timestamp }) {
      const runId = makeRunId()
      if (typeof runId !== 'string' || runId.length < 8) unavailable()
      const record = Object.freeze({ schema: `${INSTALL_ID}/dispatch-journal/v1`, state: 'INTENT_RECORDED', installId: INSTALL_ID, target: PROJECT_REF, transactionSha256: manifest.transactionSha256, sourcePinSha256: journalSourcePins(manifest), timestamp, runId })
      durableClaim(path, record, { fileSystem })
      ownedRunId = runId
      return record
    },
    transition (intent, state, additions = {}) {
      if (!intent || ownedRunId !== intent.runId || intent.state !== 'INTENT_RECORDED' || !['RECEIPT_VALIDATED', 'RECONCILIATION_REQUIRED'].includes(state)) unavailable()
      const record = Object.freeze({ ...intent, ...additions, state })
      durableTransition(path, intent, record, { fileSystem })
      ownedRunId = undefined
      return record
    },
    read: existing,
  })
}

function noAmbientOverrides () {
  for (const name of Object.keys(process.env)) {
    if (name.startsWith('PG') || name.startsWith('SUPABASE_') || ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'https_proxy', 'http_proxy', 'all_proxy', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'NODE_OPTIONS', 'SSLKEYLOGFILE', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'OPENSSL_CONF', 'OPENSSL_MODULES'].includes(name)) unavailable()
  }
}

export function normalizeKeychainToken (value) {
  if (typeof value !== 'string' || value.length > 256) unavailable()
  if (value.startsWith('go-keyring-base64:')) {
    const payload = value.slice('go-keyring-base64:'.length)
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length === 0 || payload.length % 4 !== 0) unavailable()
    const decoded = Buffer.from(payload, 'base64')
    try { if (decoded.length === 0 || decoded.toString('base64') !== payload) unavailable(); value = decoded.toString('utf8') } finally { decoded.fill(0) }
  }
  if (!/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(value)) unavailable()
  return value
}

export function consumeNativeTokenOutput ({ status, stdout, stderr }) {
  try {
    if (status !== 0 || !Buffer.isBuffer(stdout) || (stderr?.length ?? 0) !== 0) unavailable()
    return normalizeKeychainToken(stdout.toString('utf8').trim())
  } finally { if (Buffer.isBuffer(stdout)) stdout.fill(0); if (Buffer.isBuffer(stderr)) stderr.fill(0) }
}

export function readTokenFromExactKeychain () {
  if (!NATIVE_ACCESS_APPROVED || process.platform !== 'darwin') unavailable()
  noAmbientOverrides()
  const helper = fileURLToPath(new URL('./staging-disabled-migrations-012-016-keychain.py', import.meta.url))
  const result = spawnSync('/usr/bin/python3', ['-I', '-S', helper], { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, timeout: 2_000, maxBuffer: 512 })
  return consumeNativeTokenOutput(result)
}

export function validateResult (rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || Object.keys(rows[0]).join('|') !== 'tll_disabled_migration_postflight') unavailable()
  const receipt = rows[0].tll_disabled_migration_postflight
  const expected = { installId: INSTALL_ID, projectRef: PROJECT_REF, status: 'PASS', migrationCount: 5, controlsDisabled: true, objectsPresent: true }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || Object.keys(receipt).sort().join('|') !== Object.keys(expected).sort().join('|')) unavailable()
  for (const [key, value] of Object.entries(expected)) if (receipt[key] !== value) unavailable()
  return Object.freeze({ status: 'PASS', target: PROJECT_REF, installId: INSTALL_ID, migrationCount: 5, transactionSha256: sha256(FIXED_QUERY) })
}

export async function postExactlyOnce (token, deadline = Date.now() + MAX_AGE_MS) {
  if (!NATIVE_ACCESS_APPROVED || typeof token !== 'string' || Date.now() >= deadline || deadline - Date.now() > MAX_AGE_MS) unavailable()
  const body = Buffer.from(JSON.stringify({ query: FIXED_QUERY, read_only: false }))
  try {
    return await new Promise((resolvePromise, reject) => {
      const chunks = []; let size = 0; let request; let timer; let done = false
      const wipe = () => { for (const chunk of chunks) chunk.fill(0); chunks.length = 0 }
      const finish = (error, result) => { if (done) return; done = true; clearTimeout(timer); wipe(); if (error) reject(error); else resolvePromise(result) }
      timer = setTimeout(() => { request?.destroy(); finish(new Error('timeout')) }, Math.max(1, deadline - Date.now()))
      try {
        request = https.request({ protocol: 'https:', hostname: ENDPOINT.hostname, port: 443, path: ENDPOINT.path, method: ENDPOINT.method, minVersion: 'TLSv1.2', rejectUnauthorized: true, servername: ENDPOINT.hostname, agent: false, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': body.length } }, response => {
          if (response.statusCode !== 201 || !/^application\/json(?:;|$)/i.test(String(response.headers['content-type'] ?? ''))) { response.destroy(); return finish(new Error('response')) }
          response.on('data', chunk => { size += chunk.length; if (size > MAX_RESPONSE_BYTES) { chunk.fill(0); response.destroy(); finish(new Error('body')) } else chunks.push(chunk) })
          response.on('aborted', () => finish(new Error('response'))); response.on('error', () => finish(new Error('response')))
          response.on('end', () => { let responseBody; try { responseBody = Buffer.concat(chunks); finish(null, validateResult(JSON.parse(responseBody.toString('utf8')))) } catch { finish(new Error('result')) } finally { responseBody?.fill(0) } })
        })
        request.on('error', () => finish(new Error('transport'))); request.end(body)
      } catch { finish(new Error('transport')) }
    })
  } finally { body.fill(0) }
}

/**
 * Dispatches once after an intent is on durable local storage. This is kept
 * independent of native access so its crash boundaries can be tested without
 * enabling the transport. Callers must never invoke it after a prior record.
 */
export async function dispatchWithJournal ({ token, post, manifest, journal = createDispatchJournal(), now = Date.now } = {}) {
  let intent
  try {
    intent = journal.recordIntent({ manifest, timestamp: new Date(now()).toISOString() })
  } catch {
    return Object.freeze({ status: 'PRE_DISPATCH_UNAVAILABLE', target: PROJECT_REF, installId: INSTALL_ID })
  }
  try {
    const receipt = validateJournalReceipt(await post(token, now() + MAX_AGE_MS))
    const receiptHash = sha256(JSON.stringify(receipt))
    try {
      journal.transition(intent, 'RECEIPT_VALIDATED', { receiptSha256: receiptHash })
    } catch {
      // The durable intent remains, which blocks a second request until the
      // read-only reconciliation process establishes the database state.
      return Object.freeze({ status: 'UNCERTAIN_POST_DISPATCH', target: PROJECT_REF, installId: INSTALL_ID, nextAction: 'READ_ONLY_RECONCILIATION_REQUIRED' })
    }
    return receipt
  } catch {
    try { journal.transition(intent, 'RECONCILIATION_REQUIRED') } catch { /* retained INTENT_RECORDED also blocks retry */ }
    return Object.freeze({ status: 'UNCERTAIN_POST_DISPATCH', target: PROJECT_REF, installId: INSTALL_ID, nextAction: 'READ_ONLY_RECONCILIATION_REQUIRED' })
  }
}

export async function runInstallOnce ({ readToken = readTokenFromExactKeychain, post = postExactlyOnce, now = Date.now, journal = createDispatchJournal() } = {}) {
  if (!NATIVE_ACCESS_APPROVED) return Object.freeze({ status: 'NATIVE_ACCESS_DISABLED', target: PROJECT_REF, installId: INSTALL_ID })
  let manifest
  try { manifest = assertGeneratedArtifacts() } catch { return Object.freeze({ status: 'PRE_DISPATCH_UNAVAILABLE', target: PROJECT_REF, installId: INSTALL_ID }) }
  let token
  try { token = readToken() } catch { return Object.freeze({ status: 'PRE_DISPATCH_UNAVAILABLE', target: PROJECT_REF, installId: INSTALL_ID }) }
  return dispatchWithJournal({ token, post, manifest, journal, now })
}

function assertGeneratedArtifacts () {
  const manifest = JSON.parse(fs.readFileSync(new URL('../config/staging-disabled-migrations-012-016.json', import.meta.url), 'utf8'))
  const helper = fs.readFileSync(new URL('./staging-disabled-migrations-012-016-keychain.py', import.meta.url), 'utf8')
  const ownSource = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
  const pins = manifest.sourcePinsForTransport
  if (manifest.target !== PROJECT_REF || manifest.productionExcluded !== PRODUCTION_PROJECT_REF || manifest.nativeAccessApproved !== NATIVE_ACCESS_APPROVED || manifest.transport?.maxRequests !== MAX_REQUESTS || manifest.transactionSha256 !== sha256(FIXED_QUERY) || !Array.isArray(pins) || pins.length !== 2 || pins[0]?.sha256 !== sha256(ownSource) || pins[1]?.sha256 !== sha256(helper) || !new RegExp(`^APPROVED_NATIVE_READ = ${NATIVE_ACCESS_APPROVED ? 'True' : 'False'}$`, 'm').test(helper)) unavailable()
  return manifest
}

async function main () {
  if (process.argv.length !== 2) unavailable()
  assertGeneratedArtifacts()
  return runInstallOnce()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(() => { process.stdout.write(JSON.stringify({ status: 'UNAVAILABLE', target: PROJECT_REF, installId: INSTALL_ID }) + '\n'); process.exitCode = 1 })
}
