import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createGuestStore } from '../lib/local-stack.ts'
import { createStackSync } from '../lib/stack-sync.ts'
const U='22222222-2222-4222-8222-222222222222', V='33333333-3333-4333-8333-333333333333'
const P='aaaaaaaa-aaaa-4aaa-8aaa-000000000001', Q='aaaaaaaa-aaaa-4aaa-8aaa-000000000002'
const product=(id=P)=>({id,name:'Synthetic',brand:'Fixture',category:'creatine',score:null})
const item=(id=P,servings=1)=>({id:randomUUID(),product_id:id,servings_per_day:servings,products:product(id)})
const snap=(items=[],revision=0,userId=U)=>({userId,stackId:items.length?'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb':null,revision,items,recoveryConflicts:0})
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
const applied=(snapshot,acceptedIds=[],rejectedIds=[])=>response({status:'applied',snapshot,acceptedIds,rejectedIds})
function storage(){const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),m}}
function fixture(request=async()=>response(snap())){
 const data=storage(), guest=createGuestStore(data,randomUUID), states=[],calls=[]
 const service=createStackSync({guest,nonce:randomUUID,request:async(url,options)=>{calls.push([url,options]);return request(url,options)},changed:s=>states.push(s)})
 return{data,guest,states,calls,service}
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}}

test('independent guest tab additions survive because there is no shared array overwrite',()=>{
 const data=storage(),a=createGuestStore(data,randomUUID),b=createGuestStore(data,randomUUID)
 a.add(product());b.add(product(Q));assert.deepEqual(new Set(a.read().map(r=>r.product.id)),new Set([P,Q]))
})
test('late acknowledgement cannot delete a product re-added with a new token',()=>{
 const data=storage(),a=createGuestStore(data,randomUUID),b=createGuestStore(data,randomUUID)
 a.add(product());const request=a.read();b.remove(P);b.add(product());a.acknowledge(request)
 assert.equal(a.read().length,1);assert.notEqual(a.read()[0].token,request[0].token)
})
test('legacy items survive migration, acknowledged legacy items stay removed, malformed values stay untouched',()=>{
 const data=storage();data.setItem('tll_stack_v1',JSON.stringify([product(),null,{id:'bad'}]));const guest=createGuestStore(data,randomUUID)
 assert.equal(guest.read().length,1);guest.clear();assert.equal(guest.read().length,0)
 assert.equal(JSON.parse(data.getItem('tll_stack_v1')).length,3);guest.add(product());assert.equal(guest.read().length,1)
})
test('guest save storage failures cannot be presented as success',async()=>{
 const broken={get length(){return 0},key:()=>null,getItem:()=>null,setItem:()=>{throw new Error('Storage full')}}
 const service=createStackSync({guest:createGuestStore(broken,randomUUID),nonce:randomUUID,request:fetch,changed:()=>{}})
 await service.setIdentity(null);await service.add(product());assert.equal(service.getState().guest.length,0);assert.match(service.getState().error,/Storage full/)
})
for(const failure of ['network','http500','invalid-body','wrong-owner'])test(`failed ${failure} guest merge retains every local item`,async()=>{
 const f=fixture(async(_url,options)=>{
  if(!options.method)return response(snap())
  if(failure==='network')throw new Error('offline')
  if(failure==='http500')return response({error:'failed'},500)
  if(failure==='invalid-body')return response({status:'applied',snapshot:snap([item()]),acceptedIds:null})
  return applied(snap([item()],1,V),[P])
 });f.guest.add(product());await f.service.setIdentity(U)
 assert.equal(f.guest.read().length,1);assert.equal(f.service.getState().retryable,true);assert.match(f.service.getState().error,/kept/)
})
test('partial guest acknowledgement removes only accepted records and preserves existing servings',async()=>{
 const f=fixture(async(_url,o)=>o.method?applied(snap([item(P,3)],1),[P],[Q]):response(snap([item(P,3)],1)))
 f.guest.add(product());f.guest.add(product(Q));await f.service.setIdentity(U)
 assert.deepEqual(f.guest.read().map(r=>r.product.id),[Q]);assert.equal(f.service.getState().snapshot.items[0].servings_per_day,3)
 assert.match(f.service.getState().error,/unavailable/)
})
test('a successful request acknowledges its captured token only, keeping a later tab save',async()=>{
 const hold=deferred(),f=fixture(async(_url,o)=>o.method?hold.promise:response(snap()))
 f.guest.add(product());const signIn=f.service.setIdentity(U);await new Promise(setImmediate)
 f.guest.remove(P);f.guest.add(product());hold.resolve(applied(snap([item()],1),[P]));await signIn
 assert.equal(f.guest.read().length,1)
})
test('identity change discards a late previous-account response and its guest acknowledgement',async()=>{
 const hold=deferred();let gets=0
 const f=fixture(async(_url,o)=>o.method?hold.promise:response(snap([],0,++gets===1?U:V)))
 f.guest.add(product());const first=f.service.setIdentity(U);await new Promise(setImmediate)
 const logout=f.service.setIdentity(null);hold.resolve(applied(snap([item()],1),[P]));await first;await logout
 assert.equal(f.service.getState().identity,null);assert.equal(f.service.getState().snapshot,null);assert.equal(f.guest.read().length,1)
})
test('signed-in hydration loads the same snapshot used by all provider consumers without a write',async()=>{
 const f=fixture(async()=>response(snap([item(P,4),item(Q)],7)))
 await f.service.setIdentity(U);assert.equal(f.service.getState().snapshot.items.length,2)
 assert.equal(f.calls.length,1);assert.equal(f.calls[0][1].method,undefined)
})
test('stale destructive change adopts current snapshot and requires review, never automatic retry',async()=>{
 const f=fixture(async(_url,o)=>o.method?response({snapshot:snap([item(),item(Q)],3)},409):response(snap([item()],1)))
 await f.service.setIdentity(U);await f.service.clear()
 assert.equal(f.service.getState().snapshot.revision,3);assert.equal(f.service.getState().retryable,false);assert.match(f.service.getState().error,/Review/)
 assert.equal(JSON.parse(f.calls[1][1].body).expectedRevision,1)
})
test('uncertain removal retry reuses exact nonce and payload after intervening refresh',async()=>{
 let writes=0
 const f=fixture(async(_url,o)=>{if(!o.method)return response(snap([item()],writes?9:1));if(++writes===1)throw new Error('response lost');return applied(snap([item()],9))})
 await f.service.setIdentity(U);await f.service.remove(P);await f.service.refresh();await f.service.retry()
 const attempts=f.calls.filter(([,o])=>o.method).map(([,o])=>o)
 assert.equal(attempts.length,2);assert.equal(attempts[0].body,attempts[1].body);assert.equal(attempts[0].headers['Idempotency-Key'],attempts[1].headers['Idempotency-Key'])
 assert.equal(f.service.getState().snapshot.revision,9);assert.equal(f.service.getState().snapshot.items.length,1)
})
test('unconfirmed merge blocks a remove that would otherwise be undone by a retry',async()=>{
 const f=fixture(async(_url,o)=>o.method?response({},503):response(snap()))
 f.guest.add(product());await f.service.setIdentity(U);await f.service.remove(P)
 assert.equal(f.guest.read().length,1);assert.equal(f.calls.length,2)
})
test('unresolved authentication does not write guest records or send account requests',async()=>{
 const f=fixture();await f.service.add(product());assert.equal(f.guest.read().length,0);assert.equal(f.calls.length,0);assert.match(f.service.getState().error,/Sign-in/)
})
test('disposal suppresses late notifications and acknowledgements',async()=>{
 const hold=deferred(),f=fixture(async(_u,o)=>o.method?hold.promise:response(snap()));f.guest.add(product())
 const work=f.service.setIdentity(U);await new Promise(setImmediate);f.service.dispose();const count=f.states.length
 hold.resolve(applied(snap([item()],1),[P]));await work
 assert.equal(f.states.length,count);assert.equal(f.guest.read().length,1)
})
test('an acknowledgement without the product in the confirmed snapshot keeps the guest record',async()=>{
 const f=fixture(async(_url,o)=>o.method?applied(snap(),[P]):response(snap()))
 f.guest.add(product());await f.service.setIdentity(U);assert.equal(f.guest.read().length,1);assert.equal(f.service.getState().retryable,true)
})
test('single active stack invalid servings are unresolved, never replaced with a default dose',async()=>{
 const {analysisServings}=await import('../lib/stack-sync.ts')
 for(const value of [null,0,-1,11,1.5,NaN,Infinity,'NaN','2',''])assert.equal(analysisServings(snap([item(P,value)]),P),null)
 assert.equal(analysisServings(snap([item(P,3)]),P),3)
 assert.equal(analysisServings(null,P),1)
})
