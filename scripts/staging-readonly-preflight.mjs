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
const RUNTIME_ROLES = Object.freeze(['tll_customer_runtime', 'tll_cart_runtime', 'tll_broker_runtime', 'tll_provisional_runtime', 'tll_bridge_runtime'])
const CONTROLS = Object.freeze(['customer', 'cart', 'broker', 'provisional', 'bridge'])
const BASELINE_MIGRATIONS = Object.freeze(['202609150002_public_submission_gateway', '202609150003_active_stack_integrity', '202609150004_inventory_operation_ledger', '202609150005_customer_connection_repository', '202609150006_staging_cart_sessions', '202609150007_customer_subject_broker_repository', '202609170008_customer_provisional_admission_repository', '202609170009_inventory_maintenance_authority', '202609170010_customer_admission_bridge', '202609170011_customer_browser_admission_once'])
const FORBIDDEN_MIGRATIONS = Object.freeze(['202609180012_customer_shopify_proof_repository', '202609180013_customer_final_reconciliation', '202609180014_staging_cart_account_transition', '202609180015_customer_account_operations', '202609180016_customer_account_logout'])
const RETIRED_MARKER = 'tll-runtime-window/v1:{"projectRef":"qdmvngjwkcsilzmqksme","generation":5,"windowId":"e8aeb142-d2f8-4a58-b0a5-8931d90a6952","expiresAt":"2026-09-18T14:24:02.000Z","state":"retired"}'
const legacyNativeAdapter = '../../implementation-state/staging/generation-launcher-2026-09-18/native_adapter.py'
const sha256 = value => createHash('sha256').update(value).digest('hex')
const sqlList = values => values.map(value => `'${value}'`).join(',')

// One catalog/status receipt. It returns counts/booleans only: no table rows,
// credential values, role configuration, session identifiers or raw errors.
export const FIXED_QUERY = `BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='5s';
SELECT jsonb_build_object(
 'queryId','${QUERY_ID}',
 'projectRef','${PROJECT_REF}',
 'environmentMarker',coalesce((SELECT environment='tll-hosted-staging-v1' AND operator_project_ref='${PROJECT_REF}' FROM tll_staging_private.environment WHERE singleton),false),
 'operator',jsonb_build_object('current',current_user='postgres','session',session_user='postgres','database',current_database()='postgres','superuser',coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false),'createrole',coalesce((SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user),false),'readAll',pg_has_role(current_user,'pg_read_all_data','USAGE'),'writeAll',NOT pg_has_role(current_user,'pg_write_all_data','USAGE'),'maintain',NOT pg_has_role(current_user,'pg_maintain','USAGE')),
 'migrations',jsonb_build_object('baselineCount',(SELECT count(*) FROM tll_staging_private.applied_migrations WHERE version IN (${sqlList(BASELINE_MIGRATIONS)})),'forbiddenCount',(SELECT count(*) FROM tll_staging_private.applied_migrations WHERE version IN (${sqlList(FORBIDDEN_MIGRATIONS)}))),
 'controls',jsonb_build_object(
   'customer',coalesce((tll_customer_private.operator_status()->>'enabled')='false',false),
   'cart',coalesce((SELECT NOT enabled FROM tll_cart_private.control WHERE singleton),false),
   'broker',coalesce((tll_broker_private.operator_status()->>'enabled')='false',false),
   'provisional',coalesce((tll_provisional_private.operator_status()->>'enabled')='false',false),
   'bridge',coalesce((tll_bridge_private.operator_status()->>'enabled')='false',false)),
 'runtime',jsonb_build_object('roleCount',(SELECT count(*) FROM pg_roles WHERE rolname IN (${sqlList(RUNTIME_ROLES)})),'loginCount',(SELECT count(*) FROM pg_roles WHERE rolname IN (${sqlList(RUNTIME_ROLES)}) AND rolcanlogin),'passwordCount',(SELECT count(*) FROM pg_authid WHERE rolname IN (${sqlList(RUNTIME_ROLES)}) AND rolpassword IS NOT NULL),'membershipCount',(SELECT count(*) FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member WHERE member.rolname IN (${sqlList(RUNTIME_ROLES)})),'sessionCount',(SELECT count(*) FROM pg_stat_activity WHERE usename IN (${sqlList(RUNTIME_ROLES)})),'retiredMarkerCount',(SELECT count(*) FROM pg_roles WHERE rolname IN (${sqlList(RUNTIME_ROLES)}) AND shobj_description(oid,'pg_authid')='${RETIRED_MARKER}')),
 'absentObjects',jsonb_build_object('shopifyProofs',to_regclass('tll_customer_private.shopify_proofs') IS NULL,'finalizations',to_regclass('tll_bridge_private.finalizations') IS NULL,'cartTransitions',to_regclass('tll_cart_private.transitions') IS NULL,'accountGenerations',to_regclass('tll_bridge_private.account_generations') IS NULL,'accountLogouts',to_regclass('tll_bridge_private.account_logouts') IS NULL)
) AS tll_staging_preflight;
COMMIT;
`

const unavailable = () => { throw new Error('Staging read-only preflight unavailable') }
function noAmbientOverrides () {
  for (const name of Object.keys(process.env)) {
    if (name.startsWith('PG') || name.startsWith('SUPABASE_') || ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'https_proxy', 'http_proxy', 'all_proxy', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS'].includes(name)) unavailable()
  }
  const profile = resolve(homedir(), '.supabase/profile')
  try { if (readFileSync(profile, 'utf8').trim() !== 'supabase') unavailable() } catch { unavailable() }
}

export function nativeDesignReference () {
  const path = fileURLToPath(new URL(legacyNativeAdapter, import.meta.url))
  return Object.freeze({ path: legacyNativeAdapter, sha256: sha256(readFileSync(path)), service: KEYCHAIN_SERVICE, account: KEYCHAIN_ACCOUNT })
}

export function readTokenFromExactKeychain () {
  if (!NATIVE_ACCESS_APPROVED || process.platform !== 'darwin') unavailable()
  noAmbientOverrides()
  const native = fileURLToPath(new URL('./staging-readonly-preflight-keychain.py', import.meta.url))
  const result = spawnSync('/usr/bin/python3', ['-I', '-S', native], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, timeout: 2_000, maxBuffer: 512 })
  if (result.status !== 0 || result.stderr || !/^(?:go-keyring-base64:)?sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(result.stdout.trim())) unavailable()
  return result.stdout.trim()
}

export function validateResult (rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || Object.keys(rows[0]).length !== 1 || !Object.hasOwn(rows[0], 'tll_staging_preflight')) unavailable()
  const receipt = rows[0].tll_staging_preflight
  const keys = ['absentObjects', 'controls', 'environmentMarker', 'migrations', 'operator', 'projectRef', 'queryId', 'runtime']
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || Object.keys(receipt).sort().join('|') !== keys.join('|') || receipt.queryId !== QUERY_ID || receipt.projectRef !== PROJECT_REF) unavailable()
  const controls = receipt.controls
  const expectedControls = CONTROLS
  if (!controls || Object.keys(controls).sort().join('|') !== [...expectedControls].sort().join('|') || !expectedControls.every(key => controls[key] === true)) unavailable()
  if (!receipt.environmentMarker || !receipt.operator?.current || !receipt.operator?.session || !receipt.operator?.database || !receipt.operator?.superuser || !receipt.operator?.createrole || !receipt.operator?.readAll || !receipt.operator?.writeAll || !receipt.operator?.maintain) unavailable()
  if (receipt.migrations?.baselineCount !== BASELINE_MIGRATIONS.length || receipt.migrations?.forbiddenCount !== 0) unavailable()
  if (receipt.runtime?.roleCount !== RUNTIME_ROLES.length || receipt.runtime?.loginCount !== 0 || receipt.runtime?.passwordCount !== 0 || receipt.runtime?.membershipCount !== 0 || receipt.runtime?.sessionCount !== 0 || receipt.runtime?.retiredMarkerCount !== RUNTIME_ROLES.length) unavailable()
  if (!receipt.absentObjects || Object.keys(receipt.absentObjects).length !== 5 || !Object.values(receipt.absentObjects).every(value => value === true)) unavailable()
  return Object.freeze({ target: PROJECT_REF, queryId: QUERY_ID, timestamp: new Date().toISOString(), status: 'PASS', counts: Object.freeze({ baselineMigrations: receipt.migrations.baselineCount, forbiddenMigrations: receipt.migrations.forbiddenCount, runtimeRoles: receipt.runtime.roleCount, runtimeSessions: receipt.runtime.sessionCount, absentObjects: Object.keys(receipt.absentObjects).length }), receiptHash: sha256(JSON.stringify({ queryId: QUERY_ID, projectRef: PROJECT_REF, controls, migrations: receipt.migrations, runtime: receipt.runtime, absentObjects: receipt.absentObjects })) })
}

export async function postExactlyOnce (token, deadline = Date.now() + MAX_AGE_MS) {
  if (!NATIVE_ACCESS_APPROVED || typeof token !== 'string' || Date.now() >= deadline || deadline - Date.now() > MAX_AGE_MS) unavailable()
  const body = Buffer.from(JSON.stringify({ query: FIXED_QUERY, read_only: false }))
  try {
    return await new Promise((resolvePromise, reject) => {
      let done = false; const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); if (error) reject(error); else resolvePromise(value) }
      const timer = setTimeout(() => finish(new Error('timeout')), Math.max(1, deadline - Date.now()))
      const request = https.request({ protocol: 'https:', hostname: ENDPOINT.hostname, port: 443, path: ENDPOINT.path, method: ENDPOINT.method, minVersion: 'TLSv1.2', rejectUnauthorized: true, servername: ENDPOINT.hostname, agent: false, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': body.length } }, response => {
        const chunks = []; let size = 0
        if (response.statusCode !== 201 || !/^application\/json(?:;|$)/i.test(String(response.headers['content-type'] ?? ''))) return finish(new Error('response'))
        response.on('data', chunk => { size += chunk.length; if (size > 16_384) { response.destroy(); finish(new Error('body')) } else chunks.push(chunk) })
        response.on('error', () => finish(new Error('response')))
        response.on('end', () => { try { finish(null, validateResult(JSON.parse(Buffer.concat(chunks).toString('utf8')))) } catch { finish(new Error('result')) } })
      })
      request.on('error', () => finish(new Error('transport')))
      request.end(body)
    })
  } finally { body.fill(0) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(JSON.stringify({ status: 'NATIVE_ACCESS_DISABLED', target: PROJECT_REF, queryId: QUERY_ID, nativeDesign: nativeDesignReference() }) + '\n')
