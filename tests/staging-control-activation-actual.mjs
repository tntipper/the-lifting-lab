import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { buildStagingControlActivationSql } from '../scripts/staging-control-activation.mjs'
import { EXACT_MIGRATIONS } from '../scripts/staging-generation-21-retirement-preflight.mjs'
import { WINDOW_ID as GENERATION_23_WINDOW_ID } from '../scripts/staging-generation-23-credentials.mjs'
import { admin, assertFixture } from './account-operations/local-pg.mjs'

// Actual PostgreSQL 17 proof in the existing isolated local fixture. Every
// object added here has a unique prefix and is removed in finally.
assertFixture()
const OPERATOR = 'tll_ca_operator'
const GENERATION = process.env.TLL_CONTROL_GENERATION === '23' ? 23 : 22
const WINDOW = GENERATION === 23
  ? GENERATION_23_WINDOW_ID
  : '91b9cc94-7743-4e0a-9d40-6f01fd215189'
const expiry = new Date(Date.now() + 10 * 60 * 1000); expiry.setMilliseconds(0)
const EXPIRES = expiry.toISOString()
const context = { generation: GENERATION, windowId: WINDOW, expiresAt: EXPIRES }
async function armedGeneration23Checks() {
  const scripts = new URL('../scripts/', import.meta.url)
  const credentialSource = readFileSync(new URL('staging-generation-23-credentials.mjs', scripts), 'utf8')
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const ACTIVE_WINDOW_EXPIRES_AT = '${EXPIRES}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credentialSource).toString('base64')}`
  const shutdownSource = readFileSync(new URL('staging-generation-23-control-shutdown.mjs', scripts), 'utf8')
    .replace('export const STAGING_GENERATION_23_CONTROL_SHUTDOWN_ENABLED = false',
      'export const STAGING_GENERATION_23_CONTROL_SHUTDOWN_ENABLED = true')
    .replace("from './staging-generation-23-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const backendSource = readFileSync(new URL('staging-generation-23-backend-state.mjs', scripts), 'utf8')
    .replace('export const STAGING_GENERATION_23_BACKEND_STATE_ENABLED = false',
      'export const STAGING_GENERATION_23_BACKEND_STATE_ENABLED = true')
    .replace("from './staging-generation-23-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return {
    shutdown: await import(`data:text/javascript;base64,${Buffer.from(shutdownSource).toString('base64')}`),
    backend: await import(`data:text/javascript;base64,${Buffer.from(backendSource).toString('base64')}`),
  }
}
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
      tll_provisional_private.operator_status(),tll_bridge_private.operator_status(),
      tll_customer_private.operator_set_enabled(boolean,text),tll_broker_private.operator_set_enabled(boolean,text),
      tll_provisional_private.operator_set_enabled(boolean,text),tll_bridge_private.operator_set_enabled(boolean,text) TO ${OPERATOR};
    CREATE ROLE ${aliases.tll_cart_owner} NOLOGIN NOINHERIT; CREATE ROLE ${aliases.tll_cart_gateway} NOLOGIN NOINHERIT;
    CREATE SCHEMA tll_ca_staging_private; CREATE TABLE tll_ca_staging_private.environment(
      singleton boolean PRIMARY KEY,environment text NOT NULL,operator_project_ref text NOT NULL,
      operator_context text,identity_basis text,bootstrap_version text,source_commit text,integrity_sha256 text);
    INSERT INTO tll_ca_staging_private.environment VALUES(true,'tll-hosted-staging-v1','qdmvngjwkcsilzmqksme',
      'supabase-dashboard:qdmvngjwkcsilzmqksme:staging-bootstrap:reviewed',
      'explicit-operator-dashboard-binding','2026-09-15-v2',
      'a50e37ff05d8e731dc8ffceea1e96492079e5ff3',
      '2d5175eb47a891ca626d635281fbb28237b16bec0d89eebe168455935117922c');
    CREATE TABLE tll_ca_staging_private.applied_migrations(version text PRIMARY KEY,source_sha256 text);
    INSERT INTO tll_ca_staging_private.applied_migrations VALUES
      ${EXACT_MIGRATIONS.map(([version, hash]) => `(${q(version)},${q(hash)})`).join(',')};
    GRANT USAGE ON SCHEMA tll_ca_staging_private TO ${OPERATOR};
    GRANT SELECT ON tll_ca_staging_private.environment,tll_ca_staging_private.applied_migrations TO ${OPERATOR};
    CREATE SCHEMA tll_cart_private AUTHORIZATION ${OPERATOR};
    CREATE TABLE tll_cart_private.control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,operator_oid oid NOT NULL DEFAULT current_user::regrole::oid);
    INSERT INTO tll_cart_private.control(singleton,enabled) VALUES(true,false); ALTER TABLE tll_cart_private.control OWNER TO ${OPERATOR};
    ALTER TABLE tll_cart_private.control ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA tll_cart_private TO ${aliases.tll_cart_owner}; GRANT SELECT,UPDATE(enabled) ON tll_cart_private.control TO ${aliases.tll_cart_owner};
    CREATE POLICY cart_control_owner ON tll_cart_private.control FOR SELECT TO ${aliases.tll_cart_owner} USING(true);
    CREATE POLICY cart_control_lock ON tll_cart_private.control FOR UPDATE TO ${aliases.tll_cart_owner} USING(true) WITH CHECK(false);
    ${runtimes.map(role => `CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION CONNECTION LIMIT 2 PASSWORD 'synthetic-control-only' VALID UNTIL ${q(EXPIRES)};
      ALTER ROLE ${role} SET statement_timeout='10s';
      ALTER ROLE ${role} SET lock_timeout='5s';
      ALTER ROLE ${role} SET idle_in_transaction_session_timeout='15s';
      ALTER ROLE ${role} SET search_path=pg_catalog;`).join('\n')}
    GRANT ${[...owners, ...executors, ...runtimes].join(',')} TO ${OPERATOR} WITH ADMIN TRUE,INHERIT FALSE,SET FALSE;
    SET SESSION AUTHORIZATION ${OPERATOR};
    ${executors.map((role, index) => `GRANT ${role} TO ${runtimes[index]} WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;`).join('\n')}
    RESET SESSION AUTHORIZATION;
    ${runtimes.map(role => `COMMENT ON ROLE ${role} IS ${q(`tll-runtime-window/v1 ${JSON.stringify({ expiresAt: EXPIRES, generation: GENERATION, projectRef: 'qdmvngjwkcsilzmqksme', state: 'active', windowId: WINDOW })}`)};`).join('\n')}
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
  let backend, backendSql, shutdown
  if (GENERATION === 23) {
    const checks = await armedGeneration23Checks()
    backend = checks.backend
    shutdown = checks.shutdown
    backendSql = adapt(backend.buildStagingGeneration23BackendStateSql({ expiresAt: EXPIRES }))
    const off = [{ tll_generation_23_backend_state: JSON.parse(managed(backendSql)) }]
    assert.equal(backend.validateStagingGeneration23BackendState(off,
      { expiresAt: EXPIRES }).runtimeSessions, 0)
  }

  // A privilege-bearing runtime role is rejected before any control changes.
  admin(`ALTER ROLE ${runtimes[0]} CONNECTION LIMIT -1`)
  assert.equal(managed(sql, { allowFailure: true }), null)
  assert.equal(admin(controls), 'false,false,false,false,false')
  admin(`ALTER ROLE ${runtimes[0]} CONNECTION LIMIT 2`)
  admin(`ALTER ROLE ${runtimes[0]} RESET lock_timeout`)
  assert.equal(managed(sql, { allowFailure: true }), null)
  assert.equal(admin(controls), 'false,false,false,false,false')
  // Restoring the setting appends it in a different order; order alone is safe.
  admin(`ALTER ROLE ${runtimes[0]} SET lock_timeout='5s'`)
  admin(`ALTER ROLE ${runtimes[0]} SET work_mem='4MB'`)
  assert.equal(managed(sql, { allowFailure: true }), null)
  assert.equal(admin(controls), 'false,false,false,false,false')
  admin(`ALTER ROLE ${runtimes[0]} RESET work_mem`)
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
  if (GENERATION === 23) assert.equal(managed(backendSql, { allowFailure: true }), null)
  assert.equal(admin(`SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid
    WHERE g.rolname IN (${owners.map(q).join(',')}) AND e.member='${OPERATOR}'::regrole AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option`), '5')
  assert.equal(admin(`SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid
    WHERE g.rolname IN (${owners.map(q).join(',')}) AND e.member='${OPERATOR}'::regrole AND (e.inherit_option OR e.set_option OR NOT e.admin_option)`), '0')
  if (GENERATION === 23) {
    const shutdownSql = adapt(shutdown.buildStagingGeneration23ControlShutdownSql({ expiresAt: EXPIRES }))
    admin("UPDATE tll_ca_staging_private.environment SET operator_project_ref='wrong-project'")
    assert.equal(managed(shutdownSql, { allowFailure: true }), null)
    admin("UPDATE tll_ca_staging_private.environment SET operator_project_ref='qdmvngjwkcsilzmqksme'")
    admin(`UPDATE tll_ca_staging_private.applied_migrations SET source_sha256='wrong-hash'
      WHERE version=${q(EXACT_MIGRATIONS[0][0])}`)
    assert.equal(managed(shutdownSql, { allowFailure: true }), null)
    admin(`UPDATE tll_ca_staging_private.applied_migrations SET source_sha256=${q(EXACT_MIGRATIONS[0][1])}
      WHERE version=${q(EXACT_MIGRATIONS[0][0])}`)
    admin(`ALTER ROLE ${runtimes[0]} BYPASSRLS`)
    assert.equal(managed(shutdownSql, { allowFailure: true }), null)
    admin(`ALTER ROLE ${runtimes[0]} NOBYPASSRLS`)
    admin(`ALTER ROLE ${runtimes[0]} CONNECTION LIMIT -1`)
    assert.equal(managed(shutdownSql, { allowFailure: true }), null)
    assert.equal(admin(controls), 'true,true,true,true,true')
    admin(`ALTER ROLE ${runtimes[0]} CONNECTION LIMIT 2`)
    admin(`ALTER ROLE ${runtimes[0]} RESET lock_timeout`)
    assert.equal(managed(shutdownSql, { allowFailure: true }), null)
    assert.equal(admin(controls), 'true,true,true,true,true')
    admin(`ALTER ROLE ${runtimes[0]} SET lock_timeout='5s'`)
    admin('ALTER TABLE tll_cart_private.control DISABLE ROW LEVEL SECURITY')
    assert.equal(managed(shutdownSql, { allowFailure: true }), null)
    admin('ALTER TABLE tll_cart_private.control ENABLE ROW LEVEL SECURITY')
    assert.equal(admin(controls), 'true,true,true,true,true')
    const forcedShutdownFailure = shutdownSql.replace(
      "PERFORM tll_broker_private.operator_set_enabled(false,'generation_23_shutdown');",
      "RAISE EXCEPTION 'synthetic shutdown failure';")
    assert.notEqual(forcedShutdownFailure, shutdownSql)
    assert.equal(managed(forcedShutdownFailure, { allowFailure: true }), null)
    assert.equal(admin(controls), 'true,true,true,true,true')
    const shutdownRows = [{ tll_generation_23_control_shutdown: JSON.parse(managed(shutdownSql)) }]
    assert.equal(shutdown.validateStagingGeneration23ControlShutdownReceipt(shutdownRows,
      { expiresAt: EXPIRES }).status, 'CONTROLS_DISABLED')
    assert.equal(admin(controls), 'false,false,false,false,false')
    const off = [{ tll_generation_23_backend_state: JSON.parse(managed(backendSql)) }]
    assert.equal(backend.validateStagingGeneration23BackendState(off,
      { expiresAt: EXPIRES }).runtimeSessions, 0)
  }
  console.log(`PASS: PostgreSQL 17 generation ${GENERATION} rejected privilege drift, rolled back a partial failure, enabled five controls atomically${GENERATION === 23 ? ', then disabled them through the operator controls' : ''}`)
} finally {
  if (installed) admin(`${controlSchemas.map(schema => `DELETE FROM ${schema}.control;
    INSERT INTO ${schema}.control SELECT * FROM json_populate_record(NULL::${schema}.control,${q(originalControls[schema])}::json);`).join('\n')}
    DROP SCHEMA IF EXISTS tll_cart_private CASCADE; DROP SCHEMA IF EXISTS tll_ca_staging_private CASCADE;
    ${executors.map((role, index) => `REVOKE ${role} FROM ${runtimes[index]};`).join('\n')}
    ${runtimes.map(role => `DROP ROLE IF EXISTS ${role};`).join('\n')}
    DROP ROLE IF EXISTS ${aliases.tll_cart_gateway}; DROP ROLE IF EXISTS ${aliases.tll_cart_owner};
    REVOKE USAGE ON SCHEMA tll_customer_private,tll_broker_private,tll_provisional_private,tll_bridge_private FROM ${OPERATOR};
    REVOKE EXECUTE ON FUNCTION tll_customer_private.operator_status(),tll_broker_private.operator_status(),
      tll_provisional_private.operator_status(),tll_bridge_private.operator_status(),
      tll_customer_private.operator_set_enabled(boolean,text),tll_broker_private.operator_set_enabled(boolean,text),
      tll_provisional_private.operator_set_enabled(boolean,text),tll_bridge_private.operator_set_enabled(boolean,text) FROM ${OPERATOR};
    REVOKE SELECT ON pg_authid FROM ${OPERATOR}; REVOKE pg_read_all_data,pg_read_all_stats FROM ${OPERATOR}; DROP ROLE IF EXISTS ${OPERATOR};`)
}
