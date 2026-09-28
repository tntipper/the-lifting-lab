/** Disabled, read-only proof that the exact Generation 22 roles can be retired. */
import { createHash } from 'node:crypto'
import { IDENTITIES } from './staging-generation-21-credentials.mjs'
import { PRODUCTION_PROJECT_REF } from './staging-account-hosted-baseline-database.mjs'
import { EXACT_MIGRATIONS } from './staging-generation-21-retirement-preflight.mjs'
import { GENERATION, PROJECT_REF, PASSWORD_PURPOSES } from './staging-generation-22-material.mjs'
import { ACTIVE_WINDOW_EXPIRES_AT, WINDOW_ID } from './staging-generation-22-credentials.mjs'

export const STAGING_GENERATION_22_ACTIVE_CHECK_ENABLED = false
export const QUERY_ID = 'tll-staging-generation-22-active-check/v1'
const unavailable = () => { throw new Error('Generation 22 active check unavailable') }
const quote = value => `'${value.replaceAll("'", "''")}'`
const roles = PASSWORD_PURPOSES.map(purpose => IDENTITIES[purpose].login)
const roleList = roles.map(quote).join(',')
const pairs = PASSWORD_PURPOSES.map(purpose => `(${quote(IDENTITIES[purpose].membership)},${quote(IDENTITIES[purpose].login)})`).join(',')
const migrations = EXACT_MIGRATIONS.map(([version, hash]) => `(${quote(version)},${quote(hash)})`).join(',')

export function buildStagingGeneration22ActiveCheckSql({ expiresAt } = {}) {
  if (!STAGING_GENERATION_22_ACTIVE_CHECK_ENABLED || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
    || typeof expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(expiresAt)
    || !Number.isFinite(Date.parse(expiresAt))) unavailable()
  const active = `tll-runtime-window/v1 ${JSON.stringify({ expiresAt, generation: GENERATION,
    projectRef: PROJECT_REF, state: 'active', windowId: WINDOW_ID })}`
  const controls = PASSWORD_PURPOSES.map(purpose => `(SELECT count(*) FROM tll_${purpose}_private.control)<>1
    OR EXISTS(SELECT 1 FROM tll_${purpose}_private.control WHERE NOT singleton OR enabled)`).join('\n    OR ')
  return `BEGIN READ ONLY;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
DO $check$
DECLARE r text; marker text; operator_name name:=session_user;
BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' OR session_user<>'postgres'
  OR current_user<>session_user OR current_setting('server_version_num')::int<170000
  OR (SELECT rolsuper OR NOT rolcreaterole FROM pg_roles WHERE rolname=operator_name)
  OR NOT has_table_privilege(operator_name,'pg_authid','SELECT')
  OR NOT pg_has_role(operator_name,'pg_read_all_stats','MEMBER') THEN
  RAISE EXCEPTION 'Generation 22 active check operator mismatch'; END IF;
 IF to_regclass('tll_staging_private.environment') IS NULL
  OR (SELECT count(*) FROM tll_staging_private.environment)<>1
  OR NOT EXISTS(SELECT FROM tll_staging_private.environment WHERE singleton AND environment='tll-hosted-staging-v1'
    AND operator_project_ref='${PROJECT_REF}' AND operator_context='supabase-dashboard:${PROJECT_REF}:staging-bootstrap:reviewed'
    AND identity_basis='explicit-operator-dashboard-binding' AND bootstrap_version='2026-09-15-v2'
    AND source_commit='a50e37ff05d8e731dc8ffceea1e96492079e5ff3'
    AND integrity_sha256='2d5175eb47a891ca626d635281fbb28237b16bec0d89eebe168455935117922c')
  OR EXISTS(SELECT FROM tll_staging_private.environment WHERE operator_project_ref='${PRODUCTION_PROJECT_REF}') THEN
  RAISE EXCEPTION 'Generation 22 active check staging binding mismatch'; END IF;
 IF (SELECT count(*) FROM tll_staging_private.applied_migrations)<>${EXACT_MIGRATIONS.length}
  OR (SELECT count(*) FROM (VALUES ${migrations}) AS expected(version,source_sha256)
    JOIN tll_staging_private.applied_migrations actual USING(version,source_sha256))<>${EXACT_MIGRATIONS.length} THEN
  RAISE EXCEPTION 'Generation 22 active check migration mismatch'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN(${roleList}) AND rolcanlogin
    AND rolvaliduntil=${quote(expiresAt)}::timestamptz)<>5
  OR (SELECT count(*) FROM pg_authid WHERE rolname IN(${roleList}) AND rolpassword IS NOT NULL)<>5 THEN
  RAISE EXCEPTION 'Generation 22 active check credential mismatch'; END IF;
 FOREACH r IN ARRAY ARRAY[${roleList}] LOOP
  SELECT shobj_description(oid,'pg_authid') INTO marker FROM pg_roles WHERE rolname=r;
  IF marker IS DISTINCT FROM ${quote(active)} THEN RAISE EXCEPTION 'Generation 22 active check marker mismatch'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
    WHERE (g.rolname,m.rolname) IN(${pairs}) AND e.grantor=operator_name::regrole
    AND NOT e.admin_option AND e.inherit_option AND NOT e.set_option)<>5
  OR (SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
    WHERE g.rolname IN(${roleList}) AND m.rolname=operator_name
    AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5
  OR (SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
    WHERE g.rolname IN(${roleList}) OR m.rolname IN(${roleList}))<>10 THEN
  RAISE EXCEPTION 'Generation 22 active check membership mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND usename IN(${roleList})) THEN
  RAISE EXCEPTION 'Generation 22 active check runtime sessions remain'; END IF;
 IF EXISTS(
  SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
    WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND a.grantee=0 AND a.privilege_type='USAGE'
  UNION ALL SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a JOIN pg_roles g ON g.oid=a.grantee
    WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND g.rolname IN(${roleList})
  UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles g ON g.oid=a.grantee WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND g.rolname IN(${roleList})
  UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) a
    JOIN pg_roles g ON g.oid=a.grantee WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND g.rolname IN(${roleList})) THEN
  RAISE EXCEPTION 'Generation 22 active check private authority drift'; END IF;
 IF ${controls} THEN RAISE EXCEPTION 'Generation 22 active check controls not disabled'; END IF;
END $check$;
SELECT jsonb_build_object('status','PASS_ACTIVE','queryId','${QUERY_ID}',
 'projectRef','${PROJECT_REF}','generation',${GENERATION},'windowId','${WINDOW_ID}',
 'expiresAt',${quote(expiresAt)},'controlsEnabled',false,'runtimeCount',5,'runtimeSessions',0)
 AS tll_generation_22_active_check;
COMMIT;
`
}

export function validateStagingGeneration22ActiveCheck(rows, { expiresAt } = {}) {
  if (!STAGING_GENERATION_22_ACTIVE_CHECK_ENABLED || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT
    || !Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object'
    || Object.keys(rows[0]).join('|') !== 'tll_generation_22_active_check') unavailable()
  const value = rows[0].tll_generation_22_active_check
  const keys = ['status','queryId','projectRef','generation','windowId','expiresAt','controlsEnabled','runtimeCount','runtimeSessions']
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('|') !== keys.sort().join('|')
    || value.status !== 'PASS_ACTIVE' || value.queryId !== QUERY_ID || value.projectRef !== PROJECT_REF
    || value.generation !== GENERATION || value.windowId !== WINDOW_ID || value.expiresAt !== expiresAt
    || value.controlsEnabled !== false || value.runtimeCount !== 5 || value.runtimeSessions !== 0) unavailable()
  return Object.freeze({ status: 'PASS_ACTIVE', projectRef: PROJECT_REF, queryId: QUERY_ID,
    receiptSha256: createHash('sha256').update(JSON.stringify(value)).digest('hex') })
}
