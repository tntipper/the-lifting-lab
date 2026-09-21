import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'

const bundle=await build({entryPoints:['lib/identity/customer-shopify-proof.ts'],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'})
const {createCustomerShopifyProofFlow,shopifyProofConfigHash}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const NOW=Date.parse('2026-09-18T15:00:00Z'),ORIGIN='https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app'
const TRANSACTION='a0000000-0000-4000-8000-000000000001',SHOP='107532616020'
const ISSUER='https://shopify.com/authentication/'+SHOP,CLIENT='63f474eda69ec32778ce2a99e8c1114f'
const SCOPE='openid email customer-account-api:full'
const config=(change={})=>{const c={applicationOrigin:ORIGIN,verification:null,...change};c.verification=change.verification===undefined?{evidenceId:'synthetic-reviewed-config',configHash:shopifyProofConfigHash(c),verifiedAt:NOW-1000,expiresAt:NOW+3600000}:change.verification;return c}
function repository(){
 const records=new Map()
 return{records,
  async createAttempt(a){if(records.has(a.transactionId))return false;records.set(a.transactionId,{state:'pending',attempt:structuredClone(a),fence:'1'});return true},
  async claimAttempt(i){const r=records.get(i.transactionId);if(!r||r.state!=='pending'||r.attempt.stateHash!==i.stateHash||r.attempt.configHash!==i.configHash)return{status:'rejected'};r.state='exchanging';r.fence='2';return{status:'claimed',attempt:structuredClone(r.attempt),fence:r.fence}},
  async finishAttempt(i){const r=records.get(i.transactionId);if(!r||r.state!=='exchanging'||r.fence!==i.fence||r.attempt.stateHash!==i.stateHash)return false;r.state='verified';r.receipt=structuredClone(i.receipt);return true},
  async verifiedSubject(id){const r=records.get(id);if(r?.state!=='verified')return null;const proof=structuredClone(r.receipt);delete proof.tokens;return proof},
  async holdAttempt(i){const r=records.get(i.transactionId);if(r&&r.attempt.stateHash===i.stateHash&&(!i.fence||i.fence===r.fence))r.state='held'},
 }
}
function fixture(options={}){
 let now=NOW,calls=0
 const repo=options.repository??repository()
 const ports={repository:repo,now:()=>now,
  async exchangeCode(){calls++;return{accessToken:'private-access',refreshToken:'private-refresh',idToken:'private-id-token',tokenType:'Bearer',expiresIn:3600,scope:SCOPE,scopeProvenance:{source:'token_response',requestedScope:SCOPE,grantType:'authorization_code'},refreshTokenProvenance:{source:'token_response',grantType:'authorization_code'}}},
  async verifyIdToken(_token,e){return{issuer:ISSUER,subject:'gid://shopify/Customer/123',audience:CLIENT,nonce:e.nonce,issuedAt:now-1000,expiresAt:now+3600000}},
  ...options.ports}
 const api=createCustomerShopifyProofFlow({config:options.config??config(),ports,syntheticExecution:options.syntheticExecution??true,liveEnabled:options.liveEnabled})
 return{api,repo,ports,calls:()=>calls,advance:v=>{now+=v}}
}
async function start(f){const result=await f.api.start({transactionId:TRANSACTION,transactionExpiresAt:NOW+300000});assert.equal(result.status,'authorization_ready');return result}
const callback=result=>{const u=new URL(result.authorizationUrl);return`${ORIGIN}/auth/customer/shopify/callback?state=${u.searchParams.get('state')}&code=synthetic-code`}
const noSecrets=value=>assert.doesNotMatch(JSON.stringify(value),/private-|gid:\/\/shopify|receipt|subject|verifier|idToken|accessToken|refreshToken/)

test('default/live execution and unverified configuration fail before persistence',async()=>{
 for(const options of [{syntheticExecution:false},{liveEnabled:true},{config:config({verification:null})},{config:config({applicationOrigin:'https://attacker.invalid'})}]){
  const f=fixture(options),result=await f.api.start({transactionId:TRANSACTION,transactionExpiresAt:NOW+300000})
  assert.equal(result.status,'held');assert.equal(f.repo.records.size,0);assert.equal(f.calls(),0)
 }
})

test('start commits independent state, nonce and PKCE before returning an exact authorization URL',async()=>{
 const f=fixture(),result=await start(f),u=new URL(result.authorizationUrl),attempt=f.repo.records.get(TRANSACTION).attempt
 assert.equal(u.origin+u.pathname,ISSUER+'/oauth/authorize');assert.equal(u.searchParams.get('client_id'),CLIENT)
 assert.equal(u.searchParams.get('scope'),SCOPE);assert.equal(u.searchParams.get('redirect_uri'),ORIGIN+'/auth/customer/shopify/callback')
 assert.equal(u.searchParams.get('response_type'),'code');assert.equal(u.searchParams.get('code_challenge_method'),'S256')
 assert.notEqual(u.searchParams.get('state'),attempt.nonce);assert.notEqual(attempt.verifier,attempt.nonce)
 assert.equal(u.searchParams.get('code_challenge'),attempt.innerPkceChallenge);assert.equal(result.authorizationUrl.includes(attempt.verifier),false)
 noSecrets(result)
})

test('exact callback commits provider tokens privately and returns no identity or credential',async()=>{
 const f=fixture(),begun=await start(f),result=await f.api.complete({transactionId:TRANSACTION,callbackUrl:callback(begun)})
 assert.deepEqual(result,{status:'verified',liveEnabled:false});noSecrets(result);assert.equal(f.calls(),1)
 const r=f.repo.records.get(TRANSACTION);assert.equal(r.state,'verified');assert.equal(r.receipt.subject,'gid://shopify/Customer/123')
 assert.equal(r.receipt.tokens.accessToken,'private-access');assert.equal(r.receipt.innerPkceChallenge,r.attempt.innerPkceChallenge)
 assert.deepEqual(await f.repo.verifiedSubject(TRANSACTION),Object.fromEntries(Object.entries(r.receipt).filter(([k])=>k!=='tokens')))
})

test('callback target, parameter and state substitutions fail before an exchange',async()=>{
 const variants=[
  u=>u.replace(ORIGIN,'https://attacker.invalid'),u=>u+'&state=duplicate',u=>u+'#fragment',u=>u+'&extra=x',
  u=>u.replace('state=','state=x'),u=>u.replace('&code=synthetic-code',''),u=>u.replace('code=synthetic-code','error=access_denied&error_description=private-token'),
 ]
 for(const change of variants){const f=fixture(),begun=await start(f),result=await f.api.complete({transactionId:TRANSACTION,callbackUrl:change(callback(begun))});assert.equal(result.status,'held');assert.equal(f.calls(),0);noSecrets(result)}
})

test('provider cancellation consumes and quarantines the exact attempt',async()=>{
 const f=fixture(),begun=await start(f),url=callback(begun).replace('code=synthetic-code','error=access_denied&error_description=private-token')
 assert.equal((await f.api.complete({transactionId:TRANSACTION,callbackUrl:url})).status,'held')
 assert.equal(f.repo.records.get(TRANSACTION).state,'held');assert.equal((await f.api.complete({transactionId:TRANSACTION,callbackUrl:callback(begun)})).status,'held');assert.equal(f.calls(),0)
})

for(const change of [{accessToken:''},{refreshToken:''},{idToken:undefined},{tokenType:'MAC'},{expiresIn:0},{expiresIn:86401},{scope:'openid email'},{scope:SCOPE+' customer-account-mcp-api:full'},
 {scopeProvenance:{source:'unchanged_request',requestedScope:'admin',grantType:'authorization_code'}},{refreshTokenProvenance:{source:'retained_original',grantType:'refresh_token',previousTokenHash:'a'.repeat(64)}}]){
 test(`malformed or over-scoped exchange is quarantined: ${JSON.stringify(change)}`,async()=>{
  const f=fixture({ports:{async exchangeCode(i){f.exchangeInput=i;return{accessToken:'private-access',refreshToken:'private-refresh',idToken:'private-id-token',tokenType:'Bearer',expiresIn:3600,scope:SCOPE,scopeProvenance:{source:'token_response',requestedScope:SCOPE,grantType:'authorization_code'},refreshTokenProvenance:{source:'token_response',grantType:'authorization_code'},...change}}}}),begun=await start(f)
  assert.equal((await f.api.complete({transactionId:TRANSACTION,callbackUrl:callback(begun)})).status,'held');assert.equal(f.repo.records.get(TRANSACTION).state,'held')
 })
}

for(const change of [{issuer:'https://attacker.invalid'},{audience:'wrong'},{nonce:'wrong'},{subject:''},{issuedAt:NOW+1},{expiresAt:NOW}]){
 test(`invalid signed identity projection is quarantined: ${JSON.stringify(change)}`,async()=>{
  const f=fixture({ports:{async verifyIdToken(_token,e){return{issuer:ISSUER,subject:'gid://shopify/Customer/123',audience:CLIENT,nonce:e.nonce,issuedAt:NOW-1000,expiresAt:NOW+3600000,...change}}}}),begun=await start(f)
  assert.equal((await f.api.complete({transactionId:TRANSACTION,callbackUrl:callback(begun)})).status,'held');assert.equal(f.repo.records.get(TRANSACTION).state,'held')
 })
}

test('callback replay and concurrent completion permit one exchange only',async()=>{
 const f=fixture(),begun=await start(f),url=callback(begun)
 const results=await Promise.all([f.api.complete({transactionId:TRANSACTION,callbackUrl:url}),f.api.complete({transactionId:TRANSACTION,callbackUrl:url})])
 assert.equal(results.filter(r=>r.status==='verified').length,1);assert.equal(results.filter(r=>r.status==='held').length,1);assert.equal(f.calls(),1)
 assert.equal((await f.api.complete({transactionId:TRANSACTION,callbackUrl:url})).status,'held');assert.equal(f.calls(),1)
})

test('exchange or durable-finish uncertainty never retries and leaves the flow held',async()=>{
 for(const phase of ['exchange','finish']){
  const repo=repository(),original=repo.finishAttempt
  if(phase==='finish')repo.finishAttempt=async i=>{await original.call(repo,i);throw Error('private-token')}
  const f=fixture({repository:repo,ports:phase==='exchange'?{async exchangeCode(){throw Error('private-token')}}:{}}),begun=await start(f),url=callback(begun)
  const result=await f.api.complete({transactionId:TRANSACTION,callbackUrl:url});assert.equal(result.status,'held');noSecrets(result)
  assert.equal(repo.records.get(TRANSACTION).state,'held');assert.equal((await f.api.complete({transactionId:TRANSACTION,callbackUrl:url})).status,'held')
 }
})

test('expiry during verification prevents proof commitment',async()=>{
 const f=fixture({ports:{async verifyIdToken(_token,e){f.advance(300001);return{issuer:ISSUER,subject:'gid://shopify/Customer/123',audience:CLIENT,nonce:e.nonce,issuedAt:NOW-1000,expiresAt:NOW+3600000}}}}),begun=await start(f)
 assert.equal((await f.api.complete({transactionId:TRANSACTION,callbackUrl:callback(begun)})).status,'held');assert.equal(f.repo.records.get(TRANSACTION).state,'held')
})
