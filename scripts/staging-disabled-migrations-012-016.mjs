/**
 * One deliberately disabled transport for the reviewed staging-only upgrade.
 * It has no caller-supplied SQL, URL, headers, retry path, or production path.
 */
import https from 'node:https'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
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

export async function runInstallOnce ({ readToken = readTokenFromExactKeychain, post = postExactlyOnce, now = Date.now } = {}) {
  if (!NATIVE_ACCESS_APPROVED) return Object.freeze({ status: 'NATIVE_ACCESS_DISABLED', target: PROJECT_REF, installId: INSTALL_ID })
  const token = readToken()
  try { return await post(token, now() + MAX_AGE_MS) } finally { /* never persist or log token */ }
}

function assertGeneratedArtifacts () {
  const manifest = JSON.parse(readFileSync(new URL('../config/staging-disabled-migrations-012-016.json', import.meta.url), 'utf8'))
  const helper = readFileSync(new URL('./staging-disabled-migrations-012-016-keychain.py', import.meta.url), 'utf8')
  if (manifest.target !== PROJECT_REF || manifest.productionExcluded !== PRODUCTION_PROJECT_REF || manifest.nativeAccessApproved !== false || manifest.transport?.maxRequests !== MAX_REQUESTS || manifest.transactionSha256 !== sha256(FIXED_QUERY) || !/^APPROVED_NATIVE_READ = False$/m.test(helper)) unavailable()
}

async function main () {
  if (process.argv.length !== 2) unavailable()
  assertGeneratedArtifacts()
  return runInstallOnce()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(() => { process.stdout.write(JSON.stringify({ status: 'UNAVAILABLE', target: PROJECT_REF, installId: INSTALL_ID }) + '\n'); process.exitCode = 1 })
}
