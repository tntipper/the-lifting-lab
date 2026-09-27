/** Isolated PostgreSQL 17 proof of the disabled Gen23 installer; no hosted access. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { EXACT_MIGRATIONS } from '../scripts/staging-generation-21-retirement-preflight.mjs'
import { IDENTITIES } from '../scripts/staging-generation-21-credentials.mjs'
import { PASSWORD_PURPOSES } from '../scripts/staging-generation-22-material.mjs'
import { WINDOW_ID as PREDECESSOR_WINDOW_ID } from '../scripts/staging-generation-22-credentials.mjs'
import { PREDECESSOR_EXPIRES_AT } from '../scripts/staging-generation-23-predecessor-check.mjs'
import { deriveScramVerifier } from '../scripts/staging-generation-6-transport.mjs'
import { EDGE_PASSWORD_NAME, VERCEL_PASSWORD_NAMES } from '../scripts/staging-generation-23-password-material.mjs'

const name = `tll-gen23-offline-${randomUUID().slice(0, 8)}`
const docker = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 1024 * 1024 }).trim()
const sql = (user, input) => docker(['exec', '-i', name, 'psql', '-XqAt', '-U', user,
  '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input)
const quote = value => `'${String(value).replaceAll("'", "''")}'`
const projectRef = 'qdmvngjwkcsilzmqksme'
const retiredMarker = `tll-runtime-window/v1 ${JSON.stringify({
  expiresAt: PREDECESSOR_EXPIRES_AT, generation: 22, projectRef,
  state: 'retired', windowId: PREDECESSOR_WINDOW_ID,
})}`
const expiresAt = new Date(Math.floor((Date.now() + 40 * 60_000) / 1000) * 1000).toISOString()
const passwords = Object.fromEntries(PASSWORD_PURPOSES.map((purpose, index) => [purpose,
  String(index + 1).repeat(64)]))
const verifiers = Object.fromEntries(PASSWORD_PURPOSES.map((purpose, index) => [purpose,
  deriveScramVerifier(passwords[purpose], Buffer.alloc(18, index + 1))]))

function fixtureSql() {
  const environment = `CREATE ROLE postgres LOGIN CREATEROLE;
CREATE SCHEMA tll_staging_private;
CREATE TABLE tll_staging_private.environment(singleton boolean PRIMARY KEY, environment text,
 operator_project_ref text, operator_context text, identity_basis text,
 bootstrap_version text, source_commit text, integrity_sha256 text);
INSERT INTO tll_staging_private.environment VALUES(true,'tll-hosted-staging-v1',${quote(projectRef)},
 ${quote(`supabase-dashboard:${projectRef}:staging-bootstrap:reviewed`)},
 'explicit-operator-dashboard-binding','2026-09-15-v2',
 'a50e37ff05d8e731dc8ffceea1e96492079e5ff3',
 '2d5175eb47a891ca626d635281fbb28237b16bec0d89eebe168455935117922c');
CREATE TABLE tll_staging_private.applied_migrations(version text PRIMARY KEY,source_sha256 text);
INSERT INTO tll_staging_private.applied_migrations VALUES
 ${EXACT_MIGRATIONS.map(([version, hash]) => `(${quote(version)},${quote(hash)})`).join(',\n ')};
GRANT USAGE ON SCHEMA tll_staging_private TO postgres;
GRANT SELECT ON ALL TABLES IN SCHEMA tll_staging_private TO postgres;`
  const roles = PASSWORD_PURPOSES.map(purpose => {
    const { login, membership } = IDENTITIES[purpose]
    return `CREATE ROLE ${membership} NOLOGIN;
CREATE ROLE ${login} NOLOGIN NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS VALID UNTIL 'infinity';
GRANT ${membership} TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
GRANT ${login} TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
COMMENT ON ROLE ${login} IS ${quote(retiredMarker)};
CREATE SCHEMA tll_${purpose}_private;
CREATE TABLE tll_${purpose}_private.control(singleton boolean PRIMARY KEY,enabled boolean NOT NULL);
INSERT INTO tll_${purpose}_private.control VALUES(true,false);
GRANT USAGE ON SCHEMA tll_${purpose}_private TO postgres;
GRANT SELECT ON tll_${purpose}_private.control TO postgres;`
  }).join('\n')
  return `${environment}\n${roles}
GRANT pg_read_all_stats TO postgres;
GRANT SELECT ON pg_authid TO postgres;`
}

async function armedModules() {
  const path = new URL('../scripts/staging-generation-23-credentials.mjs', import.meta.url)
  const source = await readFile(path, 'utf8')
  assert.equal(source.split('export const STAGING_GENERATION_23_CREDENTIALS_ENABLED = false').length, 2)
  assert.equal(source.split("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'").length, 2)
  const armed = source
    .replace('export const STAGING_GENERATION_23_CREDENTIALS_ENABLED = false',
      'export const STAGING_GENERATION_23_CREDENTIALS_ENABLED = true')
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`)
    .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(armed).toString('base64')}`
  const recoverySource = await readFile(new URL('../scripts/staging-generation-23-recovery.mjs', import.meta.url), 'utf8')
  const recoveryArmed = recoverySource
    .replace('export const STAGING_GENERATION_23_RECOVERY_ENABLED = false',
      'export const STAGING_GENERATION_23_RECOVERY_ENABLED = true')
    .replace("from './staging-generation-23-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)
  const recoveryUrl = `data:text/javascript;base64,${Buffer.from(recoveryArmed).toString('base64')}`
  return { credentialUrl, recoveryUrl, credentials: await import(credentialUrl),
    recovery: await import(recoveryUrl) }
}

/** One disposable, networkless fixture shared by the standalone and joined tests. */
export async function createStagingGeneration23LocalDatabaseFixture() {
  assert.match(docker(['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}']), /^unix:\/\//)
  assert.equal(docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']), '')
  docker(['run', '--rm', '-d', '--name', name, '--network', 'none',
    '-e', 'POSTGRES_USER=tll_local_admin', '-e', 'POSTGRES_PASSWORD=synthetic-local-admin',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=scram-sha-256', 'postgres:17-alpine'])
  try {
  let ready = false
  for (let index = 0; index < 100; index++) {
    try {
      if (docker(['exec', name, 'cat', '/proc/1/comm']) !== 'postgres') throw Error('initialising')
      docker(['exec', name, 'pg_isready', '-U', 'tll_local_admin'])
      ready = true; break
    }
    catch { await new Promise(resolve => setTimeout(resolve, 100)) }
  }
  assert.equal(ready, true, 'isolated database did not become ready')
  assert.match(docker(['inspect', '--format', '{{.Config.Image}} {{.HostConfig.NetworkMode}}', name]), /^postgres:17-alpine none$/)
  sql('tll_local_admin', fixtureSql())
  const { credentials, recovery, credentialUrl, recoveryUrl } = await armedModules()
  let state = 'READY', built, recoverySql, removed = false
  const executeSetup = input => {
    assert.equal(state, 'READY')
    state = 'SETUP_DISPATCHED'
    const rows = [{ tll_generation_23_credential_receipt: JSON.parse(sql('postgres', input)) }]
    state = 'ACTIVE'
    return rows
  }
  const executeRetirement = input => {
    assert.equal(state, 'CONTROLS_DISABLED')
    state = 'RETIRE_DISPATCHED'
    const rows = [{ tll_generation_23_recovery_receipt: JSON.parse(sql('postgres', input)) }]
    state = 'RETIRED'
    return rows
  }
  return Object.freeze({
    expiresAt,
    verifiers,
    credentialUrl,
    recoveryUrl,
    passwordProjection() {
      assert.equal(state, 'READY')
      const vercel = Object.fromEntries(PASSWORD_PURPOSES.map(purpose => [
        `TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`, passwords[purpose],
      ]))
      assert.deepEqual(Object.keys(vercel).sort(), [...VERCEL_PASSWORD_NAMES])
      return { vercel, supabase: { [EDGE_PASSWORD_NAME]: vercel[EDGE_PASSWORD_NAME] } }
    },
    setup() {
      built = credentials.buildStagingGeneration23CredentialSql({ expiresAt, verifiers })
      const rows = executeSetup(built)
      const result = credentials.validateStagingGeneration23CredentialReceipt(rows, { expiresAt })
      assert.equal(result.status, 'PASS')
      return result
    },
    postSetupPacket(packet) {
      built = credentials.consumeStagingGeneration23PreparedSql(packet)
      return executeSetup(built)
    },
    executeSetupSql(input) {
      built = input
      return executeSetup(input)
    },
    proveRestrictedConnections() {
      assert.equal(state, 'ACTIVE')
      assert.equal(sql('postgres', `SELECT count(*) FROM pg_roles WHERE rolname IN
    (${PASSWORD_PURPOSES.map(purpose => quote(IDENTITIES[purpose].login)).join(',')})
    AND rolcanlogin AND rolvaliduntil=${quote(expiresAt)}::timestamptz`), '5')
      assert.equal(sql('postgres', `SELECT count(*) FROM pg_authid WHERE rolname IN
    (${PASSWORD_PURPOSES.map(purpose => quote(IDENTITIES[purpose].login)).join(',')})
    AND rolpassword IS NOT NULL`), '5')
      docker(['exec', '-i', name, 'sh', '-c', 'cat > "$PGDATA/pg_hba.conf"'],
    'local all all trust\nhost all all 127.0.0.1/32 scram-sha-256\nhost all all ::1/128 scram-sha-256\n')
      assert.equal(sql('tll_local_admin', 'SELECT pg_reload_conf()'), 't')
      for (const purpose of PASSWORD_PURPOSES) {
        const login = IDENTITIES[purpose].login
        assert.equal(docker(['exec', '-e', `PGPASSWORD=${passwords[purpose]}`, name, 'psql', '-XqAt',
      '-h', '127.0.0.1', '-U', login, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
      '-c', 'SELECT current_user']), login)
        assert.throws(() => docker(['exec', '-e', 'PGPASSWORD=wrong-synthetic-password', name,
      'psql', '-XqAt', '-h', '127.0.0.1', '-U', login, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
      '-c', 'SELECT 1']), /Command failed/)
        assert.throws(() => docker(['exec', '-e', `PGPASSWORD=${passwords[purpose]}`, name,
      'psql', '-XqAt', '-h', '127.0.0.1', '-U', login, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
      '-c', `SELECT * FROM tll_${purpose}_private.control`]), /Command failed/)
      }
      assert.throws(() => sql('postgres', built), /Command failed/,
    'the same installation must be rejected after roles become active')
      state = 'CONNECTIONS_PROVED'
      return { status: 'PASS', runtimeCount: 5 }
    },
    enableControls() {
      assert.equal(state, 'CONNECTIONS_PROVED')
      sql('tll_local_admin', `BEGIN;
${PASSWORD_PURPOSES.map(purpose => `UPDATE tll_${purpose}_private.control SET enabled=true WHERE singleton;`).join('\n')}
COMMIT;`)
      for (const purpose of PASSWORD_PURPOSES) {
        assert.equal(sql('tll_local_admin', `SELECT enabled FROM tll_${purpose}_private.control WHERE singleton`), 't')
      }
      state = 'CONTROLS_ENABLED'
      return { status: 'PASS_CONTROLS_ENABLED', count: 5 }
    },
    disableControls() {
      assert.equal(state, 'CONTROLS_ENABLED')
      sql('tll_local_admin', `BEGIN;
${PASSWORD_PURPOSES.map(purpose => `UPDATE tll_${purpose}_private.control SET enabled=false WHERE singleton;`).join('\n')}
COMMIT;`)
      for (const purpose of PASSWORD_PURPOSES) {
        assert.equal(sql('tll_local_admin', `SELECT enabled FROM tll_${purpose}_private.control WHERE singleton`), 'f')
      }
      state = 'CONTROLS_DISABLED'
      return { status: 'PASS_CONTROLS_DISABLED', count: 5 }
    },
    retire() {
      recoverySql = recovery.buildStagingGeneration23RecoverySql({ expiresAt })
      const rows = executeRetirement(recoverySql)
      const result = recovery.validateStagingGeneration23RecoveryReceipt(rows, { expiresAt })
      assert.equal(result.status, 'PASS_RETIRED')
      return result
    },
    postRetirementPacket(packet) {
      recoverySql = recovery.consumeStagingGeneration23PreparedRecoverySql(packet).sql
      return executeRetirement(recoverySql)
    },
    executeRetirementSql(input) {
      recoverySql = input
      return executeRetirement(input)
    },
    executePostflightReadOnlySql(input) {
      assert.equal(state, 'RETIRED')
      assert.match(input, /^BEGIN READ ONLY;/)
      return sql('postgres', input)
    },
    proveRetired() {
      assert.equal(state, 'RETIRED')
      assert.equal(sql('postgres', `SELECT count(*) FROM pg_roles WHERE rolname IN
    (${PASSWORD_PURPOSES.map(purpose => quote(IDENTITIES[purpose].login)).join(',')})
    AND NOT rolcanlogin AND rolvaliduntil='infinity'::timestamptz`), '5')
      assert.equal(sql('postgres', `SELECT count(*) FROM pg_authid WHERE rolname IN
    (${PASSWORD_PURPOSES.map(purpose => quote(IDENTITIES[purpose].login)).join(',')})
    AND rolpassword IS NOT NULL`), '0')
      for (const purpose of PASSWORD_PURPOSES) {
        assert.throws(() => docker(['exec', '-e', `PGPASSWORD=${passwords[purpose]}`, name,
      'psql', '-XqAt', '-h', '127.0.0.1', '-U', IDENTITIES[purpose].login,
      '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1']), /Command failed/)
      }
      assert.throws(() => sql('postgres', recoverySql), /Command failed/,
    'retirement cannot be replayed after roles are already retired')
      state = 'RETIREMENT_PROVED'
      return Object.freeze({ status: 'PASS_LOCAL_GEN23_DATABASE_LIFECYCLE',
    project: 'isolated-networkless-docker', runtimeCount: 5, passwordProof: 'SCRAM',
    wrongPasswordRejected: true, privateControlReadDenied: true,
    setupReplayRejected: true, retiredLoginRejected: true, recoveryReplayRejected: true })
    },
    dispose() {
      if (removed) return
      removed = true
      try { docker(['rm', '-f', name]) } catch { /* preserve original failure */ }
    },
  })
  } catch (error) {
    try { docker(['rm', '-f', name]) } catch { /* preserve original failure */ }
    throw error
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.slice(2).join(' ') !== '--run-offline-once') throw Error('Explicit local test mode required')
  const fixture = await createStagingGeneration23LocalDatabaseFixture()
  try {
    fixture.setup()
    fixture.proveRestrictedConnections()
    fixture.enableControls()
    fixture.disableControls()
    fixture.retire()
    console.log(JSON.stringify(fixture.proveRetired()))
  } finally { fixture.dispose() }
}
