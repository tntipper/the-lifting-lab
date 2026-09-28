/** Disabled, exact-staging transaction to close all five database controls atomically. */
import { createHash } from 'node:crypto'
import { ACTIVE_WINDOW_EXPIRES_AT, WINDOW_ID } from './staging-generation-23-credentials.mjs'
import { PROJECT_REF } from './staging-generation-23-password-material.mjs'
import { PRODUCTION_PROJECT_REF } from './staging-account-hosted-baseline-database.mjs'
import { EXACT_MIGRATIONS } from './staging-generation-21-retirement-preflight.mjs'
import { IDENTITIES } from './staging-generation-21-credentials.mjs'
import { PASSWORD_PURPOSES } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_23_CONTROL_SHUTDOWN_ENABLED = true
export const SHUTDOWN_ID = 'tll-staging-generation-23-control-shutdown/v1'
const REASON = 'generation_23_shutdown'
const preparedSql = new WeakMap()
const unavailable = () => { throw Error('Generation 23 control shutdown unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const quote = value => `'${value.replaceAll("'", "''")}'`
const runtimeSettings = "ARRAY['idle_in_transaction_session_timeout=15s','lock_timeout=5s','search_path=pg_catalog','statement_timeout=10s']::text[]"
const sortedRuntimeSettings = 'ARRAY(SELECT setting FROM unnest(rolconfig) AS setting ORDER BY setting)'
const operatorSchemas = ['customer', 'broker', 'provisional', 'bridge']
const roleNames = ['customer', 'cart', 'broker', 'provisional', 'bridge']
  .map(name => `tll_${name}_runtime`)
const roleList = roleNames.map(quote).join(',')
const expectedPairs = PASSWORD_PURPOSES.map(purpose =>
  `(${quote(IDENTITIES[purpose].membership)},${quote(IDENTITIES[purpose].login)})`).join(',')
const migrationPairs = EXACT_MIGRATIONS.map(([version, hash]) =>
  `(${quote(version)},${quote(hash)})`).join(',')
const ownerList = roleNames.map(name => name.replace('_runtime', '_owner')).map(quote).join(',')
const controlsOff = [...operatorSchemas.map(name =>
  `tll_${name}_private.operator_status()->'enabled' IS DISTINCT FROM 'false'::jsonb`),
`(SELECT count(*) FROM tll_cart_private.control)<>1`,
`EXISTS(SELECT 1 FROM tll_cart_private.control WHERE NOT singleton OR enabled)`].join('\n    OR ')
const operatorReasonDrift = operatorSchemas.map(name =>
  `tll_${name}_private.operator_status()->>'reasonCode' IS DISTINCT FROM ${quote(REASON)}`).join('\n    OR ')

export function buildStagingGeneration23ControlShutdownSql({ expiresAt } = {}) {
  if (!STAGING_GENERATION_23_CONTROL_SHUTDOWN_ENABLED || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
    || typeof expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(expiresAt)) unavailable()
  const activeMarker = `tll-runtime-window/v1 ${JSON.stringify({ expiresAt, generation: 23,
    projectRef: PROJECT_REF, state: 'active', windowId: WINDOW_ID })}`
  // An active customer connection must not postpone containment. Switch the
  // repository gates OFF first; the later retirement preflight requires zero sessions.
  return `BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE role_name text;
BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' OR session_user<>'postgres'
   OR current_user<>session_user OR current_setting('server_version_num')::int<170000
   OR coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),true)
   OR NOT coalesce((SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user),false)
   OR NOT has_table_privilege(current_user,'pg_authid','SELECT')
   OR NOT pg_has_role(current_user,'pg_read_all_stats','MEMBER') THEN
   RAISE EXCEPTION 'Gen23 shutdown requires exact managed staging postgres operator'; END IF;
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
   RAISE EXCEPTION 'Gen23 shutdown staging binding mismatch'; END IF;
 IF (SELECT count(*) FROM tll_staging_private.applied_migrations)<>${EXACT_MIGRATIONS.length}
   OR (SELECT count(*) FROM (VALUES ${migrationPairs}) AS expected(version,source_sha256)
     JOIN tll_staging_private.applied_migrations actual USING(version,source_sha256))<>${EXACT_MIGRATIONS.length} THEN
   RAISE EXCEPTION 'Gen23 shutdown migration mismatch'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN(${roleList}) AND rolcanlogin
   AND NOT rolsuper AND NOT rolinherit AND NOT rolcreaterole AND NOT rolcreatedb
   AND NOT rolreplication AND NOT rolbypassrls AND rolconnlimit=2
   AND rolconfig IS NOT NULL AND ${sortedRuntimeSettings} IS NOT DISTINCT FROM ${runtimeSettings}
   AND rolvaliduntil=${quote(expiresAt)}::timestamptz)<>5
   OR (SELECT count(*) FROM pg_authid WHERE rolname IN(${roleList}) AND rolpassword IS NOT NULL)<>5 THEN
   RAISE EXCEPTION 'Gen23 shutdown runtime credential mismatch'; END IF;
 FOREACH role_name IN ARRAY ARRAY[${roleList}] LOOP
   IF (SELECT shobj_description(oid,'pg_authid') FROM pg_roles WHERE rolname=role_name)
     IS DISTINCT FROM ${quote(activeMarker)} THEN
     RAISE EXCEPTION 'Gen23 shutdown runtime marker mismatch'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
   WHERE (g.rolname,m.rolname) IN(${expectedPairs}) AND e.grantor=session_user::regrole
   AND NOT e.admin_option AND e.inherit_option AND NOT e.set_option)<>5
   OR (SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
   WHERE g.rolname IN(${roleList}) AND m.rolname=session_user
   AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5
   OR (SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
   WHERE g.rolname IN(${roleList}) OR m.rolname IN(${roleList}))<>10 THEN
   RAISE EXCEPTION 'Gen23 shutdown runtime membership mismatch'; END IF;
 IF (SELECT count(*) FROM pg_auth_members e JOIN pg_roles granted ON granted.oid=e.roleid
   WHERE granted.rolname IN(${ownerList}) AND e.member=session_user::regrole
   AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5
   OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN(${ownerList})
     AND (pg_has_role(session_user,rolname,'USAGE') OR pg_has_role(session_user,rolname,'SET'))) THEN
   RAISE EXCEPTION 'Gen23 shutdown owner authority mismatch'; END IF;
 IF (SELECT relowner FROM pg_class WHERE oid='tll_cart_private.control'::regclass) IS DISTINCT FROM session_user::regrole
   OR (SELECT relrowsecurity FROM pg_class WHERE oid='tll_cart_private.control'::regclass) IS DISTINCT FROM true
   OR (SELECT relforcerowsecurity FROM pg_class WHERE oid='tll_cart_private.control'::regclass) IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'Gen23 shutdown cart ownership mismatch'; END IF;
 IF ${[...operatorSchemas.map(name =>
  `tll_${name}_private.operator_status()->'enabled' IS NULL`),
`(SELECT count(*) FROM tll_cart_private.control)<>1`,
`EXISTS(SELECT 1 FROM tll_cart_private.control WHERE NOT singleton)`].join('\n   OR ')} THEN
   RAISE EXCEPTION 'Gen23 shutdown control shape mismatch'; END IF;
END $preflight$;

DO $disable$
BEGIN
 PERFORM tll_customer_private.operator_set_enabled(false,${quote(REASON)});
 UPDATE tll_cart_private.control SET enabled=false WHERE singleton;
 PERFORM tll_broker_private.operator_set_enabled(false,${quote(REASON)});
 PERFORM tll_provisional_private.operator_set_enabled(false,${quote(REASON)});
 PERFORM tll_bridge_private.operator_set_enabled(false,${quote(REASON)});
END $disable$;

DO $postflight$
BEGIN
 IF ${controlsOff} OR ${operatorReasonDrift} THEN
   RAISE EXCEPTION 'Gen23 shutdown controls not held'; END IF;
END $postflight$;
COMMIT;
SELECT jsonb_build_object('status','PASS_CONTROLS_DISABLED','shutdownId',${quote(SHUTDOWN_ID)},
  'projectRef',${quote(PROJECT_REF)},'generation',23,'windowId',${quote(WINDOW_ID)},
  'expiresAt',${quote(expiresAt)},'controlsEnabled',0) AS tll_generation_23_control_shutdown;
`
}

export function validateStagingGeneration23ControlShutdownReceipt(rows, { expiresAt } = {}) {
  if (!STAGING_GENERATION_23_CONTROL_SHUTDOWN_ENABLED || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
    || !Array.isArray(rows) || rows.length !== 1
    || !exact(rows[0], ['tll_generation_23_control_shutdown'])) unavailable()
  const receipt = rows[0].tll_generation_23_control_shutdown
  const expected = { status: 'PASS_CONTROLS_DISABLED', shutdownId: SHUTDOWN_ID,
    projectRef: PROJECT_REF, generation: 23, windowId: WINDOW_ID, expiresAt,
    controlsEnabled: 0 }
  if (!exact(receipt, Object.keys(expected))) unavailable()
  for (const [key, value] of Object.entries(expected)) if (receipt[key] !== value) unavailable()
  return Object.freeze({ status: 'CONTROLS_DISABLED', projectRef: PROJECT_REF,
    receiptSha256: createHash('sha256').update(JSON.stringify(receipt)).digest('hex') })
}

export function prepareStagingGeneration23ControlShutdownSql(input) {
  const sql = buildStagingGeneration23ControlShutdownSql(input)
  const packet = Object.freeze({})
  preparedSql.set(packet, sql)
  return packet
}

export function consumeStagingGeneration23PreparedShutdownSql(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) unavailable()
  const sql = preparedSql.get(packet)
  if (typeof sql !== 'string') unavailable()
  preparedSql.delete(packet)
  return sql
}
