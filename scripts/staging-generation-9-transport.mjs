/** Disabled generation-9 orchestration over the reviewed shared transports. */
import { createHash } from 'node:crypto'
import { buildGeneration9CredentialSql, createGeneration9DispatchJournal, GENERATION, IDENTITIES, MAX_WINDOW_MS, PACKAGE_ID, PROJECT_REF, WINDOW_ID } from './staging-generation-9-credentials.mjs'
import { deriveScramVerifier, DISABLED_VERCEL_CONFIGURATION, eraseGeneration6Material, generateGeneration6Material, GENERATED_SUPABASE_SECRET_NAMES, projectGeneration6Secrets, SHOPIFY_CREDENTIAL_DEPENDENCIES, STAGED_VERCEL_NAMES } from './staging-generation-6-transport.mjs'

export const NATIVE_GENERATION_9_TRANSPORT_ENABLED=false
const purposes=Object.keys(IDENTITIES),providerFailurePhases=new Set(['VERCEL_STAGE','SUPABASE_STAGE','PROVIDER_READBACK'])
const providerFailureCodes=new Set(['AUTH','TRANSIENT','VALIDATION','API','CLI_EXIT','TIMEOUT','SPAWN','STREAM','OUTPUT_LIMIT','INPUT_STREAM','READBACK','CLEANUP','PROBE','PROVIDER_VALIDATION'])
const connectionFailureChecks=new Set(['input','factory','connect','connect_wait','factory_retry','connect_retry','identity','membership','matrix','own_probe','table_denial','release','close'])
const unavailable=()=>{throw new Error('Generation-9 transport unavailable')}
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|')
const projectConnectionFailure=value=>exactKeys(value,['status','reason','purpose','check'])&&value.status==='FAIL'&&value.reason==='connection_verification_failed'
  &&purposes.includes(value.purpose)&&connectionFailureChecks.has(value.check)?Object.freeze({status:value.status,reason:value.reason,purpose:value.purpose,check:value.check}):undefined

function eraseProjection(projection){if(!projection)return;for(const group of [projection.vercel,projection.supabase,projection.passwords])if(group)for(const key of Object.keys(group))group[key]=undefined}
function validateReceipt(rows,expiresAt){
  if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]??{}).join('|')!=='tll_generation_9_credential_receipt')unavailable()
  const value=rows[0].tll_generation_9_credential_receipt,expected={controlsEnabled:false,expiresAt,generation:GENERATION,packageId:PACKAGE_ID,projectRef:PROJECT_REF,runtimeCount:5,status:'PASS',windowId:WINDOW_ID}
  if(!exactKeys(value,Object.keys(expected)))unavailable();for(const [key,wanted]of Object.entries(expected))if(value[key]!==wanted)unavailable();return Object.freeze(value)
}

export async function executeGeneration9CredentialWindow({ports,journal=createGeneration9DispatchJournal(),now=Date.now,randomBytes,randomUUID}={}){
  const required=['preflightDatabase','stageVercel','stageSupabase','readbackNames','dispatchDatabase','verifyConnections','recoverDatabase','removeVercel','removeSupabase']
  if(!ports||required.some(name=>typeof ports[name]!=='function'))unavailable()
  const nowMs=now(),expiresAt=new Date(Math.floor((nowMs+MAX_WINDOW_MS-5*60*1000)/1000)*1000).toISOString()
  let material,projection,intent,dispatchAttempted=false,providerAttempted=false,preflightPassed=false,phase='ENTRY_PREFLIGHT'
  try{
    try{await ports.preflightDatabase()}catch{phase='ENTRY_PREFLIGHT_RETRY';await ports.preflightDatabase()}
    preflightPassed=true;phase='MATERIAL_GENERATION';material=generateGeneration6Material({...(randomBytes?{randomBytes}:{}),...(randomUUID?{randomUUID}:{})});projection=projectGeneration6Secrets(material)
    providerAttempted=true;phase='VERCEL_STAGE';await ports.stageVercel({secrets:projection.vercel,configuration:DISABLED_VERCEL_CONFIGURATION})
    phase='SUPABASE_STAGE';await ports.stageSupabase({secrets:projection.supabase});phase='PROVIDER_READBACK';const names=await ports.readbackNames()
    if(!names||!Array.isArray(names.vercel)||!Array.isArray(names.supabase)||STAGED_VERCEL_NAMES.some(name=>!names.vercel.includes(name))||GENERATED_SUPABASE_SECRET_NAMES.some(name=>!names.supabase.includes(name)))unavailable()
    phase='DATABASE_PACKAGE';const verifiers=Object.fromEntries(purposes.map((purpose,index)=>[purpose,deriveScramVerifier(material.passwords[purpose],Buffer.alloc(18,index+1))]));const sql=buildGeneration9CredentialSql({expiresAt,verifiers,nowMs})
    phase='JOURNAL_INTENT';intent=journal.recordIntent({expiresAt,nowMs});dispatchAttempted=true;phase='DATABASE_DISPATCH';const receipt=validateReceipt(await ports.dispatchDatabase(sql),expiresAt)
    phase='CONNECTION_VERIFICATION';await ports.verifyConnections({passwords:projection.passwords,expiresAt});journal.transition(intent,'RECEIPT_VALIDATED')
    return Object.freeze({status:'CREDENTIALS_VERIFIED_CONTROLS_DISABLED',target:PROJECT_REF,generation:GENERATION,windowId:WINDOW_ID,expiresAt,receipt,missingProviderCredentials:SHOPIFY_CREDENTIAL_DEPENDENCIES})
  }catch(error){
    const failureClassification=providerFailurePhases.has(phase)&&providerFailureCodes.has(error?.code)?error.code:undefined
    const connectionFailure=phase==='CONNECTION_VERIFICATION'?projectConnectionFailure(error?.connectionFailure):undefined
    let recovery='NOT_REQUIRED';if(dispatchAttempted){try{await ports.recoverDatabase();recovery='RECOVERY_VERIFIED'}catch{recovery='RECOVERY_REQUIRED'}try{journal.transition(intent,'RECONCILIATION_REQUIRED')}catch{}}
    if(providerAttempted){try{await ports.removeVercel(STAGED_VERCEL_NAMES)}catch{}try{await ports.removeSupabase(GENERATED_SUPABASE_SECRET_NAMES)}catch{}}
    return Object.freeze({status:dispatchAttempted?recovery:preflightPassed?'STOPPED_BEFORE_DATABASE':'ENTRY_BASELINE_FAILED',phase,target:PROJECT_REF,generation:GENERATION,windowId:WINDOW_ID,
      ...(failureClassification?{failureClassification}:{}),...(connectionFailure?{connectionFailure}:{}),nextAction:dispatchAttempted?'NO_RETRY_RECONCILE':preflightPassed?'REVIEW_PROVIDER_STAGING':'REVIEW_ENTRY_BASELINE'})
  }finally{eraseProjection(projection);eraseGeneration6Material(material)}
}

export async function runNativeGeneration9CredentialWindow(){
  if(!NATIVE_GENERATION_9_TRANSPORT_ENABLED)return Object.freeze({status:'NATIVE_TRANSPORT_DISABLED',target:PROJECT_REF,generation:GENERATION,windowId:WINDOW_ID})
  const [{stageVercelSecrets,stageSupabaseSecrets,readbackProviderNames,removeVercelSecrets,removeSupabaseSecrets},{readSupabaseTokenFromKeychain,dispatchGeneration9Database,recoverGeneration9Database,verifyGeneration9EntryBaseline,verifyGeneration9ZeroSessions},{verifyGeneration6Connections,connectionFailureReport},{createStagingPostgresRuntime},{readPinnedSupabaseCa}]=await Promise.all([
    import('./staging-generation-6-provider-transport.mjs'),import('./staging-generation-9-database-transport.mjs'),import('./staging-generation-6-connection-verifier.mjs'),import('../lib/server/staging-postgres.ts'),import('./staging-supabase-ca.mjs')])
  const token=readSupabaseTokenFromKeychain(),tlsCa=readPinnedSupabaseCa()
  return executeGeneration9CredentialWindow({ports:{preflightDatabase:()=>verifyGeneration9EntryBaseline({token}),stageVercel:stageVercelSecrets,stageSupabase:stageSupabaseSecrets,readbackNames:readbackProviderNames,
    dispatchDatabase:sql=>dispatchGeneration9Database(sql,{token}),verifyConnections:async input=>{try{await verifyGeneration6Connections({...input,tlsCa,createRuntime:createStagingPostgresRuntime})}catch(error){const projected=Error('Generation-9 connection verification unavailable');projected.connectionFailure=connectionFailureReport(error);throw projected}await verifyGeneration9ZeroSessions({token})},
    recoverDatabase:()=>recoverGeneration9Database({token}),removeVercel:removeVercelSecrets,removeSupabase:removeSupabaseSecrets}})
}

export const GENERATION_9_SOURCE_FINGERPRINT=createHash('sha256').update(`${PACKAGE_ID}|${WINDOW_ID}|${GENERATION}`).digest('hex')
