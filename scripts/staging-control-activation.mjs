/**
 * Pure, injected-port builder for one future staging control activation.
 *
 * This module has no credential reader, network client or live launcher. A
 * separately reviewed generation wrapper must pin the context and supply the
 * Management API transport. Generation 21 is consumed and is rejected here.
 */
import { createHash } from 'node:crypto'

export const PROJECT_REF = 'qdmvngjwkcsilzmqksme'
export const PRODUCTION_PROJECT_REF = 'wrhgscovsgsudtedbljr'
export const MAX_ACTIVE_WINDOW_MS = 60 * 60 * 1000
export const CONTROL_NAMES = Object.freeze(['customer', 'cart', 'broker', 'provisional', 'bridge'])
const RUNTIME_ROLES = Object.freeze(CONTROL_NAMES.map(name => `tll_${name}_runtime`))
const OWNER_ROLES = Object.freeze(CONTROL_NAMES.map(name => `tll_${name}_owner`))
const TEMPORARY_SET_OWNER_ROLES = Object.freeze(['tll_customer_owner', 'tll_broker_owner', 'tll_provisional_owner', 'tll_bridge_owner'])
const EXECUTION_PAIRS = Object.freeze([
  ['tll_customer_executor', 'tll_customer_runtime'],
  ['tll_cart_gateway', 'tll_cart_runtime'],
  ['tll_broker_executor', 'tll_broker_runtime'],
  ['tll_provisional_executor', 'tll_provisional_runtime'],
  ['tll_bridge_executor', 'tll_bridge_runtime'],
])

const unavailable = () => { throw new Error('Staging control activation unavailable') }
const sqlLiteral = value => `'${value.replaceAll("'", "''")}'`
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

export function validateControlActivationContext(value, { nowMs = Date.now() } = {}) {
  if (!exactKeys(value, ['generation', 'windowId', 'expiresAt'])) unavailable()
  if (!Number.isInteger(value.generation) || value.generation < 22 || value.generation > 999) unavailable()
  if (typeof value.windowId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.windowId)) unavailable()
  if (typeof value.expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(value.expiresAt)) unavailable()
  const expiryMs = Date.parse(value.expiresAt)
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiryMs) || expiryMs <= nowMs || expiryMs - nowMs > MAX_ACTIVE_WINDOW_MS) unavailable()
  return Object.freeze({
    generation: value.generation,
    windowId: value.windowId,
    expiresAt: value.expiresAt,
    packageId: `tll-staging-generation-${value.generation}-control-activation/v1`,
    reasonCode: `generation_${value.generation}_acceptance`,
  })
}

export function buildStagingControlActivationSql(value, options) {
  const context = validateControlActivationContext(value, options)
  const runtimeList = RUNTIME_ROLES.map(sqlLiteral).join(',')
  const ownerList = OWNER_ROLES.map(sqlLiteral).join(',')
  const expectedPairs = EXECUTION_PAIRS.map(([granted, member]) => `(${sqlLiteral(granted)},${sqlLiteral(member)})`).join(',')
  const marker = `tll-runtime-window/v1 ${JSON.stringify({
    expiresAt: context.expiresAt,
    generation: context.generation,
    projectRef: PROJECT_REF,
    state: 'active',
    windowId: context.windowId,
  })}`
  const ownerGrants = TEMPORARY_SET_OWNER_ROLES.map(role => `EXECUTE format('GRANT %I TO %I WITH INHERIT TRUE, SET TRUE',${sqlLiteral(role)},operator_name);`).join('\n  ')
  const ownerRestores = TEMPORARY_SET_OWNER_ROLES.map(role => `
  EXECUTE format('REVOKE %I FROM %I GRANTED BY %I',${sqlLiteral(role)},operator_name,operator_name);
  IF NOT EXISTS(SELECT 1 FROM pg_auth_members e JOIN pg_roles granted ON granted.oid=e.roleid
    WHERE granted.rolname=${sqlLiteral(role)} AND e.member=operator_name::regrole AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)
    OR pg_has_role(operator_name,${sqlLiteral(role)},'USAGE') OR pg_has_role(operator_name,${sqlLiteral(role)},'SET') THEN
    RAISE EXCEPTION 'Owner edge was not restored to ADMIN-only: %',${sqlLiteral(role)}; END IF;`).join('')
  const operatorStatusNames = ['customer', 'broker', 'provisional', 'bridge']
  const enabledChecks = [
    ...operatorStatusNames.map(name => `(tll_${name}_private.operator_status()->>'enabled')::boolean IS DISTINCT FROM true`),
    `(SELECT count(*) FROM tll_cart_private.control)<>1`,
    `EXISTS(SELECT 1 FROM tll_cart_private.control WHERE NOT singleton OR NOT enabled)`,
  ].join('\n    OR ')
  const disabledChecks = [
    ...operatorStatusNames.map(name => `(tll_${name}_private.operator_status()->>'enabled')::boolean IS DISTINCT FROM false`),
    `(SELECT count(*) FROM tll_cart_private.control)<>1`,
    `EXISTS(SELECT 1 FROM tll_cart_private.control WHERE NOT singleton OR enabled)`,
  ].join('\n    OR ')
  const reasonChecks = operatorStatusNames.map(name => `tll_${name}_private.operator_status()->>'reasonCode' IS DISTINCT FROM ${sqlLiteral(context.reasonCode)}`).join('\n    OR ')

  return `BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $activation_preflight$
DECLARE operator_name name:=session_user; r text; role_marker text;
BEGIN
  IF current_database()<>'postgres' OR current_user<>'postgres' OR session_user<>'postgres' OR current_user<>session_user
    OR coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),true)
    OR NOT coalesce((SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user),false)
    OR NOT has_table_privilege(current_user,'pg_authid','SELECT') THEN
    RAISE EXCEPTION 'Control activation requires exact managed staging postgres operator'; END IF;
  IF to_regclass('tll_staging_private.environment') IS NULL OR (SELECT count(*) FROM tll_staging_private.environment)<>1
    OR NOT EXISTS(SELECT 1 FROM tll_staging_private.environment WHERE singleton AND environment='tll-hosted-staging-v1'
      AND operator_project_ref='${PROJECT_REF}')
    OR EXISTS(SELECT 1 FROM tll_staging_private.environment WHERE operator_project_ref='${PRODUCTION_PROJECT_REF}') THEN
    RAISE EXCEPTION 'Control activation staging binding mismatch'; END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN(${runtimeList}))<>5
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN(${runtimeList}) AND (NOT rolcanlogin OR rolsuper OR rolinherit OR rolcreaterole
      OR rolcreatedb OR rolreplication OR rolbypassrls OR rolconnlimit<>-1 OR rolconfig IS NOT NULL
      OR rolvaliduntil IS DISTINCT FROM ${sqlLiteral(context.expiresAt)}::timestamptz))
    OR EXISTS(SELECT 1 FROM pg_authid WHERE rolname IN(${runtimeList}) AND rolpassword IS NULL)
    OR clock_timestamp()+interval '2 minutes'>=${sqlLiteral(context.expiresAt)}::timestamptz
    OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND usename IN(${runtimeList})) THEN
    RAISE EXCEPTION 'Control activation runtime state mismatch'; END IF;
  FOREACH r IN ARRAY ARRAY[${runtimeList}] LOOP
    SELECT shobj_description(oid,'pg_authid') INTO role_marker FROM pg_roles WHERE rolname=r;
    IF role_marker IS DISTINCT FROM ${sqlLiteral(marker)} THEN RAISE EXCEPTION 'Control activation runtime marker mismatch: %',r; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_auth_members e JOIN pg_roles granted ON granted.oid=e.roleid JOIN pg_roles member ON member.oid=e.member
      WHERE (granted.rolname,member.rolname) IN (${expectedPairs}) AND NOT e.admin_option AND e.inherit_option AND NOT e.set_option)<>5
    OR (SELECT count(*) FROM pg_auth_members e JOIN pg_roles granted ON granted.oid=e.roleid JOIN pg_roles member ON member.oid=e.member
      WHERE granted.rolname IN(${runtimeList}) AND member.rolname=operator_name AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5
    OR EXISTS(SELECT 1 FROM pg_auth_members e JOIN pg_roles granted ON granted.oid=e.roleid JOIN pg_roles member ON member.oid=e.member
      WHERE (granted.rolname IN(${runtimeList}) OR member.rolname IN(${runtimeList}))
        AND NOT (((granted.rolname,member.rolname) IN (${expectedPairs}) AND NOT e.admin_option AND e.inherit_option AND NOT e.set_option)
          OR (granted.rolname IN(${runtimeList}) AND member.rolname=operator_name AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option))) THEN
    RAISE EXCEPTION 'Control activation runtime membership mismatch'; END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN(${ownerList}))<>5
    OR (SELECT count(*) FROM pg_auth_members e JOIN pg_roles granted ON granted.oid=e.roleid
      WHERE granted.rolname IN(${ownerList}) AND e.member=operator_name::regrole AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN(${ownerList}) AND (pg_has_role(operator_name,rolname,'USAGE') OR pg_has_role(operator_name,rolname,'SET'))) THEN
    RAISE EXCEPTION 'Control activation owner authority mismatch'; END IF;
  IF (SELECT relowner FROM pg_class WHERE oid='tll_cart_private.control'::regclass) IS DISTINCT FROM operator_name::regrole
    OR (SELECT relrowsecurity FROM pg_class WHERE oid='tll_cart_private.control'::regclass) IS DISTINCT FROM true
    OR (SELECT relforcerowsecurity FROM pg_class WHERE oid='tll_cart_private.control'::regclass) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Control activation cart operator ownership mismatch'; END IF;
  IF ${disabledChecks} THEN RAISE EXCEPTION 'Control activation requires exact disabled controls'; END IF;
END $activation_preflight$;

DO $acquire_owner_set_edges$
DECLARE operator_name name:=session_user;
BEGIN
  ${ownerGrants}
END $acquire_owner_set_edges$;

SET LOCAL ROLE tll_customer_owner;
LOCK TABLE tll_customer_private.control IN SHARE ROW EXCLUSIVE MODE;
UPDATE tll_customer_private.control SET enabled=true,changed_at=clock_timestamp(),reason_code=${sqlLiteral(context.reasonCode)} WHERE singleton;
RESET ROLE;
LOCK TABLE tll_cart_private.control IN SHARE ROW EXCLUSIVE MODE;
UPDATE tll_cart_private.control SET enabled=true WHERE singleton;
SET LOCAL ROLE tll_broker_owner;
LOCK TABLE tll_broker_private.control IN SHARE ROW EXCLUSIVE MODE;
UPDATE tll_broker_private.control SET enabled=true,changed_at=clock_timestamp(),reason_code=${sqlLiteral(context.reasonCode)} WHERE singleton;
RESET ROLE;
SET LOCAL ROLE tll_provisional_owner;
LOCK TABLE tll_provisional_private.control IN SHARE ROW EXCLUSIVE MODE;
UPDATE tll_provisional_private.control SET enabled=true,changed_at=clock_timestamp(),reason_code=${sqlLiteral(context.reasonCode)} WHERE singleton;
RESET ROLE;
SET LOCAL ROLE tll_bridge_owner;
LOCK TABLE tll_bridge_private.control IN SHARE ROW EXCLUSIVE MODE;
UPDATE tll_bridge_private.control SET enabled=true,changed_at=clock_timestamp(),reason_code=${sqlLiteral(context.reasonCode)} WHERE singleton;
RESET ROLE;

DO $restore_edges_and_verify$
DECLARE operator_name name:=session_user;
BEGIN${ownerRestores}
  IF ${enabledChecks} OR ${reasonChecks} THEN RAISE EXCEPTION 'Control activation postflight mismatch'; END IF;
  IF clock_timestamp()>=${sqlLiteral(context.expiresAt)}::timestamptz THEN
    RAISE EXCEPTION 'Control activation window expired before commit'; END IF;
  PERFORM pg_stat_clear_snapshot();
  IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND usename IN(${runtimeList})) THEN
    RAISE EXCEPTION 'Runtime session appeared during control activation'; END IF;
END $restore_edges_and_verify$;
COMMIT;
SELECT jsonb_build_object('queryId','tll-staging-control-activation/v1','packageId',${sqlLiteral(context.packageId)},
  'projectRef','${PROJECT_REF}','generation',${context.generation},'windowId',${sqlLiteral(context.windowId)},
  'expiresAt',${sqlLiteral(context.expiresAt)},'status','PASS_CONTROLS_ENABLED','controlsEnabled',5,
  'runtimeSessions',0,'ownerEdgesVerified',5,'temporaryOwnerEdgesRestored',4) AS tll_staging_control_activation;
`
}

export function validateStagingControlActivationReceipt(rows, value, options) {
  const context = validateControlActivationContext(value, options)
  if (!Array.isArray(rows) || rows.length !== 1 || Object.keys(rows[0] ?? {}).join('|') !== 'tll_staging_control_activation') unavailable()
  const receipt = rows[0].tll_staging_control_activation
  const expected = {
    queryId: 'tll-staging-control-activation/v1', packageId: context.packageId,
    projectRef: PROJECT_REF, generation: context.generation, windowId: context.windowId,
    expiresAt: context.expiresAt, status: 'PASS_CONTROLS_ENABLED', controlsEnabled: 5,
    runtimeSessions: 0, ownerEdgesVerified: 5, temporaryOwnerEdgesRestored: 4,
  }
  if (!exactKeys(receipt, Object.keys(expected))) unavailable()
  for (const [key, wanted] of Object.entries(expected)) if (receipt[key] !== wanted) unavailable()
  return Object.freeze({
    status: 'CONTROLS_ENABLED', target: PROJECT_REF, generation: context.generation,
    windowId: context.windowId,
    receiptHash: createHash('sha256').update(JSON.stringify(receipt)).digest('hex'),
  })
}

export async function executeStagingControlActivation({ context, post, nowMs = Date.now() } = {}) {
  if (typeof post !== 'function') unavailable()
  const sql = buildStagingControlActivationSql(context, { nowMs })
  let rows
  try { rows = await post(sql) } catch {
    return Object.freeze({ status: 'RECONCILIATION_REQUIRED', target: PROJECT_REF, generation: context.generation, windowId: context.windowId })
  }
  try { return validateStagingControlActivationReceipt(rows, context, { nowMs }) } catch {
    return Object.freeze({ status: 'RECONCILIATION_REQUIRED', target: PROJECT_REF, generation: context.generation, windowId: context.windowId })
  }
}
