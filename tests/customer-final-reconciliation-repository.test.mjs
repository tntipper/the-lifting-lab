import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createHash, randomUUID } from 'node:crypto'
const bundle=await build({stdin:{contents:"export * from './lib/identity/customer-final-reconciliation-repository.ts';export * from './lib/identity/customer-token-vault.ts'",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'})
const {createCustomerFinalReconciliationRepository,createAesGcmEnvelopeVault}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const TX='aaaaaaaa-1111-4222-8333-444444444444',USER='bbbbbbbb-1111-4222-8333-444444444444',IDENTITY='cccccccc-1111-4222-8333-444444444444',RECEIPT='dddddddd-1111-4222-8333-444444444444'
const BROWSER='3'.repeat(64),CONFIG='4'.repeat(64),INTENT='5'.repeat(64),VERIFIER=Buffer.alloc(32,1).toString('base64url'),CHALLENGE=createHash('sha256').update(VERIFIER).digest('base64url'),SUBJECT='tllb_'+Buffer.alloc(32,2).toString('base64url')
const CALLBACK=`https://the-lifting-preview-my-lifting-lab-s-projects.vercel.app/auth/customer/callback?code=${TX}`,CALLBACK_HASH=createHash('sha256').update(CALLBACK).digest('hex'),NOW=Date.parse('2026-09-18T12:00:00Z')
const vault=id=>createAesGcmEnvelopeVault({activeKeyId:id,keys:new Map([[id,Buffer.alloc(32,id==='p'?1:2)]])})
const pVault=vault('p'),fVault=vault('f')
const provisional=pVault.seal({verifier:VERIFIER},['tll-provisional-admission/1','qdmvngjwkcsilzmqksme','application-pkce',TX,CONFIG,BROWSER,INTENT,'0'])
function fixture(mutator=x=>x){const calls=[],release=[];let callbackMaterial,sessionMaterial
 const pool={async connect(){calls.push(['connect']);return{async query(sql,values){calls.push([sql,values]);if(!sql.startsWith('SELECT '))return{rows:[]};const [op,wire]=values,p=JSON.parse(wire);let result
  if(op==='claim'){callbackMaterial=p.callbackMaterial;result={status:'claimed',transactionId:TX,browserHash:BROWSER,callbackHash:CALLBACK_HASH,mode:'sign_in',originalUserId:null,shopifyProofReceiptId:RECEIPT,fence:'1',generation:'0',expiresAt:NOW+60000,applicationPkceChallenge:CHALLENGE,reservedSubject:SUBJECT,configHash:CONFIG,intentHash:INTENT,provisionalMaterial:provisional,callbackMaterial}}
  if(op==='finish'){sessionMaterial=p.sessionMaterial;result={status:'reconciled'}}
  if(op==='release')result={status:'reconciled',transactionId:TX,callbackHash:CALLBACK_HASH,userId:USER,identityId:IDENTITY,reservedSubject:SUBJECT,generation:'0',sessionMaterial}
  if(op==='hold')result={status:'held'}
  return{rows:[{result:mutator(result,op)}]}},release(x){release.push(x)}}}};return{calls,release,repo:createCustomerFinalReconciliationRepository({pool,provisionalVault:pVault,finalVault:fVault,syntheticExecution:true})}}
const bound={transactionId:TX,browserHash:BROWSER,callbackUrl:CALLBACK}
const finalResult={kind:'private_provisional',session:{accessToken:'private-access',refreshToken:'private-refresh',tokenType:'Bearer',expiresAt:NOW+3600000},proof:{userId:USER,authenticatedAt:NOW-1000,checkedAt:NOW,expiresAt:NOW+3600000},identity:{identityId:IDENTITY,userId:USER,subject:SUBJECT}}

test('adapter keeps code, verifier and session tokens encrypted across exact claim, finish and release',async()=>{const f=fixture(),claim=await f.repo.claim({...bound,operationId:randomUUID()});assert.equal(claim.status,'claimed');assert.equal(claim.exchange.authCode,TX);assert.equal(claim.exchange.applicationVerifier,VERIFIER)
 assert.equal(await f.repo.finish({transactionId:TX,operationId:randomUUID(),fence:'1',generation:'0',callbackHash:CALLBACK_HASH,shopifyProofReceiptId:RECEIPT,result:finalResult}),true)
 const released=await f.repo.release(bound);assert.equal(released.status,'reconciled');assert.equal(released.session.accessToken,'private-access')
 const wires=f.calls.filter(([sql])=>sql.startsWith('SELECT ')).map(([,v])=>v[1]).join('\n');assert.doesNotMatch(wires,/private-access|private-refresh|\"authCode\"|\"verifier\"/);assert.doesNotMatch(wires,new RegExp(VERIFIER));assert.deepEqual(f.release,[false,false,false])
})
test('disabled and uncertain transports never report authority or retry',async()=>{let acquired=0;const disabled=createCustomerFinalReconciliationRepository({pool:{async connect(){acquired++;throw Error()}},provisionalVault:pVault,finalVault:fVault});assert.deepEqual(await disabled.claim({...bound,operationId:randomUUID()}),{status:'rejected'});assert.equal(acquired,0)
 const f=fixture((result,op)=>{if(op==='claim')throw Error('secret');return result});await assert.rejects(()=>f.repo.claim({...bound,operationId:randomUUID()}),/^Error: Customer final reconciliation repository unavailable$/);assert.equal(f.calls.filter(([x])=>x==='connect').length,1);assert.deepEqual(f.release,[true])
})
test('substituted claim or release metadata fails closed after acknowledged SQL',async()=>{const f=fixture((r,op)=>op==='claim'?{...r,shopifyProofReceiptId:randomUUID()}:r);const c=await f.repo.claim({...bound,operationId:randomUUID()});assert.equal(c.status,'claimed')
 const g=fixture((r,op)=>op==='claim'?{...r,callbackHash:'0'.repeat(64)}:r);await assert.rejects(()=>g.repo.claim({...bound,operationId:randomUUID()}),/unavailable/);assert.deepEqual(g.release,[false])
})
