/**
 * Pure generation-21 credential package and nonsecret dispatch journal.
 *
 * This module performs no credential lookup, network request or database work.
 * SCRAM verifiers are accepted only in memory and are interpolated into one
 * fixed staging transaction. Callers must never persist or log the SQL result.
 */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROJECT_REF = 'qdmvngjwkcsilzmqksme'
export const PRODUCTION_PROJECT_REF = 'wrhgscovsgsudtedbljr'
export const GENERATION = 21
export const WINDOW_ID = 'a5511645-77af-4fc9-9e4c-f5c8a474d5fa'
export const MAX_WINDOW_MS = 60 * 60 * 1000
export const PACKAGE_ID = 'tll-staging-generation-21-credentials/v1'
// The sole Gen21 active-window expiry source. Phase 1 deliberately has no
// UTC expiry. A reviewed arming-only diff must replace this one literal.
export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'
/**
 * Role/DB predecessor is the exact retired Generation 19 runtime window.
 * Generation 21 may never be armed until a new reviewed boundary confirms the
 * predecessor's five matching retired markers and this package's disabled gates.
 * The values below are the secret-free retirement contract, not credentials.
 */
export const PREDECESSOR = Object.freeze({
  generation: 19,
  windowId: '51809dd4-bd4b-44c7-8609-7dd8ca063679',
  expiresAt: '2026-09-21T11:08:34.000Z',
})
// A retired marker keeps the historical active expiry, while PostgreSQL role
// retirement restores the role's VALID UNTIL to infinity. These are separate
// invariants and must not be compared.
export const PREDECESSOR_VALID_UNTIL = 'infinity'
export const IDENTITIES = Object.freeze({
  customer: Object.freeze({ login: 'tll_customer_runtime', membership: 'tll_customer_executor' }),
  cart: Object.freeze({ login: 'tll_cart_runtime', membership: 'tll_cart_gateway' }),
  broker: Object.freeze({ login: 'tll_broker_runtime', membership: 'tll_broker_executor' }),
  provisional: Object.freeze({ login: 'tll_provisional_runtime', membership: 'tll_provisional_executor' }),
  bridge: Object.freeze({ login: 'tll_bridge_runtime', membership: 'tll_bridge_executor' }),
})
export const DEFAULT_JOURNAL_PATH = fileURLToPath(new URL('../../implementation-state/staging/tll-generation-21-credential-dispatch.json', import.meta.url))

const purposes = Object.keys(IDENTITIES)
const sqlLiteral = value => `'${value.replaceAll("'", "''")}'`
const unavailable = () => { throw new Error('Generation-21 credential package unavailable') }
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function validateExpiry(expiresAt, nowMs) {
  if (typeof expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(expiresAt)) unavailable()
  const expiryMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiryMs) || expiryMs <= nowMs || expiryMs - nowMs > MAX_WINDOW_MS) unavailable()
  return expiresAt
}

export function assertGeneration21ActiveWindowExpiry(nowMs = Date.now()) {
  if (ACTIVE_WINDOW_EXPIRES_AT === 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF') unavailable()
  return validateExpiry(ACTIVE_WINDOW_EXPIRES_AT, nowMs)
}

function validateVerifiers(verifiers) {
  if (!exactKeys(verifiers, purposes)) unavailable()
  const values = purposes.map(purpose => verifiers[purpose])
  const pattern = /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/
  if (values.some(value => typeof value !== 'string' || value.length > 1024 || !pattern.test(value))
    || new Set(values).size !== values.length) unavailable()
  return verifiers
}

function marker({ generation, windowId, expiresAt }, state) {
  return `tll-runtime-window/v1 ${JSON.stringify({ expiresAt, generation, projectRef: PROJECT_REF, state, windowId })}`
}

/** Build the only secret-bearing SQL used by the credential installer. */
export function buildGeneration21CredentialSql({ verifiers, nowMs = Date.now() }) {
  const expiresAt = assertGeneration21ActiveWindowExpiry(nowMs); validateVerifiers(verifiers)
  const predecessorValidUntil = sqlLiteral(PREDECESSOR_VALID_UNTIL)
  const active = marker({ generation: GENERATION, windowId: WINDOW_ID, expiresAt }, 'active')
  const logins = purposes.map(purpose => IDENTITIES[purpose].login)
  const memberships = purposes.map(purpose => IDENTITIES[purpose].membership)
  const roleList = logins.map(sqlLiteral).join(',')
  const expectedPairs = purposes.map(purpose => `(${sqlLiteral(IDENTITIES[purpose].membership)},${sqlLiteral(IDENTITIES[purpose].login)})`).join(',')
  const activate = purposes.map(purpose => {
    const { login, membership } = IDENTITIES[purpose]
    return `GRANT ${membership} TO ${login} WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;\nALTER ROLE ${login} LOGIN PASSWORD ${sqlLiteral(verifiers[purpose])} VALID UNTIL ${sqlLiteral(expiresAt)};\nCOMMENT ON ROLE ${login} IS ${sqlLiteral(active)};`
  }).join('\n')
  const expectedPasswordCases = purposes.map(purpose => `WHEN ${sqlLiteral(IDENTITIES[purpose].login)} THEN ${sqlLiteral(verifiers[purpose])}`).join(' ')
  const expectedValidUntil = sqlLiteral(expiresAt)
  return `BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE r text; role_marker text; parsed_marker jsonb; operator_name name:=session_user;
BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' OR session_user<>'postgres' OR current_user<>session_user
  OR current_setting('server_version_num')::int<170000 OR (SELECT rolsuper OR NOT rolcreaterole FROM pg_roles WHERE rolname=operator_name)
  OR NOT has_table_privilege(operator_name,'pg_authid','SELECT') THEN
  RAISE EXCEPTION 'Generation 21 requires exact managed staging postgres operator'; END IF;
 IF to_regclass('tll_staging_private.environment') IS NULL OR (SELECT count(*) FROM tll_staging_private.environment)<>1
  OR NOT EXISTS(SELECT FROM tll_staging_private.environment WHERE singleton AND environment='tll-hosted-staging-v1'
   AND operator_project_ref='${PROJECT_REF}' AND operator_context='supabase-dashboard:${PROJECT_REF}:staging-bootstrap:reviewed'
   AND identity_basis='explicit-operator-dashboard-binding' AND bootstrap_version='2026-09-15-v2'
   AND source_commit='a50e37ff05d8e731dc8ffceea1e96492079e5ff3'
   AND integrity_sha256='2d5175eb47a891ca626d635281fbb28237b16bec0d89eebe168455935117922c')
  OR EXISTS(SELECT FROM tll_staging_private.environment WHERE operator_project_ref='${PRODUCTION_PROJECT_REF}') THEN
  RAISE EXCEPTION 'Generation 21 staging binding mismatch'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN(${roleList}))<>5
  OR EXISTS(SELECT FROM pg_roles WHERE rolname IN(${roleList}) AND (rolcanlogin OR rolvaliduntil IS DISTINCT FROM ${predecessorValidUntil}::timestamptz))
  OR EXISTS(SELECT FROM pg_authid WHERE rolname IN(${roleList}) AND rolpassword IS NOT NULL) THEN
  RAISE EXCEPTION 'Generation 21 retired predecessor mismatch'; END IF;
 FOREACH r IN ARRAY ARRAY[${logins.map(sqlLiteral).join(',')}] LOOP
  SELECT shobj_description(oid,'pg_authid') INTO role_marker FROM pg_roles WHERE rolname=r;
  IF role_marker IS NULL OR role_marker !~ '^tll-runtime-window/v1 [{].*[}]$' THEN
   RAISE EXCEPTION 'Generation 21 retired predecessor marker malformed: %',r; END IF;
  BEGIN parsed_marker:=substring(role_marker FROM '^tll-runtime-window/v1 ([{].*[}])$')::jsonb;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Generation 21 retired predecessor marker invalid: %',r; END;
  IF parsed_marker IS DISTINCT FROM ${sqlLiteral(JSON.stringify({ expiresAt: PREDECESSOR.expiresAt, generation: PREDECESSOR.generation, projectRef: PROJECT_REF, state: 'retired', windowId: PREDECESSOR.windowId }))}::jsonb THEN
   RAISE EXCEPTION 'Generation 21 retired predecessor marker mismatch: %',r; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_auth_members e JOIN pg_roles m ON m.oid=e.member JOIN pg_roles g ON g.oid=e.roleid
   WHERE g.rolname IN(${roleList}) AND m.rolname=operator_name
    AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5
  OR EXISTS(SELECT FROM pg_auth_members e JOIN pg_roles m ON m.oid=e.member JOIN pg_roles g ON g.oid=e.roleid
   WHERE (g.rolname IN(${roleList}) OR m.rolname IN(${roleList}))
    AND NOT (g.rolname IN(${roleList}) AND m.rolname=operator_name
      AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)) THEN
  RAISE EXCEPTION 'Generation 21 runtime memberships are not inert'; END IF;
 IF EXISTS(SELECT FROM pg_stat_activity WHERE backend_type='client backend' AND usename IN(${roleList})) THEN
  RAISE EXCEPTION 'Generation 21 runtime sessions remain'; END IF;
 IF (SELECT count(*) FROM tll_customer_private.control)<>1 OR EXISTS(SELECT FROM tll_customer_private.control WHERE NOT singleton OR enabled)
  OR (SELECT count(*) FROM tll_cart_private.control)<>1 OR EXISTS(SELECT FROM tll_cart_private.control WHERE NOT singleton OR enabled)
  OR (SELECT count(*) FROM tll_broker_private.control)<>1 OR EXISTS(SELECT FROM tll_broker_private.control WHERE NOT singleton OR enabled)
  OR (SELECT count(*) FROM tll_provisional_private.control)<>1 OR EXISTS(SELECT FROM tll_provisional_private.control WHERE NOT singleton OR enabled)
  OR (SELECT count(*) FROM tll_bridge_private.control)<>1 OR EXISTS(SELECT FROM tll_bridge_private.control WHERE NOT singleton OR enabled) THEN
  RAISE EXCEPTION 'Generation 21 requires disabled controls'; END IF;
 FOREACH r IN ARRAY ARRAY[${memberships.map(sqlLiteral).join(',')}] LOOP
  IF NOT EXISTS(SELECT FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid WHERE g.rolname=r AND e.member=operator_name::regrole
   AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option) THEN RAISE EXCEPTION 'Generation 21 operator membership mismatch: %',r; END IF;
 END LOOP;
END $preflight$;
${activate}
DO $postflight$
DECLARE expected_marker text:=${sqlLiteral(active)};
BEGIN
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN(${roleList}) AND rolcanlogin AND rolvaliduntil=${expectedValidUntil}::timestamptz
   AND shobj_description(oid,'pg_authid')=expected_marker)<>5 THEN RAISE EXCEPTION 'Generation 21 role state mismatch'; END IF;
 IF EXISTS(SELECT FROM pg_authid WHERE rolname IN(${roleList}) AND rolpassword IS DISTINCT FROM CASE rolname ${expectedPasswordCases} END) THEN
  RAISE EXCEPTION 'Generation 21 verifier mismatch'; END IF;
 IF (SELECT count(*) FROM pg_auth_members e JOIN pg_roles m ON m.oid=e.member JOIN pg_roles g ON g.oid=e.roleid
   WHERE (g.rolname,m.rolname) IN (${expectedPairs}) AND NOT e.admin_option AND e.inherit_option AND NOT e.set_option)<>5
  OR (SELECT count(*) FROM pg_auth_members e JOIN pg_roles m ON m.oid=e.member JOIN pg_roles g ON g.oid=e.roleid
   WHERE g.rolname IN(${roleList}) AND m.rolname=session_user
    AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option)<>5
  OR EXISTS(SELECT FROM pg_auth_members e JOIN pg_roles m ON m.oid=e.member JOIN pg_roles g ON g.oid=e.roleid
   WHERE (g.rolname IN(${roleList}) OR m.rolname IN(${roleList}))
    AND NOT (((g.rolname,m.rolname) IN (${expectedPairs})
        AND NOT e.admin_option AND e.inherit_option AND NOT e.set_option)
      OR (g.rolname IN(${roleList}) AND m.rolname=session_user
        AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option))) THEN
  RAISE EXCEPTION 'Generation 21 effective membership mismatch'; END IF;
 IF (SELECT count(*) FROM tll_customer_private.control)<>1 OR EXISTS(SELECT FROM tll_customer_private.control WHERE NOT singleton OR enabled)
  OR (SELECT count(*) FROM tll_cart_private.control)<>1 OR EXISTS(SELECT FROM tll_cart_private.control WHERE NOT singleton OR enabled)
  OR (SELECT count(*) FROM tll_broker_private.control)<>1 OR EXISTS(SELECT FROM tll_broker_private.control WHERE NOT singleton OR enabled)
  OR (SELECT count(*) FROM tll_provisional_private.control)<>1 OR EXISTS(SELECT FROM tll_provisional_private.control WHERE NOT singleton OR enabled)
  OR (SELECT count(*) FROM tll_bridge_private.control)<>1 OR EXISTS(SELECT FROM tll_bridge_private.control WHERE NOT singleton OR enabled) THEN
  RAISE EXCEPTION 'Generation 21 control changed during install'; END IF;
END $postflight$;
COMMIT;
SELECT jsonb_build_object('status','PASS','packageId','${PACKAGE_ID}','projectRef','${PROJECT_REF}','generation',${GENERATION},'windowId','${WINDOW_ID}','expiresAt',${sqlLiteral(expiresAt)},'controlsEnabled',false,'runtimeCount',5) AS tll_generation_21_credential_receipt;
`
}

function fsyncDirectory(directory, fileSystem) {
  const descriptor = fileSystem.openSync(directory, 'r')
  try { fileSystem.fsyncSync(descriptor) } finally { fileSystem.closeSync(descriptor) }
}

function readJournal(path, fileSystem = fs) {
  try {
    const stat = fileSystem.lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || stat.size > 65_536) unavailable()
    const value = JSON.parse(fileSystem.readFileSync(path, 'utf8'))
    if (!exactKeys(value, ['schema','packageId','target','generation','windowId','expiresAt','state','runId','createdAt'])
      || value.schema !== `${PACKAGE_ID}/dispatch-journal/v1` || value.packageId !== PACKAGE_ID || value.target !== PROJECT_REF
      || value.generation !== GENERATION || value.windowId !== WINDOW_ID || !['INTENT_RECORDED','RECEIPT_VALIDATED','RECONCILIATION_REQUIRED'].includes(value.state)
      || typeof value.runId !== 'string' || typeof value.createdAt !== 'string') unavailable()
    return Object.freeze(value)
  } catch (error) { if (error?.code === 'ENOENT') return null; unavailable() }
}

/** The journal contains no SQL, verifier, password, key, token or provider value. */
export function createGeneration21DispatchJournal({ path = DEFAULT_JOURNAL_PATH, fileSystem = fs, makeRunId = randomUUID } = {}) {
  let ownedRunId
  return Object.freeze({
    read: () => readJournal(path, fileSystem),
    recordIntent({ expiresAt, nowMs = Date.now() }) {
      validateExpiry(expiresAt, nowMs)
      if (readJournal(path, fileSystem)) unavailable()
      const runId = makeRunId(); if (typeof runId !== 'string' || runId.length < 8) unavailable()
      const record = Object.freeze({ schema: `${PACKAGE_ID}/dispatch-journal/v1`, packageId: PACKAGE_ID, target: PROJECT_REF,
        generation: GENERATION, windowId: WINDOW_ID, expiresAt, state: 'INTENT_RECORDED', runId, createdAt: new Date(nowMs).toISOString() })
      const directory = dirname(path), bytes = Buffer.from(JSON.stringify(record) + '\n'); let descriptor
      try {
        fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 })
        descriptor = fileSystem.openSync(path, 'wx', 0o600); fileSystem.writeSync(descriptor, bytes); fileSystem.fsyncSync(descriptor)
        fileSystem.closeSync(descriptor); descriptor = undefined; fsyncDirectory(directory, fileSystem); ownedRunId = runId; return record
      } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
    },
    transition(intent, state) {
      if (!intent || intent.runId !== ownedRunId || intent.state !== 'INTENT_RECORDED'
        || !['RECEIPT_VALIDATED','RECONCILIATION_REQUIRED'].includes(state)) unavailable()
      const current = readJournal(path, fileSystem); if (!current || current.runId !== ownedRunId || current.state !== 'INTENT_RECORDED') unavailable()
      const record = Object.freeze({ ...current, state }), temporary = resolve(dirname(path), `.${PACKAGE_ID.replace(/[^a-z0-9]/gi, '_')}.${ownedRunId}.tmp`)
      const bytes = Buffer.from(JSON.stringify(record) + '\n'); let descriptor
      try {
        descriptor = fileSystem.openSync(temporary, 'wx', 0o600); fileSystem.writeSync(descriptor, bytes); fileSystem.fsyncSync(descriptor)
        fileSystem.closeSync(descriptor); descriptor = undefined; fileSystem.renameSync(temporary, path); fsyncDirectory(dirname(path), fileSystem)
        ownedRunId = undefined; return record
      } finally { if (descriptor !== undefined) fileSystem.closeSync(descriptor); bytes.fill(0) }
    },
  })
}
