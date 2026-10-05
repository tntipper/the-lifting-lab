import test, {before, beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHmac,randomUUID} from 'node:crypto'
import {fixtureTarget} from './fixture.mjs'
const {container,database,origin}=fixtureTarget()
const U='22222222-2222-4222-8222-222222222222',V='11111111-1111-4111-8111-111111111111'
const P=n=>'aaaaaaaa-aaaa-4aaa-8aaa-'+String(n).padStart(12,'0')
const sql=q=>execFileSync('docker',['exec','-i',container,'psql','-X','-q','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-tA'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()
function jwt(user=U,role='authenticated'){
 const data=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({role,sub:user,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')
 return data+'.'+createHmac('sha256','tll-stack-synthetic-only-jwt-secret-000000').update(data).digest('base64url')
}
const request=(path,body,{method=body?'POST':'GET',user=U,role='authenticated'}={})=>fetch(origin+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt(user,role)},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)})
const mutate=async({op='add',ids=[P(1)],nonce=randomUUID(),revision=null,user=U}={})=>{
 const r=await request('/rpc/mutate_active_stack',{p_operation:op,p_product_ids:ids,p_request_id:nonce,p_expected_revision:revision,p_servings:1},{user});assert.equal(r.status,200);return r.json()
}
before(()=>assert.equal(sql('select current_database()'),'tll_stack_test'))
beforeEach(()=>sql(`delete from public.user_stacks where user_id='${U}';delete from tll_stack_private.mutation_receipts where user_id='${U}'`))
test('REST denies cumulative direct writes and anonymous RPCs',async()=>{
 for(const table of ['user_stacks','stack_products'])for(const method of ['POST','PATCH','DELETE']){
  const body=table==='user_stacks'?{user_id:U,name:'HTTP fixture',is_active:true}:{stack_id:randomUUID(),product_id:P(1)}
  const r=await request('/'+table+'?id=eq.'+randomUUID(),body,{method});assert.ok([401,403].includes(r.status),`${table} ${method}: ${r.status}`)
 }
 for(const fn of ['get_active_stack','mutate_active_stack']){
  const r=await request('/rpc/'+fn,fn==='get_active_stack'?{}:{p_operation:'add',p_product_ids:[P(1)],p_request_id:randomUUID()},{role:'anon'})
  assert.ok([401,403,404].includes(r.status))
 }
})
test('authenticated HTTP GET remains read-only and cannot expose another owner',async()=>{
 const r=await request('/rpc/get_active_stack');assert.equal(r.status,200)
 const s=await r.json();assert.equal(s.userId,U);assert.equal(s.stackId,null);assert.deepEqual(s.items,[])
 const own=await request('/user_stacks?select=id,user_id');assert.deepEqual(await own.json(),[])
 assert.equal(sql(`select count(*) from public.user_stacks where user_id='${U}'`),'0')
})
test('eight simultaneous HTTP saves produce one active stack with all eight products',async()=>{
 const results=await Promise.all(Array.from({length:8},(_,i)=>mutate({ids:[P(i+1)]})))
 assert.ok(results.every(r=>r.status==='applied'))
 const s=await (await request('/rpc/get_active_stack')).json();assert.equal(s.items.length,8);assert.equal(s.revision,8)
 assert.equal(sql(`select count(*) from public.user_stacks where user_id='${U}' and is_active is true`),'1')
})
test('concurrent HTTP nonce replay and stale clear preserve newer data',async()=>{
 const nonce=randomUUID(),results=await Promise.all(Array.from({length:5},()=>mutate({nonce})))
 assert.equal(results.filter(r=>r.duplicate).length,4)
 await mutate({ids:[P(2)]});const stale=await mutate({op:'clear',ids:[],revision:1})
 assert.equal(stale.status,'conflict');assert.equal(stale.snapshot.items.length,2)
})
test('HTTP cannot choose another user or stack through named RPC parameters',async()=>{
 const before=sql(`select count(*) from public.stack_products sp join public.user_stacks s on s.id=sp.stack_id where s.user_id='${V}'`)
 const r=await request('/rpc/mutate_active_stack',{p_operation:'clear',p_product_ids:[],p_request_id:randomUUID(),p_expected_revision:0,p_user_id:V})
 assert.equal(r.status,404)
 await mutate({op:'clear',ids:[],revision:0})
 assert.equal(sql(`select count(*) from public.stack_products sp join public.user_stacks s on s.id=sp.stack_id where s.user_id='${V}'`),before)
})
