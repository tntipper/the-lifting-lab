import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { admin, assertFixture } from './local-pg.mjs'

// Actual PostgreSQL 17 proof. The synthetic operator is deliberately a
// non-superuser without BYPASSRLS or direct private-table grants. It receives
// only the same ADMIN-only role edges used by managed staging.
assertFixture()
const aliases = {
  tll_customer_owner: 'tll_ao1_customer_owner', tll_cart_owner: 'tll_ao1_cart_owner', tll_broker_owner: 'tll_ao1_broker_owner',
  tll_provisional_owner: 'tll_ao1_provisional_owner', tll_bridge_owner: 'tll_ao1_bridge_owner',
  tll_customer_executor: 'tll_ao1_customer_executor', tll_cart_gateway: 'tll_ao1_cart_gateway', tll_broker_executor: 'tll_ao1_broker_executor',
  tll_provisional_executor: 'tll_ao1_provisional_executor', tll_bridge_executor: 'tll_ao1_bridge_executor',
  tll_customer_runtime: 'tll_ao1_customer_runtime', tll_cart_runtime: 'tll_ao1_cart_runtime', tll_broker_runtime: 'tll_ao1_broker_runtime',
  tll_provisional_runtime: 'tll_ao1_provisional_runtime', tll_bridge_runtime: 'tll_ao1_bridge_runtime',
}
const OPERATOR = 'tll_ao1_recovery_operator', runtimes = ['customer','cart','broker','provisional','bridge'].map(purpose => `tll_ao1_${purpose}_runtime`)
const q = value => `'${value.replaceAll("'", "''")}'`
const adapt = source => Object.entries(aliases).reduce((text, [from, to]) => text.replace(new RegExp(`(?<![A-Za-z0-9_$])${from}(?![A-Za-z0-9_$])`, 'g'), to), source)
function managed(sql) {
  try { return execFileSync('docker', ['exec','-i','tll-stage0-postgres','psql','-XqAt','-U','postgres','-d','tll_account_operations_v1','-v','ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }) }
  catch (error) { throw Error(String(error.stderr || error.message)) }
}
let installed = false
try {
  admin(`CREATE ROLE ${OPERATOR} NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS CREATEROLE;
    GRANT pg_read_all_stats TO ${OPERATOR};
    CREATE ROLE tll_ao1_cart_gateway NOLOGIN NOINHERIT;
    CREATE ROLE tll_ao1_cart_owner NOLOGIN NOINHERIT;
    CREATE SCHEMA tll_cart_private AUTHORIZATION ${OPERATOR};
    CREATE TABLE tll_cart_private.control(singleton boolean PRIMARY KEY DEFAULT true,enabled boolean NOT NULL,operator_oid oid NOT NULL);
    INSERT INTO tll_cart_private.control VALUES(true,true,'${OPERATOR}'::regrole::oid);
    CREATE TABLE tll_cart_private.sessions(session_hash text PRIMARY KEY,phase text NOT NULL,lease_until timestamptz);
    CREATE TABLE tll_cart_private.operations(session_hash text NOT NULL,state text NOT NULL);
    CREATE TABLE tll_cart_private.transitions(source_session text PRIMARY KEY,state text NOT NULL,lease_until timestamptz);
    INSERT INTO tll_cart_private.sessions VALUES('cart-recovery-fixture','working',clock_timestamp()+interval '5 minutes');
    INSERT INTO tll_cart_private.operations VALUES('cart-recovery-fixture','working');
    INSERT INTO tll_cart_private.transitions VALUES('cart-recovery-fixture','claimed',clock_timestamp()+interval '5 minutes');
    ALTER TABLE tll_cart_private.control OWNER TO ${OPERATOR}; ALTER TABLE tll_cart_private.sessions OWNER TO ${OPERATOR};
    ALTER TABLE tll_cart_private.operations OWNER TO ${OPERATOR}; ALTER TABLE tll_cart_private.transitions OWNER TO ${OPERATOR};
    CREATE ROLE tll_ao1_customer_runtime LOGIN PASSWORD 'fixture-customer' NOINHERIT;
    CREATE ROLE tll_ao1_cart_runtime LOGIN PASSWORD 'fixture-cart' NOINHERIT;
    CREATE ROLE tll_ao1_broker_runtime LOGIN PASSWORD 'fixture-broker' NOINHERIT;
    CREATE ROLE tll_ao1_provisional_runtime LOGIN PASSWORD 'fixture-provisional' NOINHERIT;
    CREATE ROLE tll_ao1_bridge_runtime LOGIN PASSWORD 'fixture-bridge' NOINHERIT;
    GRANT tll_ao1_customer_owner,tll_ao1_customer_executor,tll_ao1_cart_owner,tll_ao1_cart_gateway,tll_ao1_broker_owner,tll_ao1_broker_executor,
      tll_ao1_provisional_owner,tll_ao1_provisional_executor,tll_ao1_bridge_owner,tll_ao1_bridge_executor,
      tll_ao1_customer_runtime,tll_ao1_cart_runtime,tll_ao1_broker_runtime,tll_ao1_provisional_runtime,tll_ao1_bridge_runtime TO ${OPERATOR}
      WITH ADMIN TRUE,INHERIT FALSE,SET FALSE;
    SET SESSION AUTHORIZATION ${OPERATOR};
    GRANT tll_ao1_customer_executor TO tll_ao1_customer_runtime;
    GRANT tll_ao1_cart_gateway TO tll_ao1_cart_runtime;
    GRANT tll_ao1_broker_executor TO tll_ao1_broker_runtime;
    GRANT tll_ao1_provisional_executor TO tll_ao1_provisional_runtime;
    GRANT tll_ao1_bridge_executor TO tll_ao1_bridge_runtime;
    RESET SESSION AUTHORIZATION;
    UPDATE tll_customer_private.control SET enabled=true; UPDATE tll_broker_private.control SET enabled=true;
    UPDATE tll_provisional_private.control SET enabled=true; UPDATE tll_bridge_private.control SET enabled=true;`)
  installed = true
  // The recovery operator cannot write the private customer control directly.
  assert.throws(() => admin(`SET SESSION AUTHORIZATION ${OPERATOR}; UPDATE tll_customer_private.control SET enabled=false;`), /Synthetic account SQL failed/)
  let recovery = adapt(readFileSync(new URL('../../config/staging-account-activation-recovery.sql', import.meta.url), 'utf8'))
  let postCommit = adapt(readFileSync(new URL('../../config/staging-account-activation-recovery-postcommit.sql', import.meta.url), 'utf8'))
  recovery = recovery.replaceAll('session_user', `'${OPERATOR}'::name`).replaceAll('current_user', `'${OPERATOR}'::name`)
  postCommit = postCommit.replaceAll('session_user', `'${OPERATOR}'::name`).replaceAll('current_user', `'${OPERATOR}'::name`)
  // `SET SESSION AUTHORIZATION` retains the real superuser session_user in a
  // fixture. Replacing those two identity expressions simulates the managed
  // direct connection without granting the synthetic operator superuser access.
  managed(`SET SESSION AUTHORIZATION ${OPERATOR}; ${recovery}`)
  managed(`SET SESSION AUTHORIZATION ${OPERATOR}; ${postCommit}`)
  admin(`REVOKE pg_read_all_stats FROM ${OPERATOR}`)
  assert.throws(() => managed(`SET SESSION AUTHORIZATION ${OPERATOR}; ${postCommit}`), /pg_read_all_stats/)
  assert.equal(admin(`SELECT string_agg(enabled::text,',') FROM (SELECT enabled FROM tll_customer_private.control UNION ALL SELECT enabled FROM tll_cart_private.control UNION ALL SELECT enabled FROM tll_broker_private.control UNION ALL SELECT enabled FROM tll_provisional_private.control UNION ALL SELECT enabled FROM tll_bridge_private.control)x`), 'false,false,false,false,false')
  assert.equal(admin("SELECT phase||':'||coalesce(lease_until::text,'null') FROM tll_cart_private.sessions WHERE session_hash='cart-recovery-fixture'"), 'held:null')
  assert.equal(admin(`SELECT count(*) FROM pg_roles WHERE rolname IN (${runtimes.map(q).join(',')}) AND rolcanlogin`), '0')
  assert.equal(admin(`SELECT count(*) FROM pg_auth_members edge JOIN pg_roles granted ON granted.oid=edge.roleid JOIN pg_roles member ON member.oid=edge.member WHERE (granted.rolname IN (${runtimes.map(q).join(',')}) OR member.rolname IN (${runtimes.map(q).join(',')})) AND NOT (granted.rolname IN (${runtimes.map(q).join(',')}) AND member.rolname='${OPERATOR}' AND edge.admin_option AND NOT edge.inherit_option AND NOT edge.set_option)`), '0')
  for (const role of Object.values(aliases).filter(role => role.endsWith('_owner')))
    assert.equal(admin(`SELECT count(*) FROM pg_auth_members WHERE roleid='${role}'::regrole AND member='${OPERATOR}'::regrole AND (inherit_option OR set_option OR NOT admin_option)`), '0')
  console.log('PASS: non-superuser managed-style operator required temporary exact SET edges, restored ADMIN-only authority, drained work and passed zero-runtime-session proof')
} finally {
  if (installed) admin(`DROP SCHEMA IF EXISTS tll_cart_private CASCADE;
    DROP ROLE IF EXISTS tll_ao1_customer_runtime; DROP ROLE IF EXISTS tll_ao1_cart_runtime; DROP ROLE IF EXISTS tll_ao1_broker_runtime;
    DROP ROLE IF EXISTS tll_ao1_provisional_runtime; DROP ROLE IF EXISTS tll_ao1_bridge_runtime; DROP ROLE IF EXISTS tll_ao1_cart_gateway; DROP ROLE IF EXISTS tll_ao1_cart_owner;
    REVOKE pg_read_all_stats FROM ${OPERATOR}; DROP ROLE IF EXISTS ${OPERATOR};
    UPDATE tll_customer_private.control SET enabled=false; UPDATE tll_broker_private.control SET enabled=false;
    UPDATE tll_provisional_private.control SET enabled=false; UPDATE tll_bridge_private.control SET enabled=false;`)
}
