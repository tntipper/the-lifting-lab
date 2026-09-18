/**
 * Real PostgreSQL 17 acceptance for the exact generated 012--016 package.
 * Every case owns a short-lived, network-isolated container.  The generated
 * SQL is executed byte-for-byte for success and guard cases; only the late
 * failure probe appends a deliberate failing statement before the ledger.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

const PACKAGE = readFileSync(new URL('../config/staging-disabled-migrations-012-016.sql', import.meta.url), 'utf8')
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
const DESTINATIONS = [
  'tll_customer_private.shopify_proofs', 'tll_bridge_private.finalizations', 'tll_cart_private.transitions',
  'tll_bridge_private.account_generations', 'tll_bridge_private.account_logouts',
]
const OWNERS = ['tll_customer_owner', 'tll_cart_owner', 'tll_broker_owner', 'tll_provisional_owner', 'tll_bridge_owner']
const containerPrefix = 'tll-disabled-migrations-actual-'
const run = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024, timeout: 90_000, ...options })
const sqlLiteral = value => `'${String(value).replaceAll("'", "''")}'`

function localDockerOnly () {
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) throw Error('Remote Docker refused')
  const endpoint = run(['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}']).trim()
  if (!endpoint.startsWith('unix://')) throw Error('Local Docker required')
}
function psql (container, user, source, { allowFailure = false } = {}) {
  try {
    return run(['exec', '-i', container, 'psql', '-XqAt', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: source }).trim()
  } catch (error) {
    if (allowFailure) return String(error.stderr || error.message)
    throw Error(String(error.stderr || error.message))
  }
}
function source (filename) { return readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8') }
function check (label, actual, expected = true) { assert.deepEqual(actual, expected, label) }

async function withFixture (label, mutate, verify) {
  const container = containerPrefix + randomBytes(6).toString('hex')
  let started = false
  try {
    run(['run', '-d', '--name', container, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=tll_fixture_admin', '-e', 'POSTGRES_DB=postgres', 'postgres:17-alpine'])
    started = true
    let ready = false
    for (let i = 0; i < 30; i++) {
      try {
        run(['exec', container, 'psql', '-XqAt', '-U', 'tll_fixture_admin', '-d', 'postgres', '-c', 'SELECT 1'], { timeout: 2_000 })
        ready = true; break
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    if (!ready) throw Error('Disposable PostgreSQL 17 fixture did not become ready')
    // Docker's first successful exec can race the entrypoint's final socket
    // hand-off on macOS; require one settled local-server interval.
    await new Promise(resolve => setTimeout(resolve, 500))
    check(`${label}: exact PostgreSQL major`, psql(container, 'tll_fixture_admin', 'SHOW server_version_num;').startsWith('17'), true)
    bootstrap(container)
    mutate?.(container)
    verify(container)
  } finally {
    if (started) {
      run(['rm', '-f', container])
      assert.throws(() => run(['inspect', container]), /No such object|Error/)
    }
  }
}

function bootstrap (container) {
  // Create an isolated fixture administrator before making `postgres` mirror
  // the exact managed, non-superuser installation identity.
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
    const settings = version === '202609150006_staging_cart_sessions'
      ? `SET tll.cart_migration_environment='staging'; SET tll.cart_expected_project_ref='qdmvngjwkcsilzmqksme';\n`
      : ''
    psql(container, 'postgres', settings + source(filename))
    psql(container, 'postgres', `INSERT INTO tll_staging_private.applied_migrations(version,source_sha256) VALUES(${sqlLiteral(version)},${sqlLiteral(hash)});`)
  }
  check('canonical 002--011 baseline ledger', psql(container, 'postgres', 'SELECT count(*) FROM tll_staging_private.applied_migrations;'), '10')
  check('operator is literal managed non-superuser', psql(container, 'tll_fixture_admin', "SELECT rolname||':'||rolsuper||':'||rolcreaterole FROM pg_roles WHERE rolname='postgres';"), 'postgres:false:true')
  check('operator has no broad write authority', psql(container, 'postgres', "SELECT pg_has_role(current_user,'pg_write_all_data','USAGE');"), 'f')
  check('baseline owner edges are ADMIN-only', psql(container, 'tll_fixture_admin', `SELECT count(*) FROM pg_auth_members e JOIN pg_roles r ON r.oid=e.roleid JOIN pg_roles m ON m.oid=e.member WHERE r.rolname IN (${OWNERS.map(sqlLiteral).join(',')}) AND m.rolname='postgres' AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option;`), '5')
}

function executePackage (container, sql = PACKAGE) { return psql(container, 'postgres', sql, { allowFailure: true }) }
function assertNo012Effects (container, label, retained = []) {
  check(`${label}: baseline ledger retained`, psql(container, 'tll_fixture_admin', 'SELECT count(*) FROM tll_staging_private.applied_migrations;'), '10')
  for (const relation of DESTINATIONS) {
    const expected = retained.includes(relation) ? 'f' : 't'
    check(`${label}: ${relation} ${expected === 't' ? 'rolled back' : 'pre-existing fixture retained'}`, psql(container, 'tll_fixture_admin', `SELECT to_regclass(${sqlLiteral(relation)}) IS NULL;`), expected)
  }
}
function assertSuccess (container) {
  check('all five additions committed atomically', psql(container, 'tll_fixture_admin', 'SELECT count(*) FROM tll_staging_private.applied_migrations;'), '15')
  check('exact 012--016 ledger versions', psql(container, 'tll_fixture_admin', "SELECT string_agg(version,',' ORDER BY version) FROM tll_staging_private.applied_migrations WHERE version LIKE '20260918001%';"), '202609180012_customer_shopify_proof_repository,202609180013_customer_final_reconciliation,202609180014_staging_cart_account_transition,202609180015_customer_account_operations,202609180016_customer_account_logout')
  for (const relation of DESTINATIONS) check(`${relation} present`, psql(container, 'tll_fixture_admin', `SELECT to_regclass(${sqlLiteral(relation)}) IS NOT NULL;`), 't')
  check('all five controls remain disabled', psql(container, 'tll_fixture_admin', `SELECT (SELECT enabled::text FROM tll_customer_private.control WHERE singleton)||','||(SELECT enabled::text FROM tll_cart_private.control WHERE singleton)||','||(SELECT enabled::text FROM tll_broker_private.control WHERE singleton)||','||(SELECT enabled::text FROM tll_provisional_private.control WHERE singleton)||','||(SELECT enabled::text FROM tll_bridge_private.control WHERE singleton);`), 'false,false,false,false,false')
  check('new stores are empty', psql(container, 'tll_fixture_admin', 'SELECT (SELECT count(*) FROM tll_customer_private.shopify_proofs)+(SELECT count(*) FROM tll_bridge_private.finalizations)+(SELECT count(*) FROM tll_cart_private.transitions)+(SELECT count(*) FROM tll_bridge_private.account_generations)+(SELECT count(*) FROM tll_bridge_private.account_logouts);'), '0')
  check('all five destinations have RLS', psql(container, 'tll_fixture_admin', `SELECT count(*) FROM pg_class WHERE oid IN (${DESTINATIONS.map(value => sqlLiteral(value) + '::regclass').join(',')}) AND relrowsecurity;`), '5')
  check('operator restores exact ADMIN-only authority', psql(container, 'tll_fixture_admin', `SELECT count(*) FROM pg_auth_members e JOIN pg_roles r ON r.oid=e.roleid JOIN pg_roles m ON m.oid=e.member WHERE r.rolname IN (${OWNERS.map(sqlLiteral).join(',')}) AND m.rolname='postgres' AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option;`), '5')
}

localDockerOnly()
await withFixture('success', null, container => { const output = executePackage(container); assert.match(output, /"status": "PASS"|"status":"PASS"/); assertSuccess(container) })
await withFixture('late failure rollback', null, container => {
  const lateFailure = PACKAGE.replace("INSERT INTO tll_staging_private.applied_migrations", "DO $$ BEGIN RAISE EXCEPTION 'fixture late failure'; END $$;\nINSERT INTO tll_staging_private.applied_migrations")
  assert.match(executePackage(container, lateFailure), /fixture late failure/); assertNo012Effects(container, 'late failure')
})
await withFixture('wrong predecessor ledger', container => {
  psql(container, 'tll_fixture_admin', "UPDATE tll_staging_private.applied_migrations SET source_sha256=repeat('0',64) WHERE version='202609150005_customer_connection_repository';")
}, container => { assert.match(executePackage(container), /Exact 002--011 predecessor ledger required/); assertNo012Effects(container, 'wrong ledger') })
await withFixture('enabled control', container => { psql(container, 'tll_fixture_admin', 'UPDATE tll_customer_private.control SET enabled=true;') }, container => {
  assert.match(executePackage(container), /All controls must remain disabled/); assertNo012Effects(container, 'enabled control')
})
await withFixture('missing control', container => { psql(container, 'tll_fixture_admin', 'DELETE FROM tll_cart_private.control;') }, container => {
  assert.match(executePackage(container), /All controls must remain disabled/); assertNo012Effects(container, 'missing control')
})
await withFixture('pre-existing destination', container => { psql(container, 'tll_fixture_admin', 'CREATE TABLE tll_customer_private.shopify_proofs(fixture boolean);') }, container => {
  assert.match(executePackage(container), /Expected empty migration destination required/); assertNo012Effects(container, 'pre-existing destination', ['tll_customer_private.shopify_proofs'])
})
await withFixture('replay refusal', null, container => {
  assert.match(executePackage(container), /"status": "PASS"|"status":"PASS"/); assertSuccess(container)
  assert.match(executePackage(container), /Exact 002--011 predecessor ledger required/)
  check('replay leaves original completed ledger unchanged', psql(container, 'tll_fixture_admin', 'SELECT count(*) FROM tll_staging_private.applied_migrations;'), '15')
})
console.log('PASS: exact generated disabled migration package accepted on disposable managed-style PostgreSQL 17 baseline; guard, rollback and replay cases leave no container residue')
