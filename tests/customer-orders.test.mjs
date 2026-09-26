import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundle=await build({entryPoints:['lib/identity/customer-orders.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'})
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const token='private_customer_access_token_'+ 'x'.repeat(40)
const valid=(change={})=>({data:{customer:{orders:{nodes:[{name:'#1001',createdAt:'2026-09-18T10:30:00Z',financialStatus:'PAID',fulfillmentStatus:'UNFULFILLED',
  totalPrice:{amount:'24.50',currencyCode:'GBP'},lineItems:{nodes:[{name:'Synthetic whey',quantity:2}],pageInfo:{hasNextPage:false}},...change}],pageInfo:{hasNextPage:false}}}}})
const response=(value,init={})=>new Response(typeof value==='string'?value:JSON.stringify(value),{status:init.status??200,headers:{'content-type':'application/json',...init.headers}})

test('fixed read-only request returns only the bounded order projection',async()=>{
  let request
  const reader=api.createCustomerOrdersReader({enabled:true,transport:async input=>{request=input;return response(valid())}})
  const result=await reader.read(token)
  assert.deepEqual(result,{orders:[{reference:'#1001',createdAt:'2026-09-18T10:30:00Z',financialStatus:'PAID',fulfillmentStatus:'UNFULFILLED',totalPence:2450,currency:'GBP',items:[{name:'Synthetic whey',quantity:2}],hasMoreItems:false}],hasMoreOrders:false})
  assert.equal(request.url,api.CUSTOMER_ORDERS_URL);assert.equal(request.method,'POST');assert.equal(request.headers.authorization,`Bearer ${token}`)
  const body=JSON.parse(request.body);assert.match(body.query,/orders\(first: 10, reverse: true\)/);assert.doesNotMatch(body.query,/email|address|phone|payment|mutation/i)
  assert.equal(JSON.stringify(result).includes(token),false);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.orders)&&Object.isFrozen(result.orders[0]))
})

test('disabled and malformed tokens stop before transport',async()=>{
  let calls=0;const transport=async()=>{calls++;return response(valid())}
  for(const [enabled,value] of [[false,token],[true,''],[true,'bad token'],[true,'x'.repeat(32769)]])await assert.rejects(
    api.createCustomerOrdersReader({enabled,transport}).read(value),e=>e.code==='CUSTOMER_ORDERS_HELD'&&e.outcome==='not_attempted')
  assert.equal(calls,0)
})

test('provider errors, redirects, malformed data and unsafe money fail closed without token disclosure',async()=>{
  const cases=[response({errors:[{message:'private'}],data:null}),response(valid(),{status:401}),response(valid(),{status:302}),response('{'),
    response(valid({totalPrice:{amount:'24.501',currencyCode:'GBP'}})),response(valid({totalPrice:{amount:'24.50',currencyCode:'USD'}})),
    response(valid({fulfillmentStatus:'NEW_STATUS'})),response(valid({lineItems:{nodes:Array(11).fill({name:'x',quantity:1}),pageInfo:{hasNextPage:true}}}))]
  for(const item of cases){const reader=api.createCustomerOrdersReader({enabled:true,transport:async()=>item});await assert.rejects(reader.read(token),e=>{
    assert.equal(e.code,'CUSTOMER_ORDERS_HELD');assert.equal(e.outcome,'uncertain');assert.equal(e.message.includes(token),false);return true})}
})

test('body limit, invalid UTF8 and total deadline are bounded',async()=>{
  for(const item of [response(' '.repeat(65537)),new Response(new Uint8Array([255]),{headers:{'content-type':'application/json'}})]){
    await assert.rejects(api.createCustomerOrdersReader({enabled:true,transport:async()=>item}).read(token),/Customer orders unavailable/)
  }
  let aborted=false
  await assert.rejects(api.createCustomerOrdersReader({enabled:true,timeoutMs:50,transport:input=>new Promise((_resolve,reject)=>input.signal.addEventListener('abort',()=>{aborted=true;reject(Error())}))}).read(token))
  assert.equal(aborted,true)
})
