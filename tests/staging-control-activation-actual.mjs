import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { buildStagingControlActivationSql } from '../scripts/staging-control-activation.mjs'
import { admin, assertFixture } from './account-operations/local-pg.mjs'

// Actual PostgreSQL 17 proof in the existing isolated local fixture. Every
// object added here has a unique prefix and is removed in finally.
assertFixture()
const OPERATOR = 'tll_ca_operator'
const WINDOW = '91b9cc94-7743-4e0a-9d40-6f01fd215189'
const expiry = new Date(Date.now() + 10 * 60 * 1000); expiry.setMilliseconds(0)
const EXPIRES = expiry.toISOString()
const context = { generation: 22, windowId: WINDOW, expiresAt: EXPIRES }
const aliases = {
  tll_customer_owner: 'tll_ao1_customer_owner', tll_cart_owner: 'tll_ca_cart_owner',
  tll_broker_owner: 'tll_ao1_broker_owner', tll_provisional_owner: 'tll_ao1_provisional_owner', tll_bridge_owner: 'tll_ao1_bridge_owner',
  tll_customer_executor: 'tll_ao1_customer_executor', tll_cart_gateway: 'tll_ca_cart_gateway',
  tll_broker_executor: 'tll_ao1_broker_executor', tll_provisional_executor: 'tll_ao1_provisional_executor', tll_bridge_executor: 'tll_ao1_bridge_executor',
  tll_customer_runtime: 'tll_ca_customer_runtime', tll_cart_runtime: 'tll_ca_cart_runtime', tll_broker_runtime: 'tll_ca_broker_runtime',
  tll_provisional_runtime: 'tll_ca_provisional_runtime', tll_bridge_runtime: 'tll_ca_bridge_runtime',
}
const runtimes = ['customer', 'cart', 'broker', 'provisional', 'bridge'].map(name => aliases[`tll_${name}_runtime`])
const owners = ['customer', 'cart', 'broker', 'provisional', 'bridge'].map(name => aliases[`tll_${name}_owner`])
const executors = ['customer', 'cart', 'broker', 'provisional', 'bridge'].map(name => aliases[name === 'cart' ? 'tll_cart_gateway' : `tll_${name}_executor`])
const q = value => `'${value.replaceAll("'", "''")}'`
const adapt = source => Object.entries(aliases).reduce((text, [from, to]) => text.replace(new RegExp(`(?<![A-Za-z0-9_$])${from}(?![A-Za-z0-9_$])`, 'g'), to), source)
  .replaceAll('tll_staging_private', 'tll_ca_staging_private')
  .replaceAll("current_database()<>'postgres'", 'false')
  .replaceAll("current_user<>'postgres'", 'false')
  .replaceAll("session_user<>'postgres'", 'false')
function managed(sql, { allowFailure = false } = {}) {
  try {
    return execFileSync('docker', ['exec', '-i', 'tll-stage0-postgres', 'psql', '-XqAt', '-U', 'postgres', '-d', 'tll_account_operations_v1', '-v', 'ON_ERROR_STOP=1'],
      { input: `SET SESSION AUTHORIZATION ${OPERATOR};\n${sql}`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    if (allowFailure) return null
    throw Error(String(error.stderr || error.message))
  }
}
function rejectedAs(role, sql) {
  try {
    execFileSync('docker', ['exec', '-i', 'tll-stage0-postgres', 'psql', '-XqAt', '-U', 'postgres', '-d', 'tll_account_operations_v1', '-v', 'ON_ERROR_STOP=1'],
      { input: `BEGIN; SET SESSION AUTHORIZATION ${role}; ${sql}`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    assert.fail('expected PostgreSQL rejection')
  } catch (error) {
    assert.match(String(error.stderr), /new row violates row-level security policy for table "control"/)
  }
}
const controls = `SELECT string_agg(enabled::text,',' ORDER BY name) FROM (
  SELECT 'bridge' name,enabled FROM tll_bridge_private.control UNION ALL
  SELECT 'broker',enabled FROM tll_broker_private.control UNION ALL
  SELECT 'cart',enabled FROM tll_cart_private.control UNION ALL
  SELECT 'customer',enabled FROM tll_customer_private.control UNION ALL
  SELECT 'provisional',enabled FROM tll_provisional_private.control)x`
const controlSchemas = ['tll_customer_private', 'tll_broker_private', 'tll_provisional_private', 'tll_bridge_private']
const originalControls = Object.fromEntries(controlSchemas.map(schema => [schema,
  admin(`SELECT row_to_json(control)::text FROM ${schema}.control AS control WHERE singleton`)]))

let installed = false
try {
  admin(`BEGIN;
    CREATE ROLE ${OPERATOR} NOLOGIN NOINHERIT NOSUPERUSER BYPASSRLS CREATEROLE;
    GRANT pg_read_all_data,pg_read_all_stats TO ${OPERATOR}; GRANT SELECT ON pg_authid TO ${OPERATOR};
    GRANT USAGE ON SCHEMA tll_customer_private,tll_broker_private,tll_provisional_private,tll_bridge_private TO ${OPERATOR};
    GRANT EXECUTE ON FUNCTION tll_customer_private.operator_status(),tll_broker_private.operator_status(),
      tll_provisional_private.operator_status(),tll_bridge_private.operator_status() TO ${OPERATOR};
    CREATE ROLE ${aliases.tll_cart_owner} NOLOGIN NOINHERIT; CREATE ROLE ${aliases.tll_cart_gateway} NOLOGIN NOINHERIT;
    CREATE SCHEMA tll_ca_staging_private; CREATE TABLE tll_ca_staging_private.environment(singleton boolean PRIMARY KEY,environment text NOT NULL,operator_project_ref text NOT NULL);
    INSERT INTO tll_ca_staging_private.environment VALUES(true,'tll-hosted-staging-v1','qdmvngjwkcsilzmqksme');
    GRANT USAGE ON SCHEMA tll_ca_staging_private TO ${OPERATOR}; GRANT SELECT ON tll_ca_staging_private.environment TO ${OPERATOR};
    CREATE SCHEMA tll_cart_private AUTHORIZATION ${OPERATOR};
    CREATE TABLE tll_cart_private.control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,operator_oid oid NOT NULL DEFAULT current_user::regrole::oid);
    INSERT INTO tll_cart_private.control(singleton,enabled) VALUES(true,false); ALTER TABLE tll_cart_private.control OWNER TO ${OPERATOR};
    ALTER TABLE tll_cart_private.control ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA tll_cart_private TO ${aliases.tll_cart_owner}; GRANT SELECT,UPDATE(enabled) ON tll_cart_private.control TO ${aliases.tll_cart_owner};
    CREATE POLICY cart_control_owner ON tll_cart_private.control FOR SELECT TO ${aliases.tll_cart_owner} USING(true);
    CREATE POLICY cart_control_lock ON tll_cart_private.control FOR UPDATE TO ${aliases.tll_cart_owner} USING(true) WITH CHECK(false);
    ${runtimes.map(role => `CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION CONNECTION LIMIT -1 PASSWORD 'synthetic-control-only' VALID UNTIL ${q(EXPIRES)};`).join('\n')}
    GRANT ${[...owners, ...executors, ...runtimes].join(',')} TO ${OPERATOR} WITH ADMIN TRUE,INHERIT FALSE,SET FALSE;
    SET SESSION AUTHORIZATION ${OPERATOR};
    ${executors.map((role, index) => `GRANT ${role} TO ${runtimes[index]} WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;`).join('\n')}
    RESET SESSION AUTHORIZATION;
    ${runtimes.map(role => `COMMENT ON ROLE ${role} IS ${q(`tll-runtime-window/v1 ${JSON.stringify({ expiresAt: EXPIRES, generation: 22, projectRef: 'qdmvngjwkcsilzmqksme', state: 'active', windowId: WINDOW })}`)};`).join('\n')}
    UPDATE tll_customer_private.control SET enabled=false,operator_oid='${OPERATOR}'::regrole::oid;
    UPDATE tll_broker_private.control SET enabled=false,operator_oid='${OPERATOR}'::regrole::oid;
    UPDATE tll_provisional_private.control SET enabled=false,operator_oid='${OPERATOR}'::regrole::oid;
    UPDATE tll_bridge_private.control SET enabled=false,operator_oid='${OPERATOR}'::regrole::oid;
    COMMIT;`)
  installed = true
  const sql = adapt(buildStagingControlActivationSql(context, { nowMs: Date.now() }))

  // The constrained cart role cannot perform the update that the table-owning
  // staging operator is expected to perform.
  rejectedAs(aliases.tll_cart_owner, 'UPDATE tll_cart_private.control SET enabled=true WHERE singleton;')
  assert.equal(admin(controls), 'false,false,false,false,false')

  // A privilege-bearing runtime role is rejected before any control changes.
  admin(`ALTER ROLE ${runtimes[0]} BYPASSRLS`)
  assert.equal(managed(sql, { allowFailure: true }), null)
  assert.equal(admin(controls), 'false,false,false,false,false')
  admin(`ALTER ROLE ${runtimes[0]} NOBYPASSRLS`)

  // A failure after earlier UPDATE statements rolls back every control.
  const forcedFailure = sql.replace('UPDATE tll_cart_private.control SET enabled=true WHERE singleton;', "RAISE EXCEPTION 'synthetic cart failure';")
  assert.equal(managed(forcedFailure, { allowFailure: true }), null)
  assert.equal(admin(controls), 'false,false,false,false,false')

  const output = managed(sql)
  assert.match(output, /"status": "PASS_CONTROLS_ENABLED"/)
  assert.equal(admin(controls), 'true,true,true,true,true')
  assert.equal(admin(`SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid
    WHERE g.rolname IN (${owners.map(q).join(',')}) AND e.member='${OPERATOR}'::regrole AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option`), '5')
  assert.equal(admin(`SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid
    WHERE g.rolname IN (${owners.map(q).join(',')}) AND e.member='${OPERATOR}'::regrole AND (e.inherit_option OR e.set_option OR NOT e.admin_option)`), '0')
  console.log('PASS: PostgreSQL 17 rejected cart-role and runtime-attribute drift, rolled back a partial failure, enabled five controls atomically and restored ADMIN-only owner edges')
} finally {
  if (installed) admin(`${controlSchemas.map(schema => `DELETE FROM ${schema}.control;
    INSERT INTO ${schema}.control SELECT * FROM json_populate_record(NULL::${schema}.control,${q(originalControls[schema])}::json);`).join('\n')}
    DROP SCHEMA IF EXISTS tll_cart_private CASCADE; DROP SCHEMA IF EXISTS tll_ca_staging_private CASCADE;
    ${executors.map((role, index) => `REVOKE ${role} FROM ${runtimes[index]};`).join('\n')}
    ${runtimes.map(role => `DROP ROLE IF EXISTS ${role};`).join('\n')}
    DROP ROLE IF EXISTS ${aliases.tll_cart_gateway}; DROP ROLE IF EXISTS ${aliases.tll_cart_owner};
    REVOKE USAGE ON SCHEMA tll_customer_private,tll_broker_private,tll_provisional_private,tll_bridge_private FROM ${OPERATOR};
    REVOKE EXECUTE ON FUNCTION tll_customer_private.operator_status(),tll_broker_private.operator_status(),
      tll_provisional_private.operator_status(),tll_bridge_private.operator_status() FROM ${OPERATOR};
    REVOKE SELECT ON pg_authid FROM ${OPERATOR}; REVOKE pg_read_all_data,pg_read_all_stats FROM ${OPERATOR}; DROP ROLE IF EXISTS ${OPERATOR};`)
}
