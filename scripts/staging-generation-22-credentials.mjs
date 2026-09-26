/** Pure, disconnected SQL package for a future reviewed staging credential window. */
import { createHash } from 'node:crypto'
import { GENERATION_21_RETIRED_EXPIRES_AT, PRODUCTION_PROJECT_REF,
  STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID } from './staging-account-hosted-baseline-database.mjs'
import { IDENTITIES, WINDOW_ID as GENERATION_21_WINDOW_ID } from './staging-generation-21-credentials.mjs'
import { GENERATION, PROJECT_REF, PASSWORD_PURPOSES } from './staging-generation-22-material.mjs'
import { EXACT_MIGRATIONS } from './staging-generation-21-retirement-preflight.mjs'

export const STAGING_GENERATION_22_CREDENTIALS_ENABLED = false
export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'
export const WINDOW_ID = '9a539def-bf3c-442c-bf06-c4bd1df39543'
export const PACKAGE_ID = 'tll-staging-generation-22-credentials/v1'
export const MAX_WINDOW_MS = 60 * 60 * 1000
export const PREDECESSOR = Object.freeze({
  generation: 21,
  windowId: GENERATION_21_WINDOW_ID,
  expiresAt: GENERATION_21_RETIRED_EXPIRES_AT,
  queryId: STAGING_ACCOUNT_HOSTED_BASELINE_DATABASE_QUERY_ID,
})
const unavailable = () => { throw new Error('Staging generation 22 credential SQL unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const quote = value => `'${value.replaceAll("'", "''")}'`
const roles = PASSWORD_PURPOSES.map(purpose => IDENTITIES[purpose].login)
const memberships = PASSWORD_PURPOSES.map(purpose => IDENTITIES[purpose].membership)
const roleList = roles.map(quote).join(',')
const migrationPairs = EXACT_MIGRATIONS.map(([version, hash]) => `(${quote(version)},${quote(hash)})`).join(',')
const pairs = PASSWORD_PURPOSES.map(purpose => `(${quote(IDENTITIES[purpose].membership)},${quote(IDENTITIES[purpose].login)})`).join(',')
const predecessorMarker = JSON.stringify({
  expiresAt: PREDECESSOR.expiresAt, generation: PREDECESSOR.generation,
  projectRef: PROJECT_REF, state: 'retired', windowId: PREDECESSOR.windowId,
})
const privateAclDrift = `SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
    WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND a.grantee=0 AND a.privilege_type='USAGE'
  UNION ALL SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
    JOIN pg_roles g ON g.oid=a.grantee WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND g.rolname IN(${roleList})
  UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a JOIN pg_roles g ON g.oid=a.grantee
    WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND g.rolname IN(${roleList})
  UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) a JOIN pg_roles g ON g.oid=a.grantee
    WHERE n.nspname LIKE 'tll\\_%\\_private' ESCAPE '\\' AND g.rolname IN(${roleList})`

function validateExpiry(expiresAt, nowMs) {
  if (typeof expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(expiresAt)
    || !Number.isFinite(nowMs)) unavailable()
  const end = Date.parse(expiresAt)
  if (!Number.isFinite(end) || end <= nowMs || end - nowMs > MAX_WINDOW_MS) unavailable()
}

function validateVerifiers(verifiers) {
  if (!exact(verifiers, PASSWORD_PURPOSES)) unavailable()
  const values = PASSWORD_PURPOSES.map(purpose => verifiers[purpose])
  const pattern = /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/
  if (values.some(value => typeof value !== 'string' || value.length > 1024 || !pattern.test(value))
    || new Set(values).size !== values.length) unavailable()
}

/** Returns secret-bearing SQL. Caller must never log, persist or return it. */
export function buildStagingGeneration22CredentialSql({ expiresAt, verifiers, nowMs = Date.now() } = {}) {
  if (!STAGING_GENERATION_22_CREDENTIALS_ENABLED || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT) unavailable()
  validateExpiry(expiresAt, nowMs)
  validateVerifiers(verifiers)
  const activeMarker = JSON.stringify({ expiresAt, generation: GENERATION, projectRef: PROJECT_REF,
    state: 'active', windowId: WINDOW_ID })
  const activeComment = `tll-runtime-window/v1 ${activeMarker}`
  const install = PASSWORD_PURPOSES.map(purpose => {
    const { login, membership } = IDENTITIES[purpose]
    return `GRANT ${membership} TO ${login} WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
ALTER ROLE ${login} LOGIN PASSWORD ${quote(verifiers[purpose])} VALID UNTIL ${quote(expiresAt)};
COMMENT ON ROLE ${login} IS ${quote(activeComment)};`
  }).join('\n')
  const passwordCases = PASSWORD_PURPOSES.map(purpose =>
    `WHEN ${quote(IDENTITIES[purpose].login)} THEN ${quote(verifiers[purpose])}`).join(' ')
  return `BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE r text; role_marker text; parsed_marker jsonb; operator_name name:=session_user;
BEGIN
 IF clock_timestamp() >= ${quote(expiresAt)}::timestamptz THEN
  RAISE EXCEPTION 'Generation 22 credential window expired before install'; END IF;
 IF current_database()<>'postgres' OR current_user<>'postgres' OR session_user<>'postgres' OR current_user<>session_user
  OR current_setting('server_version_num')::int<170000
  OR (SELECT rolsuper OR NOT rolcreaterole FROM pg_roles WHERE rolname=operator_name)
  OR NOT has_table_privilege(operator_name,'pg_authid','SELECT') THEN
  RAISE EXCEPTION 'Generation 22 operator mismatch'; END IF;
 IF to_regclass('tll_staging_private.environment') IS NULL OR (SELECT count(*) FROM tll_staging_private.environment)<>1
  OR NOT EXISTS(SELECT FROM tll_staging_private.environment WHERE singleton AND environment='tll-hosted-staging-v1'
    AND operator_project_ref='${PROJECT_REF}' AND operator_context='supabase-dashboard:${PROJECT_REF}:staging-bootstrap:reviewed'
    AND identity_basis='explicit-operator-dashboard-binding' AND bootstrap_version='2026-09-15-v2'
    AND source_commit='a50e37ff05d8e731dc8ffceea1e96492079e5ff3'
    AND integrity_sha256='2d5175eb47a891ca626d635281fbb28237b16bec0d89eebe168455935117922c')
  OR EXISTS(SELECT FROM tll_staging_private.environment WHERE operator_project_ref='${PRODUCTION_PROJECT_REF}') THEN
  RAISE EXCEPTION 'Generation 22 staging binding mismatch'; END IF;
 IF (SELECT count(*) FROM tll_staging_private.applied_migrations)<>${EXACT_MIGRATIONS.length}
  OR (SELECT count(*) FROM (VALUES ${migrationPairs}) AS expected(version,source_sha256)
    JOIN tll_staging_private.applied_migrations actual USING(version,source_sha256))<>${EXACT_MIGRATIONS.length} THEN
  RAISE EXCEPTION 'Generation 22 migration ledger mismatch'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN(${roleList}))<>5
  OR EXISTS(SELECT FROM pg_roles WHERE rolname IN(${roleList})
    AND (rolcanlogin OR rolvaliduntil IS DISTINCT FROM 'infinity'::timestamptz))
  OR EXISTS(SELECT FROM pg_authid WHERE rolname IN(${roleList}) AND rolpassword IS NOT NULL) THEN
  RAISE EXCEPTION 'Generation 22 retired predecessor mismatch'; END IF;
 FOREACH r IN ARRAY ARRAY[${roleList}] LOOP
  SELECT shobj_description(oid,'pg_authid') INTO role_marker FROM pg_roles WHERE rolname=r;
  IF role_marker IS NULL OR role_marker !~ '^tll-runtime-window/v1 [{].*[}]$' THEN
    RAISE EXCEPTION 'Generation 22 retired marker malformed'; END IF;
  BEGIN parsed_marker:=substring(role_marker FROM '^tll-runtime-window/v1 ([{].*[}])$')::jsonb;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'Generation 22 retired marker invalid'; END;
  IF parsed_marker IS DISTINCT FROM ${quote(predecessorMarker)}::jsonb THEN
    RAISE EXCEPTION 'Generation 22 retired marker mismatch'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_auth_members e JOIN pg_roles granted ON granted.oid=e.roleid
    JOIN pg_roles member ON member.oid=e.member WHERE granted.rolname IN(${roleList})
    AND member.rolname=operator_name AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5
  OR EXISTS(SELECT FROM pg_auth_members e JOIN pg_roles granted ON granted.oid=e.roleid
    JOIN pg_roles member ON member.oid=e.member WHERE
      (granted.rolname IN(${roleList}) OR member.rolname IN(${roleList})) AND NOT
      (granted.rolname IN(${roleList}) AND member.rolname=operator_name
       AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)) THEN
  RAISE EXCEPTION 'Generation 22 runtime memberships are not inert'; END IF;
 IF EXISTS(SELECT FROM pg_stat_activity WHERE usename IN(${roleList})) THEN
  RAISE EXCEPTION 'Generation 22 runtime sessions remain'; END IF;
 IF EXISTS(${privateAclDrift}) THEN
  RAISE EXCEPTION 'Generation 22 direct or PUBLIC private authority detected'; END IF;
 IF ${PASSWORD_PURPOSES.map(purpose => `(SELECT count(*) FROM tll_${purpose}_private.control)<>1
  OR EXISTS(SELECT FROM tll_${purpose}_private.control WHERE NOT singleton OR enabled)`).join('\n  OR ')} THEN
  RAISE EXCEPTION 'Generation 22 requires disabled controls'; END IF;
 FOREACH r IN ARRAY ARRAY[${memberships.map(quote).join(',')}] LOOP
  IF NOT EXISTS(SELECT FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid
    WHERE g.rolname=r AND e.member=operator_name::regrole
      AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option) THEN
    RAISE EXCEPTION 'Generation 22 operator membership mismatch'; END IF;
 END LOOP;
END $preflight$;
${install}
DO $postflight$
DECLARE expected_marker text:=${quote(activeComment)};
BEGIN
 IF clock_timestamp() >= ${quote(expiresAt)}::timestamptz THEN
  RAISE EXCEPTION 'Generation 22 credential window expired before commit'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN(${roleList})
    AND rolcanlogin AND rolvaliduntil=${quote(expiresAt)}::timestamptz
    AND shobj_description(oid,'pg_authid')=expected_marker)<>5 THEN
  RAISE EXCEPTION 'Generation 22 role state mismatch'; END IF;
 IF EXISTS(SELECT FROM pg_authid WHERE rolname IN(${roleList})
    AND rolpassword IS DISTINCT FROM CASE rolname ${passwordCases} END) THEN
  RAISE EXCEPTION 'Generation 22 verifier mismatch'; END IF;
 IF EXISTS(${privateAclDrift}) THEN
  RAISE EXCEPTION 'Generation 22 direct or PUBLIC private authority changed'; END IF;
 IF (SELECT count(*) FROM pg_auth_members e JOIN pg_roles m ON m.oid=e.member
    JOIN pg_roles g ON g.oid=e.roleid WHERE (g.rolname,m.rolname) IN (${pairs})
    AND NOT e.admin_option AND e.inherit_option AND NOT e.set_option)<>5
  OR (SELECT count(*) FROM pg_auth_members e JOIN pg_roles m ON m.oid=e.member
    JOIN pg_roles g ON g.oid=e.roleid WHERE g.rolname IN(${roleList})
    AND m.rolname=session_user AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5
  OR EXISTS(SELECT FROM pg_auth_members e JOIN pg_roles m ON m.oid=e.member
    JOIN pg_roles g ON g.oid=e.roleid
    WHERE (g.rolname IN(${roleList}) OR m.rolname IN(${roleList}))
    AND NOT (((g.rolname,m.rolname) IN (${pairs})
      AND NOT e.admin_option AND e.inherit_option AND NOT e.set_option)
      OR (g.rolname IN(${roleList}) AND m.rolname=session_user
      AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option))) THEN
  RAISE EXCEPTION 'Generation 22 effective membership mismatch'; END IF;
 IF ${PASSWORD_PURPOSES.map(purpose => `(SELECT count(*) FROM tll_${purpose}_private.control)<>1
  OR EXISTS(SELECT FROM tll_${purpose}_private.control WHERE NOT singleton OR enabled)`).join('\n  OR ')} THEN
  RAISE EXCEPTION 'Generation 22 control changed during install'; END IF;
END $postflight$;
COMMIT;
SELECT jsonb_build_object('status','PASS','packageId','${PACKAGE_ID}',
 'projectRef','${PROJECT_REF}','generation',${GENERATION},'windowId','${WINDOW_ID}',
 'expiresAt',${quote(expiresAt)},'controlsEnabled',false,'runtimeCount',5)
 AS tll_generation_22_credential_receipt;
`
}

/** Accepts only the exact nonsecret result of the single Gen22 transaction. */
export function validateStagingGeneration22CredentialReceipt(rows, { expiresAt, nowMs = Date.now() } = {}) {
  if (!STAGING_GENERATION_22_CREDENTIALS_ENABLED || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT) unavailable()
  validateExpiry(expiresAt, nowMs)
  if (!Array.isArray(rows) || rows.length !== 1 || !exact(rows[0], ['tll_generation_22_credential_receipt'])) unavailable()
  const receipt = rows[0].tll_generation_22_credential_receipt
  if (!exact(receipt, ['status', 'packageId', 'projectRef', 'generation', 'windowId', 'expiresAt', 'controlsEnabled', 'runtimeCount'])
    || receipt.status !== 'PASS' || receipt.packageId !== PACKAGE_ID || receipt.projectRef !== PROJECT_REF
    || receipt.generation !== GENERATION || receipt.windowId !== WINDOW_ID || receipt.expiresAt !== expiresAt
    || receipt.controlsEnabled !== false || receipt.runtimeCount !== 5) unavailable()
  return Object.freeze({ status: 'PASS', projectRef: PROJECT_REF, generation: GENERATION,
    windowId: WINDOW_ID, receiptSha256: createHash('sha256').update(JSON.stringify(receipt)).digest('hex') })
}
