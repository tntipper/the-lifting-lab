import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { createOwnerSuccessorControlDatabase } from './fixtures/owner-successor-control-database.mjs'
import { successorFixtureModules } from './fixtures/owner-successor-native-modules.mjs'
import { buildStagingControlActivationSql, validateStagingControlActivationReceipt } from '../scripts/staging-control-activation.mjs'
import { OWNER_SUCCESSOR_WINDOW_ID } from '../scripts/staging-owner-successor-registration.mjs'
const absent = spawnSync('docker', ['--version'], { timeout: 5000, stdio: 'ignore' }).error?.code === 'ENOENT'
test('unmodified native activation and successor shutdown reject drift and roll back partial changes',
  { skip: absent ? 'Docker binary absent; native control proof not executed' : false, timeout: 180_000 }, async () => {
    const expiresAt = new Date(Math.floor((Date.now() + 45 * 60_000) / 1000) * 1000).toISOString()
    const context = { generation: 23, windowId: OWNER_SUCCESSOR_WINDOW_ID, expiresAt }
    const modules = await successorFixtureModules({ startedAt: new Date(Date.parse(expiresAt) - 60 * 60_000).toISOString(), expiresAt })
    const shutdown = await modules.import('staging-owner-successor-sql-shutdown.mjs')
    const fixture = await createOwnerSuccessorControlDatabase(context)
    try {
      const activationSql = buildStagingControlActivationSql(context)
      const shutdownSql = shutdown.buildOwnerSuccessorControlShutdownSql({ expiresAt })
      const off = 'false,false,false,false,false', on = 'true,true,true,true,true'
      assert.equal(fixture.managed("SELECT rolsuper||','||rolcreaterole FROM pg_roles WHERE rolname=current_user"), 'false,true')
      const rejects = (sql, pattern) => assert.throws(() => fixture.managed(sql), error => {
        assert.match(error.stderr.toString(), pattern); return true
      })
      assert.throws(() => fixture.admin(activationSql), error => {
        assert.match(error.stderr.toString(), /exact managed staging postgres operator/); return true
      })
      assert.equal(fixture.controls(), off)
      for (const [drift, restore, pattern] of [
        ['ALTER ROLE tll_customer_runtime BYPASSRLS', 'ALTER ROLE tll_customer_runtime NOBYPASSRLS', /runtime state mismatch/],
        ['GRANT tll_customer_executor TO tll_customer_runtime WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY postgres',
          'GRANT tll_customer_executor TO tll_customer_runtime WITH ADMIN FALSE, INHERIT TRUE, SET FALSE GRANTED BY postgres', /runtime membership mismatch/],
        ['ALTER TABLE tll_cart_private.control DISABLE ROW LEVEL SECURITY', 'ALTER TABLE tll_cart_private.control ENABLE ROW LEVEL SECURITY', /cart operator ownership mismatch/],
      ]) {
        fixture.admin(drift); try { rejects(activationSql, pattern); assert.equal(fixture.controls(), off) }
        finally { fixture.admin(restore) }
      }
      // A fixture-only trigger fails after an earlier control update. Tested SQL remains byte-identical.
      const trigger = enabled => `CREATE FUNCTION tll_broker_private.fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN IF NEW.enabled=${enabled} THEN RAISE EXCEPTION 'synthetic atomic control failure'; END IF; RETURN NEW; END$$;
 CREATE TRIGGER fixture_fail BEFORE UPDATE ON tll_broker_private.control FOR EACH ROW EXECUTE FUNCTION tll_broker_private.fixture_fail();`
      const remove = 'DROP TRIGGER fixture_fail ON tll_broker_private.control; DROP FUNCTION tll_broker_private.fixture_fail();'
      fixture.admin(trigger('true'))
      try { rejects(activationSql, /synthetic atomic control failure/); assert.equal(fixture.controls(), off); assert.equal(fixture.inertOwners(), '5') }
      finally { fixture.admin(remove) }
      const enabled = JSON.parse(fixture.managed(activationSql))
      assert.equal(validateStagingControlActivationReceipt([{ tll_staging_control_activation: enabled }], context).status, 'CONTROLS_ENABLED')
      assert.equal(fixture.controls(), on); assert.equal(fixture.inertOwners(), '5')
      for (const [drift, restore, pattern] of [
        ['ALTER ROLE postgres NOCREATEROLE', 'ALTER ROLE postgres CREATEROLE', /exact managed staging postgres operator/],
        ['ALTER ROLE tll_customer_runtime CONNECTION LIMIT -1', 'ALTER ROLE tll_customer_runtime CONNECTION LIMIT 2', /runtime credential mismatch/],
        ['GRANT tll_customer_executor TO tll_customer_runtime WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY postgres',
          'GRANT tll_customer_executor TO tll_customer_runtime WITH ADMIN FALSE, INHERIT TRUE, SET FALSE GRANTED BY postgres', /runtime membership mismatch/],
        ['ALTER TABLE tll_cart_private.control DISABLE ROW LEVEL SECURITY', 'ALTER TABLE tll_cart_private.control ENABLE ROW LEVEL SECURITY', /cart ownership mismatch/],
      ]) {
        fixture.admin(drift); try { rejects(shutdownSql, pattern); assert.equal(fixture.controls(), on) }
        finally { fixture.admin(restore) }
      }
      fixture.admin(trigger('false'))
      try { rejects(shutdownSql, /synthetic atomic control failure/); assert.equal(fixture.controls(), on); assert.equal(fixture.inertOwners(), '5') }
      finally { fixture.admin(remove) }
      const disabled = JSON.parse(fixture.managed(shutdownSql))
      assert.equal(shutdown.validateOwnerSuccessorControlShutdownReceipt([
        { tll_owner_successor_control_shutdown: disabled }], { expiresAt }).status, 'CONTROLS_DISABLED')
      assert.equal(fixture.controls(), off); assert.equal(fixture.inertOwners(), '5')
    } finally { fixture.dispose() }
  })
