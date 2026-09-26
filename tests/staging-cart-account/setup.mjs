import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
const C='tll-stage0-postgres',D='tll_cart_account_v2',M='tll_cart_account_migrator_v2'
const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:16*1024*1024})
const sql=(db,input)=>run(['exec','-i',C,'psql','-XqAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],input)
if(process.argv.slice(2).join(' ')!=='--create-once')throw Error('Explicit --create-once required')
if(process.env.DOCKER_HOST&&!process.env.DOCKER_HOST.startsWith('unix://'))throw Error('Remote Docker refused')
if(!run(['context','inspect','--format','{{(index .Endpoints "docker").Host}}']).trim().startsWith('unix://'))throw Error('Local Docker required')
if(!/^true postgres:17/.test(run(['inspect','--format','{{.State.Running}} {{.Config.Image}}',C]).trim()))throw Error('Exact local PG17 container required')
if(sql('postgres',`SELECT count(*) FROM pg_database WHERE datname='${D}'`).trim()!=='0')throw Error('Existing cart-account fixture refused')
const map={tll_cart_owner:'tll_ca2_owner',tll_cart_gateway:'tll_ca2_gateway',tll_cart_role_setup:'tll_ca2_role_setup'}
const roles=[M,...Object.values(map)];if(sql('postgres',`SELECT count(*) FROM pg_roles WHERE rolname IN (${roles.map(x=>`'${x}'`).join(',')})`).trim()!=='0')throw Error('Existing fixture roles refused')
const adapt=text=>{for(const[a,b]of Object.entries(map))text=text.replace(new RegExp(`(?<![A-Za-z0-9_$])${a}(?![A-Za-z0-9_$])`,'g'),b);return text}
const six=adapt(readFileSync(new URL('../../supabase/migrations/202609150006_staging_cart_sessions.sql',import.meta.url),'utf8'))
const fourteen=adapt(readFileSync(new URL('../../supabase/migrations/202609180014_staging_cart_account_transition.sql',import.meta.url),'utf8'))
run(['exec',C,'createdb','-U','postgres',D])
try{sql(D,`CREATE ROLE ${M} NOLOGIN CREATEROLE NOINHERIT; ALTER DATABASE ${D} OWNER TO ${M}; CREATE SCHEMA tll_staging_private; REVOKE ALL ON SCHEMA tll_staging_private FROM PUBLIC; CREATE TABLE tll_staging_private.environment(singleton boolean PRIMARY KEY,environment text,operator_project_ref text,identity_basis text); INSERT INTO tll_staging_private.environment VALUES(true,'tll-hosted-staging-v1','abcdefghijklmnopqrst','explicit-operator-dashboard-binding'); GRANT USAGE ON SCHEMA tll_staging_private TO ${M}; GRANT SELECT ON tll_staging_private.environment TO ${M}; SET SESSION AUTHORIZATION ${M}; SET tll.cart_migration_environment='staging'; SET tll.cart_expected_project_ref='abcdefghijklmnopqrst'; ${six} ${fourteen} RESET SESSION AUTHORIZATION; COMMENT ON DATABASE ${D} IS 'tll-cart-account-synthetic-v2';`)}
catch{throw Error('Cart-account fixture installation failed; database retained for inspection')}
console.log(JSON.stringify({status:'PASS',database:D}))
