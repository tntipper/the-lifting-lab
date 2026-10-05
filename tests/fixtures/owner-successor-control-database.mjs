/** Disposable managed-operator control fixture; no shared containers or hosted transport. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EXACT_MIGRATIONS } from '../../scripts/staging-generation-21-retirement-preflight.mjs'
import { deriveScramVerifier } from '../../scripts/staging-generation-6-transport.mjs'
const purposes = ['customer', 'cart', 'broker', 'provisional', 'bridge']
const q = value => `'${value.replaceAll("'", "''")}'`
const docker = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 1024 * 1024 }).trim()
export async function createOwnerSuccessorControlDatabase(context) {
  assert.match(docker(['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}']), /^unix:\/\//)
  const name = `tll-successor-controls-${randomUUID().slice(0, 12)}`
  assert.equal(docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']), '')
  let owned = false
  const run = (user, text) => docker(['exec', '-i', name, 'psql', '-XqAt', '-U', user,
    '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], text)
  const admin = text => run('tll_local_admin', text), managed = text => run('postgres', text)
  const dispose = () => { if (owned) { docker(['rm', '-f', name]); owned = false } }
  try {
    docker(['run', '--rm', '-d', '--name', name, '--network', 'none', '-e', 'POSTGRES_USER=tll_local_admin',
      '-e', 'POSTGRES_PASSWORD=synthetic-local-control', 'postgres:17-alpine']); owned = true
    let ready = false
    for (let n = 0; n < 100; n++) {
      try {
        assert.equal(docker(['exec', name, 'cat', '/proc/1/comm']), 'postgres')
        docker(['exec', name, 'pg_isready', '-U', 'tll_local_admin']); ready = true; break
      } catch { await new Promise(resolve => setTimeout(resolve, 100)) }
    }
    assert.equal(ready, true)
    assert.equal(docker(['inspect', '--format', '{{.Config.Image}} {{.HostConfig.NetworkMode}}', name]), 'postgres:17-alpine none')
    const marker = `tll-runtime-window/v1 ${JSON.stringify({ expiresAt: context.expiresAt, generation: context.generation,
      projectRef: 'qdmvngjwkcsilzmqksme', state: 'active', windowId: context.windowId })}`
    const statements = [`CREATE ROLE postgres LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS CREATEROLE;
GRANT SELECT ON pg_authid TO postgres; GRANT pg_read_all_stats TO postgres;
CREATE SCHEMA tll_staging_private;
CREATE TABLE tll_staging_private.environment(singleton boolean PRIMARY KEY,environment text,operator_project_ref text,
 operator_context text,identity_basis text,bootstrap_version text,source_commit text,integrity_sha256 text);
INSERT INTO tll_staging_private.environment VALUES(true,'tll-hosted-staging-v1','qdmvngjwkcsilzmqksme',
 'supabase-dashboard:qdmvngjwkcsilzmqksme:staging-bootstrap:reviewed','explicit-operator-dashboard-binding',
 '2026-09-15-v2','a50e37ff05d8e731dc8ffceea1e96492079e5ff3','2d5175eb47a891ca626d635281fbb28237b16bec0d89eebe168455935117922c');
CREATE TABLE tll_staging_private.applied_migrations(version text PRIMARY KEY,source_sha256 text);
INSERT INTO tll_staging_private.applied_migrations VALUES ${EXACT_MIGRATIONS.map(([v, h]) => `(${q(v)},${q(h)})`).join(',')};
GRANT USAGE ON SCHEMA tll_staging_private TO postgres;
GRANT SELECT ON ALL TABLES IN SCHEMA tll_staging_private TO postgres;`]
    for (const [index, purpose] of purposes.entries()) {
      const owner = `tll_${purpose}_owner`, runtime = `tll_${purpose}_runtime`
      const executor = purpose === 'cart' ? 'tll_cart_gateway' : `tll_${purpose}_executor`
      const verifier = deriveScramVerifier(`synthetic-control-${purpose}`.repeat(4), Buffer.alloc(18, index + 1))
      statements.push(`CREATE ROLE ${owner} NOLOGIN NOINHERIT;
CREATE ROLE ${executor} NOLOGIN NOINHERIT;
CREATE ROLE ${runtime} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION
 CONNECTION LIMIT 2 PASSWORD ${q(verifier)} VALID UNTIL ${q(context.expiresAt)};
ALTER ROLE ${runtime} SET search_path='pg_catalog'; ALTER ROLE ${runtime} SET statement_timeout='10s';
ALTER ROLE ${runtime} SET lock_timeout='5s'; ALTER ROLE ${runtime} SET idle_in_transaction_session_timeout='15s';
COMMENT ON ROLE ${runtime} IS ${q(marker)};
GRANT ${owner},${executor},${runtime} TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
CREATE SCHEMA tll_${purpose}_private AUTHORIZATION ${purpose === 'cart' ? 'postgres' : owner};
CREATE TABLE tll_${purpose}_private.control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason_code text NOT NULL DEFAULT 'fixture_held',operator_oid oid NOT NULL DEFAULT (('postgres'::text)::regrole::oid));
INSERT INTO tll_${purpose}_private.control(singleton,enabled) VALUES(true,false);
ALTER TABLE tll_${purpose}_private.control OWNER TO ${purpose === 'cart' ? 'postgres' : owner};
ALTER TABLE tll_${purpose}_private.control ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA tll_${purpose}_private TO postgres;
GRANT SELECT ON tll_${purpose}_private.control TO postgres;
SET SESSION AUTHORIZATION postgres;
GRANT ${executor} TO ${runtime} WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
RESET SESSION AUTHORIZATION;`)
      if (purpose !== 'cart') statements.push(`ALTER TABLE tll_${purpose}_private.control FORCE ROW LEVEL SECURITY;
CREATE POLICY managed_control ON tll_${purpose}_private.control TO ${owner},postgres
 USING(session_user='postgres') WITH CHECK(session_user='postgres');
CREATE FUNCTION tll_${purpose}_private.operator_status() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog
 AS $$SELECT jsonb_build_object('enabled',enabled,'reasonCode',reason_code) FROM tll_${purpose}_private.control WHERE singleton$$;
ALTER FUNCTION tll_${purpose}_private.operator_status() OWNER TO ${owner};
REVOKE ALL ON FUNCTION tll_${purpose}_private.operator_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tll_${purpose}_private.operator_status() TO postgres;
CREATE FUNCTION tll_${purpose}_private.operator_set_enabled(boolean,text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN IF session_user<>'postgres' OR (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN
 RAISE EXCEPTION 'fixture exact managed operator required'; END IF;
 UPDATE tll_${purpose}_private.control SET enabled=$1,reason_code=$2,changed_at=clock_timestamp() WHERE singleton; END$$;
ALTER FUNCTION tll_${purpose}_private.operator_set_enabled(boolean,text) OWNER TO ${owner};
REVOKE ALL ON FUNCTION tll_${purpose}_private.operator_set_enabled(boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tll_${purpose}_private.operator_set_enabled(boolean,text) TO postgres;`)
    }
    admin(statements.join('\n'))
    return Object.freeze({ admin, managed, dispose,
      controls: () => admin(`SELECT string_agg(enabled::text,',' ORDER BY purpose) FROM (
${purposes.map(p => `SELECT '${p}' purpose,enabled FROM tll_${p}_private.control`).join(' UNION ALL ')})x`),
      inertOwners: () => admin(`SELECT count(*) FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid
 WHERE g.rolname IN (${purposes.map(p => q(`tll_${p}_owner`)).join(',')}) AND e.member='postgres'::regrole
 AND e.admin_option AND NOT e.inherit_option AND NOT e.set_option`),
    })
  } catch (error) { dispose(); throw error }
}
