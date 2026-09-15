// Entire reconstruction is ROLLBACK-ONLY in the exact owned synthetic database.
// No other schema/database is reset; no hosted endpoint or credentials exist here.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {admin,assertFixture} from './local-pg.mjs'
assertFixture()
assert.equal(admin('SELECT enabled FROM tll_customer_private.control'),'f')
assert.equal(admin("SELECT count(*) FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid IN ('tll_customer_owner'::regrole,'tll_customer_executor'::regrole) AND dbid NOT IN (0,(SELECT oid FROM pg_database WHERE datname=current_database()))"),'0')
const before=admin("SELECT json_build_object('owners',(SELECT coalesce(json_agg(x),'[]') FROM tll_customer_private.owners x),'attempts',(SELECT coalesce(json_agg(x),'[]') FROM tll_customer_private.attempts x),'connections',(SELECT coalesce(json_agg(x),'[]') FROM tll_customer_private.connections x));")
const sql=readFileSync(new URL('../../supabase/migrations/202609150005_customer_connection_repository.sql',import.meta.url),'utf8')
assert.ok(sql.includes('BEGIN;\n')&&sql.endsWith('COMMIT;\n'))
const body=sql.replace('BEGIN;\n','').replace(/COMMIT;\n$/,'')
admin(`BEGIN;
 DROP SCHEMA tll_customer_private CASCADE; DROP ROLE tll_customer_owner; DROP ROLE tll_customer_executor;
 CREATE ROLE tll_customer_default_probe NOLOGIN; GRANT tll_customer_default_probe TO anon WITH INHERIT TRUE;
 SET SESSION AUTHORIZATION tll_customer_migrator;
 ALTER DEFAULT PRIVILEGES GRANT USAGE ON SCHEMAS TO tll_customer_default_probe;
 ALTER DEFAULT PRIVILEGES GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLES TO tll_customer_default_probe;
 ALTER DEFAULT PRIVILEGES GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO tll_customer_default_probe;
 ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO tll_customer_default_probe;
 ${body}
 RESET SESSION AUTHORIZATION;
 DO $$BEGIN IF has_schema_privilege('anon','tll_customer_private','USAGE') OR has_table_privilege('anon','tll_customer_private.connections','SELECT,MAINTAIN') OR has_schema_privilege('tll_customer_migrator','tll_customer_private','CREATE') OR (SELECT enabled FROM tll_customer_private.control) THEN RAISE EXCEPTION 'Private ACL or disabled-control regression'; END IF; END$$;
 ROLLBACK;`)
assert.equal(admin("SELECT json_build_object('owners',(SELECT coalesce(json_agg(x),'[]') FROM tll_customer_private.owners x),'attempts',(SELECT coalesce(json_agg(x),'[]') FROM tll_customer_private.attempts x),'connections',(SELECT coalesce(json_agg(x),'[]') FROM tll_customer_private.connections x));"),before)
assert.equal(admin("SELECT count(*) FROM pg_roles WHERE rolname IN ('tll_customer_default_probe','tll_customer_role_setup')"),'0')
console.log('PASS: final canonical migration under non-superuser; inherited schema/table/sequence/function ACLs including MAINTAIN removed; reconstruction rolled back and fixture unchanged')
