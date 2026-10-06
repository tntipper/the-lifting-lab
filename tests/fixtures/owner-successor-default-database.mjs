/** Owned, network-isolated synthetic fixture. Canonical account/cart SQL is never rewritten.
 * The 15-row ledger is synthetic baseline metadata; unrelated submission/stack/inventory
 * migrations are not executed and this fixture cannot prove their deployed state.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { EXACT_MIGRATIONS } from '../../scripts/staging-generation-21-retirement-preflight.mjs'
import { PREDECESSOR_EXPIRES_AT, PREDECESSOR_WINDOW_ID } from '../../scripts/staging-owner-successor-predecessor-check.mjs'

const purposes = ['customer', 'cart', 'broker', 'provisional', 'bridge']
const quote = value => `'${value.replaceAll("'", "''")}'`
const docker = (args, input) => {
  try { return execFileSync('docker', args, { input, encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 16 * 1024 * 1024 }).trim() }
  catch (failure) {
    // execFileSync embeds argv (including synthetic passwords) in its Error: do not propagate it.
    const error = new Error('Owned synthetic PostgreSQL fixture command failed')
    error.code = /(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/.exec(String(failure.stderr))?.[1] ?? 'FIXTURE_COMMAND_FAILED'
    throw error
  }
}

export async function createOwnerSuccessorDefaultDatabase() {
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) throw Error('Remote Docker refused')
  assert.match(docker(['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}']), /^unix:\/\//)
  const owner = randomUUID(), containerName = `tll-successor-default-${owner}`
  const label = 'tll.synthetic.owner-successor-default'
  assert.equal(docker(['ps', '-a', '--filter', `name=^/${containerName}$`, '--format', '{{.Names}}']), '')
  let owned = false
  const assertOwned = () => assert.equal(docker(['inspect', '--format',
    `{{index .Config.Labels "${label}"}} {{.Config.Image}} {{.HostConfig.NetworkMode}}`, containerName]), `${owner} postgres:17-alpine none`)
  const run = (user, sql) => { assertOwned(); return docker(['exec', '-i', containerName, 'psql', '-XqAt',
    '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], sql) }
  const admin = sql => run('tll_local_admin', sql), managed = sql => run('postgres', sql)
  const dispose = () => { if (owned) { assertOwned(); docker(['rm', '-f', containerName]); owned = false } }
  try {
    docker(['run', '--rm', '-d', '--name', containerName, '--label', `${label}=${owner}`, '--network', 'none',
      '-e', 'POSTGRES_USER=tll_local_admin', '-e', 'POSTGRES_PASSWORD=synthetic-local-default-only',
      '-e', 'POSTGRES_HOST_AUTH_METHOD=scram-sha-256', 'postgres:17-alpine']); owned = true
    let ready = false
    for (let n = 0; n < 100; n++) {
      try { assertOwned(); assert.equal(docker(['exec', containerName, 'cat', '/proc/1/comm']), 'postgres'); docker(['exec', containerName, 'pg_isready', '-U', 'tll_local_admin']); ready = true; break }
      catch { await new Promise(resolve => setTimeout(resolve, 100)) }
    }
    assert.equal(ready, true)
    admin(`CREATE ROLE postgres LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS CREATEROLE;
GRANT CREATE ON DATABASE postgres TO postgres; ALTER SCHEMA public OWNER TO postgres;
GRANT SELECT ON pg_authid TO postgres; GRANT pg_read_all_stats TO postgres;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth AUTHORIZATION postgres;
CREATE SCHEMA tll_staging_private AUTHORIZATION postgres;`)
    managed(`CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users SELECT ('a0000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,20)i;
CREATE TABLE tll_staging_private.environment(singleton boolean PRIMARY KEY,environment text,operator_project_ref text,
operator_context text,identity_basis text,bootstrap_version text,source_commit text,integrity_sha256 text);
INSERT INTO tll_staging_private.environment VALUES(true,'tll-hosted-staging-v1','qdmvngjwkcsilzmqksme',
'supabase-dashboard:qdmvngjwkcsilzmqksme:staging-bootstrap:reviewed','explicit-operator-dashboard-binding',
'2026-09-15-v2','a50e37ff05d8e731dc8ffceea1e96492079e5ff3','2d5175eb47a891ca626d635281fbb28237b16bec0d89eebe168455935117922c');
CREATE TABLE tll_staging_private.applied_migrations(version text PRIMARY KEY,source_sha256 text);`)
    const executedMigrations = []
    for (const [version, expectedHash] of EXACT_MIGRATIONS) {
      const bytes = readFileSync(new URL(`../../supabase/migrations/${version}.sql`, import.meta.url))
      assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash)
      if (/_(?:customer_|staging_cart_)/.test(version)) {
        managed(`SET tll.cart_migration_environment='staging'; SET tll.cart_expected_project_ref='qdmvngjwkcsilzmqksme';\n${bytes.toString('utf8')}`)
        executedMigrations.push(version)
      }
    }
    managed(`INSERT INTO tll_staging_private.applied_migrations VALUES ${EXACT_MIGRATIONS.map(([v, h]) => `(${quote(v)},${quote(h)})`).join(',')};`)
    // Model the managed operator's read authority after sealed migrations finish.
    // Unchanged predecessor/setup queries read private control rows directly:
    // read-all-data supplies ACLs, BYPASSRLS supplies visibility. Neither grants
    // writes, superuser authority, nor any authority to the restricted runtimes.
    admin('GRANT pg_read_all_data TO postgres WITH INHERIT TRUE, SET FALSE; ALTER ROLE postgres BYPASSRLS;')
    const marker = `tll-runtime-window/v1 ${JSON.stringify({ expiresAt: PREDECESSOR_EXPIRES_AT,
      generation: 23, projectRef: 'qdmvngjwkcsilzmqksme', state: 'retired', windowId: PREDECESSOR_WINDOW_ID })}`
    for (const purpose of purposes) {
      const role = `tll_${purpose}_runtime`
      managed(`CREATE ROLE ${role} NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION CONNECTION LIMIT 2;
ALTER ROLE ${role} PASSWORD NULL VALID UNTIL 'infinity';
ALTER ROLE ${role} SET search_path='pg_catalog';
ALTER ROLE ${role} SET statement_timeout='10s';
ALTER ROLE ${role} SET lock_timeout='5s';
ALTER ROLE ${role} SET idle_in_transaction_session_timeout='15s';
COMMENT ON ROLE ${role} IS ${quote(marker)};`)
    }
    // Unix socket remains local managed-operator entry; all TCP clients require SCRAM.
    docker(['exec', containerName, 'sh', '-c', 'printf "local all all trust\nhost all all 127.0.0.1/32 scram-sha-256\nhost all all ::1/128 scram-sha-256\n" > "$PGDATA/pg_hba.conf"'])
    admin('SELECT pg_reload_conf();')
    const runtime = (role, password, sql) => {
      assert.match(role, /^tll_(customer|cart|broker|provisional|bridge)_runtime$/)
      assert.equal(typeof password, 'string'); assert.ok(password.length > 0)
      assertOwned()
      return docker(['exec', '-i', '-e', `PGPASSWORD=${password}`, containerName, 'psql', '-XqAt',
        '-h', '127.0.0.1', '-U', role, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], sql)
    }
    return Object.freeze({ containerName, admin, managed, runtime, dispose,
      provenance: 'SYNTHETIC_OWNED_NETWORK_NONE', executedMigrations: Object.freeze(executedMigrations),
      controls: () => admin(`SELECT string_agg(enabled::text,',' ORDER BY purpose) FROM (
${purposes.map(p => `SELECT '${p}' purpose,enabled FROM tll_${p}_private.control`).join(' UNION ALL ')})x`),
      inertOwners: () => admin(`SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid
WHERE g.rolname IN (${purposes.map(p => quote(`tll_${p}_owner`)).join(',')}) AND e.member='postgres'::regrole
AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option`),
    })
  } catch (error) { dispose(); throw error }
}
