/** Actual SQL predicate proof requires the owned Linux PostgreSQL fixture; no hosted access. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createOwnerSuccessorDefaultDatabase } from './fixtures/owner-successor-default-database.mjs'
import { PREDECESSOR_WINDOW_ID, PREDECESSOR_EXPIRES_AT } from '../scripts/staging-owner-successor-predecessor-check.mjs'
import { successorFixtureModules } from './fixtures/owner-successor-native-modules.mjs'
import { deriveScramVerifier } from '../scripts/staging-generation-6-transport.mjs'

const quote = value => `'${value.replaceAll("'", "''")}'`
const marker = delta => `tll-runtime-window/v1 ${JSON.stringify({ expiresAt: PREDECESSOR_EXPIRES_AT,
  generation: 23, projectRef: 'qdmvngjwkcsilzmqksme', state: 'retired', windowId: PREDECESSOR_WINDOW_ID, ...delta })}`
async function fixtureCheck() {
  const scripts = new URL('../scripts/', import.meta.url)
  const source = (await readFile(new URL('staging-owner-successor-predecessor-check.mjs', scripts), 'utf8'))
    .replace('export const OWNER_SUCCESSOR_PREDECESSOR_CHECK_ENABLED = false',
      'export const OWNER_SUCCESSOR_PREDECESSOR_CHECK_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('strict retired-v18 SQL accepts only its exact state and rejects identity, role, ownership, ACL, membership, control and session drift',
  { skip: process.platform !== 'linux' ? 'Owned Linux PostgreSQL fixture required; Mac Docker access is not used' : false,
    timeout: 180_000 }, async () => {
    const api = await fixtureCheck(), sql = api.buildOwnerSuccessorPredecessorCheckSql()
    const db = await createOwnerSuccessorDefaultDatabase()
    let sleeper
    const pass = () => {
      const rows = [{ tll_owner_successor_predecessor_check: JSON.parse(db.managed(sql)) }]
      assert.equal(api.validateOwnerSuccessorPredecessorCheck(rows).status, 'PASS_RETIRED')
      assert.equal(db.controls(), 'false,false,false,false,false')
    }
    const reject = () => assert.throws(() => db.managed(sql), error => error.code === 'P0001')
    try {
      pass()
      assert.throws(() => db.admin(sql), error => error.code === 'P0001', 'superuser is not the managed operator')
      // Only this owned, network-none database models effective and ineffective operators.
      // Production predicates and source gates are never edited by the fixture.
      const startedAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString()
      const expiresAt = new Date(Date.parse(startedAt) + 60 * 60_000).toISOString()
      const modules = await successorFixtureModules({ startedAt, expiresAt })
      const guarded = [['predecessor', sql]]
      for (const [name, builder] of [['credentials', 'CredentialSql'], ['retirement', 'RecoverySql'],
        ['shutdown', 'ControlShutdownSql'], ['backend-state', 'BackendStateSql'], ['final-check', 'FinalCheckSql']]) {
        const phase = await modules.import(`staging-owner-successor-sql-${name}.mjs`)
        const verifiers = Object.fromEntries(['customer', 'cart', 'broker', 'provisional', 'bridge']
          .map((purpose, index) => [purpose, deriveScramVerifier(`synthetic-visibility-${purpose}`.repeat(4), Buffer.alloc(18, index + 1))]))
        guarded.push([name, phase[`buildOwnerSuccessor${builder}`]({ expiresAt, verifiers, nowMs: Date.now() })])
      }
      db.admin('GRANT pg_read_all_stats TO postgres WITH INHERIT FALSE, SET FALSE')
      try {
        assert.equal(db.managed("SELECT pg_has_role(current_user,'pg_read_all_stats','MEMBER')||','||pg_has_role(current_user,'pg_read_all_stats','USAGE')"), 'true,false')
        for (const [name, phaseSql] of guarded) {
          assert.throws(() => db.managed(phaseSql), error => error.code === 'P0001' && error.predicate === 'OPERATOR',
            `${name}: ineffective statistics membership must fail at the operator predicate`)
          assert.equal(db.controls(), 'false,false,false,false,false')
        }
      } finally { db.admin('GRANT pg_read_all_stats TO postgres WITH INHERIT TRUE, SET FALSE') }
      assert.equal(db.managed("SELECT pg_has_role(current_user,'pg_read_all_stats','MEMBER')||','||pg_has_role(current_user,'pg_read_all_stats','USAGE')"), 'true,true')
      pass()
      const cases = [
        ['foreign project', "UPDATE tll_staging_private.environment SET operator_project_ref='wrhgscovsgsudtedbljr'",
          "UPDATE tll_staging_private.environment SET operator_project_ref='qdmvngjwkcsilzmqksme'"],
        ['bad migration hash', "UPDATE tll_staging_private.applied_migrations SET source_sha256=repeat('0',64) WHERE version='202609150002_public_submission_gateway'",
          "UPDATE tll_staging_private.applied_migrations SET source_sha256='c82f9afb10c7ee7e46549033d4076046568557226a7864f8c2b8c8117ecd4bca' WHERE version='202609150002_public_submission_gateway'"],
        ...[{ windowId: '759bc8ed-5ecd-475c-8a4c-e35fcf628a73', expiresAt: '2026-09-28T21:05:00.000Z' },
          { windowId: 'unknown' }, { expiresAt: '2026-09-28T21:48:00.000Z' }, { state: 'active' },
          { generation: 22 }, { projectRef: 'wrhgscovsgsudtedbljr' }, { extra: true }]
          .map(delta => [JSON.stringify(delta), `COMMENT ON ROLE tll_customer_runtime IS ${quote(marker(delta))}`,
            `COMMENT ON ROLE tll_customer_runtime IS ${quote(marker({}))}`]),
        ['missing marker', 'COMMENT ON ROLE tll_customer_runtime IS NULL',
          `COMMENT ON ROLE tll_customer_runtime IS ${quote(marker({}))}`],
        ...[['LOGIN', 'NOLOGIN'], ['SUPERUSER', 'NOSUPERUSER'], ['CREATEDB', 'NOCREATEDB'],
          ['CREATEROLE', 'NOCREATEROLE'], ['REPLICATION', 'NOREPLICATION'], ['BYPASSRLS', 'NOBYPASSRLS']]
          .map(([bad, good]) => [bad, `ALTER ROLE tll_customer_runtime ${bad}`, `ALTER ROLE tll_customer_runtime ${good}`]),
        ['password configured', "ALTER ROLE tll_customer_runtime PASSWORD 'synthetic-fixture-only'", 'ALTER ROLE tll_customer_runtime PASSWORD NULL'],
        ['finite validity', "ALTER ROLE tll_customer_runtime VALID UNTIL '2030-01-01'", "ALTER ROLE tll_customer_runtime VALID UNTIL 'infinity'"],
        ['missing runtime', 'ALTER ROLE tll_customer_runtime RENAME TO fixture_missing_runtime', 'ALTER ROLE fixture_missing_runtime RENAME TO tll_customer_runtime'],
        ['runtime ownership', 'CREATE TABLE public.fixture_owned(i int); ALTER TABLE public.fixture_owned OWNER TO tll_customer_runtime', 'DROP TABLE public.fixture_owned'],
        ['public private-schema authority', 'GRANT USAGE ON SCHEMA tll_customer_private TO PUBLIC', 'REVOKE USAGE ON SCHEMA tll_customer_private FROM PUBLIC'],
        ['runtime schema authority', 'GRANT USAGE ON SCHEMA tll_customer_private TO tll_customer_runtime', 'REVOKE USAGE ON SCHEMA tll_customer_private FROM tll_customer_runtime'],
        ['runtime relation authority', 'GRANT SELECT ON tll_customer_private.control TO tll_customer_runtime', 'REVOKE SELECT ON tll_customer_private.control FROM tll_customer_runtime'],
        ['runtime function authority', 'CREATE FUNCTION tll_customer_private.fixture_acl() RETURNS int LANGUAGE sql AS $$SELECT 1$$; GRANT EXECUTE ON FUNCTION tll_customer_private.fixture_acl() TO tll_customer_runtime', 'DROP FUNCTION tll_customer_private.fixture_acl()'],
        ['runtime membership', 'GRANT tll_customer_runtime TO tll_cart_runtime WITH ADMIN FALSE, INHERIT TRUE, SET FALSE', 'REVOKE tll_customer_runtime FROM tll_cart_runtime'],
        ...['customer', 'cart', 'broker', 'provisional', 'bridge'].map(purpose => [purpose + ' control',
          `UPDATE tll_${purpose}_private.control SET enabled=true`, `UPDATE tll_${purpose}_private.control SET enabled=false`]),
      ]
      for (const [label, drift, restore] of cases) {
        db.admin(drift)
        try { reject() } catch (error) { error.message = `${label}: ${error.message}`; throw error }
        finally { db.admin(restore) }
        pass()
      }
      // Establish a session, then retire login admission; the unchanged session predicate must reject it.
      db.admin('ALTER ROLE tll_customer_runtime LOGIN')
      sleeper = spawn('docker', ['exec', '-i', db.containerName, 'psql', '-XqAt', '-U', 'tll_customer_runtime',
        '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'SET statement_timeout=120000; SELECT pg_sleep(90)'], { stdio: 'ignore' })
      let observed = false
      for (let n = 0; n < 50; n++) {
        if (db.admin("SELECT count(*) FROM pg_stat_activity WHERE usename='tll_customer_runtime'") === '1') { observed = true; break }
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      assert.equal(observed, true, 'owned runtime session must exist before testing session denial')
      db.admin('ALTER ROLE tll_customer_runtime NOLOGIN')
      const visible = "SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND usename='tll_customer_runtime'"
      assert.equal(db.managed(visible), '1', 'effective operator must see the lingering client backend')
      assert.throws(() => db.managed(sql), error => error.code === 'P0001' && error.predicate === 'RUNTIME_SESSIONS',
        'the strict session predicate must reject the observed lingering backend')
      assert.equal(db.managed(visible), '1', 'session must remain alive after the strict query rejects it')
      assert.equal(db.admin("SELECT pg_terminate_backend(pid,5000) FROM pg_stat_activity WHERE usename='tll_customer_runtime'"), 't')
      assert.equal(db.admin("SELECT count(*) FROM pg_stat_activity WHERE usename='tll_customer_runtime'"), '0')
      sleeper.kill(); sleeper = undefined
      pass()
    } finally {
      sleeper?.kill()
      db.dispose()
    }
  })
