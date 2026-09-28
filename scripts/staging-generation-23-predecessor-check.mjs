/** Read-only proof that the previous Gen23 window is fully retired. */
import { createHash } from 'node:crypto'
import { IDENTITIES } from './staging-generation-21-credentials.mjs'
import { PRODUCTION_PROJECT_REF } from './staging-account-hosted-baseline-database.mjs'
import { EXACT_MIGRATIONS } from './staging-generation-21-retirement-preflight.mjs'
import { PROJECT_REF, PASSWORD_PURPOSES } from './staging-generation-22-material.mjs'
import { GENERATION } from './staging-generation-23-password-material.mjs'

/** Fixed from the consumed and separately retired Gen23 v7 window. */
export const PREDECESSOR_EXPIRES_AT = '2026-09-27T22:40:00.000Z'
export const PREDECESSOR_WINDOW_ID = 'b7bf72d4-18c1-4b85-8e7c-23a95dd845fe'

export const STAGING_GENERATION_23_PREDECESSOR_CHECK_ENABLED = true
export const QUERY_ID = 'tll-staging-generation-23-predecessor-check/v1'
const unavailable = () => { throw new Error('Generation 23 predecessor check unavailable') }
const quote = value => `'${value.replaceAll("'", "''")}'`
const roles = PASSWORD_PURPOSES.map(purpose => IDENTITIES[purpose].login)
const roleList = roles.map(quote).join(',')
const migrationPairs = EXACT_MIGRATIONS.map(([version, hash]) => `(${quote(version)},${quote(hash)})`).join(',')

export function buildStagingGeneration23PredecessorCheckSql() {
  const expiresAt = PREDECESSOR_EXPIRES_AT
  if (!STAGING_GENERATION_23_PREDECESSOR_CHECK_ENABLED) unavailable()
  const marker = `tll-runtime-window/v1 ${JSON.stringify({ expiresAt, generation: GENERATION,
    projectRef: PROJECT_REF, state: 'retired', windowId: PREDECESSOR_WINDOW_ID })}`
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
  RAISE EXCEPTION 'Generation 23 predecessor check operator mismatch'; END IF;
 IF to_regclass('tll_staging_private.environment') IS NULL
  OR (SELECT count(*) FROM tll_staging_private.environment)<>1
  OR NOT EXISTS(SELECT FROM tll_staging_private.environment WHERE singleton AND environment='tll-hosted-staging-v1'
    AND operator_project_ref='${PROJECT_REF}' AND operator_context='supabase-dashboard:${PROJECT_REF}:staging-bootstrap:reviewed'
    AND identity_basis='explicit-operator-dashboard-binding' AND bootstrap_version='2026-09-15-v2'
    AND source_commit='a50e37ff05d8e731dc8ffceea1e96492079e5ff3'
    AND integrity_sha256='2d5175eb47a891ca626d635281fbb28237b16bec0d89eebe168455935117922c')
  OR EXISTS(SELECT FROM tll_staging_private.environment WHERE operator_project_ref='${PRODUCTION_PROJECT_REF}') THEN
  RAISE EXCEPTION 'Generation 23 predecessor check staging binding mismatch'; END IF;
 IF (SELECT count(*) FROM tll_staging_private.applied_migrations)<>${EXACT_MIGRATIONS.length}
  OR (SELECT count(*) FROM (VALUES ${migrationPairs}) AS expected(version,source_sha256)
    JOIN tll_staging_private.applied_migrations actual USING(version,source_sha256))<>${EXACT_MIGRATIONS.length} THEN
  RAISE EXCEPTION 'Generation 23 predecessor check migration mismatch'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN(${roleList}) AND NOT rolcanlogin
    AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
    AND NOT rolreplication AND NOT rolbypassrls
    AND rolvaliduntil='infinity'::timestamptz)<>5
  OR EXISTS(SELECT 1 FROM pg_authid WHERE rolname IN(${roleList}) AND rolpassword IS NOT NULL) THEN
  RAISE EXCEPTION 'Generation 23 predecessor check credentials remain'; END IF;
 -- PostgreSQL records object ownership as a shared dependency on the role.
 -- An owned object grants authority even when its ACL has no explicit grant.
 IF EXISTS(SELECT 1 FROM pg_shdepend d JOIN pg_roles g ON g.oid=d.refobjid
   WHERE d.refclassid='pg_authid'::regclass AND d.deptype='o'
     AND g.rolname IN(${roleList})) THEN
  RAISE EXCEPTION 'Generation 23 predecessor check runtime ownership drift'; END IF;
 FOREACH r IN ARRAY ARRAY[${roleList}] LOOP
  SELECT shobj_description(oid,'pg_authid') INTO marker FROM pg_roles WHERE rolname=r;
  IF marker IS DISTINCT FROM ${quote(marker)} THEN RAISE EXCEPTION 'Generation 23 predecessor check marker mismatch'; END IF;
 END LOOP;
  IF (SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
    WHERE g.rolname IN(${roleList}) AND m.rolname=operator_name
    AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5
  OR EXISTS(SELECT 1 FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
    WHERE (g.rolname IN(${roleList}) OR m.rolname IN(${roleList}))
    AND NOT (g.rolname IN(${roleList}) AND m.rolname=operator_name
      AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)) THEN
  RAISE EXCEPTION 'Generation 23 predecessor check membership mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND usename IN(${roleList})) THEN
  RAISE EXCEPTION 'Generation 23 predecessor check runtime sessions remain'; END IF;
 IF EXISTS(
  SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
    WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND a.grantee=0 AND a.privilege_type='USAGE'
  UNION ALL SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a JOIN pg_roles g ON g.oid=a.grantee
    WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND g.rolname IN(${roleList})
  UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles g ON g.oid=a.grantee WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND g.rolname IN(${roleList})
  UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) a
    JOIN pg_roles g ON g.oid=a.grantee WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND g.rolname IN(${roleList})) THEN
  RAISE EXCEPTION 'Generation 23 predecessor check private authority drift'; END IF;
 IF ${controls} THEN RAISE EXCEPTION 'Generation 23 predecessor check controls changed'; END IF;
END $check$;
SELECT jsonb_build_object('status','PASS_RETIRED','queryId','${QUERY_ID}',
 'projectRef','${PROJECT_REF}','generation',${GENERATION},'windowId','${PREDECESSOR_WINDOW_ID}',
 'expiresAt',${quote(expiresAt)},'controlsEnabled',false,'runtimeCount',5,'runtimeSessions',0)
 AS tll_generation_23_predecessor_check;
COMMIT;
`
}

export function validateStagingGeneration23PredecessorCheck(rows) {
  const expiresAt = PREDECESSOR_EXPIRES_AT
  if (!STAGING_GENERATION_23_PREDECESSOR_CHECK_ENABLED
    || !Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object'
    || Object.keys(rows[0]).join('|') !== 'tll_generation_23_predecessor_check') unavailable()
  const value = rows[0].tll_generation_23_predecessor_check
  const keys = ['status','queryId','projectRef','generation','windowId','expiresAt','controlsEnabled','runtimeCount','runtimeSessions']
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== keys.sort().join('|')
    || value.status !== 'PASS_RETIRED' || value.queryId !== QUERY_ID || value.projectRef !== PROJECT_REF
    || value.generation !== GENERATION || value.windowId !== PREDECESSOR_WINDOW_ID || value.expiresAt !== expiresAt
    || value.controlsEnabled !== false || value.runtimeCount !== 5 || value.runtimeSessions !== 0) unavailable()
  return Object.freeze({ status: 'PASS_RETIRED', projectRef: PROJECT_REF, queryId: QUERY_ID,
    receiptSha256: createHash('sha256').update(JSON.stringify(value)).digest('hex') })
}
