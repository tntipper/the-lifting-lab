import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { admin, assertFixture } from './local-pg.mjs'

// This is an actual PostgreSQL 17 execution against the isolated account
// fixture. That fixture intentionally predates cart migration 014, so this
// file supplies only its required cart relation shapes; it never contacts a
// hosted Supabase project.
assertFixture()
const aliases = {
  tll_customer_executor: 'tll_ao1_customer_executor', tll_cart_gateway: 'tll_ao1_cart_gateway',
  tll_broker_executor: 'tll_ao1_broker_executor', tll_provisional_executor: 'tll_ao1_provisional_executor',
  tll_bridge_executor: 'tll_ao1_bridge_executor',
  tll_customer_runtime: 'tll_ao1_customer_runtime', tll_cart_runtime: 'tll_ao1_cart_runtime',
  tll_broker_runtime: 'tll_ao1_broker_runtime', tll_provisional_runtime: 'tll_ao1_provisional_runtime',
  tll_bridge_runtime: 'tll_ao1_bridge_runtime',
}
const runtimes = ['customer','cart','broker','provisional','bridge'].map(purpose => `tll_ao1_${purpose}_runtime`)
const q = value => `'${value.replaceAll("'", "''")}'`
let installed = false
try {
  admin(`CREATE ROLE tll_ao1_cart_gateway NOLOGIN NOINHERIT;
    CREATE SCHEMA tll_cart_private;
    CREATE TABLE tll_cart_private.control(singleton boolean PRIMARY KEY DEFAULT true,enabled boolean NOT NULL);
    INSERT INTO tll_cart_private.control VALUES(true,true);
    CREATE TABLE tll_cart_private.sessions(session_hash text PRIMARY KEY,phase text NOT NULL,lease_until timestamptz);
    CREATE TABLE tll_cart_private.operations(session_hash text NOT NULL,state text NOT NULL);
    CREATE TABLE tll_cart_private.transitions(source_session text PRIMARY KEY,state text NOT NULL,lease_until timestamptz);
    INSERT INTO tll_cart_private.sessions VALUES('cart-recovery-fixture','working',clock_timestamp()+interval '5 minutes');
    INSERT INTO tll_cart_private.operations VALUES('cart-recovery-fixture','working');
    INSERT INTO tll_cart_private.transitions VALUES('cart-recovery-fixture','claimed',clock_timestamp()+interval '5 minutes');
    CREATE ROLE tll_ao1_customer_runtime LOGIN PASSWORD 'fixture-customer' NOINHERIT;
    CREATE ROLE tll_ao1_cart_runtime LOGIN PASSWORD 'fixture-cart' NOINHERIT;
    CREATE ROLE tll_ao1_broker_runtime LOGIN PASSWORD 'fixture-broker' NOINHERIT;
    CREATE ROLE tll_ao1_provisional_runtime LOGIN PASSWORD 'fixture-provisional' NOINHERIT;
    CREATE ROLE tll_ao1_bridge_runtime LOGIN PASSWORD 'fixture-bridge' NOINHERIT;
    GRANT tll_ao1_customer_executor TO tll_ao1_customer_runtime;
    GRANT tll_ao1_cart_gateway TO tll_ao1_cart_runtime;
    GRANT tll_ao1_broker_executor TO tll_ao1_broker_runtime;
    GRANT tll_ao1_provisional_executor TO tll_ao1_provisional_runtime;
    GRANT tll_ao1_bridge_executor TO tll_ao1_bridge_runtime;
    UPDATE tll_customer_private.control SET enabled=true;
    UPDATE tll_broker_private.control SET enabled=true;
    UPDATE tll_provisional_private.control SET enabled=true;
    UPDATE tll_bridge_private.control SET enabled=true;`)
  installed = true
  let sql = readFileSync(new URL('../../config/staging-account-activation-recovery.sql', import.meta.url), 'utf8')
  for (const [from, to] of Object.entries(aliases)) sql = sql.replace(new RegExp(`(?<![A-Za-z0-9_$])${from}(?![A-Za-z0-9_$])`, 'g'), to)
  admin(sql)
  assert.equal(admin(`SELECT string_agg(enabled::text,',') FROM (SELECT enabled FROM tll_customer_private.control UNION ALL SELECT enabled FROM tll_cart_private.control UNION ALL SELECT enabled FROM tll_broker_private.control UNION ALL SELECT enabled FROM tll_provisional_private.control UNION ALL SELECT enabled FROM tll_bridge_private.control)x`), 'false,false,false,false,false')
  assert.equal(admin("SELECT phase||':'||coalesce(lease_until::text,'null') FROM tll_cart_private.sessions WHERE session_hash='cart-recovery-fixture'"), 'held:null')
  assert.equal(admin("SELECT state FROM tll_cart_private.operations WHERE session_hash='cart-recovery-fixture'"), 'held')
  assert.equal(admin("SELECT state||':'||coalesce(lease_until::text,'null') FROM tll_cart_private.transitions WHERE source_session='cart-recovery-fixture'"), 'held:null')
  assert.equal(admin(`SELECT count(*) FROM pg_authid WHERE rolname IN (${runtimes.map(q).join(',')}) AND (rolcanlogin OR rolpassword IS NOT NULL)`), '0')
  assert.equal(admin(`SELECT count(*) FROM pg_auth_members edge JOIN pg_roles granted ON granted.oid=edge.roleid JOIN pg_roles member ON member.oid=edge.member WHERE granted.rolname IN (${runtimes.map(q).join(',')}) OR member.rolname IN (${runtimes.map(q).join(',')})`), '0')
  console.log('PASS: recovery artifact executed on isolated PostgreSQL 17 fixture; all controls closed, cart work held and runtime login/membership authority retired')
} finally {
  if (installed) {
    admin(`DROP SCHEMA IF EXISTS tll_cart_private CASCADE;
      DROP ROLE IF EXISTS tll_ao1_customer_runtime;
      DROP ROLE IF EXISTS tll_ao1_cart_runtime;
      DROP ROLE IF EXISTS tll_ao1_broker_runtime;
      DROP ROLE IF EXISTS tll_ao1_provisional_runtime;
      DROP ROLE IF EXISTS tll_ao1_bridge_runtime;
      DROP ROLE IF EXISTS tll_ao1_cart_gateway;
      UPDATE tll_customer_private.control SET enabled=false;
      UPDATE tll_broker_private.control SET enabled=false;
      UPDATE tll_provisional_private.control SET enabled=false;
      UPDATE tll_bridge_private.control SET enabled=false;`)
  }
}
