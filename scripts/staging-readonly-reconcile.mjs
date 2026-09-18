/**
 * Separate, fixed observation-only reconciliation for the one uncertain
 * disabled-migration dispatch. This is not the preflight and cannot install,
 * recover, enable, or invoke application functions.
 */
import https from 'node:https'
import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const NATIVE_ACCESS_APPROVED = false
export const PROJECT_REF = 'qdmvngjwkcsilzmqksme'
export const PRODUCTION_PROJECT_REF = 'wrhgscovsgsudtedbljr'
export const QUERY_ID = 'tll-staging-readonly-reconcile/v1'
export const PRIOR_ATTEMPT = 'UNCERTAIN_POST_DISPATCH'
export const KEYCHAIN_SERVICE = 'Supabase CLI'
export const KEYCHAIN_ACCOUNT = 'supabase'
export const ENDPOINT = Object.freeze({ hostname: 'api.supabase.com', path: `/v1/projects/${PROJECT_REF}/database/query`, method: 'POST' })
export const MAX_AGE_MS = 60_000
export const NATIVE_HELPER_TIMEOUT_MS = 15_000
export const DEFAULT_JOURNAL_PATH = fileURLToPath(new URL('../../implementation-state/staging/tll-staging-readonly-reconcile-observation.json', import.meta.url))
const RUNTIME_ROLES = Object.freeze(['tll_customer_runtime', 'tll_cart_runtime', 'tll_broker_runtime', 'tll_provisional_runtime', 'tll_bridge_runtime'])
const CONTROLS = Object.freeze([['customer', 'tll_customer_private.control'], ['cart', 'tll_cart_private.control'], ['broker', 'tll_broker_private.control'], ['provisional', 'tll_provisional_private.control'], ['bridge', 'tll_bridge_private.control']])
const BASELINE = Object.freeze([
  ['202609150002_public_submission_gateway', 'c82f9afb10c7ee7e46549033d4076046568557226a7864f8c2b8c8117ecd4bca'],
  ['202609150003_active_stack_integrity', '05cac500b24262975a773b2db284bc3fb95b62dc25fc6d47670eefbc86f15a60'],
  ['202609150004_inventory_operation_ledger', '030ccb26228aca6665147eced447815f8a290abd74b8003b0f32bfb2a05e5a76'],
  ['202609150005_customer_connection_repository', 'f0f49edca9a0938b8e40b4d87ba7ee1eaee02dbc5082fc019a58ca949b263d0b'],
  ['202609150006_staging_cart_sessions', '17d039a6d1f343f35d1551c259a3f8c0e8643fe669b8230170a235bbc941155c'],
  ['202609150007_customer_subject_broker_repository', '85a118335d91d896b707dcdff1570f6c2df22a9b2037e9a569b587b89ad41c21'],
  ['202609170008_customer_provisional_admission_repository', '038b2bfc9d236f39c0cb5ae9b657a5a54b572fc304e6da318b00a07cf0d201e2'],
  ['202609170009_inventory_maintenance_authority', '4f054b145466a6ef2136ec79a0e1c17e8aa252e5bc02fa8c27deb23664eb153f'],
  ['202609170010_customer_admission_bridge', '711b92ef8a6e5760a126e340396f68cc372e361ee3e6bf66f3e6f3370be5f7aa'],
  ['202609170011_customer_browser_admission_once', '12bf5b5916d2f266f218bcd39c38098aea3225acef1cb0f67b47fe76bc29f58f'],
])
const FORBIDDEN = Object.freeze(['202609180012_customer_shopify_proof_repository', '202609180013_customer_final_reconciliation', '202609180014_staging_cart_account_transition', '202609180015_customer_account_operations', '202609180016_customer_account_logout'])
const ABSENT = Object.freeze([['shopifyProofs', 'tll_customer_private.shopify_proofs'], ['finalizations', 'tll_bridge_private.finalizations'], ['cartTransitions', 'tll_cart_private.transitions'], ['accountGenerations', 'tll_bridge_private.account_generations'], ['accountLogouts', 'tll_bridge_private.account_logouts']])
const RETIRED_WINDOW_ID = '83888906-23fa-4653-a886-fe2733ed76a0'
const sha256 = value => createHash('sha256').update(value).digest('hex')
const unavailable = () => { throw new Error('Staging read-only reconciliation unavailable') }
const quoted = value => `'${value}'`
const list = values => values.map(quoted).join(',')
const pairValues = BASELINE.map(([v, h]) => `(${quoted(v)},${quoted(h)})`).join(',')

// Exactly one SELECT statement. It contains no function invocation from an
// application schema, no transaction command, and no data-changing keyword.
export const FIXED_QUERY = `SELECT jsonb_build_object(
 'queryId',${quoted(QUERY_ID)},'projectRef',${quoted(PROJECT_REF)},'priorAttempt',${quoted(PRIOR_ATTEMPT)},
 'environmentMarker',coalesce((SELECT environment='tll-hosted-staging-v1' AND operator_project_ref=${quoted(PROJECT_REF)} AND operator_project_ref<>${quoted(PRODUCTION_PROJECT_REF)} FROM tll_staging_private.environment WHERE singleton),false),
 'operator',jsonb_build_object('current',current_user='postgres','session',session_user='postgres','database',current_database()='postgres','notSuperuser',NOT coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),true),'createrole',coalesce((SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user),false),'readAll',pg_has_role(current_user,'pg_read_all_data','USAGE'),'writeAll',pg_has_role(current_user,'pg_write_all_data','USAGE'),'maintain',pg_has_role(current_user,'pg_maintain','USAGE')),
 'migrations',jsonb_build_object('totalCount',(SELECT count(*) FROM tll_staging_private.applied_migrations),'baselinePairCount',(SELECT count(*) FROM (VALUES ${pairValues}) AS expected(version,source_sha256) JOIN tll_staging_private.applied_migrations actual USING(version,source_sha256)),'forbiddenCount',(SELECT count(*) FROM tll_staging_private.applied_migrations WHERE version IN (${list(FORBIDDEN)}))),
 'controls',jsonb_build_object(${CONTROLS.map(([key, table]) => `${quoted(key)},coalesce((SELECT NOT enabled FROM ${table} WHERE singleton),false)`).join(',')}),
 'runtime',jsonb_build_object('roleCount',(SELECT count(*) FROM pg_roles WHERE rolname IN (${list(RUNTIME_ROLES)})),'loginCount',(SELECT count(*) FROM pg_roles WHERE rolname IN (${list(RUNTIME_ROLES)}) AND rolcanlogin),'passwordCount',(SELECT count(*) FROM pg_authid WHERE rolname IN (${list(RUNTIME_ROLES)}) AND rolpassword IS NOT NULL),'edgeCount',(SELECT count(*) FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE g.rolname IN (${list(RUNTIME_ROLES)}) OR member.rolname IN (${list(RUNTIME_ROLES)})),'retiredOperatorEdgeCount',(SELECT count(*) FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE g.rolname IN (${list(RUNTIME_ROLES)}) AND member.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option),'qualifyingDistinctRoleCount',(SELECT count(DISTINCT g.oid) FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE g.rolname IN (${list(RUNTIME_ROLES)}) AND member.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option),'sessionCount',(SELECT count(*) FROM pg_stat_activity WHERE usename IN (${list(RUNTIME_ROLES)})),'retiredMarkerCount',(SELECT count(*) FROM pg_roles WHERE rolname IN (${list(RUNTIME_ROLES)}) AND shobj_description(oid,'pg_authid') ~ ${quoted(`^tll-runtime-window/v1 [\\{].*[\\}]$`)} AND ((substring(shobj_description(oid,'pg_authid') FROM '^tll-runtime-window/v1 ([\\{].*[\\}])$'))::jsonb->>'projectRef')=${quoted(PROJECT_REF)} AND ((substring(shobj_description(oid,'pg_authid') FROM '^tll-runtime-window/v1 ([\\{].*[\\}])$'))::jsonb->>'generation')='6' AND ((substring(shobj_description(oid,'pg_authid') FROM '^tll-runtime-window/v1 ([\\{].*[\\}])$'))::jsonb->>'windowId')=${quoted(RETIRED_WINDOW_ID)} AND ((substring(shobj_description(oid,'pg_authid') FROM '^tll-runtime-window/v1 ([\\{].*[\\}])$'))::jsonb->>'state')='retired')),
 'absentObjects',jsonb_build_object(${ABSENT.map(([key, relation]) => `${quoted(key)},to_regclass(${quoted(relation)}) IS NULL`).join(',')})
) AS tll_staging_readonly_reconcile;`

function noAmbientOverrides () { for (const name of Object.keys(process.env)) if (name.startsWith('PG') || name.startsWith('SUPABASE_') || ['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','https_proxy','http_proxy','all_proxy','NODE_TLS_REJECT_UNAUTHORIZED','NODE_EXTRA_CA_CERTS','NODE_DEBUG','NODE_DEBUG_NATIVE','NODE_OPTIONS','SSLKEYLOGFILE','SSL_CERT_FILE','SSL_CERT_DIR','OPENSSL_CONF','OPENSSL_MODULES'].includes(name)) unavailable() }
export function normalizeKeychainToken (value) { if (typeof value !== 'string' || value.length > 256) unavailable(); if (value.startsWith('go-keyring-base64:')) { const payload = value.slice(18); if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || !payload || payload.length % 4) unavailable(); const decoded = Buffer.from(payload, 'base64'); try { if (decoded.toString('base64') !== payload) unavailable(); value = decoded.toString('utf8') } finally { decoded.fill(0) } } if (!/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(value)) unavailable(); return value }
export function consumeNativeTokenOutput ({ status, stdout, stderr }) { try { if (status !== 0 || !Buffer.isBuffer(stdout) || (stderr?.length ?? 0) !== 0) unavailable(); return normalizeKeychainToken(stdout.toString('utf8').trim()) } finally { if (Buffer.isBuffer(stdout)) stdout.fill(0); if (Buffer.isBuffer(stderr)) stderr.fill(0) } }
export function readTokenFromExactKeychain () { if (!NATIVE_ACCESS_APPROVED || process.platform !== 'darwin') unavailable(); noAmbientOverrides(); const helper = fileURLToPath(new URL('./staging-readonly-reconcile-keychain.py', import.meta.url)); return consumeNativeTokenOutput(spawnSync('/usr/bin/python3', ['-I','-S',helper], { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, timeout: NATIVE_HELPER_TIMEOUT_MS, maxBuffer: 512 })) }

const isBooleanMap = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|') && keys.every(key => typeof value[key] === 'boolean')
const isCount = value => Number.isInteger(value) && value >= 0 && value <= 1_000_000
export function validateResult (rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || Object.keys(rows[0]).join('|') !== 'tll_staging_readonly_reconcile') unavailable()
  const o = rows[0].tll_staging_readonly_reconcile
  const operatorKeys = ['current','session','database','notSuperuser','createrole','readAll','writeAll','maintain']
  const runtimeKeys = ['roleCount','loginCount','passwordCount','edgeCount','retiredOperatorEdgeCount','qualifyingDistinctRoleCount','sessionCount','retiredMarkerCount']
  if (!o || typeof o !== 'object' || Array.isArray(o) || o.queryId !== QUERY_ID || o.projectRef !== PROJECT_REF || o.priorAttempt !== PRIOR_ATTEMPT || typeof o.environmentMarker !== 'boolean' || !isBooleanMap(o.operator, operatorKeys) || !isBooleanMap(o.controls, CONTROLS.map(([key]) => key)) || !isBooleanMap(o.absentObjects, ABSENT.map(([key]) => key)) || !o.migrations || !['totalCount','baselinePairCount','forbiddenCount'].every(key => isCount(o.migrations[key])) || !o.runtime || !runtimeKeys.every(key => isCount(o.runtime[key]))) unavailable()
  const expected = { environmentMarker: true, migrations: { totalCount: 15, baselinePairCount: 10, forbiddenCount: 5 }, controls: Object.fromEntries(CONTROLS.map(([key]) => [key, true])), runtime: { roleCount: 5, loginCount: 0, passwordCount: 0, edgeCount: 10, retiredOperatorEdgeCount: 5, qualifyingDistinctRoleCount: 5, sessionCount: 0, retiredMarkerCount: 5 }, absentObjects: Object.fromEntries(ABSENT.map(([key]) => [key, false])) }
  const observed = { environmentMarker: o.environmentMarker, migrations: o.migrations, controls: o.controls, runtime: o.runtime, absentObjects: o.absentObjects, operator: o.operator }
  const differences = Object.keys(expected).filter(key => JSON.stringify(observed[key]) !== JSON.stringify(expected[key]))
  return Object.freeze({ status: 'PASS', target: PROJECT_REF, queryId: QUERY_ID, priorAttempt: PRIOR_ATTEMPT, observed, differences, observationHash: sha256(JSON.stringify(observed)) })
}

const sizeBucket = size => size === 0 ? '0' : size <= 1024 ? '1k' : size <= 4096 ? '4k' : size <= 16384 ? '16k' : 'over-limit'
const statusClass = code => Number.isInteger(code) ? `${Math.floor(code / 100)}xx` : 'none'
const allowed400Category = body => /read.?only/i.test(body) ? 'read_only' : /syntax/i.test(body) ? 'syntax' : /relation|object.*does not exist/i.test(body) ? 'missing_object' : /permission|privilege/i.test(body) ? 'permission' : /timeout|statement.*cancel/i.test(body) ? 'timeout' : 'unknown'
export async function postExactlyOnce (token, deadline = Date.now() + MAX_AGE_MS) {
  if (!NATIVE_ACCESS_APPROVED || typeof token !== 'string' || Date.now() >= deadline || deadline - Date.now() > MAX_AGE_MS) unavailable()
  const body = Buffer.from(JSON.stringify({ query: FIXED_QUERY, read_only: true }))
  try { return await new Promise((resolvePromise, reject) => { const chunks=[]; let size=0; let request; let timer; let done=false; const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);for(const c of chunks)c.fill(0);if(error)reject(error);else resolvePromise(value)}; timer=setTimeout(()=>{request?.destroy();finish(Object.freeze({ kind:'timeout' }))},Math.max(1,deadline-Date.now())); request=https.request({ protocol:'https:',hostname:ENDPOINT.hostname,port:443,path:ENDPOINT.path,method:ENDPOINT.method,minVersion:'TLSv1.2',rejectUnauthorized:true,servername:ENDPOINT.hostname,agent:false,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Length':body.length}},response=>{response.on('data',chunk=>{size+=chunk.length;if(size>16384){chunk.fill(0);response.destroy();return finish(Object.freeze({kind:'response',statusClass:statusClass(response.statusCode),contentType:'oversize',sizeBucket:'over-limit'}))}chunks.push(chunk)});response.on('error',()=>finish(Object.freeze({kind:'transport'})));response.on('aborted',()=>finish(Object.freeze({kind:'transport'})));response.on('end',()=>{let raw;try{raw=Buffer.concat(chunks);const contentType=/^application\/json(?:;|$)/i.test(String(response.headers['content-type']??''))?'json':'other';if(response.statusCode!==201||contentType!=='json')return finish(Object.freeze({kind:'response',statusClass:statusClass(response.statusCode),contentType,sizeBucket:sizeBucket(raw.length),category:response.statusCode===400?allowed400Category(raw.toString('utf8')):undefined}));finish(null,validateResult(JSON.parse(raw.toString('utf8'))))}catch{finish(Object.freeze({kind:'response',statusClass:statusClass(response.statusCode),contentType:'json',sizeBucket:sizeBucket(size),category:'unknown'}))}finally{raw?.fill(0)}})});request.on('error',()=>finish(Object.freeze({kind:'transport'})));request.end(body) }) } finally { body.fill(0) }
}

function durableClaim (path, record, fileSystem=fs) { const directory=dirname(path); const data=Buffer.from(JSON.stringify(record)+'\n'); let fd; try { fileSystem.mkdirSync(directory,{recursive:true,mode:0o700}); fd=fileSystem.openSync(path,'wx',0o600); fileSystem.writeSync(fd,data); fileSystem.fsyncSync(fd) } finally { if(fd!==undefined)fileSystem.closeSync(fd);data.fill(0) } }
export function createObservationJournal ({ path=DEFAULT_JOURNAL_PATH, fileSystem=fs, makeRunId=randomUUID }={}) { let owned; return Object.freeze({ path, claim(timestamp){const runId=makeRunId();if(typeof runId!=='string'||runId.length<8)unavailable();const r=Object.freeze({schema:`${QUERY_ID}/observation-journal/v1`,state:'INTENT_RECORDED',target:PROJECT_REF,queryId:QUERY_ID,priorAttempt:PRIOR_ATTEMPT,timestamp,runId});durableClaim(path,r,fileSystem);owned=runId;return r}, finish(intent,state,addition={}){if(owned!==intent?.runId||!['PASS_OBSERVED','TERMINAL_OUTCOME'].includes(state))unavailable();const data=Buffer.from(JSON.stringify({...intent,...addition,state})+'\n');const temporary=`${path}.${intent.runId}.tmp`;let fd;try{fd=fileSystem.openSync(temporary,'wx',0o600);fileSystem.writeSync(fd,data);fileSystem.fsyncSync(fd);fileSystem.closeSync(fd);fd=undefined;fileSystem.renameSync(temporary,path)}finally{if(fd!==undefined)fileSystem.closeSync(fd);data.fill(0)}owned=undefined}, read(){try{return JSON.parse(fileSystem.readFileSync(path,'utf8'))}catch(error){if(error?.code==='ENOENT')return null;unavailable()}} }) }
export async function runReconciliationOnce ({ readToken=readTokenFromExactKeychain, post=postExactlyOnce, journal=createObservationJournal(), now=Date.now }={}) { if(!NATIVE_ACCESS_APPROVED)return Object.freeze({status:'NATIVE_ACCESS_DISABLED',target:PROJECT_REF,queryId:QUERY_ID}); let intent;try{intent=journal.claim(new Date(now()).toISOString())}catch{return Object.freeze({status:'PRE_DISPATCH_UNAVAILABLE',target:PROJECT_REF,queryId:QUERY_ID})} let token;try{token=readToken()}catch{try{journal.finish(intent,'TERMINAL_OUTCOME',{outcome:'PRE_DISPATCH_UNAVAILABLE'})}catch{}return Object.freeze({status:'PRE_DISPATCH_UNAVAILABLE',target:PROJECT_REF,queryId:QUERY_ID})}try{const result=await post(token,now()+MAX_AGE_MS);journal.finish(intent,'PASS_OBSERVED',{observationHash:result.observationHash,differenceKeys:result.differences});return result}catch(error){const diagnostic=error&&typeof error==='object'?error:{kind:'transport'};const outcome=diagnostic.kind==='timeout'?'timeout':diagnostic.kind==='response'?'response':'transport';const terminal={status:'POST_DISPATCH_DIAGNOSTIC',target:PROJECT_REF,queryId:QUERY_ID,outcome,statusClass:diagnostic.statusClass??'none',contentType:diagnostic.contentType??'none',sizeBucket:diagnostic.sizeBucket??'0',...(diagnostic.category?{category:diagnostic.category}:{})};try{journal.finish(intent,'TERMINAL_OUTCOME',{outcome,statusClass:terminal.statusClass,contentType:terminal.contentType,sizeBucket:terminal.sizeBucket,...(terminal.category?{category:terminal.category}:{})})}catch{}return Object.freeze(terminal)} }

if (process.argv[1] === fileURLToPath(import.meta.url)) runReconciliationOnce().then(value => process.stdout.write(JSON.stringify(value)+'\n')).catch(() => { process.stdout.write(JSON.stringify({status:'PRE_DISPATCH_UNAVAILABLE',target:PROJECT_REF,queryId:QUERY_ID})+'\n'); process.exitCode=1 })
