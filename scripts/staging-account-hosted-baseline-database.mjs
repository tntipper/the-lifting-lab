/**
 * One closed, read-only observation of the Generation 21 retirement state.
 *
 * This is deliberately an injected port: importing it cannot find a token,
 * open a socket, execute a process, or select a caller-supplied project/SQL.
 */
import { createHash } from 'node:crypto'
import { PROJECT_REF, PRODUCTION_PROJECT_REF, GENERATION, WINDOW_ID } from './staging-generation-21-credentials.mjs'

export { PROJECT_REF, PRODUCTION_PROJECT_REF }
export const STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_ENABLED = false
export const STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID = 'tll-staging-hosted-baseline-database/v1'
// Exact historical Gen21 expiry from the reviewed one-window arming diff:
// docs/ops/stage-plans/2026-09-22-generation-21-arming-diff.md. The normal
// credential source is deliberately disarmed and therefore contains a sentinel.
export const GENERATION_21_RETIRED_EXPIRES_AT = '2026-09-22T14:00:00.000Z'
export const STAGING_ACCOUNT_HOSTED_BASELINE_MANAGEMENT_ENDPOINT = Object.freeze({
  hostname: 'api.supabase.com', method: 'POST', path: `/v1/projects/${PROJECT_REF}/database/query`,
})

const unavailable = () => { throw new Error('Staging hosted baseline database unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const sqlLiteral = value => `'${value.replaceAll("'", "''")}'`
const runtimeRoles = Object.freeze(['tll_customer_runtime', 'tll_cart_runtime', 'tll_broker_runtime', 'tll_provisional_runtime', 'tll_bridge_runtime'])
const controls = Object.freeze(['customer', 'cart', 'broker', 'provisional', 'bridge'])
const migrations = Object.freeze([
  '202609150002_public_submission_gateway', '202609150003_active_stack_integrity',
  '202609150004_inventory_operation_ledger', '202609150005_customer_connection_repository',
  '202609150006_staging_cart_sessions', '202609150007_customer_subject_broker_repository',
  '202609170008_customer_provisional_admission_repository', '202609170009_inventory_maintenance_authority',
  '202609170010_customer_admission_bridge', '202609170011_customer_browser_admission_once',
  '202609180012_customer_shopify_proof_repository', '202609180013_customer_final_reconciliation',
  '202609180014_staging_cart_account_transition', '202609180015_customer_account_operations',
  '202609180016_customer_account_logout',
])
const roleList = runtimeRoles.map(sqlLiteral).join(',')
const migrationList = migrations.map(sqlLiteral).join(',')

const receipt = Object.freeze({
  queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID,
  projectRef: PROJECT_REF,
  generation: GENERATION,
  windowId: WINDOW_ID,
  status: 'PASS_RETIRED',
  migrations: 15,
  runtimeRoles: 5,
  controlsEnabled: 0,
  passwordsConfigured: 0,
  validUntilInfinity: 5,
  operatorEdges: 5,
  executionEdges: 0,
  runtimeSessions: 0,
})

/** Immutable Management API SQL. The literal receipt leaks no credentials. */
export const STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL = `BEGIN READ ONLY;
-- The five runtime identities must remain NOLOGIN, passwordless and inert.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
DO $hosted_baseline$
DECLARE r text; marker text; parsed jsonb; operator_name name:=session_user;
BEGIN
  IF current_database()<>'postgres' OR current_user<>'postgres' OR session_user<>'postgres' OR current_user<>session_user
    OR EXISTS(SELECT 1 FROM tll_staging_private.environment WHERE operator_project_ref='${PRODUCTION_PROJECT_REF}')
    OR (SELECT count(*) FROM tll_staging_private.environment)<>1
    OR NOT EXISTS(SELECT 1 FROM tll_staging_private.environment WHERE singleton AND environment='tll-hosted-staging-v1'
      AND operator_project_ref='${PROJECT_REF}') THEN
    RAISE EXCEPTION 'Hosted baseline staging binding mismatch';
  END IF;
  IF (SELECT count(*) FROM tll_staging_private.applied_migrations)<>15
    OR (SELECT count(*) FROM tll_staging_private.applied_migrations WHERE version IN(${migrationList}))<>15 THEN
    RAISE EXCEPTION 'Hosted baseline migration ledger mismatch';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN(${roleList}))<>5
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN(${roleList}) AND (rolcanlogin OR rolvaliduntil IS DISTINCT FROM 'infinity'::timestamptz))
    OR EXISTS(SELECT 1 FROM pg_authid WHERE rolname IN(${roleList}) AND rolpassword IS NOT NULL) THEN
    RAISE EXCEPTION 'Hosted baseline runtime credential mismatch';
  END IF;
  FOREACH r IN ARRAY ARRAY[${roleList}] LOOP
    SELECT shobj_description(oid,'pg_authid') INTO marker FROM pg_roles WHERE rolname=r;
    IF marker IS NULL OR marker !~ '^tll-runtime-window/v1 [{].*[}]$' THEN
      RAISE EXCEPTION 'Hosted baseline retired marker malformed';
    END IF;
    BEGIN parsed:=substring(marker FROM '^tll-runtime-window/v1 ([{].*[}])$')::jsonb;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'Hosted baseline retired marker invalid'; END;
    IF parsed IS DISTINCT FROM jsonb_build_object('expiresAt','${GENERATION_21_RETIRED_EXPIRES_AT}','generation',${GENERATION},
      'projectRef','${PROJECT_REF}','state','retired','windowId','${WINDOW_ID}') THEN
      RAISE EXCEPTION 'Hosted baseline retired marker mismatch';
    END IF;
  END LOOP;
  IF ${controls.map(name => `(SELECT count(*) FROM tll_${name}_private.control)<>1 OR EXISTS(SELECT 1 FROM tll_${name}_private.control WHERE NOT singleton OR enabled)`).join('\n    OR ')} THEN
    RAISE EXCEPTION 'Hosted baseline controls are not disabled';
  END IF;
  IF (SELECT count(*) FROM pg_auth_members e JOIN pg_roles granted ON granted.oid=e.roleid JOIN pg_roles member ON member.oid=e.member
      WHERE granted.rolname IN(${roleList}) AND member.rolname=operator_name AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5
    OR EXISTS(SELECT 1 FROM pg_auth_members e JOIN pg_roles granted ON granted.oid=e.roleid JOIN pg_roles member ON member.oid=e.member
      WHERE (granted.rolname IN(${roleList}) OR member.rolname IN(${roleList}))
        AND NOT (granted.rolname IN(${roleList}) AND member.rolname=operator_name AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)) THEN
    RAISE EXCEPTION 'Hosted baseline runtime edges are not retired';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND usename IN(${roleList})) THEN
    RAISE EXCEPTION 'Hosted baseline runtime sessions remain';
  END IF;
END $hosted_baseline$;
SELECT '${JSON.stringify(receipt)}'::jsonb AS tll_staging_hosted_baseline_database;
COMMIT;
`

export function validateStagingAccountHostedBaselineDatabaseReceipt(rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || !exact(rows[0], ['tll_staging_hosted_baseline_database'])) unavailable()
  const value = rows[0].tll_staging_hosted_baseline_database
  if (!exact(value, Object.keys(receipt))) unavailable()
  for (const [key, expected] of Object.entries(receipt)) if (value[key] !== expected) unavailable()
  return Object.freeze({
    status: 'PASS', target: PROJECT_REF, queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID,
    receiptHash: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
    counts: Object.freeze({ migrations: 15, controlsEnabled: 0, runtimeRoles: 5, runtimeSessions: 0, executionEdges: 0, operatorEdges: 5 }),
  })
}

/** The sole injected read port receives the fixed SQL and fixed target metadata. */
export function createStagingAccountHostedBaselineDatabase({ postManagementQuery } = {}) {
  if (typeof postManagementQuery !== 'function' || PROJECT_REF === PRODUCTION_PROJECT_REF) unavailable()
  return Object.freeze({
    target: PROJECT_REF,
    nativeEnabled: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_ENABLED,
    async observe(input = {}) {
      if (!exact(input, ['signal'])) unavailable()
      const { signal } = input
      if (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || signal.aborted) unavailable()
      let rows
      try {
        rows = await postManagementQuery(Object.freeze({
          endpoint: STAGING_ACCOUNT_HOSTED_BASELINE_MANAGEMENT_ENDPOINT,
          query: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_SQL,
          signal,
        }))
      } catch { unavailable() }
      return validateStagingAccountHostedBaselineDatabaseReceipt(rows)
    },
  })
}
