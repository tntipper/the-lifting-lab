// Explicit one-time setup, only the already approved local container. Never reset
// a DB, start Docker, provision a LOGIN or target an arbitrary endpoint.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { assertLocalContainer } from './local-pg.mjs'
const container='tll-stage0-postgres',db='tll_customer_repository'
const run=(args,input)=>execFileSync('docker',args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024})
if(process.argv.slice(2).join(' ')!=='--create-once')throw new Error('Explicit --create-once required')
assertLocalContainer()
const psql=(database,sql)=>run(['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],sql)
if(psql('postgres',"SELECT 1 FROM pg_database WHERE datname='tll_customer_repository';").includes('(1 row)'))throw new Error('Existing database refused; never reset')
run(['exec',container,'createdb','-U','postgres',db])
psql(db,"COMMENT ON DATABASE tll_customer_repository IS 'tll-customer-repository-synthetic-v1';\n"+readFileSync(new URL('bootstrap.sql',import.meta.url),'utf8'))
const migrations=['202609150005_customer_connection_repository.sql','202609180012_customer_shopify_proof_repository.sql']
  .map(name=>readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'))
const bodies=migrations.map(migration=>migration.slice(migration.indexOf('BEGIN;\n')+7).replace(/COMMIT;\n$/,''))
psql(db,`BEGIN; CREATE ROLE tll_customer_default_probe NOLOGIN;
 GRANT tll_customer_default_probe TO anon WITH INHERIT TRUE;
 SET SESSION AUTHORIZATION tll_customer_migrator;
 ALTER DEFAULT PRIVILEGES GRANT USAGE ON SCHEMAS TO tll_customer_default_probe;
 ALTER DEFAULT PRIVILEGES GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLES TO tll_customer_default_probe;
 ALTER DEFAULT PRIVILEGES GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO tll_customer_default_probe;
 ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO tll_customer_default_probe;
 ${bodies.join('\n')}
 RESET SESSION AUTHORIZATION;
 DO $$BEGIN IF has_schema_privilege('anon','tll_customer_private','USAGE') OR has_table_privilege('anon','tll_customer_private.connections','SELECT,MAINTAIN') OR has_schema_privilege('tll_customer_migrator','tll_customer_private','CREATE') THEN RAISE EXCEPTION 'Inherited ACL regression'; END IF; END$$;
 ROLLBACK;`)
psql(db,'SET SESSION AUTHORIZATION tll_customer_migrator;\n'+migrations.join('\n'))
console.log('PASS: isolated setup; non-superuser migration and rollback-only inherited-ACL regression; control remains disabled')
