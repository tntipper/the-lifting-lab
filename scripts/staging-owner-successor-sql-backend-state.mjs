import { assertOwnerSuccessorSqlWindow } from './staging-owner-successor-sql-context.mjs'
/** Disconnected successor SQL port; native gate OFF. No transport, reader or hosted authority. */
/** Disabled, read-only proof that Gen23 backend controls are OFF. */
import { createHash } from 'node:crypto'
import { ACTIVE_WINDOW_EXPIRES_AT, WINDOW_ID } from './staging-owner-successor-sql-context.mjs'
import { PROJECT_REF } from './staging-owner-successor-sql-context.mjs'
import { PRODUCTION_PROJECT_REF } from './staging-account-hosted-baseline-database.mjs'
import { EXACT_MIGRATIONS } from './staging-generation-21-retirement-preflight.mjs'
import { IDENTITIES } from './staging-generation-21-credentials.mjs'
import { PASSWORD_PURPOSES } from './staging-generation-22-material.mjs'

export const OWNER_SUCCESSOR_NATIVE_SQL_BACKEND_STATE_ENABLED = false
export const QUERY_ID = 'tll-owner-successor-backend-off-state/v1'
const unavailable = () => { throw Error('Generation 23 backend state unavailable') }
const quote = value => `'${value.replaceAll("'", "''")}'`
const roles = PASSWORD_PURPOSES.map(purpose => IDENTITIES[purpose].login)
const roleList = roles.map(quote).join(',')
const migrations = EXACT_MIGRATIONS.map(([version, hash]) =>
  `(${quote(version)},${quote(hash)})`).join(',')
const operators = ['customer', 'broker', 'provisional', 'bridge']
const controlOff = [...operators.map(name =>
  `tll_${name}_private.operator_status()->'enabled' IS DISTINCT FROM 'false'::jsonb`),
`(SELECT count(*) FROM tll_cart_private.control)<>1`,
`EXISTS(SELECT 1 FROM tll_cart_private.control WHERE NOT singleton OR enabled)`].join('\n   OR ')
const prepared = new WeakMap()

export function buildOwnerSuccessorBackendStateSql({ expiresAt } = {}) {
  if (!OWNER_SUCCESSOR_NATIVE_SQL_BACKEND_STATE_ENABLED || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
    || typeof expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(expiresAt)) unavailable()
  assertOwnerSuccessorSqlWindow(expiresAt)
  const marker = `tll-runtime-window/v1 ${JSON.stringify({ expiresAt, generation: 23,
    projectRef: PROJECT_REF, state: 'active', windowId: WINDOW_ID })}`
  return `BEGIN READ ONLY;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
DO $check$
DECLARE role_name text;
BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' OR session_user<>'postgres'
   OR current_user<>session_user OR current_setting('server_version_num')::int<170000
   OR coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),true)
   OR NOT coalesce((SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user),false)
   OR NOT has_table_privilege(current_user,'pg_authid','SELECT')
   OR NOT pg_has_role(current_user,'pg_read_all_stats','MEMBER') THEN
   RAISE EXCEPTION 'Gen23 backend read requires exact staging operator'; END IF;
 IF to_regclass('tll_staging_private.environment') IS NULL
   OR (SELECT count(*) FROM tll_staging_private.environment)<>1
   OR NOT EXISTS(SELECT 1 FROM tll_staging_private.environment WHERE singleton
     AND environment='tll-hosted-staging-v1' AND operator_project_ref=${quote(PROJECT_REF)}
     AND operator_context=${quote(`supabase-dashboard:${PROJECT_REF}:staging-bootstrap:reviewed`)}
     AND identity_basis='explicit-operator-dashboard-binding'
     AND bootstrap_version='2026-09-15-v2'
     AND source_commit='a50e37ff05d8e731dc8ffceea1e96492079e5ff3'
     AND integrity_sha256='2d5175eb47a891ca626d635281fbb28237b16bec0d89eebe168455935117922c')
   OR EXISTS(SELECT 1 FROM tll_staging_private.environment WHERE operator_project_ref=${quote(PRODUCTION_PROJECT_REF)}) THEN
   RAISE EXCEPTION 'Gen23 backend staging binding mismatch'; END IF;
 IF (SELECT count(*) FROM tll_staging_private.applied_migrations)<>${EXACT_MIGRATIONS.length}
   OR (SELECT count(*) FROM (VALUES ${migrations}) AS expected(version,source_sha256)
     JOIN tll_staging_private.applied_migrations actual USING(version,source_sha256))<>${EXACT_MIGRATIONS.length} THEN
   RAISE EXCEPTION 'Gen23 backend migration mismatch'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN(${roleList}) AND rolcanlogin
   AND NOT rolsuper AND NOT rolinherit AND NOT rolcreaterole AND NOT rolcreatedb
   AND NOT rolreplication AND NOT rolbypassrls AND rolvaliduntil=${quote(expiresAt)}::timestamptz)<>5
   OR (SELECT count(*) FROM pg_authid WHERE rolname IN(${roleList}) AND rolpassword IS NOT NULL)<>5 THEN
   RAISE EXCEPTION 'Gen23 backend runtime credential mismatch'; END IF;
 FOREACH role_name IN ARRAY ARRAY[${roleList}] LOOP
   IF (SELECT shobj_description(oid,'pg_authid') FROM pg_roles WHERE rolname=role_name)
     IS DISTINCT FROM ${quote(marker)} THEN
     RAISE EXCEPTION 'Gen23 backend runtime marker mismatch'; END IF;
 END LOOP;
 IF ${controlOff} THEN RAISE EXCEPTION 'Gen23 backend controls not OFF'; END IF;
END $check$;
SELECT jsonb_build_object('status','PASS_BACKEND_OFF','queryId',${quote(QUERY_ID)},
 'projectRef',${quote(PROJECT_REF)},'generation',23,'windowId',${quote(WINDOW_ID)},
 'expiresAt',${quote(expiresAt)},'controlsEnabled',false,
 'runtimeSessions',(SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
   AND usename IN(${roleList}))) AS tll_owner_successor_backend_state;
COMMIT;
`
}

export function validateOwnerSuccessorBackendState(rows, { expiresAt } = {}) {
  if (!OWNER_SUCCESSOR_NATIVE_SQL_BACKEND_STATE_ENABLED || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
    || !Array.isArray(rows) || rows.length !== 1 || !rows[0]
    || typeof rows[0] !== 'object' || Array.isArray(rows[0])
    || Object.keys(rows[0]).join('|') !== 'tll_owner_successor_backend_state') unavailable()
  assertOwnerSuccessorSqlWindow(expiresAt)
  const value = rows[0].tll_owner_successor_backend_state
  const expected = { status: 'PASS_BACKEND_OFF', queryId: QUERY_ID, projectRef: PROJECT_REF,
    generation: 23, windowId: WINDOW_ID, expiresAt, controlsEnabled: false }
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('|') !== [...Object.keys(expected), 'runtimeSessions'].sort().join('|')
    || Object.entries(expected).some(([key, item]) => value[key] !== item)
    || !Number.isSafeInteger(value.runtimeSessions) || value.runtimeSessions < 0) unavailable()
  return Object.freeze({ projectRef: PROJECT_REF, controlsEnabled: false,
    runtimeSessions: value.runtimeSessions,
    receiptSha256: createHash('sha256').update(JSON.stringify(value)).digest('hex') })
}

export function prepareOwnerSuccessorBackendStateSql(input) {
  const sql = buildOwnerSuccessorBackendStateSql(input)
  const packet = Object.freeze({})
  prepared.set(packet, sql)
  return packet
}

export function consumeOwnerSuccessorBackendStateSql(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) unavailable()
  const sql = prepared.get(packet)
  if (typeof sql !== 'string') unavailable()
  prepared.delete(packet)
  return sql
}
