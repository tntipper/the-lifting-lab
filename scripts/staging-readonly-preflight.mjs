/**
 * Fixed, disabled hosted-staging preflight. This is deliberately not a general
 * Supabase or SQL client: it has no input surface for a URL, method, headers or
 * query and has no import/call path to a mutation launcher.
 */
import https from 'node:https'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'

export const NATIVE_ACCESS_APPROVED = false
export const PROJECT_REF = 'qdmvngjwkcsilzmqksme'
export const PRODUCTION_PROJECT_REF = 'wrhgscovsgsudtedbljr'
export const QUERY_ID = 'tll-staging-readonly-preflight/v1'
export const KEYCHAIN_SERVICE = 'Supabase CLI'
export const KEYCHAIN_ACCOUNT = 'supabase'
export const ENDPOINT = Object.freeze({ hostname: 'api.supabase.com', path: `/v1/projects/${PROJECT_REF}/database/query`, method: 'POST' })
export const MAX_AGE_MS = 60_000
export const NATIVE_HELPER_TIMEOUT_MS = 15_000
const RUNTIME_ROLES = Object.freeze(['tll_customer_runtime', 'tll_cart_runtime', 'tll_broker_runtime', 'tll_provisional_runtime', 'tll_bridge_runtime'])
const CONTROLS = Object.freeze(['customer', 'cart', 'broker', 'provisional', 'bridge'])
const BASELINE_MIGRATIONS = Object.freeze([['202609150002_public_submission_gateway', 'c82f9afb10c7ee7e46549033d4076046568557226a7864f8c2b8c8117ecd4bca'], ['202609150003_active_stack_integrity', '05cac500b24262975a773b2db284bc3fb95b62dc25fc6d47670eefbc86f15a60'], ['202609150004_inventory_operation_ledger', '030ccb26228aca6665147eced447815f8a290abd74b8003b0f32bfb2a05e5a76'], ['202609150005_customer_connection_repository', 'f0f49edca9a0938b8e40b4d87ba7ee1eaee02dbc5082fc019a58ca949b263d0b'], ['202609150006_staging_cart_sessions', '17d039a6d1f343f35d1551c259a3f8c0e8643fe669b8230170a235bbc941155c'], ['202609150007_customer_subject_broker_repository', '85a118335d91d896b707dcdff1570f6c2df22a9b2037e9a569b587b89ad41c21'], ['202609170008_customer_provisional_admission_repository', '038b2bfc9d236f39c0cb5ae9b657a5a54b572fc304e6da318b00a07cf0d201e2'], ['202609170009_inventory_maintenance_authority', '4f054b145466a6ef2136ec79a0e1c17e8aa252e5bc02fa8c27deb23664eb153f'], ['202609170010_customer_admission_bridge', '711b92ef8a6e5760a126e340396f68cc372e361ee3e6bf66f3e6f3370be5f7aa'], ['202609170011_customer_browser_admission_once', '12bf5b5916d2f266f218bcd39c38098aea3225acef1cb0f67b47fe76bc29f58f']])
const FORBIDDEN_MIGRATIONS = Object.freeze(['202609180012_customer_shopify_proof_repository', '202609180013_customer_final_reconciliation', '202609180014_staging_cart_account_transition', '202609180015_customer_account_operations', '202609180016_customer_account_logout'])
const RETIRED_MARKER = 'tll-runtime-window/v1:{"projectRef":"qdmvngjwkcsilzmqksme","generation":5,"windowId":"e8aeb142-d2f8-4a58-b0a5-8931d90a6952","expiresAt":"2026-09-18T14:24:02.000Z","state":"retired"}'
const legacyNativeAdapter = '../../implementation-state/staging/generation-launcher-2026-09-18/native_adapter.py'
const sha256 = value => createHash('sha256').update(value).digest('hex')
const sqlList = values => values.map(value => `'${value}'`).join(',')
const migrationPairs = BASELINE_MIGRATIONS.map(([version, hash]) => `('${version}','${hash}')`).join(',')

// One catalog/status receipt. It returns counts/booleans only: no table rows,
// credential values, role configuration, session identifiers or raw errors.
export const FIXED_QUERY = `BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='5s';
SELECT jsonb_build_object(
 'queryId','${QUERY_ID}',
 'projectRef','${PROJECT_REF}',
 'environmentMarker',coalesce((SELECT environment='tll-hosted-staging-v1' AND operator_project_ref='${PROJECT_REF}' FROM tll_staging_private.environment WHERE singleton),false),
 'operator',jsonb_build_object('current',current_user='postgres','session',session_user='postgres','database',current_database()='postgres','notSuperuser',NOT coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),true),'createrole',coalesce((SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user),false),'readAll',pg_has_role(current_user,'pg_read_all_data','USAGE'),'writeAll',NOT pg_has_role(current_user,'pg_write_all_data','USAGE'),'maintain',NOT pg_has_role(current_user,'pg_maintain','USAGE')),
 'migrations',jsonb_build_object('totalCount',(SELECT count(*) FROM tll_staging_private.applied_migrations),'baselinePairCount',(SELECT count(*) FROM (VALUES ${migrationPairs}) AS expected(version,source_sha256) JOIN tll_staging_private.applied_migrations actual USING(version,source_sha256)),'forbiddenCount',(SELECT count(*) FROM tll_staging_private.applied_migrations WHERE version IN (${sqlList(FORBIDDEN_MIGRATIONS)}))),
 'controls',jsonb_build_object(
   'customer',coalesce((tll_customer_private.operator_status()->>'enabled')='false',false),
   'cart',coalesce((SELECT NOT enabled FROM tll_cart_private.control WHERE singleton),false),
   'broker',coalesce((tll_broker_private.operator_status()->>'enabled')='false',false),
   'provisional',coalesce((tll_provisional_private.operator_status()->>'enabled')='false',false),
   'bridge',coalesce((tll_bridge_private.operator_status()->>'enabled')='false',false)),
 'runtime',jsonb_build_object('roleCount',(SELECT count(*) FROM pg_roles WHERE rolname IN (${sqlList(RUNTIME_ROLES)})),'loginCount',(SELECT count(*) FROM pg_roles WHERE rolname IN (${sqlList(RUNTIME_ROLES)}) AND rolcanlogin),'passwordCount',(SELECT count(*) FROM pg_authid WHERE rolname IN (${sqlList(RUNTIME_ROLES)}) AND rolpassword IS NOT NULL),'edgeCount',(SELECT count(*) FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE granted.rolname IN (${sqlList(RUNTIME_ROLES)}) OR member.rolname IN (${sqlList(RUNTIME_ROLES)})),'retiredOperatorEdgeCount',(SELECT count(*) FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles member ON member.oid=m.member JOIN pg_roles grantor ON grantor.oid=m.grantor WHERE granted.rolname IN (${sqlList(RUNTIME_ROLES)}) AND member.rolname='postgres' AND grantor.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option),'sessionCount',(SELECT count(*) FROM pg_stat_activity WHERE usename IN (${sqlList(RUNTIME_ROLES)})),'retiredMarkerCount',(SELECT count(*) FROM pg_roles WHERE rolname IN (${sqlList(RUNTIME_ROLES)}) AND shobj_description(oid,'pg_authid')='${RETIRED_MARKER}')),
 'absentObjects',jsonb_build_object('shopifyProofs',to_regclass('tll_customer_private.shopify_proofs') IS NULL,'finalizations',to_regclass('tll_bridge_private.finalizations') IS NULL,'cartTransitions',to_regclass('tll_cart_private.transitions') IS NULL,'accountGenerations',to_regclass('tll_bridge_private.account_generations') IS NULL,'accountLogouts',to_regclass('tll_bridge_private.account_logouts') IS NULL)
) AS tll_staging_preflight;
COMMIT;
`

const unavailable = () => { throw new Error('Staging read-only preflight unavailable') }
export function validateSupabaseProfile (content) {
  if (content !== undefined && (typeof content !== 'string' || content.trim() !== 'supabase')) unavailable()
  return true
}
function noAmbientOverrides () {
  for (const name of Object.keys(process.env)) {
    if (name.startsWith('PG') || name.startsWith('SUPABASE_') || ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'https_proxy', 'http_proxy', 'all_proxy', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'NODE_OPTIONS', 'SSLKEYLOGFILE', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'OPENSSL_CONF', 'OPENSSL_MODULES'].includes(name)) unavailable()
  }
  const profile = resolve(homedir(), '.supabase/profile')
  try { validateSupabaseProfile(readFileSync(profile, 'utf8')) } catch (error) { if (error?.code !== 'ENOENT') unavailable() }
}

export function nativeDesignReference () {
  const path = fileURLToPath(new URL(legacyNativeAdapter, import.meta.url))
  return Object.freeze({ path: legacyNativeAdapter, sha256: sha256(readFileSync(path)), service: KEYCHAIN_SERVICE, account: KEYCHAIN_ACCOUNT })
}

export function normalizeKeychainToken (value) {
  if (typeof value !== 'string' || value.length > 256) unavailable()
  if (value.startsWith('go-keyring-base64:')) {
    const payload = value.slice('go-keyring-base64:'.length)
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length === 0 || payload.length % 4 !== 0) unavailable()
    const decoded = Buffer.from(payload, 'base64')
    try {
      if (decoded.length === 0 || decoded.toString('base64') !== payload) unavailable()
      value = decoded.toString('utf8')
    } finally { decoded.fill(0) }
  }
  if (!/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(value)) unavailable()
  return value
}

export function consumeNativeTokenOutput ({ status, stdout, stderr }) {
  try {
    if (status !== 0 || !Buffer.isBuffer(stdout) || (stderr?.length ?? 0) !== 0) unavailable()
    return normalizeKeychainToken(stdout.toString('utf8').trim())
  } finally {
    if (Buffer.isBuffer(stdout)) stdout.fill(0)
    if (Buffer.isBuffer(stderr)) stderr.fill(0)
  }
}

export function readTokenFromExactKeychain () {
  if (!NATIVE_ACCESS_APPROVED || process.platform !== 'darwin') unavailable()
  noAmbientOverrides()
  const native = fileURLToPath(new URL('./staging-readonly-preflight-keychain.py', import.meta.url))
  const result = spawnSync('/usr/bin/python3', ['-I', '-S', native], { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, timeout: NATIVE_HELPER_TIMEOUT_MS, maxBuffer: 512 })
  return consumeNativeTokenOutput(result)
}

export function validateResult (rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || Object.keys(rows[0]).length !== 1 || !Object.hasOwn(rows[0], 'tll_staging_preflight')) unavailable()
  const receipt = rows[0].tll_staging_preflight
  const keys = ['absentObjects', 'controls', 'environmentMarker', 'migrations', 'operator', 'projectRef', 'queryId', 'runtime']
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || Object.keys(receipt).sort().join('|') !== keys.join('|') || receipt.queryId !== QUERY_ID || receipt.projectRef !== PROJECT_REF) unavailable()
  const controls = receipt.controls
  const expectedControls = CONTROLS
  if (!controls || Object.keys(controls).sort().join('|') !== [...expectedControls].sort().join('|') || !expectedControls.every(key => controls[key] === true)) unavailable()
  const operatorKeys = ['createrole', 'current', 'database', 'maintain', 'notSuperuser', 'readAll', 'session', 'writeAll']
  if (!receipt.environmentMarker || Object.keys(receipt.operator ?? {}).sort().join('|') !== operatorKeys.join('|') || !receipt.operator.current || !receipt.operator.session || !receipt.operator.database || !receipt.operator.notSuperuser || !receipt.operator.createrole || !receipt.operator.readAll || !receipt.operator.writeAll || !receipt.operator.maintain) unavailable()
  if (receipt.migrations?.totalCount !== BASELINE_MIGRATIONS.length || receipt.migrations?.baselinePairCount !== BASELINE_MIGRATIONS.length || receipt.migrations?.forbiddenCount !== 0) unavailable()
  const runtimeKeys = ['edgeCount', 'loginCount', 'passwordCount', 'retiredMarkerCount', 'retiredOperatorEdgeCount', 'roleCount', 'sessionCount']
  if (Object.keys(receipt.runtime ?? {}).sort().join('|') !== runtimeKeys.join('|') || receipt.runtime.roleCount !== RUNTIME_ROLES.length || receipt.runtime.loginCount !== 0 || receipt.runtime.passwordCount !== 0 || receipt.runtime.edgeCount !== RUNTIME_ROLES.length || receipt.runtime.retiredOperatorEdgeCount !== RUNTIME_ROLES.length || receipt.runtime.sessionCount !== 0 || receipt.runtime.retiredMarkerCount !== RUNTIME_ROLES.length) unavailable()
  if (!receipt.absentObjects || Object.keys(receipt.absentObjects).length !== 5 || !Object.values(receipt.absentObjects).every(value => value === true)) unavailable()
  return Object.freeze({ target: PROJECT_REF, queryId: QUERY_ID, timestamp: new Date().toISOString(), status: 'PASS', counts: Object.freeze({ baselineMigrations: receipt.migrations.baselinePairCount, forbiddenMigrations: receipt.migrations.forbiddenCount, runtimeRoles: receipt.runtime.roleCount, runtimeSessions: receipt.runtime.sessionCount, absentObjects: Object.keys(receipt.absentObjects).length }), receiptHash: sha256(JSON.stringify({ queryId: QUERY_ID, projectRef: PROJECT_REF, controls, migrations: receipt.migrations, runtime: receipt.runtime, absentObjects: receipt.absentObjects })) })
}

export async function postExactlyOnce (token, deadline = Date.now() + MAX_AGE_MS) {
  if (!NATIVE_ACCESS_APPROVED || typeof token !== 'string' || Date.now() >= deadline || deadline - Date.now() > MAX_AGE_MS) unavailable()
  const body = Buffer.from(JSON.stringify({ query: FIXED_QUERY, read_only: false }))
  try {
    return await new Promise((resolvePromise, reject) => {
      const chunks = []; let size = 0; let request; let timer; let done = false
      const wipeChunks = () => { for (const chunk of chunks) chunk.fill(0); chunks.length = 0 }
      const finish = (error, value) => {
        if (done) return
        done = true; clearTimeout(timer); wipeChunks()
        if (error) reject(error); else resolvePromise(value)
      }
      timer = setTimeout(() => { request?.destroy(); finish(new Error('timeout')) }, Math.max(1, deadline - Date.now()))
      try {
        request = https.request({ protocol: 'https:', hostname: ENDPOINT.hostname, port: 443, path: ENDPOINT.path, method: ENDPOINT.method, minVersion: 'TLSv1.2', rejectUnauthorized: true, servername: ENDPOINT.hostname, agent: false, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': body.length } }, response => {
          if (response.statusCode !== 201 || !/^application\/json(?:;|$)/i.test(String(response.headers['content-type'] ?? ''))) { response.destroy(); return finish(new Error('response')) }
          response.on('data', chunk => { size += chunk.length; if (size > 16_384) { chunk.fill(0); response.destroy(); finish(new Error('body')) } else chunks.push(chunk) })
          response.on('aborted', () => finish(new Error('response')))
          response.on('error', () => finish(new Error('response')))
          response.on('end', () => {
            let responseBody
            try { responseBody = Buffer.concat(chunks); finish(null, validateResult(JSON.parse(responseBody.toString('utf8')))) } catch { finish(new Error('result')) } finally { responseBody?.fill(0) }
          })
        })
        request.on('error', () => finish(new Error('transport')))
        request.end(body)
      } catch { finish(new Error('transport')) }
    })
  } finally { body.fill(0) }
}

export async function runPreflightOnce ({ readToken = readTokenFromExactKeychain, post = postExactlyOnce, now = Date.now } = {}) {
  if (!NATIVE_ACCESS_APPROVED) return Object.freeze({ status: 'NATIVE_ACCESS_DISABLED', target: PROJECT_REF, queryId: QUERY_ID })
  const deadline = now() + MAX_AGE_MS
  const token = readToken()
  try { return await post(token, deadline) } finally { /* token is never logged or persisted */ }
}

async function main () {
  if (process.argv.length !== 2) unavailable()
  return runPreflightOnce()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(() => {
    process.stdout.write(JSON.stringify({ status: 'UNAVAILABLE', target: PROJECT_REF, queryId: QUERY_ID }) + '\n')
    process.exitCode = 1
  })
}
