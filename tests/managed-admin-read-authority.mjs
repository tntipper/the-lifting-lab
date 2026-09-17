// Rollback-only proof in existing marked synthetic fixtures. No hosted endpoint,
// container creation, credentials, persistent roles or fixture reset is permitted.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { source as bridgeSource, body } from './admission-bridge/sources.mjs'
import { migrationAuthorityProof } from './repository-migration-authority.mjs'
const fixtures = {
  customer: ['customer-repository', '202609150005_customer_connection_repository.sql'],
  broker: ['subject-broker-repository', '202609150007_customer_subject_broker_repository.sql'],
  provisional: ['provisional-admission-repository', '202609170008_customer_provisional_admission_repository.sql'],
  bridge: ['admission-bridge', '202609170010_customer_admission_bridge.sql'],
}
const chosen = process.argv.slice(2)
if (chosen.some(n => !Object.hasOwn(fixtures, n))) throw Error('Unknown fixed synthetic fixture')
const exclusive = `DO $$BEGIN IF EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) THEN RAISE EXCEPTION 'Fixture is not exclusive'; END IF; END$$;`
for (const name of chosen.length ? chosen : Object.keys(fixtures)) {
  const [directory, filename] = fixtures[name]
  const { assertFixture, CONTAINER, DATABASE } = await import(`./${directory}/local-pg.mjs`)
  assertFixture()
  const admin = sql => {
    try { return execFileSync('docker',['exec','-i',CONTAINER,'psql','-XqAt','-U','postgres','-d',DATABASE,'-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000,maxBuffer:8*1024*1024}).trim() }
    catch(error) { throw Error(`Synthetic ${name} proof failed: ${String(error.stderr).split('\n').find(line => line.includes('ERROR:')) ?? 'no SQL diagnostic'}`) }
  }
  const operator = name === 'bridge' ? 'tll_admission_bridge_migrator' : `tll_${name}_migrator`
  const schemas = name === 'bridge' ? ['tll_broker_private', 'tll_provisional_private', 'tll_bridge_private'] : [`tll_${name}_private`]
  const owner = name === 'bridge' ? 'tll_ab_bridge_owner' : `tll_${name}_owner`
  const executor = name === 'bridge' ? 'tll_ab_bridge_executor' : `tll_${name}_executor`
  const schema = `tll_${name}_private`
  const schemaSQL = schemas.map(s => `'${s}'`).join(',')
  const canonical = name === 'bridge' ? bridgeSource(2).adapted : readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8')
  const checkedGuards = name === 'bridge'
    ? canonical.match(/DO \$postflight\$[\s\S]*?END \$postflight\$;/)?.[0]
    : canonical.match(/DO \$postflight\$[\s\S]*?\$retire_authority\$;/)?.[0]
  assert.ok(checkedGuards)
  // The pre-retirement postflight reads control under the migration's temporary
  // owner edge. Reproduce that exact window before checking existing fixtures.
  const guards = name === 'bridge' ? checkedGuards : `GRANT ${owner} TO ${operator} WITH INHERIT TRUE,SET TRUE; ${checkedGuards}`
  admin(exclusive)
  for (const s of schemas) assert.equal(admin(`SELECT enabled FROM ${s}.control`), 'f')
  assert.equal(admin(`SELECT rolsuper OR rolbypassrls OR pg_has_role('${operator}','pg_read_all_data','USAGE') OR pg_has_role('${operator}','pg_write_all_data','USAGE') OR pg_has_role('${operator}','pg_maintain','USAGE') FROM pg_roles WHERE rolname='${operator}'`), 'f')
  const tables = JSON.parse(admin(`SELECT json_agg(n.nspname||'.'||c.relname ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN (${schemaSQL}) AND c.relkind='r'`))
  const fingerprint = () => {
    // PG17 VACUUM/ANALYZE can change these five maintenance estimates/horizons
    // between rollback snapshots. Preserve every identity, ownership, ACL, RLS,
    // storage and structural field, plus the complete role/function/data checks.
    // https://www.postgresql.org/docs/17/catalog-pg-class.html
    const catalog = admin(`SELECT jsonb_build_object(
      'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY oid) FROM pg_roles r),
      'members',(SELECT jsonb_agg(to_jsonb(m) ORDER BY oid) FROM pg_auth_members m),
      'namespaces',(SELECT jsonb_agg(to_jsonb(n) ORDER BY oid) FROM pg_namespace n WHERE nspname IN (${schemaSQL})),
      'relations',(SELECT jsonb_agg(to_jsonb(c)-ARRAY['relpages','reltuples','relallvisible','relfrozenxid','relminmxid'] ORDER BY oid) FROM pg_class c WHERE relnamespace IN (SELECT oid FROM pg_namespace WHERE nspname IN (${schemaSQL}))),
      'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY attrelid,attnum) FROM pg_attribute a WHERE attrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN (${schemaSQL}))),
      'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_proc p WHERE pronamespace IN (SELECT oid FROM pg_namespace WHERE nspname IN (${schemaSQL}))),
      'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_default_acl d))`)
    const data = tables.map(t => admin(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM ${t} x`))
    return createHash('sha256').update(JSON.stringify([catalog, data])).digest('hex')
  }
  const before = fingerprint()
  const managed = `GRANT pg_read_all_data TO ${operator} WITH ADMIN FALSE,INHERIT TRUE,SET FALSE; ALTER ROLE ${operator} BYPASSRLS;`
  const reconstruct = name === 'bridge' ? `
DROP FUNCTION tll_broker_private.repository(text,jsonb),tll_provisional_private.repository(text,jsonb),tll_broker_private.operator_set_enabled(boolean,text),tll_provisional_private.operator_set_enabled(boolean,text);
ALTER FUNCTION tll_broker_private.repository_v1(text,jsonb) RENAME TO repository;
ALTER FUNCTION tll_provisional_private.repository_v1(text,jsonb) RENAME TO repository;
ALTER FUNCTION tll_broker_private.operator_set_enabled_v1(boolean,text) RENAME TO operator_set_enabled;
ALTER FUNCTION tll_provisional_private.operator_set_enabled_v1(boolean,text) RENAME TO operator_set_enabled;
DROP FUNCTION tll_broker_private.bridge_lock(),tll_broker_private.bridge_register(uuid,jsonb),tll_broker_private.bridge_terminal(jsonb,text),tll_provisional_private.bridge_lock(),tll_provisional_private.bridge_source(jsonb),tll_provisional_private.bridge_terminal(jsonb,text);
ALTER TABLE tll_provisional_private.intents DROP COLUMN bridge_epoch;
DROP OWNED BY ${owner},${executor}; DROP ROLE ${owner},${executor};`
    : `DROP SCHEMA ${schema} CASCADE; DROP ROLE ${owner},${executor};`
  // Role destruction is confined to roles with no dependencies in another DB.
  assert.equal(admin(`SELECT count(*) FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid IN ('${owner}'::regrole,'${executor}'::regrole) AND dbid NOT IN (0,(SELECT oid FROM pg_database WHERE datname=current_database()))`), '0')
  const readProof = `DO $read_proof$ DECLARE r record; BEGIN
    IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) OR NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) OR NOT pg_has_role(current_user,'pg_read_all_data','USAGE') THEN RAISE EXCEPTION 'Managed test profile absent'; END IF;
    FOR r IN SELECT c.oid,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN (${schemaSQL}) AND c.relkind IN ('r','S') LOOP
      IF r.relkind='r' AND (NOT has_table_privilege(current_user,r.oid,'SELECT') OR NOT has_any_column_privilege(current_user,r.oid,'SELECT') OR has_table_privilege(current_user,r.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(current_user,r.oid,'INSERT,UPDATE,REFERENCES')) THEN RAISE EXCEPTION 'Managed table authority mismatch'; END IF;
      IF r.relkind='S' AND (NOT has_sequence_privilege(current_user,r.oid,'SELECT') OR has_sequence_privilege(current_user,r.oid,'USAGE,UPDATE')) THEN RAISE EXCEPTION 'Managed sequence authority mismatch'; END IF;
    END LOOP;
    BEGIN UPDATE ${schema}.control SET enabled=true; RAISE EXCEPTION 'Managed operator writes control'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET ROLE ${executor}; RAISE EXCEPTION 'Managed operator sets executor'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM ${schema}.repository('invalid','{}'::jsonb); RAISE EXCEPTION 'Managed operator calls runtime'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END $read_proof$;`
  // Existing plain nonsuperuser fixture must pass with no implicit read authority.
  admin(`BEGIN; ${exclusive} SET SESSION AUTHORIZATION ${operator}; ${guards} ROLLBACK;`)
  assert.equal(fingerprint(), before)
  // Complete canonical reconstruction, not a hand-built replacement guard. All
  // platform-like test membership/flags and DDL disappear on connection rollback.
  admin(`BEGIN; ${exclusive} ${managed} ${reconstruct} SET SESSION AUTHORIZATION ${operator}; ${body(canonical)} ${readProof} ${name === 'bridge' ? '' : migrationAuthorityProof(name)} ROLLBACK;`)
  assert.equal(fingerprint(), before)
  admin(`BEGIN; ${exclusive} ${managed} SET SESSION AUTHORIZATION ${operator}; ${guards} ${readProof} ROLLBACK;`)
  assert.equal(fingerprint(), before)
  const probes = [
    ['explicit installer table SELECT', `GRANT SELECT ON ${schema}.control TO ${operator}`, 'Unexpected private relation or column ACL'],
    ['explicit installer column SELECT', `GRANT SELECT(enabled) ON ${schema}.control TO ${operator}`, 'Unexpected private relation or column ACL'],
    ['implicit installer write-all', `GRANT pg_write_all_data TO ${operator} WITH INHERIT TRUE`, /Unexpected (operator (table\/column|sequence) authority|effective private data access|effective sequence access)/],
    ['implicit installer maintain', `GRANT pg_maintain TO ${operator} WITH INHERIT TRUE`, /Unexpected (operator table\/column authority|effective private data access)/],
    ['browser read-all', 'GRANT pg_read_all_data TO anon WITH INHERIT TRUE', /Unexpected (effective schema authority|private schema CREATE|protected role superuser)/],
    ['executor read-all', `GRANT pg_read_all_data TO ${executor} WITH INHERIT TRUE`, /Unexpected (sequence authority|effective private table\/column authority|bridge role authority)/],
    ['browser superuser', 'ALTER ROLE anon SUPERUSER', /Unexpected (effective schema authority|protected role superuser)/],
    ['executor superuser', `ALTER ROLE ${executor} SUPERUSER`, /Unexpected (effective schema authority|bridge role authority)/],
    ['owner bootstrap SET', `GRANT ${owner} TO ${operator} WITH ADMIN TRUE,INHERIT FALSE,SET TRUE`, /Unexpected (repository membership|bridge role authority)/],
    ['owner bootstrap INHERIT', `GRANT ${owner} TO ${operator} WITH ADMIN TRUE,INHERIT TRUE,SET FALSE`, /Unexpected (repository membership|bridge role authority)/],
  ]
  const sequenceSchema = name === 'bridge' ? 'tll_provisional_private' : schema
  probes.push(
    ['explicit installer sequence SELECT', `GRANT SELECT ON SEQUENCE ${sequenceSchema}.fences TO ${operator}`, 'Unexpected private relation or column ACL'],
    ['explicit installer sequence USAGE', `GRANT USAGE ON SEQUENCE ${sequenceSchema}.fences TO ${operator}`, 'Unexpected private relation or column ACL'],
    ['explicit installer sequence UPDATE', `GRANT UPDATE ON SEQUENCE ${sequenceSchema}.fences TO ${operator}`, 'Unexpected private relation or column ACL'],
  )
  if (name === 'bridge') for (const predecessor of ['broker', 'provisional']) for (const role of ['owner', 'executor']) {
    const target = `tll_ab_${predecessor}_${role}`
    probes.push(
      [`${predecessor} ${role} bootstrap SET`, `GRANT ${target} TO ${operator} WITH ADMIN TRUE,INHERIT FALSE,SET TRUE`, 'Unexpected bridge role authority'],
      [`${predecessor} ${role} bootstrap INHERIT`, `GRANT ${target} TO ${operator} WITH ADMIN TRUE,INHERIT TRUE,SET FALSE`, 'Unexpected bridge role authority'],
      [`${predecessor} ${role} duplicate edge`, `SET SESSION AUTHORIZATION ${operator}; GRANT ${target} TO ${operator} WITH ADMIN FALSE,INHERIT FALSE,SET TRUE; RESET SESSION AUTHORIZATION`, 'Unexpected bridge role authority'],
    )
  }
  for (const [label, mutation, expected] of probes) {
    let rejected = false
    try {
      execFileSync('docker', ['exec','-i',CONTAINER,'psql','-XqAt','-U','postgres','-d',DATABASE,'-v','ON_ERROR_STOP=1'], {
        input: `BEGIN; ${exclusive} ${managed} ${mutation};\n\\echo TLL_MUTATION_APPLIED\nSET SESSION AUTHORIZATION ${operator}; ${guards} ROLLBACK;`,
        encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000,maxBuffer:8*1024*1024,
      })
    } catch (error) {
      assert.ok(String(error.stdout).includes('TLL_MUTATION_APPLIED'), `Mutation did not apply: ${name}: ${label}`)
      const diagnostic = String(error.stderr)
      assert.ok(typeof expected === 'string' ? diagnostic.includes(expected) : expected.test(diagnostic), `Wrong guard rejected ${name}: ${label}`)
      rejected = true
    }
    assert.ok(rejected, `Guard accepted ${name}: ${label}`)
    assert.equal(fingerprint(), before, `Rollback differs: ${name}: ${label}`)
  }
  admin(exclusive)
  console.log(`PASS ${name}: plain guard; full nonsuperuser read-all+BYPASSRLS reconstruction and SELECT-only proof; ${probes.length} applied mutations rejected; complete role/catalog/data fingerprint restored ${before}`)
}
