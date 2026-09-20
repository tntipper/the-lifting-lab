/** Fixed Supabase Management API transport. Native token access is disabled. */
import https from 'node:https'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PROJECT_REF, PACKAGE_ID, WINDOW_ID } from './staging-generation-6-credentials.mjs'

export const NATIVE_DATABASE_TRANSPORT_ENABLED = false
export const MANAGEMENT_ENDPOINT = Object.freeze({ hostname:'api.supabase.com',path:`/v1/projects/${PROJECT_REF}/database/query`,method:'POST' })
const MAX_RESPONSE_BYTES=65_536, TIMEOUT_MS=35_000
const unavailable=()=>{throw new Error('Generation-6 database transport unavailable')}

export function normalizeSupabaseToken(value){
  if(typeof value!=='string'||value.length>256)unavailable()
  if(value.startsWith('go-keyring-base64:')){const payload=value.slice(18);if(!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)||payload.length%4)unavailable();const decoded=Buffer.from(payload,'base64');try{if(decoded.toString('base64')!==payload)unavailable();value=decoded.toString('utf8')}finally{decoded.fill(0)}}
  if(!/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(value))unavailable();return value
}

export function readSupabaseTokenFromKeychain(){
  if(!NATIVE_DATABASE_TRANSPORT_ENABLED||process.platform!=='darwin')unavailable()
  const helper=fileURLToPath(new URL('./staging-generation-6-keychain.py',import.meta.url))
  const result=spawnSync('/usr/bin/python3',['-I','-S',helper],{env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},timeout:15_000,maxBuffer:512,encoding:null})
  try{if(result.status!==0||!Buffer.isBuffer(result.stdout)||result.stderr?.length)unavailable();return normalizeSupabaseToken(result.stdout.toString('utf8').trim())}
  finally{result.stdout?.fill(0);result.stderr?.fill(0)}
}

export async function postManagementQuery(token,query,{request=https.request}={}){
  token=normalizeSupabaseToken(token);if(typeof query!=='string'||query.length<1||query.length>1_000_000)unavailable()
  const body=Buffer.from(JSON.stringify({query,read_only:false}));
  try{return await new Promise((resolve,reject)=>{let req,done=false,size=0;const chunks=[]
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);for(const chunk of chunks)chunk.fill(0);if(error)reject(error);else resolve(value)}
    const fail=()=>{try{req?.destroy()}catch{};finish(new Error('Generation-6 database transport unavailable'))};const timer=setTimeout(fail,TIMEOUT_MS)
    req=request({protocol:'https:',hostname:MANAGEMENT_ENDPOINT.hostname,port:443,path:MANAGEMENT_ENDPOINT.path,method:'POST',minVersion:'TLSv1.2',rejectUnauthorized:true,servername:MANAGEMENT_ENDPOINT.hostname,agent:false,
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Length':body.length}},response=>{
      if(response.statusCode!==201||!/^application\/json(?:;|$)/i.test(String(response.headers['content-type']??''))){response.destroy();return fail()}
      response.on('error',fail);response.on('aborted',fail);response.on('data',chunk=>{size+=chunk.length;if(size>MAX_RESPONSE_BYTES){chunk.fill(0);response.destroy();fail()}else chunks.push(chunk)})
      response.on('end',()=>{const output=Buffer.concat(chunks);try{const parsed=JSON.parse(output.toString('utf8'));if(!Array.isArray(parsed))unavailable();finish(null,parsed)}catch{fail()}finally{output.fill(0)}})
    });req.on('error',fail);req.end(body)
  })}finally{body.fill(0);token=undefined}
}

export async function dispatchGeneration6Database(sql,{token,post=postManagementQuery}={}){
  if(typeof sql!=='string'||!sql.startsWith('BEGIN;\n')||!sql.endsWith(' AS tll_generation_6_credential_receipt;\n')
    ||sql.split('tll_generation_6_credential_receipt').length!==2||!sql.includes(PACKAGE_ID)||!sql.includes(WINDOW_ID))unavailable()
  return post(token,sql)
}

const zeroSessionSql=`BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
DO $verify$ BEGIN
 IF EXISTS(SELECT FROM pg_stat_activity WHERE backend_type='client backend' AND usename IN ('tll_customer_runtime','tll_cart_runtime','tll_broker_runtime','tll_provisional_runtime','tll_bridge_runtime')) THEN RAISE EXCEPTION 'Generation 6 runtime sessions remain'; END IF;
 IF EXISTS(SELECT FROM (VALUES ((SELECT enabled FROM tll_customer_private.control WHERE singleton)),((SELECT enabled FROM tll_cart_private.control WHERE singleton)),((SELECT enabled FROM tll_broker_private.control WHERE singleton)),((SELECT enabled FROM tll_provisional_private.control WHERE singleton)),((SELECT enabled FROM tll_bridge_private.control WHERE singleton))) controls(enabled) WHERE enabled) THEN RAISE EXCEPTION 'Generation 6 control enabled during zero-session proof'; END IF;
END $verify$;
COMMIT;
SELECT jsonb_build_object('status','ZERO_SESSIONS','projectRef','${PROJECT_REF}','windowId','${WINDOW_ID}','controlsEnabled',false) AS tll_generation_6_zero_sessions;
`
export async function verifyGeneration6ZeroSessions({token,post=postManagementQuery}={}){
  const rows=await post(token,zeroSessionSql)
  if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]??{}).join('|')!=='tll_generation_6_zero_sessions')unavailable()
  const value=rows[0].tll_generation_6_zero_sessions,expected={controlsEnabled:false,projectRef:PROJECT_REF,status:'ZERO_SESSIONS',windowId:WINDOW_ID}
  if(!value||Object.keys(value).sort().join('|')!==Object.keys(expected).sort().join('|'))unavailable()
  for(const [key,wanted]of Object.entries(expected))if(value[key]!==wanted)unavailable()
  return Object.freeze(expected)
}

const recoverySql=()=>readFileSync(new URL('../config/staging-account-activation-recovery.sql',import.meta.url),'utf8')+
  `\nSELECT jsonb_build_object('status','RECOVERY_COMMITTED','projectRef','${PROJECT_REF}','windowId','${WINDOW_ID}') AS tll_generation_6_recovery_receipt;\n`
const postCommitSql=()=>readFileSync(new URL('../config/staging-account-activation-recovery-postcommit.sql',import.meta.url),'utf8')+
  `\nSELECT jsonb_build_object('status','RECOVERY_VERIFIED','projectRef','${PROJECT_REF}','windowId','${WINDOW_ID}') AS tll_generation_6_recovery_postcommit;\n`
function exact(rows,key,status){if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]??{}).join('|')!==key)unavailable();const value=rows[0][key]
  if(!value||Object.keys(value).sort().join('|')!=='projectRef|status|windowId'||value.status!==status||value.projectRef!==PROJECT_REF||value.windowId!==WINDOW_ID)unavailable()}

export async function recoverGeneration6Database({token,post=postManagementQuery}={}){
  exact(await post(token,recoverySql()),'tll_generation_6_recovery_receipt','RECOVERY_COMMITTED')
  exact(await post(token,postCommitSql()),'tll_generation_6_recovery_postcommit','RECOVERY_VERIFIED')
  return Object.freeze({status:'RECOVERY_VERIFIED',projectRef:PROJECT_REF,windowId:WINDOW_ID})
}
