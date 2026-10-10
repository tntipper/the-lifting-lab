// Rollback-first canonical011 proof. Never changes another fixture or creates roles.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { admin, assertFixture, CONTAINER, DATABASE } from './local-pg.mjs'
import { source, fingerprint, exclusive } from './browser-once.mjs'
assertFixture(); admin(exclusive)
for (const schema of ['tll_bridge_private','tll_broker_private','tll_provisional_private']) assert.equal(admin(`SELECT enabled FROM ${schema}.control`), 'f')
assert.equal(admin("SELECT to_regclass('tll_provisional_private.provisional_browser_once') IS NULL"), 't')
const before = fingerprint(), canonical = source()
admin(`BEGIN; ${exclusive} SET SESSION AUTHORIZATION tll_admission_bridge_migrator; ${canonical.body}
DO $$BEGIN
 IF NOT EXISTS(SELECT FROM pg_constraint WHERE conrelid='tll_provisional_private.intents'::regclass AND conname='provisional_browser_once' AND contype='u' AND NOT condeferrable) THEN RAISE EXCEPTION 'Missing unique binding'; END IF;
 BEGIN SET ROLE tll_ab_provisional_owner; RAISE EXCEPTION 'Installer owner authority retained'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$; ROLLBACK;`)
assert.equal(fingerprint(), before)
// Mutations must have actually been applied before the migration rejects them.
const mutations = [
  "UPDATE tll_provisional_private.control SET enabled=true",
  "UPDATE tll_bridge_private.control SET enabled=true",
  "GRANT SELECT(browser_hash) ON tll_provisional_private.intents TO anon",
  "GRANT UPDATE ON tll_provisional_private.intents TO tll_ab_provisional_executor",
  "GRANT tll_ab_provisional_owner TO tll_ab_provisional_executor WITH INHERIT TRUE",
  "GRANT EXECUTE ON FUNCTION tll_provisional_private.repository_v1(text,jsonb) TO tll_ab_provisional_executor",
  "ALTER FUNCTION tll_provisional_private.repository(text,jsonb) SET search_path=public",
  "ALTER TABLE tll_provisional_private.intents ADD CONSTRAINT provisional_browser_once UNIQUE(browser_hash)",
]
for (const mutation of mutations) {
  let rejected = false
  try { execFileSync('docker', ['exec','-i',CONTAINER,'psql','-XqAt','-U','postgres','-d',DATABASE,'-v','ON_ERROR_STOP=1'], {
    encoding: 'utf8', timeout: 15000, stdio: ['pipe','pipe','pipe'], input: `BEGIN; ${exclusive} ${mutation}; SELECT 'mutation_applied'; SET SESSION AUTHORIZATION tll_admission_bridge_migrator; ${canonical.body} ROLLBACK;`,
  }) } catch (e) { assert.match(e.stdout?.toString() ?? '', /mutation_applied/); rejected = true }
  assert.equal(rejected, true); assert.equal(fingerprint(), before)
}
console.log('PASS: canonical011 rollback reconstruction, exact security/catalog/data/role restoration, 8 applied negative probes', canonical.sha256)
