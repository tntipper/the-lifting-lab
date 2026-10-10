import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundle=await build({entryPoints:['lib/identity/customer-account-operations.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'})
const {createCustomerAccountOperations}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const USER='70000000-0000-4000-8000-000000000001',SESSION='80000000-0000-4000-8000-000000000001',RECEIPT='90000000-0000-4000-8000-000000000001'
const NOW=Date.parse('2026-09-18T18:00:00Z'), TOKEN='private_token_'+ 'x'.repeat(40)
const proof=(change={})=>({userId:USER,sessionId:SESSION,issuer:'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1',audience:'authenticated',anonymous:false,authenticatedAt:NOW-1000,checkedAt:NOW,expiresAt:NOW+60000,...change})
const orders={orders:[{reference:'#1001',createdAt:'2026-09-18T10:00:00Z',financialStatus:'PAID',fulfillmentStatus:'UNFULFILLED',totalPence:1000,currency:'GBP',items:[],hasMoreItems:false}],hasMoreOrders:false}
function fixture(changes={}){const events=[],sessions=[proof(),proof()]
  const repository={async claimOrders(i){events.push(['claim',i]);return{status:'claimed',operationId:i.operationId,fence:'1',owner:{userId:i.userId,sessionId:i.sessionId},receiptId:RECEIPT,accessToken:TOKEN,accessExpiresAt:NOW+30000}},
    async finishOrders(i){events.push(['finish',i]);return changes.finish!==false},async holdOrders(i){events.push(['hold',i])}}
  const api=createCustomerAccountOperations({repository,orders:{async read(token){events.push(['read',token]);if(changes.readError)throw Error('secret');return orders}},
    currentSession:async()=>sessions.shift()??null,now:()=>NOW,syntheticExecution:true,...changes.options})
  return{api,events,sessions}}

test('orders release only after the same current session and acknowledged finish',async()=>{const f=fixture();assert.deepEqual(await f.api.readOrders(),orders)
  assert.deepEqual(f.events.map(e=>e[0]),['claim','read','finish']);assert.equal(f.events[1][1],TOKEN);assert.equal(JSON.stringify(await f.api.readOrders().catch(e=>e)).includes(TOKEN),false)})
test('changed account or session holds the exact claim and releases no projection',async()=>{for(const change of [{userId:'70000000-0000-4000-8000-000000000002'},{sessionId:'80000000-0000-4000-8000-000000000002'}]){
  const f=fixture();f.sessions[1]=proof(change);await assert.rejects(f.api.readOrders(),/unavailable/);assert.deepEqual(f.events.map(e=>e[0]),['claim','read','hold'])}})
test('provider failure or lost finish acknowledgement holds and redacts token details',async()=>{for(const changes of [{readError:true},{finish:false}]){const f=fixture(changes)
  await assert.rejects(f.api.readOrders(),e=>{assert.equal(e.message,'Customer account operation unavailable');assert.equal(e.message.includes(TOKEN),false);return true});assert.equal(f.events.at(-1)[0],'hold')}})
test('disabled coordinator and absent current session touch no repository or provider',async()=>{for(const options of [{syntheticExecution:false},{liveEnabled:true}]){const f=fixture({options});await assert.rejects(f.api.readOrders());assert.deepEqual(f.events,[])}
  const f=fixture();f.sessions.splice(0);await assert.rejects(f.api.readOrders());assert.deepEqual(f.events,[])
  const stale=fixture();stale.sessions[0]=proof({checkedAt:NOW-10000});await assert.rejects(stale.api.readOrders());assert.deepEqual(stale.events,[])})
