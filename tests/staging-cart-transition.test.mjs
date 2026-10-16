import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {build} from 'esbuild'
const bundle=await build({entryPoints:['lib/commerce/staging-cart-transition.ts'],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'})
const {createCartTransitionRepository,createCartTransitionService}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const binding={sourceSession:'1'.repeat(64),sourceActor:'2'.repeat(64),targetSession:'3'.repeat(64),targetActor:'4'.repeat(64)}
const row=(target=false,change={})=>({sessionHash:target?binding.targetSession:binding.sourceSession,actorHash:target?binding.targetActor:binding.sourceActor,
  revision:2,phase:'ready',envelope:{v:1,alg:'A256GCM',kid:'k',iv:'a'.repeat(16),tag:'b'.repeat(22),ciphertext:'cipher'},quantity:2,unitPricePence:1200,subtotalPence:2400,
  operationId:null,expiresAt:new Date(Date.now()+60000).toISOString(),...change})

test('repository uses three fixed committed RPCs and destroys uncertain connections',async()=>{
  const calls=[],released=[],request=randomUUID(),results=[
    {status:'absent',source:row(),target:null},{status:'claimed',source:row(false,{phase:'working',operationId:request}),target:null},{status:'reconciled',target:row(true)}]
  const pool={async connect(){return{async query(sql,args){calls.push([sql,args]);if(sql==='BEGIN'||sql==='COMMIT')return{rows:[]};return{rows:[{result:results.shift()}]}},release(d){released.push(d)}}}}
  const repo=createCartTransitionRepository({enabled:true,pool})
  assert.equal((await repo.read(binding)).status,'absent');assert.equal((await repo.claim(binding,request,2)).status,'claimed')
  assert.equal((await repo.finish(binding,request,row().envelope,row(false,{phase:'working',operationId:request}))).status,'reconciled')
  assert.deepEqual(calls.filter(([sql])=>sql.startsWith('SELECT')).map(([sql])=>sql.split('(')[0]),[
    'SELECT public.tll_cart_transition_read','SELECT public.tll_cart_transition_claim','SELECT public.tll_cart_transition_finish'])
  assert.deepEqual(released,[false,false,false])
  let count=0;const lost=createCartTransitionRepository({enabled:true,pool:{async connect(){return{async query(sql){if(sql==='COMMIT')throw Error('lost');count++;return sql==='BEGIN'?{rows:[]}:{rows:[{result:{status:'conflict'}}]}},release(d){assert.equal(d,true)}}}}})
  await assert.rejects(()=>lost.read(binding),/Staging cart unavailable/);assert.equal(count,2)
})

test('service rewraps known cart custody without a provider mutation',async()=>{
  const request=randomUUID(),source=row(false,{phase:'working',operationId:request}),events=[]
  const repository={async claim(received,id,revision){events.push(['claim',received,id,revision]);return{status:'claimed',source,target:null}},
    async finish(received,id,envelope,record){events.push(['finish',received,id,envelope,record]);return{status:'reconciled',target:row(true,{envelope})}},async read(){throw Error('unused')}}
  const vault={open(value,context){events.push(['open',value,context]);return{id:'gid://shopify/Cart/private'}},seal(value,context){events.push(['seal',value,context]);return row().envelope}}
  const service=createCartTransitionService({repository,vault,context:['project','shop','origin']})
  const result=await service.transfer(binding,request,2);assert.equal(result.status,'reconciled');assert.equal(result.target.actorHash,binding.targetActor)
  assert.deepEqual(events.map(([name])=>name),['claim','open','seal','finish'])
  assert.deepEqual(events[1][2].slice(-2),[binding.sourceSession,binding.sourceActor]);assert.deepEqual(events[2][2].slice(-2),[binding.targetSession,binding.targetActor])
})

test('conflict, held and already reconciled states do not rewrap or finish',async()=>{
  for(const status of ['conflict','held','reconciled']){let touched=0;const target=status==='reconciled'?row(true):null
    const service=createCartTransitionService({repository:{async claim(){return{status,source:status==='conflict'?null:row(),target}},async finish(){touched++;throw Error()},async read(){}},vault:{open(){touched++},seal(){touched++}},context:[]})
    const result=await service.transfer(binding,randomUUID(),2);assert.equal(result.status,status);assert.equal(touched,0)}
})

test('empty guest carts transfer with no vault operation',async()=>{
  const request=randomUUID(),source=row(false,{phase:'working',operationId:request,envelope:null,quantity:0,unitPricePence:null,subtotalPence:0});let finished
  const service=createCartTransitionService({repository:{async claim(){return{status:'claimed',source,target:null}},async finish(b,id,envelope){finished=envelope;return{status:'reconciled',target:row(true,{envelope:null,quantity:0,unitPricePence:null,subtotalPence:0})}},async read(){}},
    vault:{open(){throw Error('unexpected')},seal(){throw Error('unexpected')}},context:[]})
  assert.equal((await service.transfer(binding,request,2)).status,'reconciled');assert.equal(finished,null)
})
