/** Actual PG17 forward repair, exclusively in rollback on the preserved marked fixture. */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fixture } from './fixture.mjs'
const CONTAINER=process.env.TLL_INVENTORY_TEST_CONTAINER??'tll-stage0-postgres'
assert.ok(CONTAINER==='tll-stage0-postgres'||(process.platform==='linux'&&/^tll-inventory-ci-[1-9][0-9]*$/.test(CONTAINER)),'Only the approved existing container or a fresh Linux inventory CI fixture is allowed')
const DB='tll_inventory_ledger', OPERATOR='tll_inventory_test_migrator'
const OWNER='tll_inventory_owner_v2', WORKER='tll_inventory_worker_v2', A='tll_inventory009_worker_a', B='tll_inventory009_worker_b', PROBE='tll_inventory009_probe'
const args=['exec','-i',CONTAINER,'psql','-XqAt','-U','postgres','-d',DB,'-v','ON_ERROR_STOP=1']
const options={encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000,maxBuffer:12*1024*1024}
const sqlLiteral=v=>v===null?'NULL':"'"+String(v).replaceAll("'","''")+"'"
const digest=v=>createHash('sha256').update(v).digest('hex')
function admin(sql){return execFileSync('docker',args,{...options,input:sql}).trim()}
assert.ok(!process.env.DOCKER_HOST||process.env.DOCKER_HOST.startsWith('unix://'))
assert.ok(execFileSync('docker',['context','inspect','--format','{{(index .Endpoints "docker").Host}}'],options).trim().startsWith('unix://'))
assert.match(execFileSync('docker',['inspect','--format','{{.State.Running}} {{.Config.Image}}',CONTAINER],options).trim(),/^true postgres:17(?:[.\-].*)?$/)
assert.equal(admin("SELECT current_database()||':'||marker FROM public.tll_inventory_test_marker"),DB+':synthetic-inventory-ledger-v1')
assert.equal(admin("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()"),'0','Fixture must be exclusive')
assert.equal(admin('SELECT enabled FROM tll_inventory_private.control'),'f')
assert.equal(admin('SELECT (SELECT count(*) FROM tll_inventory_private.operations)||\':\'||(SELECT count(*) FROM tll_inventory_private.events)'),'12:43','Preserved acceptance fixture required')
assert.equal(admin(`SELECT count(*) FROM pg_roles WHERE rolname IN(${[OWNER,WORKER,A,B,PROBE].map(sqlLiteral).join(',')})`),'0','Never adopt existing proof roles')
assert.equal(admin("SELECT count(*) FROM pg_namespace WHERE nspname='tll_staging_private'"),'0')
const canonical=readFileSync(new URL('../../supabase/migrations/202609150004_inventory_operation_ledger.sql',import.meta.url),'utf8')
assert.equal(digest(canonical),'030ccb26228aca6665147eced447815f8a290abd74b8003b0f32bfb2a05e5a76','Historical004 bytes must not change')
const migration=readFileSync(new URL('../../supabase/migrations/202609170009_inventory_maintenance_authority.sql',import.meta.url),'utf8')
assert.equal((migration.match(/^begin;$/gm)||[]).length,1);assert.equal((migration.match(/^commit;$/gm)||[]).length,1)
const body=migration.replace(/^begin;\n/m,'').replace(/^commit;\n$/m,'')
const functions=text=>[...text.matchAll(/^create function [^\n]*? as \$\$[\s\S]*?\$\$;/gm)].map(x=>x[0])
assert.equal(functions(canonical).length,12);assert.deepEqual(functions(migration),functions(canonical),'All twelve declarations/body bytes remain exact')
assert.doesNotMatch(migration,/\bdrop\s+(?:schema|table|role)\b|\btruncate\b\s+tll_|\breassign\s+owned\b/i)
const snapshot=`SELECT jsonb_build_object(
 'control',(SELECT jsonb_agg(to_jsonb(x)) FROM tll_inventory_private.control x),
 'operations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY operation_id) FROM tll_inventory_private.operations x),
 'events',(SELECT jsonb_agg(to_jsonb(x) ORDER BY event_id) FROM tll_inventory_private.events x),
 'schema',(SELECT to_jsonb(n) FROM pg_namespace n WHERE nspname='tll_inventory_private'),
 'relations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY oid) FROM pg_class c WHERE relnamespace='tll_inventory_private'::regnamespace),
 'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_proc p WHERE pronamespace='tll_inventory_private'::regnamespace),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_policy p WHERE polrelid IN(SELECT oid FROM pg_class WHERE relnamespace='tll_inventory_private'::regnamespace)),
 'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY oid) FROM pg_trigger t WHERE tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='tll_inventory_private'::regnamespace)),
 'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY oid) FROM pg_roles r WHERE rolname LIKE 'tll_inventory%'),
 'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM pg_auth_members m WHERE roleid IN('tll_inventory_owner'::regrole,'tll_inventory_worker'::regrole)))`
const before=admin(snapshot)
const bootstrap=JSON.parse(admin("SELECT json_build_object('oid',oid,'name',rolname,'superuser',rolsuper) FROM pg_roles WHERE oid=10"))
assert.equal(bootstrap.superuser,true,'Expected PostgreSQL bootstrap grantor')
const membershipRows=`SELECT jsonb_agg(jsonb_build_object('role',r.rolname,'member',m.member::regrole::text,'grantorOid',m.grantor,'grantor',g.rolname,'superuserGrantor',g.rolsuper,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) ORDER BY r.rolname) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles g ON g.oid=m.grantor WHERE m.roleid IN('${OWNER}'::regrole,'${WORKER}'::regrole)`
const expectedMemberships=[OWNER,WORKER].map(role=>({role,member:OPERATOR,grantorOid:bootstrap.oid,grantor:bootstrap.name,superuserGrantor:true,admin:true,inherit:false,set:false}))
// The historical fixture has two synthetic clients. Remove only their known
// membership edges inside this proof's rollback, never the fixture's rows/schema.
const preparation=`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
REVOKE tll_inventory_worker FROM tll_inventory_test_worker_a,tll_inventory_test_worker_b;
CREATE ROLE ${PROBE} NOLOGIN;
SET SESSION AUTHORIZATION ${OPERATOR};
CREATE SCHEMA tll_staging_private;
CREATE TABLE tll_staging_private.applied_migrations(version text PRIMARY KEY,source_sha256 text);
INSERT INTO tll_staging_private.applied_migrations VALUES('202609150004_inventory_operation_ledger','030ccb26228aca6665147eced447815f8a290abd74b8003b0f32bfb2a05e5a76');
`
let checks=0
function check(name,actual=true,expected=true){assert.deepEqual(actual,expected,name);checks++;console.log('PASS '+name)}
const mutations=[
 ['enabled control','UPDATE tll_inventory_private.control SET enabled=true'],
 ['missing control','DELETE FROM tll_inventory_private.control'],
 ['changed function body',"CREATE OR REPLACE FUNCTION tll_inventory_private.exact_keys(v jsonb,keys text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $f$ SELECT false $f$"],
 ['changed function argument',"DROP FUNCTION tll_inventory_private.exact_keys(jsonb,text[]) RESTRICT; CREATE FUNCTION tll_inventory_private.exact_keys(v jsonb,keys text[],extra text) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$"],
 ['changed function settings',"ALTER FUNCTION tll_inventory_private.exact_keys(jsonb,text[]) SET search_path=public"],
 ['unrelated function ACL',`GRANT EXECUTE ON FUNCTION tll_inventory_private.enqueue(text) TO ${PROBE}`],
 ['function grant option','GRANT EXECUTE ON FUNCTION tll_inventory_private.enqueue(text) TO tll_inventory_worker WITH GRANT OPTION'],
 ['unrelated table ACL',`GRANT MAINTAIN ON tll_inventory_private.operations TO ${PROBE}`],
 ['column ACL',`GRANT SELECT(manifest_document) ON tll_inventory_private.operations TO ${PROBE}`],
 ['schema grant option','GRANT USAGE ON SCHEMA tll_inventory_private TO tll_inventory_worker WITH GRANT OPTION'],
 ['role LOGIN','ALTER ROLE tll_inventory_owner LOGIN'],
 ['unexpected membership',`GRANT tll_inventory_owner TO ${PROBE}`],
 ['RLS disabled','ALTER TABLE tll_inventory_private.operations DISABLE ROW LEVEL SECURITY'],
 ['changed RLS','ALTER POLICY inventory_control_read ON tll_inventory_private.control USING(false)'],
 ['changed trigger','ALTER TABLE tll_inventory_private.events DISABLE TRIGGER immutable_inventory_event'],
 ['extra column','ALTER TABLE tll_inventory_private.operations ADD COLUMN unreviewed text'],
 ['changed column identity',"ALTER TABLE tll_inventory_private.operations ALTER COLUMN desired_available ADD GENERATED ALWAYS AS IDENTITY"],
 ['changed constraint','ALTER TABLE tll_inventory_private.operations DROP CONSTRAINT operations_fence_check'],
 ['changed index','DROP INDEX tll_inventory_private.inventory_one_outstanding_target'],
 ['changed table owner',`ALTER TABLE tll_inventory_private.control OWNER TO ${PROBE}`],
 ['new-role collision',`CREATE ROLE ${OWNER} NOLOGIN`],
 ['unexpected retired role dependency',`CREATE TABLE public.tll_inventory009_dependency(id integer); GRANT SELECT ON public.tll_inventory009_dependency TO tll_inventory_owner`],
 ['unexpected dependent view',`CREATE VIEW public.tll_inventory009_dependency AS SELECT tll_inventory_private.exact_keys('{}'::jsonb,ARRAY[]::text[])`],
 ['historical ledger mismatch',"UPDATE tll_staging_private.applied_migrations SET source_sha256=repeat('0',64)"],
]
for(const[name,mutation]of mutations){
 let failure
 try{admin(preparation+`RESET SESSION AUTHORIZATION; ${mutation}; SET SESSION AUTHORIZATION ${OPERATOR};\n`+body+'\nROLLBACK;')}catch(error){failure=String(error.stderr??'')}
 assert.ok(failure&&(failure.includes('Inventory maintenance:')||failure.includes('other objects depend on them')),name+': expected guard/RESTRICT refusal, got '+failure)
 assert.equal(admin(snapshot),before,'Rollback after '+name)
 check('preflight/RESTRICT refuses '+name)
}
for(const [name,session] of [['superuser installer','RESET SESSION AUTHORIZATION'],['external role switch',`RESET SESSION AUTHORIZATION; SET ROLE ${OPERATOR}`]]){
 let failure
 try{admin(preparation+session+';\n'+body+'\nROLLBACK;')}catch(error){failure=String(error.stderr??'')}
 assert.ok(failure?.includes('Inventory maintenance: PostgreSQL17+ nonsuperuser installer required'),name)
 assert.equal(admin(snapshot),before)
 check('entry refuses '+name)
}
function connection(){
 const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});const lines=createInterface({input:child.stdout})
 let pending=null,errors=''
 child.stderr.on('data',b=>{errors+=b.toString()})
 lines.on('line',line=>{if(!pending)return;if(line===pending.marker){const p=pending;pending=null;p.resolve(p.lines.join('\n'))}else pending.lines.push(line)})
 const closed=new Promise(resolve=>child.on('close',code=>{pending?.reject(new Error('Fixture SQL failed: '+errors.slice(-4000)));pending=null;resolve(code)}))
 child.on('error',error=>pending?.reject(error))
 return {async query(sql){assert.equal(pending,null);return new Promise((resolve,reject)=>{const marker=randomUUID();pending={resolve,reject,marker,lines:[]};child.stdin.write(sql+';\n\\echo '+marker+'\n')})},async close(){child.stdin.end('ROLLBACK;\n\\q\n');await closed;lines.close()}}
}
const db=connection()
try{
 await db.query(preparation+`ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO ${PROBE};\n`+body)
 check('nonsuperuser forward repair and exact postflight pass with stray creation default ACL removed')
 check('exact owner and worker ADMIN-only edges have the bootstrap superuser grantor',JSON.parse(await db.query(membershipRows)),expectedMemberships)
 const preserved=JSON.parse(before)
 check('existing control data preserved',JSON.parse(await db.query('SELECT row_to_json(c) FROM tll_inventory_private.control c')),preserved.control[0])
 for(const table of['operations','events'])check('existing '+table+' rows preserved',JSON.parse(await db.query(`SELECT jsonb_agg(to_jsonb(x) ORDER BY ${table==='events'?'event_id':'operation_id'}) FROM tll_inventory_private.${table} x`)),preserved[table])
 check('all original table and index OIDs preserved',JSON.parse(await db.query("SELECT jsonb_agg(oid ORDER BY oid) FROM pg_class WHERE relnamespace='tll_inventory_private'::regnamespace")),preserved.relations.map(x=>x.oid).sort((a,b)=>a-b))
 check('historical source ledger unchanged',await db.query("SELECT version||':'||source_sha256 FROM tll_staging_private.applied_migrations"),'202609150004_inventory_operation_ledger:030ccb26228aca6665147eced447815f8a290abd74b8003b0f32bfb2a05e5a76')
 const denial=sql=>`DO $deny$ BEGIN BEGIN EXECUTE ${sqlLiteral(sql)}; RAISE EXCEPTION 'Expected denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $deny$`
 await db.query(denial('ALTER FUNCTION tll_inventory_private.exact_keys(jsonb,text[]) COST 101'))
 await db.query(denial('SELECT tll_inventory_private.enqueue(NULL)'))
 check('installer cannot ALTER owner function or execute worker API at rest')
 await db.query(`GRANT ${OWNER} TO ${OPERATOR} WITH ADMIN FALSE,INHERIT FALSE,SET TRUE; GRANT CREATE ON SCHEMA tll_inventory_private TO ${OWNER}; SET LOCAL ROLE ${OWNER}; ${denial('UPDATE tll_inventory_private.control SET enabled=true')}; ${denial('DELETE FROM tll_inventory_private.operations')}; ALTER FUNCTION tll_inventory_private.exact_keys(jsonb,text[]) COST 101; ALTER FUNCTION tll_inventory_private.exact_keys(jsonb,text[]) COST 100; ${functions(canonical)[2].replace('create function','create or replace function')}; SET LOCAL ROLE ${OPERATOR}; REVOKE CREATE ON SCHEMA tll_inventory_private FROM ${OWNER}; REVOKE ${OWNER} FROM ${OPERATOR} GRANTED BY ${OPERATOR}`)
 await db.query(denial('ALTER FUNCTION tll_inventory_private.exact_keys(jsonb,text[]) COST 101'))
 check('explicit temporary SET permits future ALTER/replacement and removes only self-granted edge')
 check('new function owner still cannot update control or delete operation evidence')
 check('future maintenance restores precisely the two original bootstrap grantors',JSON.parse(await db.query(membershipRows)),expectedMemberships)
 await db.query(`CREATE ROLE ${A} NOLOGIN NOINHERIT; CREATE ROLE ${B} NOLOGIN NOINHERIT; GRANT ${WORKER} TO ${A},${B} WITH ADMIN FALSE,INHERIT TRUE,SET FALSE; GRANT ${A},${B} TO ${OPERATOR} WITH ADMIN FALSE,INHERIT FALSE,SET TRUE`)
 check('installer can delegate new worker without platform superuser')
 async function as(role,sql){await db.query(`SET LOCAL ROLE ${role}`);return db.query(sql)}
 const api=async(name,params=[],role=A)=>{const raw=await as(role,`SELECT tll_inventory_private.${name}(${params.map(sqlLiteral).join(',')})`);return raw?JSON.parse(raw):null}
 const operator=sql=>as(OPERATOR,sql)
 for(const role of[A,B,'anon','authenticated','service_role']){
  // Browser roles need the initial local administrator for session selection only.
  if([A,B].includes(role))await db.query(`SET LOCAL ROLE ${role}`)
  else await db.query(`RESET SESSION AUTHORIZATION; SET SESSION AUTHORIZATION ${role}`)
  for(const sql of['SELECT * FROM tll_inventory_private.operations','UPDATE tll_inventory_private.control SET enabled=true','SELECT tll_inventory_private.cancel_never_attempted(NULL,NULL)','CREATE TABLE tll_inventory_private.forged(id int)',`SET ROLE ${OWNER}`])await db.query(denial(sql))
  await db.query(`RESET SESSION AUTHORIZATION; SET SESSION AUTHORIZATION ${OPERATOR}`)
  check('direct data/control/cancellation/DDL/owner SET denied for '+role)
 }
 const workerId=randomUUID(),otherWorker=randomUUID()
 const prepared=async target=>fixture({operationId:randomUUID(),target,now:Date.now()})
 const enq=f=>api('enqueue',[JSON.stringify(f.manifest)])
 const claim=(f,who=workerId,role=A)=>api('claim',[f.plan.operationId,who,120],role)
 const begin=(f,c,role=A)=>api('begin_attempt',[f.plan.operationId,c.worker_id,c.fence,f.manifest.plan.requestHash],role)
 const reconcile=(f,c,outcome='acknowledged',role=A)=>api('begin_reconciliation',[f.plan.operationId,c.worker_id,c.fence,outcome,outcome==='acknowledged'?'gid://shopify/InventoryAdjustmentGroup/synthetic009':null],role)
 const observed=async f=>{const o=await f.adapter.readTarget(f.binding);assert.equal(o.status,'observed');return {...o.observation,observedAtMs:Date.now(),level:{...o.observation.level,available:f.manifest.plan.desiredAvailable}}}
 const finish=async(f,c,token,result='hold',role=A,observation)=>api('finish_reconciliation',[f.plan.operationId,c.worker_id,c.fence,token,result,JSON.stringify(observation??await observed(f))],role)
 const f=await prepared(90001)
 check('enqueue accepts canonical manifest',(await enq(f)).status,'enqueued')
 check('exact enqueue is idempotent',(await enq(f)).status,'existing')
 check('disabled claim rejects',(await claim(f)).status,'disabled')
 check('target uniqueness still excludes replacement',(await enq(await prepared(90001))).status,'target_busy')
 check('invalid input is rejected',(await api('enqueue',['null'])).status,'invalid')
 check('inspect API returns stored operation',(await api('inspect_operation',[f.plan.operationId])).state,'queued')
 await operator('UPDATE tll_inventory_private.control SET enabled=true')
 const c=await claim(f)
 check('claim first attempt',c.mode,'first_attempt')
 check('second worker cannot take live lease',(await claim(f,otherWorker,B)).status,'unavailable')
 check('wrong worker fenced',(await api('begin_attempt',[f.plan.operationId,otherWorker,c.fence,f.manifest.plan.requestHash],B)).status,'fenced')
 await operator('UPDATE tll_inventory_private.control SET enabled=false')
 check('disabled leased attempt denied',(await begin(f,c)).status,'disabled')
 await operator('UPDATE tll_inventory_private.control SET enabled=true')
 check('durable attempt',(await begin(f,c)).status,'attempt_committed')
 check('duplicate attempt fenced',(await begin(f,c)).status,'fenced')
 const r=await reconcile(f,c)
 check('acknowledgement starts reconciliation',r.status,'reconciling')
 check('incorrect token fenced',(await finish(f,c,randomUUID(),'reconciled')).status,'fenced')
 check('fresh matching proof completes',(await finish(f,c,r.reconcile_token,'reconciled')).status,'completed')
 const uncertain=await prepared(90002);await enq(uncertain);const uc=await claim(uncertain);await begin(uncertain,uc);const ur=await reconcile(uncertain,uc,'unknown')
 check('unknown outcome cannot complete',(await finish(uncertain,uc,ur.reconcile_token,'reconciled')).status,'invalid')
 check('unknown outcome held',(await finish(uncertain,uc,ur.reconcile_token)).status,'held')
 check('operator cannot erase possibly-sent hold',(await api('cancel_never_attempted',[uncertain.plan.operationId,randomUUID()],OPERATOR)).status,'unavailable')
 const abandoned=await prepared(90003);await enq(abandoned);const ac=await claim(abandoned)
 await operator(`UPDATE tll_inventory_private.operations SET lease_until=clock_timestamp()-interval '1 second' WHERE operation_id=${sqlLiteral(abandoned.plan.operationId)}`)
 const recovered=await claim(abandoned,otherWorker,B)
 check('expired lease only admits reconciliation',[recovered.mode,recovered.fence,recovered.attempted],['reconcile_only','2',false])
 check('stale worker fenced',(await begin(abandoned,ac)).status,'fenced')
 check('recovered worker cannot dispatch',(await begin(abandoned,recovered,B)).status,'fenced')
 check('unsent recovery held',(await finish(abandoned,recovered,recovered.reconcile_token,'hold',B)).status,'held')
 check('operator cancels never-attempted held operation',(await api('cancel_never_attempted',[abandoned.plan.operationId,randomUUID()],OPERATOR)).status,'cancelled')
 for(const sql of[`UPDATE tll_inventory_private.operations SET request_hash=repeat('0',64) WHERE operation_id=${sqlLiteral(f.plan.operationId)}`,`DELETE FROM tll_inventory_private.operations WHERE operation_id=${sqlLiteral(f.plan.operationId)}`,`UPDATE tll_inventory_private.events SET event_name='forged'`,`DELETE FROM tll_inventory_private.events`]){
  await operator(`DO $immut$ BEGIN BEGIN EXECUTE ${sqlLiteral(sql)}; RAISE EXCEPTION 'Expected immutable evidence rejection'; EXCEPTION WHEN check_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM NOT IN('Append-only inventory events','Immutable inventory operation') THEN RAISE; END IF; END; END $immut$`)
 }
 check('both rebound immutable triggers reject updates/deletes')
 await operator('UPDATE tll_inventory_private.control SET enabled=false')
 await db.query('ROLLBACK')
}finally{await db.close()}
assert.equal(admin(snapshot),before,'Complete original fixture snapshot must survive the proof')
assert.equal(admin(`SELECT count(*) FROM pg_roles WHERE rolname IN(${[OWNER,WORKER,A,B,PROBE].map(sqlLiteral).join(',')})`),'0')
assert.equal(admin("SELECT count(*) FROM pg_namespace WHERE nspname='tll_staging_private'"),'0')
check('outer rollback restored all fixture catalog/row bytes and removed proof roles/history')
console.log(JSON.stringify({status:'PASS',checks,canonical004SHA256:digest(canonical),migration009SHA256:digest(migration),preservedOperations:12,preservedEvents:43,fixtureSnapshotSHA256:digest(before),rollbackOnly:true,hostedCalls:false,fullHostedBaselineExercised:false}))
