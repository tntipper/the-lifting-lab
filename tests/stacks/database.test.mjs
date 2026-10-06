import test, { before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const container = process.env.TLL_STACK_TEST_CONTAINER ?? 'tll-stage0-postgres', database = 'tll_stack_test'
if (container !== 'tll-stage0-postgres' && !/^tll-stack-ci-postgres-[a-f0-9]{12}$/.test(container)) throw new Error('Invalid synthetic stack container')
const args = ['exec','-i',container,'psql','-X','-q','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-tA']
const sql = query => execFileSync('docker',args,{ input:query,encoding:'utf8',stdio:['pipe','pipe','pipe'] }).trim()
const U='22222222-2222-4222-8222-222222222222', LEGACY='11111111-1111-4111-8111-111111111111', CANON='d1111111-1111-4111-8111-111111111111'
const P=n=>'aaaaaaaa-aaaa-4aaa-8aaa-'+String(n).padStart(12,'0')
const quote=value=>"'"+value.replaceAll("'","''")+"'"
const as=(query,user=U)=>`set role authenticated; set request.jwt.claim.sub=${quote(user)}; ${query}`
const get=(user=U)=>JSON.parse(sql(as('select public.get_active_stack()',user)))
const command=({op='add',ids=[P(1)],id=randomUUID(),revision=null,servings=1,user=U}={})=>as(`select public.mutate_active_stack(${quote(op)},array[${ids.map(quote).join(',')}]::uuid[],${quote(id)}::uuid,${revision??'null'},${servings})`,user)
const call=options=>JSON.parse(sql(command(options)))
const concurrent=options=>new Promise((resolve,reject)=>{
 const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err=''
 child.stdout.on('data',v=>{out+=v});child.stderr.on('data',v=>{err+=v});child.on('error',reject);child.on('close',code=>code===0?resolve(JSON.parse(out.trim())):reject(new Error(err)));child.stdin.end(command(options))
})
const migration=readFileSync(new URL('../../supabase/migrations/202609150003_active_stack_integrity.sql',import.meta.url),'utf8')
before(()=>{
 const exists=execFileSync('docker',['exec',container,'psql','-X','-q','-U','postgres','-d','postgres','-tAc',"select 1 from pg_database where datname='tll_stack_test'"],{encoding:'utf8'}).trim()
 if(exists!=='1')execFileSync('docker',['exec',container,'createdb','-U','postgres',database])
 assert.equal(sql('select current_database()'),database)
 sql(readFileSync(new URL('./bootstrap.sql',import.meta.url),'utf8'))
 sql(migration)
})
beforeEach(()=>{sql(`delete from public.user_stacks where user_id='${U}';delete from tll_stack_private.mutation_receipts where user_id='${U}'`)})
test('duplicate repair preserves original rows, archives extra stacks, unions only unambiguous products',()=>{
 const snap=get(LEGACY)
 assert.equal(snap.stackId,CANON);assert.equal(snap.recoveryConflicts,2)
 assert.deepEqual(snap.items.map(i=>[i.product_id,i.servings_per_day]).sort(),[[P(1),2],[P(2),1]])
 assert.equal(sql(`select count(*) from public.user_stacks where user_id='${LEGACY}'`),'4')
 assert.equal(sql(`select count(*) from public.user_stacks where user_id='${LEGACY}' and is_active is true`),'1')
 assert.equal(sql('select count(*) from public.stack_products'),'7')
 assert.equal(sql("select sum(jsonb_array_length(before_items)) from tll_stack_private.repair_journal"),'5')
 assert.equal(sql("select bool_and(sp.servings_per_day is not distinct from (original->>'servings_per_day')::numeric) from tll_stack_private.repair_journal j cross join lateral jsonb_array_elements(j.before_items) original join public.stack_products sp on sp.id=(original->>'id')::uuid"),'t')
})
test('GET is read-only and returns no other user records for an empty account',()=>{
 const before=sql('select count(*) from public.user_stacks')
 for(let n=0;n<3;n++)assert.deepEqual(get(),{userId:U,stackId:null,revision:0,items:[],recoveryConflicts:0})
 assert.equal(sql('select count(*) from public.user_stacks'),before)
})
test('all direct browser mutation paths denied; each user can read only own stacks/items',()=>{
 for(const role of ['anon','authenticated'])for(const table of ['user_stacks','stack_products'])assert.equal(sql(`select has_table_privilege('${role}','public.${table}','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('${role}','public.${table}','INSERT,UPDATE,REFERENCES')`),'f')
 assert.equal(sql(as('select count(*) from public.user_stacks')),'0')
 assert.equal(sql(as('select count(*) from public.stack_products')),'0')
 assert.throws(()=>sql(as(`insert into public.user_stacks(user_id) values('${U}')`)))
 assert.throws(()=>sql(as(`update public.user_stacks set is_active=true where id='${CANON}'`)))
 assert.throws(()=>sql(as('delete from public.stack_products')))
 for(const role of ['anon','authenticated'])assert.throws(()=>sql(`set role ${role};select * from tll_stack_private.repair_journal`))
 assert.throws(()=>sql('set role anon;select public.get_active_stack()'))
 assert.throws(()=>sql('set role authenticated;select public.get_active_stack()'))
})
test('database singleton index also blocks privileged duplicate active inserts',()=>{
 assert.throws(()=>sql(`insert into public.user_stacks(user_id,is_active) values('${LEGACY}',true)`))
 assert.equal(sql('set role tll_stack_test_staff;select count(*) from public.user_stacks'),'4')
 assert.equal(sql("select has_table_privilege('service_role','public.user_stacks','INSERT,UPDATE,DELETE')"),'t')
})
test('simultaneous first-use adds create one active stack and lose no distinct products',async()=>{
 const responses=await Promise.all(Array.from({length:10},(_,n)=>concurrent({ids:[P(n+1)]})))
 assert.ok(responses.every(r=>r.status==='applied'))
 const snap=get();assert.equal(snap.items.length,10);assert.equal(snap.revision,10)
 assert.equal(sql(`select count(*) from public.user_stacks where user_id='${U}' and is_active is true`),'1')
})
test('same product and repeated request are idempotent across independent connections',async()=>{
 const id=randomUUID()
 const responses=await Promise.all(Array.from({length:8},()=>concurrent({id})))
 assert.equal(responses.filter(r=>r.duplicate).length,7)
 assert.equal(get().items.length,1);assert.equal(get().revision,1)
 assert.equal(sql(`select count(*) from tll_stack_private.mutation_receipts where user_id='${U}'`),'1')
 assert.equal(call({id,ids:[P(2)]}).status,'idempotency_conflict')
})
test('guest merge keeps stored servings and acknowledges only active product IDs',()=>{
 call({servings:3})
 const merged=call({op:'merge',ids:[P(1),P(2),P(12),P(99)]})
 assert.deepEqual(merged.acceptedIds,[P(1),P(2)])
 assert.deepEqual(merged.rejectedIds,[P(12),P(99)])
 assert.equal(merged.snapshot.items.find(i=>i.product_id===P(1)).servings_per_day,3)
 assert.equal(merged.snapshot.items.length,2)
})
test('stale clear cannot discard an intervening add from another device',()=>{
 const first=call({}).snapshot
 call({ids:[P(2)]})
 assert.equal(call({op:'clear',ids:[],revision:first.revision}).status,'conflict')
 assert.equal(get().items.length,2)
})
test('competing serving edits use compare-and-swap so one cannot overwrite the other',async()=>{
 const first=call({}).snapshot
 const responses=await Promise.all([concurrent({op:'servings',revision:first.revision,servings:2}),concurrent({op:'servings',revision:first.revision,servings:3})])
 assert.deepEqual(responses.map(r=>r.status).sort(),['applied','conflict'])
 assert.equal(get().revision,2);assert.ok([2,3].includes(get().items[0].servings_per_day))
})
test('replayed removal after a new add does not delete the newly saved item',()=>{
 const first=call({}).snapshot,id=randomUUID()
 assert.equal(call({op:'remove',id,revision:first.revision}).status,'applied')
 call({})
 const retry=call({op:'remove',id,revision:first.revision})
 assert.equal(retry.duplicate,true);assert.equal(retry.snapshot.items.length,1)
})
test('mutation derives owner from auth and cannot change the same product in another account',()=>{
 const before=get(LEGACY)
 call({op:'remove',revision:0})
 assert.deepEqual(get(LEGACY),before)
 const own=call({}).snapshot
 assert.notEqual(own.stackId,CANON)
 assert.equal(own.userId,U)
})
test('staff item edits increment revision and invalidate stale browser changes',()=>{
 const first=call({}).snapshot
 sql(`set role tll_stack_test_staff;update public.stack_products set servings_per_day=5 where stack_id='${first.stackId}'`)
 assert.equal(call({op:'remove',revision:first.revision}).status,'conflict')
 assert.equal(get().items[0].servings_per_day,5)
})
test('invalid operations and units fail without creating stacks or receipts',()=>{
 for(const input of [{op:'replace'},{op:'clear',ids:[]},{op:'add',ids:[]},{servings:0},{servings:11},{servings:1.5},{op:'merge',ids:[]}])assert.equal(call(input).status,'invalid')
 assert.equal(get().stackId,null)
 assert.equal(sql(`select count(*) from tll_stack_private.mutation_receipts where user_id='${U}'`),'0')
})
test('failed item insertion rolls back singleton creation, revision and request receipt',()=>{
 sql("alter table public.stack_products add constraint synthetic_stack_failure check(product_id<>'aaaaaaaa-aaaa-4aaa-8aaa-000000000009') not valid")
 try{assert.throws(()=>call({ids:[P(9)]}));assert.equal(get().stackId,null);assert.equal(sql(`select count(*) from tll_stack_private.mutation_receipts where user_id='${U}'`),'0')}
 finally{sql('alter table public.stack_products drop constraint synthetic_stack_failure')}
})
const removeBoundary="drop function public.mutate_active_stack(text,uuid[],uuid,bigint,numeric);drop function public.get_active_stack();drop trigger tll_stack_revision on public.stack_products;drop function public.bump_stack_revision();drop schema tll_stack_private cascade;drop index public.user_stacks_one_active_per_user;alter table public.user_stacks drop column revision;"
for(const scope of ['usage on schemas','select on tables'])test(`inherited default ${scope} rejects the full migration without exposing recovery data`,()=>{
 try{sql('begin;'+removeBoundary+`create role tll_stack_test_defaults nologin;grant tll_stack_test_defaults to anon;alter default privileges for role postgres grant ${scope} to tll_stack_test_defaults;`+migration);assert.fail('Expected default ACL rejection')}
 catch(error){assert.match(String(error.stderr),/Private stack (schema|table) privilege inherited/)}
 assert.equal(sql("select count(*) from pg_roles where rolname='tll_stack_test_defaults'"),'0')
 assert.equal(get(LEGACY).stackId,CANON)
 assert.throws(()=>sql('set role anon;select * from tll_stack_private.repair_journal'))
})
test('existing inherited column writes cause preflight rollback without changing shared roles',()=>{
 try{sql('begin;'+removeBoundary+"create role tll_stack_test_inherited nologin;grant tll_stack_test_inherited to authenticated;grant update(name) on public.user_stacks to tll_stack_test_inherited;"+migration);assert.fail('Expected inherited write rejection')}
 catch(error){assert.match(String(error.stderr),/Inherited stack privileges remain/)}
 assert.equal(sql("select count(*) from pg_roles where rolname='tll_stack_test_inherited'"),'0')
 assert.equal(get(LEGACY).items.length,2)
})
const rollback=readFileSync(new URL('../../docs/ops/active-stack-repair-rollback.sql',import.meta.url),'utf8').replace(/^begin;$/m,'').replace(/^commit;$/m,'').replace('-- set local tll.stack_repair_rollback','set local tll.stack_repair_rollback')
test('guarded repair reversal restores original contents and active flags while leaving browser writes closed',()=>{
 const result=sql('begin;'+rollback+"select (select count(*) from public.user_stacks where is_active is true)=3 and (select count(*) from public.stack_products)=6 and not has_table_privilege('authenticated','public.user_stacks','INSERT,UPDATE,DELETE') and not has_function_privilege('authenticated','public.mutate_active_stack(text,uuid[],uuid,bigint,numeric)','EXECUTE');rollback;")
 assert.equal(result,'t');assert.equal(get(LEGACY).items.length,2)
})
test('repair reversal refuses to remove newer customer changes',()=>{
 try{sql(`begin;insert into public.stack_products(stack_id,product_id) values('${CANON}','${P(5)}');`+rollback+'rollback;');assert.fail('Expected rollback refusal')}
 catch(error){assert.match(String(error.stderr),/Affected stacks changed after repair/)}
 assert.equal(get(LEGACY).items.length,2)
})
test('schema drift and absent unique item constraint fail before modification',()=>{
 try{sql('begin;'+removeBoundary+'alter table public.stack_products drop constraint stack_products_stack_id_product_id_key;'+migration);assert.fail('Expected missing uniqueness failure')}
 catch(error){assert.match(String(error.stderr),/Missing stack\/product unique index/)}
 try{sql('begin;'+removeBoundary+'alter table public.user_stacks add column unexpected text;'+migration);assert.fail('Expected schema drift failure')}
 catch(error){assert.match(String(error.stderr),/Stack schema drift/)}
 assert.equal(get(LEGACY).stackId,CANON)
})
test('non-superuser schema owner can migrate and the resulting RPC remains owner scoped',()=>{
 const setup='begin;'+removeBoundary+"create role tll_stack_test_migrator nologin nosuperuser;grant create on database tll_stack_test to tll_stack_test_migrator;alter schema public owner to tll_stack_test_migrator;alter table public.user_stacks owner to tll_stack_test_migrator;alter table public.stack_products owner to tll_stack_test_migrator;grant usage on schema auth,extensions to tll_stack_test_migrator;grant select on auth.users,public.products,public.product_nutrients to tll_stack_test_migrator;grant references on auth.users to tll_stack_test_migrator;set session authorization tll_stack_test_migrator;"
 const transaction=migration.replace(/^begin;$/m,'').replace(/^commit;$/m,'')
 const result=sql(setup+transaction+`reset session authorization;set role authenticated;set request.jwt.claim.sub='${U}';select public.get_active_stack()->>'userId';rollback;`)
 assert.equal(result,U)
 assert.equal(sql("select count(*) from pg_roles where rolname='tll_stack_test_migrator'"),'0')
})
test('uncertain or invalid archived serving amounts are preserved but never copied into the active stack',()=>{
 const setup='begin;'+removeBoundary+`update public.user_stacks set is_active=true where id='d2222222-2222-4222-8222-222222222222';insert into public.stack_products(stack_id,product_id,servings_per_day) values('d2222222-2222-4222-8222-222222222222','${P(7)}',null),('d2222222-2222-4222-8222-222222222222','${P(8)}','NaN');`
 const transaction=migration.replace(/^begin;$/m,'').replace(/^commit;$/m,'')
 assert.equal(sql(setup+transaction+`select (select count(*) from public.stack_products where product_id in ('${P(7)}','${P(8)}'))=2 and not exists(select 1 from public.stack_products where stack_id='${CANON}' and product_id in ('${P(7)}','${P(8)}'));rollback;`),'t')
})
test('repeat migration is deliberately refused and leaves the complete synthetic database unchanged',()=>{
 const dump=()=>execFileSync('docker',['exec',container,'pg_dump','-U','postgres','-d',database],{encoding:'utf8'}).split('\n').filter(line=>!/^\\(?:un)?restrict\b/.test(line)).join('\n')
 const before=dump()
 try{sql(migration);assert.fail('Expected replay guard')}catch(error){assert.match(String(error.stderr),/Stack migration exists or name collides/)}
 assert.equal(dump(),before)
})
test('inherited default function execution is rejected rather than leaving anonymous RPC access',()=>{
 try{sql('begin;'+removeBoundary+"create role tll_stack_test_execute nologin;grant tll_stack_test_execute to anon;alter default privileges for role postgres grant execute on functions to tll_stack_test_execute;"+migration);assert.fail('Expected inherited function rejection')}
 catch(error){assert.match(String(error.stderr),/Revision trigger execution inherited|Anonymous stack RPC execution inherited/)}
 assert.equal(sql("select count(*) from pg_roles where rolname='tll_stack_test_execute'"),'0')
})
