/** Fixed Supabase Management API transport. Native token access is disabled. */
import https from 'node:https'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PREDECESSOR, PROJECT_REF, PACKAGE_ID, WINDOW_ID } from './staging-generation-18-credentials.mjs'

export const NATIVE_GENERATION_18_DATABASE_TRANSPORT_ENABLED = true
export const MANAGEMENT_ENDPOINT = Object.freeze({ hostname:'api.supabase.com',path:`/v1/projects/${PROJECT_REF}/database/query`,method:'POST' })
export const KEYCHAIN_HELPER_TIMEOUT_MS=45_000
/**
 * Gen 17 live (~134s CONNECTION_VERIFICATION) exhausted tip maxAttempts=3 × POOLER_CONVERGENCE_MS=16s
 * with true `runtime_sessions_remain` (mgmt mapping worked). PR #40 raised tip drain defaults to
 * 30s × 5; Gen 18 inherits those longer defaults from day one — still hard-capped.
 * Probe reconnect wait remains POOLER_CONVERGENCE_MS (16s) in the verifier.
 */
export const ZERO_SESSIONS_DRAIN_CONVERGENCE_MS = 30_000
export const ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS = 5
export const ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS_CAP = 8
export const ZERO_SESSIONS_DRAIN_CONVERGENCE_MS_CAP = 90_000
const MAX_RESPONSE_BYTES=65_536, TIMEOUT_MS=35_000
const unavailable=()=>{throw new Error('Generation-18 database transport unavailable')}

/**
 * Promote only allow-listed Gen-16 SQL exception phrases from Management API error bodies.
 * Never logs or returns raw response text. Normalizes to fixed secret-free messages for classification.
 */
export function extractAllowListedSqlExceptionMessage(text){
  if(typeof text!=='string'||text.length<1||text.length>MAX_RESPONSE_BYTES)return undefined
  const candidates=[]
  try{
    const parsed=JSON.parse(text)
    if(typeof parsed==='string')candidates.push(parsed)
    else if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){
      for(const key of ['message','error','msg','hint']){
        if(typeof parsed[key]==='string')candidates.push(parsed[key])
      }
      if(parsed.error&&typeof parsed.error==='object'&&typeof parsed.error.message==='string')candidates.push(parsed.error.message)
    }
  }catch{
    candidates.push(text.slice(0,500))
  }
  for(const candidate of candidates){
    if(/runtime sessions remain/i.test(candidate))return 'Generation 18 runtime sessions remain'
    if(/control enabled/i.test(candidate))return 'Generation 18 control enabled during zero-session proof'
  }
  return undefined
}

function projectManagementHttpFailure(statusCode,output){
  let text=''
  try{text=output.toString('utf8')}catch{/* ignore decode failure */}
  const allowListed=extractAllowListedSqlExceptionMessage(text)
  const error=new Error(allowListed??'Generation-18 database transport unavailable')
  if(Number.isInteger(statusCode)&&statusCode>=100&&statusCode<=599)error.managementStatusCode=statusCode
  return error
}

export function normalizeSupabaseToken(value){
  if(typeof value!=='string'||value.length>256)unavailable()
  if(value.startsWith('go-keyring-base64:')){const payload=value.slice(18);if(!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)||payload.length%4)unavailable();const decoded=Buffer.from(payload,'base64');try{if(decoded.toString('base64')!==payload)unavailable();value=decoded.toString('utf8')}finally{decoded.fill(0)}}
  if(!/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(value))unavailable();return value
}

export function readSupabaseTokenFromKeychain(){
  if(!NATIVE_GENERATION_18_DATABASE_TRANSPORT_ENABLED||process.platform!=='darwin')unavailable()
  const helper=fileURLToPath(new URL('./staging-generation-18-keychain.py',import.meta.url))
  const result=spawnSync('/usr/bin/python3',['-I','-S',helper],{env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},timeout:KEYCHAIN_HELPER_TIMEOUT_MS,maxBuffer:512,encoding:null})
  try{if(result.status!==0||!Buffer.isBuffer(result.stdout)||result.stderr?.length)unavailable();return normalizeSupabaseToken(result.stdout.toString('utf8').trim())}
  finally{result.stdout?.fill(0);result.stderr?.fill(0)}
}

export async function postManagementQuery(token,query,{request=https.request}={}){
  token=normalizeSupabaseToken(token);if(typeof query!=='string'||query.length<1||query.length>1_000_000)unavailable()
  const body=Buffer.from(JSON.stringify({query,read_only:false}));
  try{return await new Promise((resolve,reject)=>{let req,done=false,size=0;const chunks=[]
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);for(const chunk of chunks)chunk.fill(0);if(error)reject(error);else resolve(value)}
    const fail=()=>{try{req?.destroy()}catch{};finish(new Error('Generation-18 database transport unavailable'))};const timer=setTimeout(fail,TIMEOUT_MS)
    req=request({protocol:'https:',hostname:MANAGEMENT_ENDPOINT.hostname,port:443,path:MANAGEMENT_ENDPOINT.path,method:'POST',minVersion:'TLSv1.2',rejectUnauthorized:true,servername:MANAGEMENT_ENDPOINT.hostname,agent:false,
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Length':body.length}},response=>{
      // Always drain the body (bounded). Non-201 SQL RAISE responses carry the exception text in JSON;
      // destroying without reading collapsed every RAISE into generic unavailable and skipped drain retries.
      const isJson=/^application\/json(?:;|$)/i.test(String(response.headers['content-type']??''))
      response.on('error',fail);response.on('aborted',fail)
      response.on('data',chunk=>{size+=chunk.length;if(size>MAX_RESPONSE_BYTES){chunk.fill(0);response.destroy();fail()}else chunks.push(chunk)})
      response.on('end',()=>{const output=Buffer.concat(chunks);try{
        if(response.statusCode!==201||!isJson){finish(projectManagementHttpFailure(response.statusCode,output));return}
        let parsed
        try{parsed=JSON.parse(output.toString('utf8'))}catch{finish(new Error('Generation-18 database transport unavailable'));return}
        if(!Array.isArray(parsed)){finish(new Error('Generation-18 database transport unavailable'));return}
        finish(null,parsed)
      }finally{output.fill(0)}})
    });req.on('error',fail);req.end(body)
  })}finally{body.fill(0);token=undefined}
}

export async function dispatchGeneration18Database(sql,{token,post=postManagementQuery}={}){
  if(typeof sql!=='string'||!sql.startsWith('BEGIN;\n')||!sql.endsWith(' AS tll_generation_18_credential_receipt;\n')
    ||sql.split('tll_generation_18_credential_receipt').length!==2||!sql.includes(PACKAGE_ID)||!sql.includes(WINDOW_ID))unavailable()
  return post(token,sql)
}

const predecessorMarkerPayload=JSON.stringify({expiresAt:PREDECESSOR.expiresAt,generation:PREDECESSOR.generation,projectRef:PROJECT_REF,state:'retired',windowId:PREDECESSOR.windowId})
export const GENERATION_18_ENTRY_BASELINE_SQL=`BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='5s';
DO $preflight$ DECLARE r text; role_marker text; parsed_marker jsonb; BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' OR session_user<>'postgres'
  OR coalesce((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),true)
  OR NOT coalesce((SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user),false)
  OR NOT has_table_privilege(current_user,'pg_authid','SELECT') THEN
  RAISE EXCEPTION 'Generation 18 entry operator mismatch'; END IF;
 IF NOT EXISTS(SELECT FROM tll_staging_private.environment WHERE singleton AND environment='tll-hosted-staging-v1'
  AND operator_project_ref='${PROJECT_REF}') THEN RAISE EXCEPTION 'Generation 18 entry environment mismatch'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('tll_customer_runtime','tll_cart_runtime','tll_broker_runtime','tll_provisional_runtime','tll_bridge_runtime'))<>5
  OR EXISTS(SELECT FROM pg_roles WHERE rolname IN ('tll_customer_runtime','tll_cart_runtime','tll_broker_runtime','tll_provisional_runtime','tll_bridge_runtime') AND (rolcanlogin OR rolvaliduntil IS DISTINCT FROM '${PREDECESSOR.expiresAt}'::timestamptz))
  OR EXISTS(SELECT FROM pg_authid WHERE rolname IN ('tll_customer_runtime','tll_cart_runtime','tll_broker_runtime','tll_provisional_runtime','tll_bridge_runtime') AND rolpassword IS NOT NULL)
  OR (SELECT count(*) FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE granted.rolname IN ('tll_customer_runtime','tll_cart_runtime','tll_broker_runtime','tll_provisional_runtime','tll_bridge_runtime') OR member.rolname IN ('tll_customer_runtime','tll_cart_runtime','tll_broker_runtime','tll_provisional_runtime','tll_bridge_runtime'))<>5
  OR (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND usename IN ('tll_customer_runtime','tll_cart_runtime','tll_broker_runtime','tll_provisional_runtime','tll_bridge_runtime'))<>0 THEN
  RAISE EXCEPTION 'Generation 18 entry predecessor mismatch'; END IF;
 FOREACH r IN ARRAY ARRAY['tll_customer_runtime','tll_cart_runtime','tll_broker_runtime','tll_provisional_runtime','tll_bridge_runtime'] LOOP
  SELECT shobj_description(oid,'pg_authid') INTO role_marker FROM pg_roles WHERE rolname=r;
  IF role_marker IS NULL OR role_marker !~ '^tll-runtime-window/v1 [{].*[}]$' THEN RAISE EXCEPTION 'Generation 18 entry predecessor marker malformed: %',r; END IF;
  BEGIN parsed_marker:=substring(role_marker FROM '^tll-runtime-window/v1 ([{].*[}])$')::jsonb;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Generation 18 entry predecessor marker invalid: %',r; END;
  IF parsed_marker IS DISTINCT FROM '${predecessorMarkerPayload}'::jsonb THEN RAISE EXCEPTION 'Generation 18 entry predecessor marker mismatch: %',r; END IF;
 END LOOP;
 IF EXISTS(SELECT FROM (VALUES ((SELECT enabled FROM tll_customer_private.control WHERE singleton)),((SELECT enabled FROM tll_cart_private.control WHERE singleton)),((SELECT enabled FROM tll_broker_private.control WHERE singleton)),((SELECT enabled FROM tll_provisional_private.control WHERE singleton)),((SELECT enabled FROM tll_bridge_private.control WHERE singleton))) controls(enabled) WHERE enabled) THEN
  RAISE EXCEPTION 'Generation 18 entry control enabled'; END IF;
END $preflight$;
COMMIT;
SELECT jsonb_build_object('status','ENTRY_BASELINE_PASS','projectRef','${PROJECT_REF}','windowId','${WINDOW_ID}','runtimeGeneration',17,'runtimeInert',true,'controlsEnabled',false) AS tll_generation_18_entry_baseline;
`
export async function verifyGeneration18EntryBaseline({token,post=postManagementQuery}={}){
  const rows=await post(token,GENERATION_18_ENTRY_BASELINE_SQL)
  if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]??{}).join('|')!=='tll_generation_18_entry_baseline')unavailable()
  const value=rows[0].tll_generation_18_entry_baseline,expected={controlsEnabled:false,projectRef:PROJECT_REF,runtimeGeneration:17,runtimeInert:true,status:'ENTRY_BASELINE_PASS',windowId:WINDOW_ID}
  if(!value||Object.keys(value).sort().join('|')!==Object.keys(expected).sort().join('|'))unavailable()
  for(const [key,wanted]of Object.entries(expected))if(value[key]!==wanted)unavailable()
  return Object.freeze(expected)
}

const zeroSessionSql=`BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
DO $verify$ BEGIN
 IF EXISTS(SELECT FROM pg_stat_activity WHERE backend_type='client backend' AND usename IN ('tll_customer_runtime','tll_cart_runtime','tll_broker_runtime','tll_provisional_runtime','tll_bridge_runtime')) THEN RAISE EXCEPTION 'Generation 18 runtime sessions remain'; END IF;
 IF EXISTS(SELECT FROM (VALUES ((SELECT enabled FROM tll_customer_private.control WHERE singleton)),((SELECT enabled FROM tll_cart_private.control WHERE singleton)),((SELECT enabled FROM tll_broker_private.control WHERE singleton)),((SELECT enabled FROM tll_provisional_private.control WHERE singleton)),((SELECT enabled FROM tll_bridge_private.control WHERE singleton))) controls(enabled) WHERE enabled) THEN RAISE EXCEPTION 'Generation 18 control enabled during zero-session proof'; END IF;
END $verify$;
COMMIT;
SELECT jsonb_build_object('status','ZERO_SESSIONS','projectRef','${PROJECT_REF}','windowId','${WINDOW_ID}','controlsEnabled',false) AS tll_generation_18_zero_sessions;
`
export async function verifyGeneration18ZeroSessions({token,post=postManagementQuery}={}){
  const rows=await post(token,zeroSessionSql)
  const receiptMismatch=()=>{throw new Error('Generation-18 zero-session receipt mismatch')}
  if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]??{}).join('|')!=='tll_generation_18_zero_sessions')receiptMismatch()
  const value=rows[0].tll_generation_18_zero_sessions,expected={controlsEnabled:false,projectRef:PROJECT_REF,status:'ZERO_SESSIONS',windowId:WINDOW_ID}
  if(!value||Object.keys(value).sort().join('|')!==Object.keys(expected).sort().join('|'))receiptMismatch()
  for(const [key,wanted]of Object.entries(expected))if(value[key]!==wanted)receiptMismatch()
  return Object.freeze(expected)
}

/** Secret-free classification of zero-session proof failures. Never logs SQL or secrets. Walks cause chain. */
export function classifyZeroSessionsFailure(error){
  let current=error
  for(let depth=0;depth<5&&current;depth+=1){
    const message=typeof current?.message==='string'?current.message:''
    if(/runtime sessions remain/i.test(message))return 'runtime_sessions_remain'
    if(/control enabled/i.test(message))return 'control_enabled'
    if(/zero-session receipt mismatch/i.test(message))return 'receipt_mismatch'
    current=current?.cause
  }
  return 'unavailable'
}

function projectZeroSessionsFailure(error,failureReason,{zeroSessionsAttempts}={}){
  const projected=Error('Generation-18 zero-session verification unavailable')
  projected.failureStep='zero_sessions'
  projected.failureReason=failureReason
  // Secret-free attempt count only (integer); never SQL or body text.
  if(Number.isInteger(zeroSessionsAttempts)&&zeroSessionsAttempts>=1&&zeroSessionsAttempts<=ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS_CAP){
    projected.zeroSessionsAttempts=zeroSessionsAttempts
  }
  // Persist secret-free Management HTTP status when known (number only; never body text).
  let current=error
  for(let depth=0;depth<5&&current;depth+=1){
    const code=current?.managementStatusCode
    if(Number.isInteger(code)&&code>=100&&code<=599){projected.managementStatusCode=code;break}
    current=current?.cause
  }
  if(error&&typeof error==='object')projected.cause=error
  return projected
}

/**
 * Post-probe zero-session proof with bounded pooler drain.
 * Contract: connection verifier closes runtimes (finally → runtime.close()) → wait
 * ZERO_SESSIONS_DRAIN_CONVERGENCE_MS → prove. Retries only while failureReason is
 * runtime_sessions_remain; never infinite. SQL proof still requires zero sessions + controls off.
 */
export async function verifyGeneration18ZeroSessionsAfterPoolerDrain({
  token,
  post=postManagementQuery,
  pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  convergenceMs=ZERO_SESSIONS_DRAIN_CONVERGENCE_MS,
  maxAttempts=ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS,
}={}){
  if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS_CAP)unavailable()
  if(!Number.isFinite(convergenceMs)||convergenceMs<0||convergenceMs>ZERO_SESSIONS_DRAIN_CONVERGENCE_MS_CAP)unavailable()
  if(typeof pause!=='function')unavailable()
  // Initial drain after probes closed all runtimes — pooler sessions can linger briefly.
  await pause(convergenceMs)
  let lastError
  let attemptsCompleted=0
  for(let attempt=1;attempt<=maxAttempts;attempt+=1){
    try{
      attemptsCompleted=attempt
      return await verifyGeneration18ZeroSessions({token,post})
    }catch(error){
      lastError=error
      attemptsCompleted=attempt
      const failureReason=classifyZeroSessionsFailure(error)
      if(failureReason!=='runtime_sessions_remain'||attempt===maxAttempts){
        throw projectZeroSessionsFailure(error,failureReason,{zeroSessionsAttempts:attemptsCompleted})
      }
      await pause(convergenceMs)
    }
  }
  throw projectZeroSessionsFailure(lastError,classifyZeroSessionsFailure(lastError),{zeroSessionsAttempts:attemptsCompleted||maxAttempts})
}

const recoverySql=()=>readFileSync(new URL('../config/staging-generation-18-recovery.sql',import.meta.url),'utf8')+
  `\nSELECT jsonb_build_object('status','RECOVERY_COMMITTED','projectRef','${PROJECT_REF}','windowId','${WINDOW_ID}') AS tll_generation_18_recovery_receipt;\n`
const postCommitSql=()=>readFileSync(new URL('../config/staging-generation-18-recovery-postcommit.sql',import.meta.url),'utf8')+
  `\nSELECT jsonb_build_object('status','RECOVERY_VERIFIED','projectRef','${PROJECT_REF}','windowId','${WINDOW_ID}') AS tll_generation_18_recovery_postcommit;\n`
function exact(rows,key,status){if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]??{}).join('|')!==key)unavailable();const value=rows[0][key]
  if(!value||Object.keys(value).sort().join('|')!=='projectRef|status|windowId'||value.status!==status||value.projectRef!==PROJECT_REF||value.windowId!==WINDOW_ID)unavailable()}

export async function recoverGeneration18Database({token,post=postManagementQuery}={}){
  exact(await post(token,recoverySql()),'tll_generation_18_recovery_receipt','RECOVERY_COMMITTED')
  exact(await post(token,postCommitSql()),'tll_generation_18_recovery_postcommit','RECOVERY_VERIFIED')
  return Object.freeze({status:'RECOVERY_VERIFIED',projectRef:PROJECT_REF,windowId:WINDOW_ID})
}
