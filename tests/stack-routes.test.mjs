import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import vm from 'node:vm'
import {randomUUID} from 'node:crypto'
const require=createRequire(import.meta.url),ts=require('typescript')
const U='22222222-2222-4222-8222-222222222222',P='aaaaaaaa-aaaa-4aaa-8aaa-000000000001',S='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const snapshot={userId:U,stackId:S,revision:1,items:[{id:P,product_id:P,servings_per_day:1,products:{id:P}}],recoveryConflicts:0}
function fixture({signedIn=true,providerError=false,outcome={status:'applied',snapshot,acceptedIds:[P],rejectedIds:[]}}={}){
 const calls=[],awards=[],cache=new Map()
 const supabase={auth:{getUser:async()=>({data:{user:signedIn?{id:U}:null},error:null})},rpc:async(name,args)=>{calls.push({name,args});return{data:name==='get_active_stack'?snapshot:outcome,error:providerError?{message:'PRIVATE provider detail'}:null}}}
 function load(relative){
  if(cache.has(relative))return cache.get(relative)
  const filename=fileURLToPath(new URL('../'+relative,import.meta.url)),mod={exports:{}}
  const out=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const localRequire=name=>name==='@/lib/supabase-server'?{createServerSupabase:async()=>supabase}:name==='@/lib/points'?{awardPoints:async(...args)=>{awards.push(args.slice(1));return 10}}:name.startsWith('@/lib/')?load(name.slice(2)+'.ts'):require(name)
  vm.runInThisContext(`(function(require,module,exports){${out}\n})`,{filename})(localRequire,mod,mod.exports);cache.set(relative,mod.exports);return mod.exports
 }
 return{routes:load('app/api/stack/route.ts'),parser:load('lib/stack-api.ts'),calls,awards}
}
const request=(method,body,headers={})=>new Request('https://fixture.test/api/stack',{method,headers:{'content-type':'application/json','idempotency-key':randomUUID(),...headers},body:typeof body==='string'?body:JSON.stringify(body)})
test('GET performs only the read RPC and never creates a stack',async()=>{
 const f=fixture();const response=await f.routes.GET()
 assert.equal(response.status,200);assert.deepEqual(await response.json(),snapshot)
 assert.deepEqual(f.calls,[{name:'get_active_stack',args:undefined}]);assert.equal(response.headers.get('cache-control'),'private, no-store')
})
test('missing authentication and provider failure cannot look like a saved empty stack',async()=>{
 for(const method of ['GET','POST','DELETE','PATCH']){
  const f=fixture({signedIn:false});const response=await f.routes[method](method==='GET'?undefined:request(method,{productId:P}))
  assert.equal(response.status,401);assert.equal(f.calls.length,0)
 }
 const f=fixture({providerError:true});const response=await f.routes.GET();assert.equal(response.status,503);assert.equal((await response.text()).includes('PRIVATE'),false)
})
test('POST add and guest merge invoke one atomic RPC using only validated product identities',async()=>{
 const f=fixture(),id=randomUUID();assert.equal((await f.routes.POST(request('POST',{productId:P},{'idempotency-key':id}))).status,200)
 assert.deepEqual(f.calls[0],{name:'mutate_active_stack',args:{p_operation:'add',p_product_ids:[P],p_request_id:id,p_expected_revision:null,p_servings:1}})
 assert.equal((await f.routes.POST(request('POST',{productIds:[P.toUpperCase(),P]}))).status,200)
 assert.deepEqual(f.calls[1].args.p_product_ids,[P]);assert.equal(f.calls[1].args.p_operation,'merge')
})
for(const [method,body] of [['POST',{productId:P,userId:U}],['POST',{productId:P,servingsPerDay:'2'}],['POST',{productId:P,servingsPerDay:0}],['POST',{productIds:[null]}],['DELETE',{productId:P}],['DELETE',{clear:true,expectedRevision:-1}],['PATCH',{productId:P,servingsPerDay:3,expectedRevision:Infinity}]])test(`invalid ${method} mutation never reaches a data RPC: ${JSON.stringify(body)}`,async()=>{
 const f=fixture();assert.equal((await f.routes[method](request(method,body))).status,400);assert.equal(f.calls.length,0)
})
test('request body and nonce limits reject malformed, oversized and sparse inputs',async()=>{
 const f=fixture()
 assert.equal((await f.routes.POST(request('POST',{productId:P},{'idempotency-key':'bad'}))).status,400)
 assert.equal((await f.routes.POST(request('POST','{'))).status,400)
 assert.equal((await f.routes.POST(request('POST','x'.repeat(8193)))).status,413)
 assert.equal((await f.routes.POST(request('POST',{}, {'content-type':'text/plain'}))).status,415)
 assert.equal(f.parser.parseStackOperation('POST',{productIds:Array(1)},randomUUID()),null)
 assert.equal(f.calls.length,0)
})
test('destructive mutations carry the expected revision and never use a client owner ID',async()=>{
 const f=fixture()
 await f.routes.DELETE(request('DELETE',{productId:P,expectedRevision:7}))
 await f.routes.DELETE(request('DELETE',{clear:true,expectedRevision:8}))
 await f.routes.PATCH(request('PATCH',{productId:P,servingsPerDay:3,expectedRevision:9}))
 assert.deepEqual(f.calls.map(c=>[c.args.p_operation,c.args.p_expected_revision]),[['remove',7],['clear',8],['servings',9]])
 assert.equal(f.calls.some(c=>'p_user_id' in c.args),false)
})
for(const [status,expected] of [['conflict',409],['idempotency_conflict',409],['not_found',404],['invalid',400]])test(`database ${status} is an honest HTTP ${expected}`,async()=>{
 const f=fixture({outcome:{status,snapshot}});assert.equal((await f.routes.POST(request('POST',{productId:P}))).status,expected);assert.equal(f.awards.length,0)
})
test('reward evidence uses the verified returned stack only after a successful additive mutation',async()=>{
 const f=fixture({outcome:{status:'applied',snapshot:{...snapshot,items:[{},{},{}]}}})
 assert.equal((await f.routes.POST(request('POST',{productId:P}))).status,200)
 assert.deepEqual(f.awards,[['build_stack',S]])
})
