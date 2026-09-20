import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { admin, assertFixture } from './account-operations/local-pg.mjs'
import { buildGeneration6CredentialSql, IDENTITIES, PREDECESSOR, PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-6-credentials.mjs'
import { deriveScramVerifier } from '../scripts/staging-generation-6-transport.mjs'

// Actual PostgreSQL 17 syntax/authority proof in the existing isolated fixture.
// Every created object is uniquely prefixed and removed in finally.
assertFixture()
const OPERATOR = 'tll_g6_operator'
const aliases = Object.fromEntries(Object.values(IDENTITIES).flatMap(identity => [identity.login, identity.membership])
  .map(role => [role, role.replace(/^tll_/, 'tll_g6_')]))
const runtimes = Object.values(IDENTITIES).map(identity => aliases[identity.login])
const executors = Object.values(IDENTITIES).map(identity => aliases[identity.membership])
const q = value => `'${value.replaceAll("'", "''")}'`
const predecessor = `tll-runtime-window/v1:${JSON.stringify({ projectRef: PROJECT_REF, generation: PREDECESSOR.generation,
  windowId: PREDECESSOR.windowId, expiresAt: PREDECESSOR.expiresAt, state: 'retired' })}`
const expiry = new Date(Date.now() + 45 * 60 * 1000); expiry.setMilliseconds(0)
const expiresAt = expiry.toISOString()
const passwords = Object.fromEntries(Object.keys(IDENTITIES).map((purpose, index) => [purpose, Buffer.alloc(48,index+1).toString('base64url')]))
const verifiers = Object.fromEntries(Object.keys(IDENTITIES).map((purpose, index) => [purpose, deriveScramVerifier(passwords[purpose],Buffer.alloc(18,index+9))]))
const adapt = source => Object.entries(aliases).reduce((text, [from, to]) => text.replace(new RegExp(`(?<![A-Za-z0-9_$])${from}(?![A-Za-z0-9_$])`, 'g'), to), source)
  .replaceAll('tll_staging_private', 'tll_g6_staging_private')
  .replaceAll('tll_cart_private', 'tll_g6_cart_private')
  .replaceAll("current_database()<>'postgres'", 'false').replaceAll("current_user<>'postgres'", 'false').replaceAll("session_user<>'postgres'", 'false')
function managed(sql) {
  try { return execFileSync('docker', ['exec','-i','tll-stage0-postgres','psql','-XqAt','-U','postgres','-d','tll_account_operations_v1','-v','ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }) }
  catch (error) { throw Error(String(error.stderr || error.message)) }
}

let installed = false
try {
  admin(`BEGIN;
    CREATE ROLE ${OPERATOR} NOLOGIN INHERIT NOSUPERUSER BYPASSRLS CREATEROLE;
    GRANT pg_read_all_data,pg_read_all_stats TO ${OPERATOR};
    GRANT SELECT ON pg_authid TO ${OPERATOR};
    GRANT USAGE ON SCHEMA tll_customer_private,tll_broker_private,tll_provisional_private,tll_bridge_private TO ${OPERATOR};
    ${executors.map(role => `CREATE ROLE ${role} NOLOGIN NOINHERIT;`).join('\n')}
    ${runtimes.map(role => `CREATE ROLE ${role} NOLOGIN NOINHERIT VALID UNTIL ${q(PREDECESSOR.expiresAt)};`).join('\n')}
    GRANT ${[...executors, ...runtimes].join(',')} TO ${OPERATOR} WITH ADMIN TRUE,INHERIT FALSE,SET FALSE;
    CREATE SCHEMA tll_g6_staging_private;
    CREATE TABLE tll_g6_staging_private.environment(singleton boolean PRIMARY KEY,environment text NOT NULL,operator_project_ref text NOT NULL,
      operator_context text NOT NULL,identity_basis text NOT NULL,source_commit text NOT NULL,integrity_sha256 text NOT NULL,bootstrap_version text NOT NULL);
    INSERT INTO tll_g6_staging_private.environment VALUES(true,'tll-hosted-staging-v1','${PROJECT_REF}',
      'supabase-dashboard:${PROJECT_REF}:staging-bootstrap:reviewed','explicit-operator-dashboard-binding','a50e37ff05d8e731dc8ffceea1e96492079e5ff3',
      '2d5175eb47a891ca626d635281fbb28237b16bec0d89eebe168455935117922c','2026-09-15-v2');
    GRANT USAGE ON SCHEMA tll_g6_staging_private TO ${OPERATOR}; GRANT SELECT ON tll_g6_staging_private.environment TO ${OPERATOR};
    CREATE SCHEMA tll_g6_cart_private; CREATE TABLE tll_g6_cart_private.control(singleton boolean PRIMARY KEY,enabled boolean NOT NULL);
    INSERT INTO tll_g6_cart_private.control VALUES(true,false); GRANT USAGE ON SCHEMA tll_g6_cart_private TO ${OPERATOR};
    GRANT SELECT ON tll_g6_cart_private.control TO ${OPERATOR};
    ${runtimes.map(role => `COMMENT ON ROLE ${role} IS ${q(predecessor)};`).join('\n')}
    UPDATE tll_customer_private.control SET enabled=false; UPDATE tll_g6_cart_private.control SET enabled=false;
    UPDATE tll_broker_private.control SET enabled=false; UPDATE tll_provisional_private.control SET enabled=false; UPDATE tll_bridge_private.control SET enabled=false;
    COMMIT;`)
  installed = true
  const sql = adapt(buildGeneration6CredentialSql({ expiresAt, verifiers }))
  admin(`COMMENT ON ROLE ${runtimes[0]} IS 'wrong-predecessor';`)
  assert.throws(() => managed(`SET SESSION AUTHORIZATION ${OPERATOR}; ${sql}`), /retired predecessor mismatch/)
  admin(`COMMENT ON ROLE ${runtimes[0]} IS ${q(predecessor)}; ALTER ROLE ${runtimes[0]} VALID UNTIL 'infinity';`)
  assert.throws(() => managed(`SET SESSION AUTHORIZATION ${OPERATOR}; ${sql}`), /retired predecessor mismatch/)
  admin(`ALTER ROLE ${runtimes[0]} VALID UNTIL ${q(PREDECESSOR.expiresAt)}; UPDATE tll_g6_cart_private.control SET enabled=true;`)
  assert.throws(() => managed(`SET SESSION AUTHORIZATION ${OPERATOR}; ${sql}`), /requires disabled controls/)
  admin('UPDATE tll_g6_cart_private.control SET enabled=false;')
  const output = managed(`SET SESSION AUTHORIZATION ${OPERATOR}; ${sql}`)
  assert.match(output, /"status": "PASS"/); assert.match(output, new RegExp(WINDOW_ID))
  assert.equal(admin(`SELECT count(*) FROM pg_authid WHERE rolname IN (${runtimes.map(q).join(',')}) AND rolcanlogin AND rolpassword IS NOT NULL`), '5')
  assert.equal(admin(`SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member
    WHERE (g.rolname,m.rolname) IN (${executors.map((role,index) => `(${q(role)},${q(runtimes[index])})`).join(',')})
      AND NOT e.admin_option AND e.inherit_option AND NOT e.set_option`), '5')
  assert.equal(admin(`SELECT count(DISTINCT shobj_description(oid,'pg_authid')) FROM pg_roles WHERE rolname IN (${runtimes.map(q).join(',')})`), '1')
  assert.match(admin(`SELECT shobj_description(oid,'pg_authid') FROM pg_roles WHERE rolname=${q(runtimes[0])}`), /"generation":6/)
  for (const [index,purpose] of Object.keys(IDENTITIES).entries()) {
    const login=execFileSync('docker',['exec','-e',`PGPASSWORD=${passwords[purpose]}`,'tll-stage0-postgres','psql','-XqAt','-h','127.0.0.1','-U',runtimes[index],'-d','tll_account_operations_v1','-v','ON_ERROR_STOP=1','-c','SELECT current_user'],{encoding:'utf8'}).trim()
    assert.equal(login,runtimes[index])
  }
  console.log('PASS: generation-6 credential transaction rejected wrong predecessor/control state, then installed five exact restricted PostgreSQL 17 identities')
} finally {
  if (installed) admin(`DROP SCHEMA IF EXISTS tll_g6_staging_private CASCADE; DROP SCHEMA IF EXISTS tll_g6_cart_private CASCADE;
    ${executors.map((role,index) => `REVOKE ${role} FROM ${runtimes[index]};`).join('\n')}
    ${runtimes.map(role => `DROP ROLE IF EXISTS ${role};`).join('\n')}
    ${executors.map(role => `DROP ROLE IF EXISTS ${role};`).join('\n')}
    REVOKE USAGE ON SCHEMA tll_customer_private,tll_broker_private,tll_provisional_private,tll_bridge_private FROM ${OPERATOR};
    REVOKE SELECT ON pg_authid FROM ${OPERATOR}; REVOKE pg_read_all_data,pg_read_all_stats FROM ${OPERATOR}; DROP ROLE IF EXISTS ${OPERATOR};`)
}
