import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const dir=fileURLToPath(new URL('../scripts/',import.meta.url))
let source=readFileSync(dir+'staging-generation-23-fixed-hosted-adapters.mjs','utf8')
source=source.replace('export const STAGING_GENERATION_23_FIXED_HOSTED_ADAPTERS_ENABLED = false','export const STAGING_GENERATION_23_FIXED_HOSTED_ADAPTERS_ENABLED = true').replace('} catch { throw Error(\'Generation 23 fixed hosted adapters unavailable\') }', '} catch (error) { throw error }').replaceAll("from './",`from '${pathToFileURL(dir).href}`)
const {createStagingGeneration23FixedHostedAdapters}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
const broker=await import(pathToFileURL(dir+'staging-provider-broker-rotation.mjs').href)
const providerAdapter=await import(pathToFileURL(dir+'staging-provider-broker-native-adapter.mjs').href)
const deploymentId='dpl_2Bexi74bn7mqZVoCMFJF2zPoP4Hz'
const immutableUrl='https://the-lifting-4xs0s070x-my-lifting-lab-s-projects.vercel.app'
const gitSourceCommit='191b5a24f5a3c3688e687500ba42f8774cc4cd93'
const aliasHost='the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app'
const alias=()=>({alias:aliasHost,projectId:'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4',deploymentId,deployment:{id:deploymentId,url:new URL(immutableUrl).hostname}})
const fixtures=new Map([
 ['/v1/projects/qdmvngjwkcsilzmqksme/api-keys?reveal=true',[{name:'service_role',type:'legacy',api_key:'s'.repeat(64)}]],
 ['/v1/projects/qdmvngjwkcsilzmqksme/secrets',[{name:broker.BROKER_SECRET_NAME}]],
 ['/auth/v1/admin/custom-providers/custom:tll-staging-subject-broker-v1',{
  id:'custom-provider-id',provider_type:'oauth2',identifier:broker.PROVIDER_IDENTIFIER,name:providerAdapter.STAGING_PROVIDER_NAME,
  client_id:broker.STAGING_BROKER_PROVIDER.clientId,acceptable_client_ids:[],scopes:['subject'],pkce_enabled:true,
  attribute_mapping:{},authorization_params:{},enabled:false,email_optional:true,issuer:'',discovery_url:'',skip_nonce_check:false,
  authorization_url:broker.STAGING_BROKER_PROVIDER.authorizationUrl,token_url:broker.STAGING_BROKER_PROVIDER.tokenUrl,
  userinfo_url:broker.STAGING_BROKER_PROVIDER.userinfoUrl,jwks_uri:broker.STAGING_BROKER_PROVIDER.jwksUrl,discovery_document:null,
  created_at:'2026-09-22T10:00:00.000Z',updated_at:'2026-09-22T10:00:00.000Z'}],
 ['/v9/projects/prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4?teamId=team_gf7cgIkkoeMLtODFDDT5MrW4',{
  id:'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4',name:'the-lifting-lab',accountId:'team_gf7cgIkkoeMLtODFDDT5MrW4',
  link:{type:'github',repoId:1264363509,repoOwnerId:776655,org:'tntipper',repo:'the-lifting-lab',productionBranch:'main',sourceless:true}}],
 ['/v10/projects/prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4/env?target=preview&gitBranch=codex%2Ftll-integration&limit=100&teamId=team_gf7cgIkkoeMLtODFDDT5MrW4',{
  envs:[{key:broker.BROKER_SECRET_NAME,target:['preview'],gitBranch:'codex/tll-integration',type:'sensitive'}],pagination:{next:null}}],
 [`/v4/aliases/${aliasHost}?projectId=prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4&teamId=team_gf7cgIkkoeMLtODFDDT5MrW4`,alias()],
 [`/v13/deployments/${deploymentId}?withGitRepoInfo=true&teamId=team_gf7cgIkkoeMLtODFDDT5MrW4`,{
  id:deploymentId,projectId:'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4',ownerId:'team_gf7cgIkkoeMLtODFDDT5MrW4',target:null,
  readyState:'READY',url:new URL(immutableUrl).hostname,gitSource:{type:'github',repoId:1264363509,ref:'codex/tll-integration',sha:gitSourceCommit}}],
 ['/api/staging/readiness',{deploymentId,immutableUrl,projectRef:'qdmvngjwkcsilzmqksme',branch:'codex/tll-integration',privateCustomer:false,privateCart:false,publicCustomer:false,publicCart:false}],
 ['/functions/v1/tll-broker-token',{error:'temporarily_unavailable'}],
])
const calls=[]
const fakeFetch=async(input)=>{
 const u=new URL(input),key=u.pathname+u.search,body=fixtures.get(key)
 if(body===undefined)throw Error('UNEXPECTED_OFFLINE_REQUEST')
 calls.push(key)
 return new Response(JSON.stringify(body),{status:u.pathname==='/functions/v1/tll-broker-token'?503:200,headers:{'content-type':'application/json'}})
}
const journal={read(){return null},claim(){throw Error('WRITE_BLOCKED')},dispatch(){throw Error('WRITE_BLOCKED')},confirm(){throw Error('WRITE_BLOCKED')},hold(){throw Error('WRITE_BLOCKED')}}
test('Generation 23 joins actual held surface binding shape across all fixed readers',async()=>{
const adapter=createStagingGeneration23FixedHostedAdapters({
 credentials:{managementToken:Buffer.from('fake-management-token'),vercelToken:Buffer.from('fake-vercel-token'),previewBypass:Buffer.from('fake-preview-bypass')},
 fetch:fakeFetch,expiresAt:'2099-01-01T00:00:00.000Z',expectedDeployment:{deploymentId,immutableUrl,gitSourceCommit},settingsJournal:journal,
 factories:{readPredecessor:async()=>({status:'PASS_RETIRED',receiptSha256:'a'.repeat(64)})},
})
try{
 const result=await adapter.ports.readBaseline({signal:new AbortController().signal})
 assert.equal(result.status,'BASELINE_HELD_VERIFIED')
 assert.equal(calls.length,10)
 assert.equal(calls.filter(path=>path.startsWith('/v4/aliases/')).length,2)
 assert.ok(calls.includes('/v1/projects/qdmvngjwkcsilzmqksme/api-keys?reveal=true'))
}finally{adapter.dispose()}
})
