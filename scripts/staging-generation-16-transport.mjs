/** Disabled generation-16 orchestration over the reviewed shared transports. */
import { createHash } from 'node:crypto'
import { buildGeneration16CredentialSql, createGeneration16DispatchJournal, GENERATION, IDENTITIES, MAX_WINDOW_MS, PACKAGE_ID, PROJECT_REF, WINDOW_ID } from './staging-generation-16-credentials.mjs'
import { deriveScramVerifier, DISABLED_VERCEL_CONFIGURATION, eraseGeneration6Material, generateGeneration6Material, GENERATED_SUPABASE_SECRET_NAMES, projectGeneration6Secrets, SHOPIFY_CREDENTIAL_DEPENDENCIES, STAGED_VERCEL_NAMES } from './staging-generation-6-transport.mjs'

export const NATIVE_GENERATION_16_TRANSPORT_ENABLED=true
const purposes=Object.keys(IDENTITIES),providerFailurePhases=new Set(['VERCEL_STAGE','SUPABASE_STAGE','PROVIDER_READBACK'])
const providerFailureCodes=new Set(['AUTH','TRANSIENT','VALIDATION','API','CLI_EXIT','TIMEOUT','SPAWN','STREAM','OUTPUT_LIMIT','INPUT_STREAM','READBACK','CLEANUP','PROBE','PROVIDER_VALIDATION'])
const connectionFailureChecks=new Set(['input','factory','connect','connect_wait','factory_retry','connect_retry','identity','membership','matrix','own_probe','table_denial','release','close'])
const unavailable=()=>{throw new Error('Generation-16 transport unavailable')}
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|')
const optionalFailureKeys=new Set(['sqlstate','expectedMode','purposesPassed','host','port','recoverySubOutcome'])
const projectConnectionFailure=value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined
  const keys=Object.keys(value)
  if(!['status','reason','purpose','check'].every(k=>keys.includes(k)))return undefined
  if(keys.some(k=>!['status','reason','purpose','check'].includes(k)&&!optionalFailureKeys.has(k)))return undefined
  if(value.status!=='FAIL'||value.reason!=='connection_verification_failed')return undefined
  if(!purposes.includes(value.purpose)||!connectionFailureChecks.has(value.check))return undefined
  const out={status:value.status,reason:value.reason,purpose:value.purpose,check:value.check}
  if(value.sqlstate!==undefined){if(typeof value.sqlstate!=='string'||!/^[0-9A-Z]{5}$/.test(value.sqlstate))return undefined;out.sqlstate=value.sqlstate}
  if(value.expectedMode!==undefined){if(value.expectedMode!=='rejected'&&value.expectedMode!=='error')return undefined;out.expectedMode=value.expectedMode}
  if(value.purposesPassed!==undefined){if(!Number.isInteger(value.purposesPassed)||value.purposesPassed<0||value.purposesPassed>5)return undefined;out.purposesPassed=value.purposesPassed}
  if(value.host!==undefined){if(value.host!=='aws-0-eu-west-2.pooler.supabase.com')return undefined;out.host=value.host}
  if(value.port!==undefined){if(value.port!==6543)return undefined;out.port=value.port}
  if(value.recoverySubOutcome!==undefined){if(!['RECOVERY_COMMITTED','RECOVERY_POSTCOMMIT_FAILED','RECOVERY_REQUIRED'].includes(value.recoverySubOutcome))return undefined;out.recoverySubOutcome=value.recoverySubOutcome}
  return Object.freeze(out)
}

function eraseProjection(projection){if(!projection)return;for(const group of [projection.vercel,projection.supabase,projection.passwords])if(group)for(const key of Object.keys(group))group[key]=undefined}
function validateReceipt(rows,expiresAt){
  if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]??{}).join('|')!=='tll_generation_16_credential_receipt')unavailable()
  const value=rows[0].tll_generation_16_credential_receipt,expected={controlsEnabled:false,expiresAt,generation:GENERATION,packageId:PACKAGE_ID,projectRef:PROJECT_REF,runtimeCount:5,status:'PASS',windowId:WINDOW_ID}
  if(!exactKeys(value,Object.keys(expected)))unavailable();for(const [key,wanted]of Object.entries(expected))if(value[key]!==wanted)unavailable();return Object.freeze(value)
}

/** Injected-only orchestration. Optional onPhase is for the dedicated live launcher's phase journal. */
export async function executeGeneration16CredentialWindow({ports,journal=createGeneration16DispatchJournal(),now=Date.now,randomBytes,randomUUID,onPhase}={}){
  const required=['preflightDatabase','stageVercel','stageSupabase','readbackNames','dispatchDatabase','verifyConnections','recoverDatabase','removeVercel','removeSupabase']
  if(!ports||required.some(name=>typeof ports[name]!=='function'))unavailable()
  if(onPhase!==undefined&&typeof onPhase!=='function')unavailable()
  const notify=async next=>{phase=next;if(onPhase)await onPhase(next)}
  const nowMs=now(),expiresAt=new Date(Math.floor((nowMs+MAX_WINDOW_MS-5*60*1000)/1000)*1000).toISOString()
  let material,projection,intent,dispatchAttempted=false,providerAttempted=false,preflightPassed=false,phase='ENTRY_PREFLIGHT'
  try{
    await notify('ENTRY_PREFLIGHT')
    try{await ports.preflightDatabase()}catch{await notify('ENTRY_PREFLIGHT_RETRY');await ports.preflightDatabase()}
    preflightPassed=true;await notify('JOURNAL_INTENT');intent=journal.recordIntent({expiresAt,nowMs})
    await notify('MATERIAL_GENERATION');material=generateGeneration6Material({...(randomBytes?{randomBytes}:{}),...(randomUUID?{randomUUID}:{})});projection=projectGeneration6Secrets(material)
    providerAttempted=true;await notify('VERCEL_STAGE');await ports.stageVercel({secrets:projection.vercel,configuration:DISABLED_VERCEL_CONFIGURATION})
    await notify('SUPABASE_STAGE');await ports.stageSupabase({secrets:projection.supabase});await notify('PROVIDER_READBACK');const names=await ports.readbackNames()
    if(!names||!Array.isArray(names.vercel)||!Array.isArray(names.supabase)||STAGED_VERCEL_NAMES.some(name=>!names.vercel.includes(name))||GENERATED_SUPABASE_SECRET_NAMES.some(name=>!names.supabase.includes(name)))unavailable()
    await notify('DATABASE_PACKAGE');const verifiers=Object.fromEntries(purposes.map((purpose,index)=>[purpose,deriveScramVerifier(projection.passwords[purpose],Buffer.alloc(18,index+1))]));const sql=buildGeneration16CredentialSql({expiresAt,verifiers,nowMs})
    dispatchAttempted=true;await notify('DATABASE_DISPATCH');const receipt=validateReceipt(await ports.dispatchDatabase(sql),expiresAt)
    await notify('CONNECTION_VERIFICATION');await ports.verifyConnections({passwords:projection.passwords,expiresAt})
    await notify('JOURNAL_FINALIZE');journal.transition(intent,'RECEIPT_VALIDATED')
    return Object.freeze({status:'CREDENTIALS_VERIFIED_CONTROLS_DISABLED',target:PROJECT_REF,generation:GENERATION,windowId:WINDOW_ID,expiresAt,receipt,missingProviderCredentials:SHOPIFY_CREDENTIAL_DEPENDENCIES})
  }catch(error){
    // Capture throw-site phase before recovery/cleanup notifies overwrite `phase`.
    const failedPhase=phase
    const allowedFailureSteps=new Set(['zero_sessions','connection_verification','provider','preflight','journal','dispatch','recovery'])
    const failureStep=allowedFailureSteps.has(error?.failureStep)?error.failureStep:undefined
    const allowedFailureReasons=new Set(['runtime_sessions_remain','control_enabled','receipt_mismatch','unavailable'])
    const failureReason=allowedFailureReasons.has(error?.failureReason)?error.failureReason:undefined
    const failureClassification=providerFailurePhases.has(failedPhase)&&providerFailureCodes.has(error?.code)?error.code:undefined
    const connectionFailure=failedPhase==='CONNECTION_VERIFICATION'?projectConnectionFailure(error?.connectionFailure):undefined
    let recoveryOutcome='NOT_REQUIRED'
    if(dispatchAttempted){
      try{if(onPhase)await notify('DATABASE_RECOVERY');await ports.recoverDatabase();recoveryOutcome='RECOVERY_VERIFIED'}
      catch{recoveryOutcome='RECOVERY_REQUIRED'}
    }
    if(intent){try{journal.transition(intent,'RECONCILIATION_REQUIRED')}catch{}}
    if(providerAttempted){
      try{if(onPhase)await notify('VERCEL_CLEANUP');await ports.removeVercel(STAGED_VERCEL_NAMES)}catch{}
      try{if(onPhase)await notify('SUPABASE_CLEANUP');await ports.removeSupabase(GENERATED_SUPABASE_SECRET_NAMES)}catch{}
    }
    const journalRejected=failedPhase==='JOURNAL_INTENT'&&!intent
    return Object.freeze({
      status:dispatchAttempted?recoveryOutcome:journalRejected?'JOURNAL_CLAIM_REJECTED':preflightPassed?'STOPPED_BEFORE_DATABASE':'ENTRY_BASELINE_FAILED',
      phase,failedPhase,recoveryOutcome,connectionFailurePresent:Boolean(connectionFailure),
      target:PROJECT_REF,generation:GENERATION,windowId:WINDOW_ID,
      ...(failureStep?{failureStep}:{}),
      ...(failureReason?{failureReason}:{}),
      ...(failureClassification?{failureClassification}:{}),
      ...(connectionFailure?{connectionFailure}:{}),
      nextAction:dispatchAttempted?'NO_RETRY_RECONCILE':journalRejected?'REVIEW_EXCLUSIVE_JOURNAL':preflightPassed?'REVIEW_PROVIDER_STAGING':'REVIEW_ENTRY_BASELINE',
    })
  }finally{eraseProjection(projection);eraseGeneration6Material(material)}
}

export const GENERATION_16_SOURCE_FINGERPRINT=createHash('sha256').update(`${PACKAGE_ID}|${WINDOW_ID}|${GENERATION}`).digest('hex')
