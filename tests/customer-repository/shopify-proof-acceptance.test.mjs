import test,{before,beforeEach,after} from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {build} from 'esbuild'
import {admin,assertFixture,localPool,closeClients} from './local-pg.mjs'
import {createAesGcmEnvelopeVault} from '../../lib/identity/customer-token-vault.ts'

const bundle=await build({entryPoints:['lib/identity/customer-shopify-proof-repository.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'})
const {createCustomerShopifyProofRepository}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const SHOP='107532616020',ISSUER='https://shopify.com/authentication/'+SHOP,CONFIG='a'.repeat(64)
const hash=v=>createHash('sha256').update(v).digest('hex')
const callback='https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app/auth/customer/shopify/callback'
let vault,repo,verified=false
const fresh=(change={})=>{const now=Date.now(),verifier=randomBytes(32).toString('base64url');return{
 transactionId:randomUUID(),stateHash:hash(randomBytes(32)),configHash:CONFIG,callbackUrl:callback,
 innerPkceChallenge:createHash('sha256').update(verifier).digest('base64url'),verifier,
 nonce:randomBytes(32).toString('base64url'),createdAt:now,expiresAt:now+300000,...change}}
const receipt=(a,change={})=>{const now=Date.now();return{transactionId:a.transactionId,receiptId:randomUUID(),shopId:SHOP,issuer:ISSUER,
 subject:'gid://shopify/Customer/synthetic-1',innerPkceChallenge:a.innerPkceChallenge,verifiedAt:now,expiresAt:Math.min(a.expiresAt,now+240000),
 tokens:{accessToken:'SYNTHETIC_SECRET_access_'+randomUUID(),refreshToken:'SYNTHETIC_SECRET_refresh_'+randomUUID(),
  idToken:'SYNTHETIC_SECRET_id_'+randomUUID(),accessExpiresAt:now+3600000,scopes:['openid','email','customer-account-api:full'],
  originalNonce:a.nonce,scopeProvenance:{source:'token_response',requestedScope:'openid email customer-account-api:full',grantType:'authorization_code'},
  refreshTokenProvenance:{source:'token_response',grantType:'authorization_code'}},...change}}
const make=(pool=localPool())=>createCustomerShopifyProofRepository({pool,vault,syntheticExecution:true})
const state=id=>JSON.parse(admin(`SELECT json_build_object('state',state,'material',attempt_material IS NOT NULL,'tokens',tokens IS NOT NULL,'subject',subject) FROM tll_customer_private.shopify_proofs WHERE transaction_id='${id}'`))

before(()=>{assertFixture();verified=true;assert.equal(admin("SELECT to_regprocedure('tll_customer_private.shopify_proof_repository(text,jsonb)') IS NOT NULL"),'t');assert.equal(admin('SELECT enabled FROM tll_customer_private.control'),'f')})
beforeEach(()=>{vault?.destroy();admin('TRUNCATE tll_customer_private.shopify_proofs; UPDATE tll_customer_private.control SET enabled=true;');vault=createAesGcmEnvelopeVault({activeKeyId:'synthetic-proof',keys:new Map([['synthetic-proof',randomBytes(32)]])});repo=make()})
after(async()=>{if(!verified)return;admin('UPDATE tll_customer_private.control SET enabled=false; TRUNCATE tll_customer_private.shopify_proofs;');vault?.destroy();await closeClients();assert.equal(admin('SELECT enabled FROM tll_customer_private.control'),'f')})

test('restricted executor has operation access but no proof, token, table or sequence access',async()=>{
 for(const role of ['anon','authenticated','service_role','tll_customer_executor']){
  assert.equal(admin(`SELECT has_table_privilege('${role}','tll_customer_private.shopify_proofs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege('${role}','tll_customer_private.shopify_proofs','SELECT,INSERT,UPDATE,REFERENCES')`),'f')
  assert.equal(admin(`SELECT has_sequence_privilege('${role}','tll_customer_private.shopify_proof_fences','USAGE,SELECT,UPDATE')`),'f')
  assert.equal(admin(`SELECT has_function_privilege('${role}','tll_customer_private.shopify_proof_repository(text,jsonb)','EXECUTE')`),role==='tll_customer_executor'?'t':'f')
 }
})

test('one committed exchange yields only the exact public broker proof',async()=>{
 const a=fresh();assert.equal(await repo.createAttempt(a),true)
 const stored=admin(`SELECT row_to_json(x) FROM (SELECT * FROM tll_customer_private.shopify_proofs WHERE transaction_id='${a.transactionId}')x`)
 assert.doesNotMatch(stored,new RegExp([a.verifier,a.nonce].join('|')))
 const claim=await repo.claimAttempt({operationId:randomUUID(),transactionId:a.transactionId,stateHash:a.stateHash,configHash:a.configHash})
 assert.equal(claim.status,'claimed');assert.equal(claim.attempt.verifier,a.verifier);assert.equal(claim.attempt.nonce,a.nonce)
 assert.equal((await repo.claimAttempt({operationId:randomUUID(),transactionId:a.transactionId,stateHash:a.stateHash,configHash:a.configHash})).status,'rejected')
 const r=receipt(a);assert.equal(await repo.finishAttempt({transactionId:a.transactionId,stateHash:a.stateHash,fence:claim.fence,receipt:r}),true)
 assert.deepEqual(await repo.verifiedSubject(a.transactionId),Object.fromEntries(Object.entries(r).filter(([key])=>key!=='tokens')))
 const final=state(a.transactionId);assert.deepEqual(final,{state:'verified',material:false,tokens:true,subject:r.subject})
 const raw=admin(`SELECT row_to_json(x) FROM (SELECT * FROM tll_customer_private.shopify_proofs WHERE transaction_id='${a.transactionId}')x`)
 assert.doesNotMatch(raw,/SYNTHETIC_SECRET/)
})

test('mismatched verified proof cannot be substituted and quarantines the exchange',async()=>{
 const a=fresh();await repo.createAttempt(a);const claim=await repo.claimAttempt({operationId:randomUUID(),transactionId:a.transactionId,stateHash:a.stateHash,configHash:a.configHash})
 assert.equal(claim.status,'claimed')
 const wrong=receipt(a,{innerPkceChallenge:'z'.repeat(43)})
 assert.equal(await repo.finishAttempt({transactionId:a.transactionId,stateHash:a.stateHash,fence:claim.fence,receipt:wrong}),false)
 assert.deepEqual(state(a.transactionId),{state:'held',material:false,tokens:false,subject:null})
 assert.equal(await repo.verifiedSubject(a.transactionId),null)
})

test('lost create acknowledgement leaves a tombstone that blocks delayed replay',async()=>{
 const a=fresh(),faulted=make(localPool({fault:({op})=>op==='create'}))
 await assert.rejects(()=>faulted.createAttempt(a),/unavailable/)
 assert.equal(state(a.transactionId).state,'held')
 assert.equal(await repo.createAttempt(a),false)
})

test('lost claim and finish acknowledgements revoke the same transaction',async()=>{
 for(const phase of ['claim','finish']){
  admin('TRUNCATE tll_customer_private.shopify_proofs;')
  const a=fresh();await repo.createAttempt(a)
  if(phase==='claim'){
   const faulted=make(localPool({fault:({op})=>op==='claim'}))
   await assert.rejects(()=>faulted.claimAttempt({operationId:randomUUID(),transactionId:a.transactionId,stateHash:a.stateHash,configHash:a.configHash}),/unavailable/)
  }else{
   const claim=await repo.claimAttempt({operationId:randomUUID(),transactionId:a.transactionId,stateHash:a.stateHash,configHash:a.configHash});assert.equal(claim.status,'claimed')
   const faulted=make(localPool({fault:({op})=>op==='finish'}))
   await assert.rejects(()=>faulted.finishAttempt({transactionId:a.transactionId,stateHash:a.stateHash,fence:claim.fence,receipt:receipt(a)}),/unavailable/)
  }
  assert.deepEqual(state(a.transactionId),{state:'held',material:false,tokens:false,subject:null})
 }
})

test('disabled controls reject release operations while still permitting exact quarantine',async()=>{
 const a=fresh();await repo.createAttempt(a);admin('UPDATE tll_customer_private.control SET enabled=false;')
 assert.equal((await repo.claimAttempt({operationId:randomUUID(),transactionId:a.transactionId,stateHash:a.stateHash,configHash:a.configHash})).status,'rejected')
 assert.equal(await repo.verifiedSubject(a.transactionId),null)
 await repo.holdAttempt({transactionId:a.transactionId,stateHash:a.stateHash})
 assert.equal(state(a.transactionId).state,'held')
})
