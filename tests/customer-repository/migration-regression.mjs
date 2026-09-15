// Entire reconstruction is ROLLBACK-ONLY in the exact owned synthetic database.
// No other schema/database is reset; no hosted endpoint or credentials exist here.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {admin,assertFixture} from './local-pg.mjs'
assertFixture()
assert.equal(admin('SELECT enabled FROM tll_customer_private.control'),'f')
assert.equal(admin("SELECT count(*) FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid IN ('tll_customer_owner'::regrole,'tll_customer_executor'::regrole) AND dbid NOT IN (0,(SELECT oid FROM pg_database WHERE datname=current_database()))"),'0')
const before=admin("SELECT json_build_object('control',(SELECT row_to_json(c) FROM tll_customer_private.control c),'owners',(SELECT coalesce(json_agg(x),'[]') FROM tll_customer_private.owners x),'attempts',(SELECT coalesce(json_agg(x),'[]') FROM tll_customer_private.attempts x),'connections',(SELECT coalesce(json_agg(x),'[]') FROM tll_customer_private.connections x));")
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
 DO $$DECLARE result jsonb; BEGIN
   result:=tll_customer_private.operator_status();
   IF result->'enabled'<>'false'::jsonb OR result->>'owners'<>'0'
     OR result->>'reasonCode'<>'installed_disabled' THEN RAISE EXCEPTION 'Operator status unavailable'; END IF;
   result:=tll_customer_private.operator_set_enabled(true,'synthetic_acceptance');
   IF result->'enabled'<>'true'::jsonb THEN RAISE EXCEPTION 'Operator enable unavailable'; END IF;
   result:=tll_customer_private.operator_set_enabled(false,'synthetic_complete');
   IF result->'enabled'<>'false'::jsonb THEN RAISE EXCEPTION 'Operator disable unavailable'; END IF;
   BEGIN PERFORM * FROM tll_customer_private.connections; RAISE EXCEPTION 'Operator reads ciphertext'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN UPDATE tll_customer_private.control SET enabled=true; RAISE EXCEPTION 'Operator directly writes control'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN CREATE TABLE tll_customer_private.unexpected_operator_table(id int); RAISE EXCEPTION 'Operator can create'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN PERFORM tll_customer_private.repository('logout','{}'::jsonb); RAISE EXCEPTION 'Operator can call executor'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN PERFORM tll_customer_private.operator_set_enabled(NULL,'synthetic'); RAISE EXCEPTION 'Null enable accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
   BEGIN PERFORM tll_customer_private.operator_set_enabled(true,'Invalid reason with spaces'); RAISE EXCEPTION 'Invalid reason accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END$$;
 RESET SESSION AUTHORIZATION;
 CREATE ROLE tll_customer_operator_probe NOLOGIN;
 GRANT tll_customer_migrator TO tll_customer_operator_probe WITH INHERIT TRUE, SET TRUE;
 SET SESSION AUTHORIZATION tll_customer_operator_probe;
 SET ROLE tll_customer_migrator;
 DO $$BEGIN
   BEGIN PERFORM tll_customer_private.operator_status(); RAISE EXCEPTION 'SET ROLE impersonated operator status'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN PERFORM tll_customer_private.operator_set_enabled(true,'synthetic'); RAISE EXCEPTION 'SET ROLE impersonated operator control'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END$$;
 RESET SESSION AUTHORIZATION;
 ${['anon','authenticated','service_role','tll_customer_executor'].map(role=>`SET SESSION AUTHORIZATION ${role};
 DO $$BEGIN
   BEGIN PERFORM tll_customer_private.operator_status(); RAISE EXCEPTION 'Non-operator reads status'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN PERFORM tll_customer_private.operator_set_enabled(true,'synthetic'); RAISE EXCEPTION 'Non-operator controls use'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END$$; RESET SESSION AUTHORIZATION;`).join('\n')}
 DO $$BEGIN IF has_schema_privilege('anon','tll_customer_private','USAGE') OR has_table_privilege('anon','tll_customer_private.connections','SELECT,MAINTAIN') OR has_schema_privilege('tll_customer_migrator','tll_customer_private','CREATE') OR (SELECT enabled FROM tll_customer_private.control) THEN RAISE EXCEPTION 'Private ACL or disabled-control regression'; END IF; END$$;
 ROLLBACK;`)
assert.equal(admin("SELECT json_build_object('control',(SELECT row_to_json(c) FROM tll_customer_private.control c),'owners',(SELECT coalesce(json_agg(x),'[]') FROM tll_customer_private.owners x),'attempts',(SELECT coalesce(json_agg(x),'[]') FROM tll_customer_private.attempts x),'connections',(SELECT coalesce(json_agg(x),'[]') FROM tll_customer_private.connections x));"),before)
assert.equal(admin("SELECT count(*) FROM pg_roles WHERE rolname IN ('tll_customer_default_probe','tll_customer_role_setup','tll_customer_operator_probe')"),'0')
console.log('PASS: final canonical migration under non-superuser; inherited schema/table/sequence/function ACLs including MAINTAIN removed; operator status/control usable with no data/CREATE/executor access; session impersonation denied; reconstruction rolled back and fixture unchanged')
