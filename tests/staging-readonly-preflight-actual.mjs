/**
 * PostgreSQL 17 acceptance fixture for the one, generated staging preflight
 * query.  Each assertion runs in a fresh network-isolated container so a
 * mismatch cannot accidentally inherit state from a preceding case.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { EXPECTED_RECEIPT, FIXED_QUERY } from '../scripts/staging-readonly-preflight.mjs'

const MIGRATIONS = [
  ['202609150002_public_submission_gateway', '202609150002_public_submission_gateway.sql', 'c82f9afb10c7ee7e46549033d4076046568557226a7864f8c2b8c8117ecd4bca'],
  ['202609150003_active_stack_integrity', '202609150003_active_stack_integrity.sql', '05cac500b24262975a773b2db284bc3fb95b62dc25fc6d47670eefbc86f15a60'],
  ['202609150004_inventory_operation_ledger', '202609150004_inventory_operation_ledger.sql', '030ccb26228aca6665147eced447815f8a290abd74b8003b0f32bfb2a05e5a76'],
  ['202609150005_customer_connection_repository', '202609150005_customer_connection_repository.sql', 'f0f49edca9a0938b8e40b4d87ba7ee1eaee02dbc5082fc019a58ca949b263d0b'],
  ['202609150006_staging_cart_sessions', '202609150006_staging_cart_sessions.sql', '17d039a6d1f343f35d1551c259a3f8c0e8643fe669b8230170a235bbc941155c'],
  ['202609150007_customer_subject_broker_repository', '202609150007_customer_subject_broker_repository.sql', '85a118335d91d896b707dcdff1570f6c2df22a9b2037e9a569b587b89ad41c21'],
  ['202609170008_customer_provisional_admission_repository', '202609170008_customer_provisional_admission_repository.sql', '038b2bfc9d236f39c0cb5ae9b657a5a54b572fc304e6da318b00a07cf0d201e2'],
  ['202609170009_inventory_maintenance_authority', '202609170009_inventory_maintenance_authority.sql', '4f054b145466a6ef2136ec79a0e1c17e8aa252e5bc02fa8c27deb23664eb153f'],
  ['202609170010_customer_admission_bridge', '202609170010_customer_admission_bridge.sql', '711b92ef8a6e5760a126e340396f68cc372e361ee3e6bf66f3e6f3370be5f7aa'],
  ['202609170011_customer_browser_admission_once', '202609170011_customer_browser_admission_once.sql', '12bf5b5916d2f266f218bcd39c38098aea3225acef1cb0f67b47fe76bc29f58f'],
]
const RUNTIME = ['tll_customer_runtime', 'tll_cart_runtime', 'tll_broker_runtime', 'tll_provisional_runtime', 'tll_bridge_runtime']
const RETIRED_MARKER = 'tll-runtime-window/v1:{"projectRef":"qdmvngjwkcsilzmqksme","generation":5,"windowId":"e8aeb142-d2f8-4a58-b0a5-8931d90a6952","expiresAt":"2026-09-18T14:24:02.000Z","state":"retired"}'
const prefix = 'tll-preflight-actual-'
const run = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024, timeout: 90_000, ...options })
const q = value => `'${String(value).replaceAll("'", "''")}'`
const source = filename => readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8')

function localDockerOnly () {
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) throw Error('Remote Docker refused')
  const endpoint = run(['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}']).trim()
  if (!endpoint.startsWith('unix://')) throw Error('Local Docker required')
}
function psql (container, user, text, { allowFailure = false } = {}) {
  try {
    return run(['exec', '-i', container, 'psql', '-XqAt', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: text }).trim()
  } catch (error) {
    if (allowFailure) return String(error.stderr || error.message)
    throw Error(String(error.stderr || error.message))
  }
}
function check (label, actual, expected) { assert.deepEqual(actual, expected, label) }

async function withFixture (label, mutate, verify) {
  const container = prefix + randomBytes(6).toString('hex')
  let started = false
  let volumes = []
  try {
    run(['run', '-d', '--name', container, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=tll_fixture_admin', '-e', 'POSTGRES_DB=postgres', 'postgres:17-alpine'])
    started = true
    volumes = run(['inspect', '--format', '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}', container]).trim().split(/\s+/).filter(Boolean)
    let ready = false
    for (let attempt = 0; attempt < 30; attempt++) {
      try { run(['exec', container, 'psql', '-XqAt', '-U', 'tll_fixture_admin', '-d', 'postgres', '-c', 'SELECT 1'], { timeout: 2_000 }); ready = true; break } catch {}
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    if (!ready) throw Error('Disposable PostgreSQL 17 fixture did not become ready')
    await new Promise(resolve => setTimeout(resolve, 500))
    check(`${label}: PostgreSQL 17`, psql(container, 'tll_fixture_admin', 'SHOW server_version_num;').startsWith('17'), true)
    bootstrap(container)
    mutate?.(container)
    verify(container)
  } finally {
    if (started) {
      run(['rm', '-fv', container])
      assert.throws(() => run(['inspect', container]), /No such object|Error/)
      for (const volume of volumes) assert.throws(() => run(['volume', 'inspect', volume]), /No such volume|Error/)
    }
  }
}

function bootstrap (container) {
  // The initial image user is only a fixture bootstrapper. `postgres` mirrors
  // the reviewed managed operator: non-superuser, CREATEROLE, read-only
  // catalog visibility, no broad write or maintenance role.
  psql(container, 'tll_fixture_admin', `
    CREATE ROLE postgres LOGIN NOSUPERUSER CREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS INHERIT;
    ALTER DATABASE postgres OWNER TO postgres;
    CREATE SCHEMA extensions AUTHORIZATION tll_fixture_admin;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE service_role NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT CREATE ON SCHEMA public TO postgres;
    GRANT USAGE ON SCHEMA extensions TO postgres;
    GRANT pg_read_all_data,pg_read_all_stats TO postgres;
  `)
  psql(container, 'postgres', `
    CREATE SCHEMA auth AUTHORIZATION postgres;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE TABLE public.contact_submissions(id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),name text NOT NULL,email text NOT NULL,message text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.supplement_submissions(id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),category text NOT NULL,brand text NOT NULL,product_name text NOT NULL,url text NOT NULL,notes text,email text,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.products(id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),name text NOT NULL,brand text,category text,status text DEFAULT 'active',serving_size numeric,serving_unit text,buy_url text);
    CREATE TABLE public.user_stacks(id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,name text NOT NULL DEFAULT 'My Stack',is_active boolean DEFAULT true,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE public.stack_products(id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),stack_id uuid NOT NULL REFERENCES public.user_stacks(id) ON DELETE CASCADE,product_id uuid NOT NULL REFERENCES public.products(id),servings_per_day numeric DEFAULT 1,added_at timestamptz DEFAULT now(),UNIQUE(stack_id,product_id));
    CREATE SCHEMA tll_staging_private AUTHORIZATION postgres;
    CREATE TABLE tll_staging_private.environment(singleton boolean PRIMARY KEY,environment text NOT NULL,operator_project_ref text NOT NULL,operator_context text NOT NULL,identity_basis text NOT NULL,source_commit text NOT NULL,integrity_sha256 text NOT NULL,bootstrap_version text NOT NULL);
    INSERT INTO tll_staging_private.environment VALUES(true,'tll-hosted-staging-v1','qdmvngjwkcsilzmqksme','supabase-dashboard:qdmvngjwkcsilzmqksme:staging-bootstrap:reviewed','explicit-operator-dashboard-binding','fixture','fixture','2026-09-15-v2');
    CREATE TABLE tll_staging_private.applied_migrations(version text PRIMARY KEY,source_sha256 text NOT NULL);
  `)
  for (const [version, filename, hash] of MIGRATIONS) {
    const settings = version === '202609150006_staging_cart_sessions' ? "SET tll.cart_migration_environment='staging'; SET tll.cart_expected_project_ref='qdmvngjwkcsilzmqksme';\n" : ''
    psql(container, 'postgres', settings + source(filename))
    psql(container, 'postgres', `INSERT INTO tll_staging_private.applied_migrations(version,source_sha256) VALUES(${q(version)},${q(hash)});`)
  }
  psql(container, 'postgres', `
    BEGIN;
    SET LOCAL createrole_self_grant='';
    CREATE ROLE tll_customer_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;
    CREATE ROLE tll_cart_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;
    CREATE ROLE tll_broker_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;
    CREATE ROLE tll_provisional_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;
    CREATE ROLE tll_bridge_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;
    COMMENT ON ROLE tll_customer_runtime IS ${q(RETIRED_MARKER)};
    COMMENT ON ROLE tll_cart_runtime IS ${q(RETIRED_MARKER)};
    COMMENT ON ROLE tll_broker_runtime IS ${q(RETIRED_MARKER)};
    COMMENT ON ROLE tll_provisional_runtime IS ${q(RETIRED_MARKER)};
    COMMENT ON ROLE tll_bridge_runtime IS ${q(RETIRED_MARKER)};
    COMMIT;
  `)
  check('canonical 002--011 ledger', psql(container, 'postgres', 'SELECT count(*) FROM tll_staging_private.applied_migrations;'), '10')
  check('exact managed non-superuser operator', psql(container, 'tll_fixture_admin', "SELECT rolname||':'||rolsuper||':'||rolcreaterole FROM pg_roles WHERE rolname='postgres';"), 'postgres:false:true')
  check('operator has no broad write authority', psql(container, 'postgres', "SELECT pg_has_role(current_user,'pg_write_all_data','USAGE')||':'||pg_has_role(current_user,'pg_maintain','USAGE');"), 'false:false')
  check('all controls are disabled', psql(container, 'postgres', `SELECT (tll_customer_private.operator_status()->>'enabled')||','||(SELECT enabled::text FROM tll_cart_private.control WHERE singleton)||','||(tll_broker_private.operator_status()->>'enabled')||','||(tll_provisional_private.operator_status()->>'enabled')||','||(tll_bridge_private.operator_status()->>'enabled');`), 'false,false,false,false,false')
  check('exact retired runtime edges', psql(container, 'tll_fixture_admin', `SELECT count(*) FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE granted.rolname IN (${RUNTIME.map(q).join(',')}) AND member.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option;`), '5')
  check('no extra runtime edges', psql(container, 'tll_fixture_admin', `SELECT count(*) FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE granted.rolname IN (${RUNTIME.map(q).join(',')}) OR member.rolname IN (${RUNTIME.map(q).join(',')});`), '5')
  check('all retired generation-5 comments', psql(container, 'tll_fixture_admin', `SELECT count(*) FROM pg_roles WHERE rolname IN (${RUNTIME.map(q).join(',')}) AND shobj_description(oid,'pg_authid')=${q(RETIRED_MARKER)};`), '5')
}

function execute (container) { return psql(container, 'postgres', FIXED_QUERY, { allowFailure: true }) }
function assertReceipt (container) {
  const output = execute(container)
  assert.doesNotMatch(output, /ERROR:/, 'preflight must not raise')
  check('literal one-row preflight receipt', JSON.parse(output), EXPECTED_RECEIPT)
  check('one receipt row', output.split(/\r?\n/).filter(Boolean).length, 1)
}
function assertAssertionFailure (container, label) {
  const output = execute(container)
  assert.match(output, /staging preflight assertion failed/, `${label}: mismatch must fail in the read-only assertion phase`)
  assert.equal(output.includes(JSON.stringify(EXPECTED_RECEIPT)), false, `${label}: failed query must not emit final receipt`)
}

localDockerOnly()
await withFixture('success', null, assertReceipt)
await withFixture('ledger mismatch', container => {
  psql(container, 'tll_fixture_admin', "UPDATE tll_staging_private.applied_migrations SET source_sha256=repeat('0',64) WHERE version='202609150005_customer_connection_repository';")
}, container => assertAssertionFailure(container, 'ledger'))
await withFixture('environment mismatch', container => {
  psql(container, 'tll_fixture_admin', "UPDATE tll_staging_private.environment SET environment='other' WHERE singleton;")
}, container => assertAssertionFailure(container, 'environment'))
await withFixture('control mismatch', container => {
  psql(container, 'tll_fixture_admin', 'UPDATE tll_customer_private.control SET enabled=true WHERE singleton;')
}, container => assertAssertionFailure(container, 'control'))
await withFixture('role mismatch', container => {
  psql(container, 'tll_fixture_admin', 'DROP ROLE tll_bridge_runtime;')
}, container => assertAssertionFailure(container, 'role'))
await withFixture('login mismatch', container => {
  psql(container, 'tll_fixture_admin', 'ALTER ROLE tll_customer_runtime LOGIN;')
}, container => assertAssertionFailure(container, 'login'))
await withFixture('password mismatch', container => {
  psql(container, 'tll_fixture_admin', "ALTER ROLE tll_customer_runtime PASSWORD 'fixture-only-password';")
}, container => assertAssertionFailure(container, 'password'))
await withFixture('membership mismatch', container => {
  psql(container, 'tll_fixture_admin', 'GRANT anon TO tll_customer_runtime;')
}, container => assertAssertionFailure(container, 'edge'))
await withFixture('duplicated qualifying role edge', container => {
  // Keep the total runtime edge count and qualifying row count at five, while
  // moving one qualifying edge from bridge to customer. A second grantor is a
  // disposable fixture-only superuser, allowing PostgreSQL to record a second
  // membership row for the same role/member pair without adding a runtime edge
  // to that grantor.
  psql(container, 'tll_fixture_admin', `
    CREATE ROLE tll_fixture_second_grantor SUPERUSER NOLOGIN;
    SET ROLE tll_fixture_second_grantor;
    GRANT tll_customer_runtime TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
    RESET ROLE;
    REVOKE tll_bridge_runtime FROM postgres;
  `)
  check('duplicate case retains five runtime edges', psql(container, 'tll_fixture_admin', `SELECT count(*) FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE granted.rolname IN (${RUNTIME.map(q).join(',')}) OR member.rolname IN (${RUNTIME.map(q).join(',')});`), '5')
  check('duplicate case retains five qualifying rows', psql(container, 'tll_fixture_admin', `SELECT count(*) FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE granted.rolname IN (${RUNTIME.map(q).join(',')}) AND member.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option;`), '5')
  check('duplicate case has four distinct qualifying roles', psql(container, 'tll_fixture_admin', `SELECT count(DISTINCT granted.oid) FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE granted.rolname IN (${RUNTIME.map(q).join(',')}) AND member.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option;`), '4')
}, container => assertAssertionFailure(container, 'duplicate qualifying role edge'))
await withFixture('comment mismatch', container => {
  psql(container, 'tll_fixture_admin', "COMMENT ON ROLE tll_customer_runtime IS 'wrong-marker';")
}, container => assertAssertionFailure(container, 'comment'))
await withFixture('destination object mismatch', container => {
  psql(container, 'tll_fixture_admin', 'CREATE TABLE tll_customer_private.shopify_proofs(fixture boolean);')
}, container => assertAssertionFailure(container, 'object'))
console.log('PASS: exact generated staging preflight query accepts only the retired generation-5 PostgreSQL 17 baseline and emits no receipt for every major mismatch class')
