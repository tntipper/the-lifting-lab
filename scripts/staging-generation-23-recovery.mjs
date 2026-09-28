/** Disconnected, fail-closed retirement of the exact Generation 23 staging role window. */
import { IDENTITIES } from './staging-generation-21-credentials.mjs'
import { createHash } from 'node:crypto'
import { PRODUCTION_PROJECT_REF } from './staging-account-hosted-baseline-database.mjs'
import { EXACT_MIGRATIONS } from './staging-generation-21-retirement-preflight.mjs'
import { GENERATION, PROJECT_REF } from './staging-generation-23-password-material.mjs'
import { PASSWORD_PURPOSES } from './staging-generation-22-material.mjs'
import { ACTIVE_WINDOW_EXPIRES_AT, WINDOW_ID } from './staging-generation-23-credentials.mjs'

export const STAGING_GENERATION_23_RECOVERY_ENABLED = true
export const RECOVERY_ID = 'tll-staging-generation-23-recovery/v1'
const unavailable = () => { throw new Error('Generation 23 recovery unavailable') }
const preparedSql = new WeakMap()
const quote = value => `'${value.replaceAll("'", "''")}'`
const roles = PASSWORD_PURPOSES.map(purpose => IDENTITIES[purpose].login)
const roleList = roles.map(quote).join(',')
const membershipList = PASSWORD_PURPOSES.map(purpose => quote(IDENTITIES[purpose].membership)).join(',')
const pairs = PASSWORD_PURPOSES.map(purpose => `(${quote(IDENTITIES[purpose].membership)},${quote(IDENTITIES[purpose].login)})`).join(',')
const migrations = EXACT_MIGRATIONS.map(([version, hash]) => `(${quote(version)},${quote(hash)})`).join(',')

/** Returns no secret but must be reviewed and armed before any hosted use. */
export function buildStagingGeneration23RecoverySql({ expiresAt } = {}) {
  if (!STAGING_GENERATION_23_RECOVERY_ENABLED
    || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
    || typeof expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(expiresAt)
    || !Number.isFinite(Date.parse(expiresAt))) unavailable()
  const active = `tll-runtime-window/v1 ${JSON.stringify({ expiresAt, generation: GENERATION,
    projectRef: PROJECT_REF, state: 'active', windowId: WINDOW_ID })}`
  const retired = `tll-runtime-window/v1 ${JSON.stringify({ expiresAt, generation: GENERATION,
    projectRef: PROJECT_REF, state: 'retired', windowId: WINDOW_ID })}`
  const revoke = PASSWORD_PURPOSES.map(purpose => {
    const { login, membership } = IDENTITIES[purpose]
    return `REVOKE ${membership} FROM ${login};\nALTER ROLE ${login} NOLOGIN PASSWORD NULL VALID UNTIL 'infinity';\nCOMMENT ON ROLE ${login} IS ${quote(retired)};`
  }).join('\n')
  const aclDrift = `SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
    WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND a.grantee=0 AND a.privilege_type='USAGE'
  UNION ALL SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a JOIN pg_roles g ON g.oid=a.grantee
    WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND g.rolname IN(${roleList})
  UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles g ON g.oid=a.grantee WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND g.rolname IN(${roleList})
  UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) a
    JOIN pg_roles g ON g.oid=a.grantee WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND g.rolname IN(${roleList})`
  const controls = PASSWORD_PURPOSES.map(purpose => `(SELECT count(*) FROM tll_${purpose}_private.control)<>1
    OR EXISTS(SELECT 1 FROM tll_${purpose}_private.control WHERE NOT singleton OR enabled)`).join('\n    OR ')
  return `BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE r text; marker text; operator_name name:=session_user;
BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' OR session_user<>'postgres'
  OR current_user<>session_user OR current_setting('server_version_num')::int<170000
  OR (SELECT rolsuper OR NOT rolcreaterole FROM pg_roles WHERE rolname=operator_name)
  OR NOT has_table_privilege(operator_name,'pg_authid','SELECT')
  OR NOT pg_has_role(operator_name,'pg_read_all_stats','MEMBER') THEN
  RAISE EXCEPTION 'Generation 23 recovery operator mismatch'; END IF;
 IF to_regclass('tll_staging_private.environment') IS NULL
  OR (SELECT count(*) FROM tll_staging_private.environment)<>1
  OR NOT EXISTS(SELECT FROM tll_staging_private.environment WHERE singleton AND environment='tll-hosted-staging-v1'
    AND operator_project_ref='${PROJECT_REF}' AND operator_context='supabase-dashboard:${PROJECT_REF}:staging-bootstrap:reviewed'
    AND identity_basis='explicit-operator-dashboard-binding' AND bootstrap_version='2026-09-15-v2'
    AND source_commit='a50e37ff05d8e731dc8ffceea1e96492079e5ff3'
    AND integrity_sha256='2d5175eb47a891ca626d635281fbb28237b16bec0d89eebe168455935117922c')
  OR EXISTS(SELECT FROM tll_staging_private.environment WHERE operator_project_ref='${PRODUCTION_PROJECT_REF}') THEN
  RAISE EXCEPTION 'Generation 23 recovery staging binding mismatch'; END IF;
 IF (SELECT count(*) FROM tll_staging_private.applied_migrations)<>${EXACT_MIGRATIONS.length}
  OR (SELECT count(*) FROM (VALUES ${migrations}) AS expected(version,source_sha256)
    JOIN tll_staging_private.applied_migrations actual USING(version,source_sha256))<>${EXACT_MIGRATIONS.length} THEN
  RAISE EXCEPTION 'Generation 23 recovery migration mismatch'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN(${roleList}) AND rolcanlogin
    AND rolvaliduntil=${quote(expiresAt)}::timestamptz)<>5
  OR (SELECT count(*) FROM pg_authid WHERE rolname IN(${roleList}) AND rolpassword IS NOT NULL)<>5 THEN
  RAISE EXCEPTION 'Generation 23 recovery active credential mismatch'; END IF;
 FOREACH r IN ARRAY ARRAY[${roleList}] LOOP
  SELECT shobj_description(oid,'pg_authid') INTO marker FROM pg_roles WHERE rolname=r;
  IF marker IS DISTINCT FROM ${quote(active)} THEN RAISE EXCEPTION 'Generation 23 recovery marker mismatch'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
    WHERE (g.rolname,m.rolname) IN(${pairs}) AND e.grantor=operator_name::regrole
    AND NOT e.admin_option AND e.inherit_option AND NOT e.set_option)<>5
  OR (SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
    WHERE g.rolname IN(${roleList}) AND m.rolname=operator_name
    AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5
  OR (SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
    WHERE g.rolname IN(${roleList}) OR m.rolname IN(${roleList}))<>10 THEN
  RAISE EXCEPTION 'Generation 23 recovery membership mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND usename IN(${roleList})) THEN
  RAISE EXCEPTION 'Generation 23 recovery runtime sessions remain'; END IF;
 IF EXISTS(${aclDrift}) THEN RAISE EXCEPTION 'Generation 23 recovery private authority drift'; END IF;
 IF ${controls} THEN RAISE EXCEPTION 'Generation 23 recovery controls not disabled'; END IF;
END $preflight$;
${revoke}
DO $postflight$
DECLARE r text; marker text;
BEGIN
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN(${roleList}) AND NOT rolcanlogin
    AND rolvaliduntil='infinity'::timestamptz)<>5
  OR EXISTS(SELECT 1 FROM pg_authid WHERE rolname IN(${roleList}) AND rolpassword IS NOT NULL) THEN
  RAISE EXCEPTION 'Generation 23 recovery credentials remain'; END IF;
 FOREACH r IN ARRAY ARRAY[${roleList}] LOOP
  SELECT shobj_description(oid,'pg_authid') INTO marker FROM pg_roles WHERE rolname=r;
  IF marker IS DISTINCT FROM ${quote(retired)} THEN RAISE EXCEPTION 'Generation 23 recovery retired marker mismatch'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_auth_members e JOIN pg_roles m ON m.oid=e.member
    WHERE m.rolname IN(${roleList}))
  OR (SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
    WHERE g.rolname IN(${roleList}) OR m.rolname IN(${roleList}))<>5
  OR (SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
    WHERE g.rolname IN(${roleList}) AND m.rolname=session_user
    AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5 THEN
  RAISE EXCEPTION 'Generation 23 recovery runtime grants drift'; END IF;
 IF (SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
    WHERE g.rolname IN(${membershipList}) AND m.rolname=session_user
    AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5 THEN
  RAISE EXCEPTION 'Generation 23 recovery inert operator links changed'; END IF;
 IF EXISTS(${aclDrift}) THEN RAISE EXCEPTION 'Generation 23 recovery private authority changed'; END IF;
 IF ${controls} THEN RAISE EXCEPTION 'Generation 23 recovery controls changed'; END IF;
END $postflight$;
COMMIT;
SELECT jsonb_build_object('status','PASS_RETIRED','recoveryId','${RECOVERY_ID}',
 'projectRef','${PROJECT_REF}','generation',${GENERATION},'windowId','${WINDOW_ID}',
 'expiresAt',${quote(expiresAt)},'controlsEnabled',false,'runtimeCount',5) AS tll_generation_23_recovery_receipt;
`
}

export function validateStagingGeneration23RecoveryReceipt(rows, { expiresAt } = {}) {
  if (!STAGING_GENERATION_23_RECOVERY_ENABLED
    || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
    || !Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object'
    || Object.keys(rows[0]).join('|') !== 'tll_generation_23_recovery_receipt') unavailable()
  const receipt = rows[0].tll_generation_23_recovery_receipt
  const keys = ['status', 'recoveryId', 'projectRef', 'generation', 'windowId', 'expiresAt', 'controlsEnabled', 'runtimeCount']
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
    || Object.keys(receipt).sort().join('|') !== keys.sort().join('|')
    || receipt.status !== 'PASS_RETIRED' || receipt.recoveryId !== RECOVERY_ID
    || receipt.projectRef !== PROJECT_REF || receipt.generation !== GENERATION
    || receipt.windowId !== WINDOW_ID || receipt.expiresAt !== expiresAt
    || receipt.controlsEnabled !== false || receipt.runtimeCount !== 5) unavailable()
  return Object.freeze({ status: 'PASS_RETIRED', projectRef: PROJECT_REF, generation: GENERATION,
    windowId: WINDOW_ID, receiptSha256: createHash('sha256').update(JSON.stringify(receipt)).digest('hex') })
}

/** Issue one opaque, in-process packet for the exact recovery transaction. */
export function prepareStagingGeneration23RecoverySql(input) {
  const sql = buildStagingGeneration23RecoverySql(input)
  const packet = Object.freeze({})
  preparedSql.set(packet, Object.freeze({ sql, expiresAt: input.expiresAt }))
  return packet
}

/** Only the fixed recovery transport may consume the original packet once. */
export function consumeStagingGeneration23PreparedRecoverySql(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) unavailable()
  const prepared = preparedSql.get(packet)
  if (!prepared || typeof prepared.sql !== 'string'
    || prepared.expiresAt !== ACTIVE_WINDOW_EXPIRES_AT) unavailable()
  preparedSql.delete(packet)
  return prepared
}
