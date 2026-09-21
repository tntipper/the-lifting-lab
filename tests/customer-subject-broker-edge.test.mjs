import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle=await build({entryPoints:['lib/identity/customer-subject-broker-edge.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'})
const {createCustomerSubjectBrokerEdgeHandler}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const SECRET='edge-broker-client-'+'s'.repeat(40),PASSWORD='edge-broker-database-'+'p'.repeat(40)
const env=Object.freeze({SUPABASE_URL:'https://qdmvngjwkcsilzmqksme.supabase.co',TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED:'true',
 TLL_STAGING_BROKER_DATABASE_PASSWORD:PASSWORD,TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET:SECRET,
 TLL_STAGING_POSTGRES_CA_PEM:'reviewed-ca-pem',TLL_STAGING_POSTGRES_CA_SHA256:'a'.repeat(64)})

function fixture(changes={}){
 const calls=[],pool=Object.freeze({marker:'pool'}),repository=Object.freeze({marker:'repository'});let closed=0
 const runtimeFactory=options=>{calls.push(['runtime',structuredClone(options)]);return{enabled:true,pool,async close(){closed++;if(changes.closeFailure)throw Error('private-close')}}}
 const repositoryFactory=options=>{calls.push(['repository',options]);return repository}
 const coreFactory=options=>{calls.push(['core',options]);return{
  async token(input){calls.push(['token',input]);if(changes.coreFailure)throw Error('private-core');return{status:200,headers:{'content-type':'application/json','cache-control':'no-store',pragma:'no-cache'},body:{access_token:'opaque-broker-bearer',token_type:'Bearer',expires_in:30,scope:'subject'},liveEnabled:false}},
  async userinfo(input){calls.push(['userinfo',input]);return{status:200,headers:{'content-type':'application/json','cache-control':'no-store',pragma:'no-cache'},body:{sub:'tllb_'+ 'a'.repeat(43)},liveEnabled:false}}
 }}
 return{calls,get closed(){return closed},make:(surface,environment=env)=>createCustomerSubjectBrokerEdgeHandler(surface,environment,{runtimeFactory,repositoryFactory,coreFactory})}
}
const tokenRequest=(body='grant_type=authorization_code&code=opaque')=>new Request('https://qdmvngjwkcsilzmqksme.supabase.co/functions/v1/tll-broker-token',{method:'POST',headers:{authorization:'Basic '+Buffer.from('client:secret').toString('base64'),'content-type':'application/x-www-form-urlencoded'},body})

test('disabled, foreign-project and malformed secrets fail before runtime construction',async()=>{
 for(const change of [{TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED:'false'},{SUPABASE_URL:'https://other.supabase.co'},
  {TLL_STAGING_BROKER_DATABASE_PASSWORD:'short'},{TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET:PASSWORD},
  {TLL_STAGING_POSTGRES_CA_PEM:undefined},{TLL_STAGING_POSTGRES_CA_SHA256:undefined},
  {TLL_STAGING_POSTGRES_CA_SHA256:'bad'}]){
  const f=fixture(),response=await f.make('token',{...env,...change})(tokenRequest());assert.equal(response.status,503);assert.equal(f.calls.length,0)
  assert.deepEqual(await response.json(),{error:'temporarily_unavailable'})
 }
})

test('token surface owns one restricted broker runtime and forwards only bounded protocol input',async()=>{
 const f=fixture(),handler=f.make('token'),response=await handler(tokenRequest())
 assert.equal(response.status,200);assert.equal(f.closed,1);assert.equal(response.headers.get('cache-control'),'no-store')
 const runtime=f.calls.find(([kind])=>kind==='runtime')[1];assert.deepEqual(runtime,{purpose:'broker',enabled:true,password:PASSWORD,tlsCa:{pem:'reviewed-ca-pem',sha256:'a'.repeat(64)}})
 const repository=f.calls.find(([kind])=>kind==='repository')[1];assert.equal(repository.pool.marker,'pool');assert.equal(repository.syntheticExecution,true);assert.equal(repository.liveEnabled,false)
 const core=f.calls.find(([kind])=>kind==='core')[1];assert.equal(core.clientSecret,SECRET);assert.equal(core.ports.repository.marker,'repository')
 const input=f.calls.find(([kind])=>kind==='token')[1];assert.equal(input.method,'POST');assert.equal(input.body,'grant_type=authorization_code&code=opaque')
 assert.match(input.headers.find(([name])=>name==='authorization')[1],/^Basic /)
 assert.doesNotMatch(JSON.stringify(await response.json()),/database|client-secret|private/i)
})

test('userinfo forwards method and bearer headers without reading a body',async()=>{
 const f=fixture(),response=await f.make('userinfo')(new Request('https://qdmvngjwkcsilzmqksme.supabase.co/functions/v1/tll-broker-userinfo',{headers:{authorization:'Bearer '+ 'b'.repeat(43)}}))
 assert.equal(response.status,200);assert.equal(f.closed,1);assert.deepEqual(Object.keys(await response.json()),['sub'])
 const input=f.calls.find(([kind])=>kind==='userinfo')[1];assert.equal(input.method,'GET');assert.match(input.headers.find(([name])=>name==='authorization')[1],/^Bearer /)
 assert.equal(f.calls.some(([kind])=>kind==='token'),false)
})

test('oversized bodies, core uncertainty and close failure expose only a fixed unavailable response',async t=>{
 for(const issue of ['oversized','core','close'])await t.test(issue,async()=>{const f=fixture({coreFailure:issue==='core',closeFailure:issue==='close'}),body=issue==='oversized'?'x'.repeat(4097):'grant_type=authorization_code'
  const response=await f.make('token')(tokenRequest(body));assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'temporarily_unavailable'})
  assert.doesNotMatch(JSON.stringify([...response.headers]),/private|password|secret/i);assert.equal(f.closed,1)
 })
})
