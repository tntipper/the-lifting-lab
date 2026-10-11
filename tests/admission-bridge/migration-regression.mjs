// Reconstruct only this owned fixture's bridge inside one rollback transaction.
// Canonical 007/008 source and existing rows/controls/grants are restored exactly.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { admin, assertFixture } from './local-pg.mjs'
import { source, body } from './sources.mjs'
assertFixture()
const exclusive = `DO $$BEGIN IF EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) THEN RAISE EXCEPTION 'Fixture is not exclusive'; END IF; END$$;`
admin(exclusive)
for (const schema of ['tll_bridge_private', 'tll_broker_private', 'tll_provisional_private']) assert.equal(admin(`SELECT enabled FROM ${schema}.control`), 'f')
assert.equal(admin("SELECT count(*) FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid IN ('tll_ab_bridge_owner'::regrole,'tll_ab_bridge_executor'::regrole) AND dbid NOT IN (0,(SELECT oid FROM pg_database WHERE datname=current_database()))"), '0')
const fingerprint = () => admin(`SELECT json_build_object(
'functions',(SELECT json_agg(x ORDER BY x.oid) FROM (SELECT oid,proname,prosrc,proconfig,proacl,proowner FROM pg_proc WHERE pronamespace IN ('tll_bridge_private'::regnamespace,'tll_broker_private'::regnamespace,'tll_provisional_private'::regnamespace))x),
'membership',(SELECT json_agg(x ORDER BY x.oid) FROM (SELECT * FROM pg_auth_members WHERE roleid IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'tll_ab_%'))x),
'bridgeControl',(SELECT row_to_json(x) FROM tll_bridge_private.control x), 'brokerControl',(SELECT row_to_json(x) FROM tll_broker_private.control x), 'provisionalControl',(SELECT row_to_json(x) FROM tll_provisional_private.control x),
'intents',(SELECT coalesce(json_agg(x),'[]') FROM tll_provisional_private.intents x),'flows',(SELECT coalesce(json_agg(x),'[]') FROM tll_broker_private.flows x),
'grants',(SELECT coalesce(json_agg(x),'[]') FROM tll_bridge_private.grants x))`)
const before = fingerprint(), canonical = source(2)
const definitions = [...canonical.adapted.matchAll(/CREATE FUNCTION ([a-z_]+\.[a-z_]+)\([\s\S]*?AS \$f\$([\s\S]*?)\$f\$;/g)]
assert.equal(definitions.length, 18)
for (const [, name, implementation] of definitions) {
  const [schema, fn] = name.split('.')
  assert.equal(admin(`SELECT md5(prosrc) FROM pg_proc WHERE pronamespace='${schema}'::regnamespace AND proname='${fn}'`),
    createHash('md5').update(implementation).digest('hex'), `Fixture function differs from final canonical source: ${name}`)
}
admin(`BEGIN; ${exclusive}
DROP FUNCTION tll_broker_private.repository(text,jsonb),tll_provisional_private.repository(text,jsonb),tll_broker_private.operator_set_enabled(boolean,text),tll_provisional_private.operator_set_enabled(boolean,text);
ALTER FUNCTION tll_broker_private.repository_v1(text,jsonb) RENAME TO repository;
ALTER FUNCTION tll_provisional_private.repository_v1(text,jsonb) RENAME TO repository;
ALTER FUNCTION tll_broker_private.operator_set_enabled_v1(boolean,text) RENAME TO operator_set_enabled;
ALTER FUNCTION tll_provisional_private.operator_set_enabled_v1(boolean,text) RENAME TO operator_set_enabled;
DROP FUNCTION tll_broker_private.bridge_lock(),tll_broker_private.bridge_register(uuid,jsonb),tll_broker_private.bridge_terminal(jsonb,text),tll_provisional_private.bridge_lock(),tll_provisional_private.bridge_source(jsonb),tll_provisional_private.bridge_terminal(jsonb,text);
ALTER TABLE tll_provisional_private.intents DROP COLUMN bridge_epoch;
DROP OWNED BY tll_ab_bridge_owner,tll_ab_bridge_executor;
DROP ROLE tll_ab_bridge_owner,tll_ab_bridge_executor;
CREATE ROLE tll_ab_default_probe NOLOGIN;
GRANT tll_ab_default_probe TO anon WITH INHERIT TRUE;
SET SESSION AUTHORIZATION tll_admission_bridge_migrator;
ALTER DEFAULT PRIVILEGES GRANT USAGE ON SCHEMAS TO tll_ab_default_probe;
ALTER DEFAULT PRIVILEGES GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLES TO tll_ab_default_probe;
ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO tll_ab_default_probe;
${body(canonical.adapted)}
DO $$BEGIN
 IF tll_bridge_private.operator_status()->'enabled'<>'false'::jsonb THEN RAISE EXCEPTION 'Bridge enabled after migration'; END IF;
 BEGIN PERFORM tll_broker_private.repository_v1('register','{}'::jsonb); RAISE EXCEPTION 'Installer calls legacy'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN SET ROLE tll_ab_bridge_owner; RAISE EXCEPTION 'Installer sets owner'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM tll_bridge_private.grants; RAISE EXCEPTION 'Installer reads grant'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
-- Scoped ADMIN-only owner maintenance can intentionally open then retire a DDL
-- window without granting permanent schema/data authority to this operator.
GRANT tll_ab_bridge_owner TO tll_admission_bridge_migrator WITH INHERIT FALSE,SET TRUE;
SET ROLE tll_ab_bridge_owner;
CREATE TABLE tll_bridge_private.future_upgrade_probe(id int);
DROP TABLE tll_bridge_private.future_upgrade_probe;
RESET ROLE;
REVOKE tll_ab_bridge_owner FROM tll_admission_bridge_migrator GRANTED BY tll_admission_bridge_migrator;
RESET SESSION AUTHORIZATION;
DO $$BEGIN
 IF has_schema_privilege('anon','tll_bridge_private','USAGE') OR has_function_privilege('anon','tll_bridge_private.repository(text,jsonb)','EXECUTE')
   OR has_table_privilege('anon','tll_bridge_private.grants','SELECT,MAINTAIN') THEN RAISE EXCEPTION 'Inherited ACL leak'; END IF;
END$$;
ROLLBACK;`)
assert.equal(fingerprint(), before)
assert.equal(admin("SELECT count(*) FROM pg_roles WHERE rolname='tll_ab_default_probe'"), '0')
const guard = canonical.adapted.match(/DO \$postflight\$[\s\S]*?END \$postflight\$;/)?.[0]
assert.ok(guard)
admin(`BEGIN; ${exclusive} SET SESSION AUTHORIZATION tll_admission_bridge_migrator; ${guard} ROLLBACK;`)
const mutations = [
  'GRANT SELECT ON tll_bridge_private.grants TO tll_ab_guard_probe',
  'GRANT SELECT(release_hash) ON tll_bridge_private.grants TO tll_ab_guard_probe',
  'GRANT USAGE ON SCHEMA tll_bridge_private TO tll_ab_guard_probe',
  'GRANT EXECUTE ON FUNCTION tll_bridge_private.gate() TO tll_ab_guard_probe',
  'GRANT EXECUTE ON FUNCTION tll_bridge_private.repository(text,jsonb) TO tll_ab_bridge_executor WITH GRANT OPTION',
  'GRANT EXECUTE ON FUNCTION tll_broker_private.repository_v1(text,jsonb) TO tll_ab_broker_executor',
  'GRANT tll_ab_broker_owner TO tll_ab_bridge_executor WITH INHERIT TRUE',
  'ALTER TABLE tll_bridge_private.grants DISABLE ROW LEVEL SECURITY',
  'UPDATE tll_bridge_private.control SET enabled=true',
]
for (const mutation of mutations) {
  // ON_ERROR_STOP closes the transaction on rejection: every malicious change
  // and the probe role are rolled back, even though the final ROLLBACK is skipped.
  assert.throws(() => admin(`BEGIN; ${exclusive} CREATE ROLE tll_ab_guard_probe NOLOGIN; ${mutation}; SET SESSION AUTHORIZATION tll_admission_bridge_migrator; ${guard} ROLLBACK;`))
  assert.equal(fingerprint(), before)
  assert.equal(admin("SELECT count(*) FROM pg_roles WHERE rolname='tll_ab_guard_probe'"), '0')
}
console.log('PASS: canonical 010 reconstructed with hostile inherited defaults under nonsuperuser; exact baseline restored; legacy/owner access denied; future DDL delegation retired; 9 ACL/control tamper probes rejected', canonical.sha256)
