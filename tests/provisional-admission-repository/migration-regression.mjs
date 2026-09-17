// Entire reconstruction is ROLLBACK-ONLY in the exact owned synthetic database.
// No other schema/database is reset; no hosted endpoint or credentials exist here.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {admin,assertFixture} from './local-pg.mjs'
import {migrationAuthorityProof} from '../repository-migration-authority.mjs'
assertFixture()
assert.equal(admin('SELECT enabled FROM tll_provisional_private.control'),'f')
assert.equal(admin("SELECT count(*) FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid IN ('tll_provisional_owner'::regrole,'tll_provisional_executor'::regrole) AND dbid NOT IN (0,(SELECT oid FROM pg_database WHERE datname=current_database()))"),'0')
const snapshot=()=>admin("SELECT json_build_object('control',(SELECT row_to_json(c) FROM tll_provisional_private.control c),'attempts',(SELECT coalesce(json_agg(x),'[]') FROM tll_provisional_private.operations x),'connections',(SELECT coalesce(json_agg(x),'[]') FROM tll_provisional_private.intents x));")
const before=snapshot()
const sql=readFileSync(new URL('../../supabase/migrations/202609170008_customer_provisional_admission_repository.sql',import.meta.url),'utf8')
assert.ok(sql.includes('BEGIN;\n')&&sql.endsWith('COMMIT;\n'))
const body=sql.replace('BEGIN;\n','').replace(/COMMIT;\n$/,'')
admin(`BEGIN;
 DROP SCHEMA tll_provisional_private CASCADE; DROP ROLE tll_provisional_owner; DROP ROLE tll_provisional_executor;
 CREATE ROLE tll_provisional_default_probe NOLOGIN; GRANT tll_provisional_default_probe TO anon WITH INHERIT TRUE;
 SET SESSION AUTHORIZATION tll_provisional_migrator;
 ALTER DEFAULT PRIVILEGES GRANT USAGE ON SCHEMAS TO tll_provisional_default_probe;
 ALTER DEFAULT PRIVILEGES GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLES TO tll_provisional_default_probe;
 ALTER DEFAULT PRIVILEGES GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO tll_provisional_default_probe;
 ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO tll_provisional_default_probe;
 ${body}
 ${migrationAuthorityProof('provisional')}
 DO $$DECLARE result jsonb; BEGIN
   result:=tll_provisional_private.operator_status();
   IF result->'enabled'<>'false'::jsonb OR result->>'intents'<>'0'
     OR result->>'reasonCode'<>'installed_disabled' THEN RAISE EXCEPTION 'Operator status unavailable'; END IF;
   result:=tll_provisional_private.operator_set_enabled(true,'synthetic_acceptance');
   IF result->'enabled'<>'true'::jsonb THEN RAISE EXCEPTION 'Operator enable unavailable'; END IF;
   result:=tll_provisional_private.operator_set_enabled(false,'synthetic_complete');
   IF result->'enabled'<>'false'::jsonb THEN RAISE EXCEPTION 'Operator disable unavailable'; END IF;
   BEGIN PERFORM * FROM tll_provisional_private.intents; RAISE EXCEPTION 'Operator reads ciphertext'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN UPDATE tll_provisional_private.control SET enabled=true; RAISE EXCEPTION 'Operator directly writes control'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN CREATE TABLE tll_provisional_private.unexpected_operator_table(id int); RAISE EXCEPTION 'Operator can create'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN SET ROLE tll_provisional_executor; RAISE EXCEPTION 'Operator can SET executor role'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN PERFORM tll_provisional_private.repository('cancel','{}'::jsonb); RAISE EXCEPTION 'Operator can call executor'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN PERFORM tll_provisional_private.operator_set_enabled(NULL,'synthetic'); RAISE EXCEPTION 'Null enable accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
   BEGIN PERFORM tll_provisional_private.operator_set_enabled(true,'Invalid reason with spaces'); RAISE EXCEPTION 'Invalid reason accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END$$;
 -- This disposable NOLOGIN probe is never committed. Its exact delegation
 -- is granted and revoked under the narrow operator authority.
 CREATE ROLE tll_provisional_runtime_probe NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 GRANT tll_provisional_executor TO tll_provisional_runtime_probe WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
 DO $$BEGIN IF NOT pg_has_role('tll_provisional_runtime_probe','tll_provisional_executor','USAGE') THEN RAISE EXCEPTION 'Runtime delegation failed'; END IF; END$$;
 REVOKE tll_provisional_executor FROM tll_provisional_runtime_probe;
 DO $$BEGIN IF pg_has_role('tll_provisional_runtime_probe','tll_provisional_executor','MEMBER') THEN RAISE EXCEPTION 'Runtime revocation failed'; END IF; END$$;
 RESET SESSION AUTHORIZATION;
 CREATE ROLE tll_provisional_operator_probe NOLOGIN;
 GRANT tll_provisional_migrator TO tll_provisional_operator_probe WITH INHERIT TRUE, SET TRUE;
 SET SESSION AUTHORIZATION tll_provisional_operator_probe;
 SET ROLE tll_provisional_migrator;
 DO $$BEGIN
   BEGIN PERFORM tll_provisional_private.operator_status(); RAISE EXCEPTION 'SET ROLE impersonated operator status'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN PERFORM tll_provisional_private.operator_set_enabled(true,'synthetic'); RAISE EXCEPTION 'SET ROLE impersonated operator control'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END$$;
 RESET SESSION AUTHORIZATION;
 ${['anon','authenticated','service_role','tll_provisional_executor'].map(role=>`SET SESSION AUTHORIZATION ${role};
 DO $$BEGIN
   BEGIN PERFORM tll_provisional_private.operator_status(); RAISE EXCEPTION 'Non-operator reads status'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN PERFORM tll_provisional_private.operator_set_enabled(true,'synthetic'); RAISE EXCEPTION 'Non-operator controls use'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END$$; RESET SESSION AUTHORIZATION;`).join('\n')}
 DO $$BEGIN IF has_schema_privilege('anon','tll_provisional_private','USAGE') OR has_table_privilege('anon','tll_provisional_private.intents','SELECT,MAINTAIN') OR has_schema_privilege('tll_provisional_migrator','tll_provisional_private','CREATE') OR (SELECT enabled FROM tll_provisional_private.control) THEN RAISE EXCEPTION 'Private ACL or disabled-control regression'; END IF; END$$;
 ROLLBACK;`)
assert.equal(snapshot(),before)
admin(`BEGIN;
 DROP SCHEMA tll_provisional_private CASCADE; DROP ROLE tll_provisional_owner; DROP ROLE tll_provisional_executor;
 ${body}
 DO $$BEGIN
  IF (SELECT count(*) FROM pg_auth_members WHERE roleid IN ('tll_provisional_owner'::regrole,'tll_provisional_executor'::regrole))<>2
   OR EXISTS(SELECT FROM pg_auth_members WHERE roleid IN ('tll_provisional_owner'::regrole,'tll_provisional_executor'::regrole)
     AND NOT(member=current_user::regrole AND grantor=current_user::regrole AND admin_option AND NOT inherit_option AND NOT set_option))
   OR (SELECT enabled FROM tll_provisional_private.control) THEN RAISE EXCEPTION 'Superuser single-edge retirement failed'; END IF;
 END$$;
 ROLLBACK;`)
assert.equal(snapshot(),before)
assert.equal(admin("SELECT count(*) FROM pg_roles WHERE rolname IN ('tll_provisional_default_probe','tll_provisional_role_setup','tll_provisional_operator_probe','tll_provisional_runtime_probe')"),'0')
console.log('PASS: final canonical migration under non-superuser and superuser; temporary owner SET permits future ALTER FUNCTION/TABLE/GRANT then retires to exact bootstrap ADMIN-only edge; inherited schema/table/sequence/function ACLs including MAINTAIN removed; operator status/control usable with no data/CREATE/executor access; session impersonation denied; exact ADMIN-only executor delegation granted/revoked for an uncommitted NOLOGIN probe; reconstruction rolled back and fixture unchanged')
