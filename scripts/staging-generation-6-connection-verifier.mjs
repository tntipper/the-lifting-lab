/** Current-schema per-role connection and denial verifier. No pool is created here. */
import { IDENTITIES, PROJECT_REF } from './staging-generation-6-credentials.mjs'

export const ENTRYPOINTS=Object.freeze({
  customer:Object.freeze(['tll_customer_private.repository(text,jsonb)','tll_customer_private.shopify_proof_repository(text,jsonb)']),
  cart:Object.freeze(['public.tll_cart_open(text,text)','public.tll_cart_read(text,text)','public.tll_cart_claim(text,text,uuid,text,bigint,integer)','public.tll_cart_finish(text,text,uuid,text,jsonb,integer,integer,integer)',
    'public.tll_cart_transition_read(text,text,text,text)','public.tll_cart_transition_claim(text,text,text,text,uuid,bigint)','public.tll_cart_transition_finish(text,text,text,text,uuid,jsonb,integer,integer,integer)']),
  broker:Object.freeze(['tll_broker_private.repository(text,jsonb)']), provisional:Object.freeze(['tll_provisional_private.repository(text,jsonb)']),
  bridge:Object.freeze(['tll_bridge_private.repository(text,jsonb)','tll_bridge_private.final_repository(text,jsonb)','tll_bridge_private.account_repository(text,jsonb)','tll_bridge_private.account_logout_repository(text,jsonb)']),
})
const purposes=Object.keys(IDENTITIES),failureChecks=new Set(['input','factory','connect','connect_wait','factory_retry','connect_retry','identity','membership','matrix','own_probe','table_denial','release','close'])
const failures=new WeakMap()
const sqlstateOf=error=>typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code)?error.code:null
const safeConnect=value=>value&&typeof value==='object'
  && ['driver','acquire','state','closed'].includes(value.operation)
  && ['authentication','capacity','network','timeout','other'].includes(value.category)
  && ['under_1s','1_to_4s','over_4s'].includes(value.elapsed)
  && (value.code===null||['28P01','28000','53300','57P03','08001','08004','08006',
    'ECONNREFUSED','ECONNRESET','ENETUNREACH','EHOSTUNREACH','ETIMEDOUT','EAI_AGAIN'].includes(value.code))
  ? Object.freeze({operation:value.operation,category:value.category,code:value.code,elapsed:value.elapsed}):null
const unavailable=(purpose=null,check='input',extras={})=>{
  const error=new Error('Generation-6 connection verification unavailable')
  const meta={purpose:purposes.includes(purpose)?purpose:null,check:failureChecks.has(check)?check:'input'}
  if(extras.expectedMode==='rejected'||extras.expectedMode==='error')meta.expectedMode=extras.expectedMode
  if(typeof extras.sqlstate==='string'&&/^[0-9A-Z]{5}$/.test(extras.sqlstate))meta.sqlstate=extras.sqlstate
  if(Number.isInteger(extras.purposesPassed)&&extras.purposesPassed>=0&&extras.purposesPassed<=purposes.length)meta.purposesPassed=extras.purposesPassed
  if(safeConnect(extras.firstConnect))meta.firstConnect=safeConnect(extras.firstConnect)
  if(safeConnect(extras.secondConnect))meta.secondConnect=safeConnect(extras.secondConnect)
  failures.set(error,meta);return error
}
export const POOLER_CONVERGENCE_MS=16_000
export function connectionFailureReport(error){
  const value=failures.get(error)
  const report={status:'FAIL',reason:'connection_verification_failed',purpose:value?.purpose??null,check:value?.check??'input'}
  if(value?.expectedMode==='rejected'||value?.expectedMode==='error')report.expectedMode=value.expectedMode
  if(typeof value?.sqlstate==='string')report.sqlstate=value.sqlstate
  if(Number.isInteger(value?.purposesPassed))report.purposesPassed=value.purposesPassed
  if(value?.firstConnect)report.firstConnect=value.firstConnect
  if(value?.secondConnect)report.secondConnect=value.secondConnect
  return Object.freeze(report)
}
const values=purposes.flatMap(purpose=>ENTRYPOINTS[purpose].map(signature=>`('${purpose}','${signature}')`)).join(',')
const waitForPooler=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(unavailable(null,'connect_wait'));return}
  let timer
  const done=error=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);if(error)reject(error);else resolve()}
  const onAbort=()=>done(unavailable(null,'connect_wait'))
  timer=setTimeout(()=>done(),ms)
  signal?.addEventListener('abort',onAbort,{once:true})
})
export const IDENTITY_QUERY=`SELECT current_database() AS database,current_user::text AS current_role,session_user::text AS session_role,current_setting('application_name') AS application_name,
 r.rolcanlogin AS can_login,r.rolinherit AS inherits,r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls,r.rolcreaterole AS create_role,r.rolcreatedb AS create_database,
 r.rolreplication AS replication,r.rolvaliduntil::text AS valid_until FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`
export const MEMBERSHIP_QUERY=`SELECT g.rolname AS granted,m.rolname AS member,grantor.rolname AS grantor,e.admin_option,e.inherit_option,e.set_option
 FROM pg_auth_members e JOIN pg_roles g ON g.oid=e.roleid JOIN pg_roles m ON m.oid=e.member JOIN pg_roles grantor ON grantor.oid=e.grantor WHERE e.member=current_user::regrole ORDER BY g.rolname`
export const FUNCTION_MATRIX_QUERY=`WITH expected(purpose,signature) AS(VALUES ${values}),actual AS(SELECT e.purpose,e.signature,p.oid FROM expected e LEFT JOIN(
 SELECT p.oid,n.nspname||'.'||p.proname||'('||replace(pg_catalog.oidvectortypes(p.proargtypes),', ',',')||')' AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace)p USING(signature))
 SELECT purpose,signature,(oid IS NOT NULL) AS present,CASE WHEN oid IS NULL THEN false ELSE has_function_privilege(current_user,oid,'EXECUTE') END AS allowed FROM actual ORDER BY purpose,signature`
export const PRIVATE_TABLE_DENIAL_QUERY='SELECT enabled FROM tll_customer_private.control LIMIT 0'
const ownProbe=Object.freeze({
  customer:[`SELECT tll_customer_private.shopify_proof_repository('create',$1::jsonb) AS result`,JSON.stringify({transactionId:'00000000-0000-4000-8000-000000000006'}),'rejected'],
  cart:[`SELECT public.tll_cart_open(repeat('a',64),repeat('b',64)) AS result`,null,'error'],
  broker:[`SELECT tll_broker_private.repository('admit',$1::jsonb) AS result`,'{}','rejected'],
  provisional:[`SELECT tll_provisional_private.repository('prepare',$1::jsonb) AS result`,'{}','rejected'],
  bridge:[`SELECT tll_bridge_private.repository('register',$1::jsonb) AS result`,'{}','error'],
})
export const OWN_PROBE=ownProbe

function exactIdentity(row,purpose,expiresAt){const login=IDENTITIES[purpose].login
  if(!row||row.database!=='postgres'||row.current_role!==login||row.session_role!==login||row.application_name!=='Supavisor'||row.can_login!==true||row.inherits!==false
    ||row.superuser!==false||row.bypass_rls!==false||row.create_role!==false||row.create_database!==false||row.replication!==false||Date.parse(row.valid_until)!==Date.parse(expiresAt))throw unavailable(purpose,'identity')}
function exactMembership(rows,purpose){const expected=IDENTITIES[purpose]
  if(!Array.isArray(rows)||rows.length!==1||rows[0].granted!==expected.membership||rows[0].member!==expected.login||rows[0].grantor!=='postgres'
    ||rows[0].admin_option!==false||rows[0].inherit_option!==true||rows[0].set_option!==false)throw unavailable(purpose,'membership')}
function exactMatrix(rows,purpose){if(!Array.isArray(rows)||rows.length!==Object.values(ENTRYPOINTS).reduce((n,list)=>n+list.length,0))throw unavailable(purpose,'matrix')
  for(const row of rows)if(!row.present||row.allowed!==(row.purpose===purpose)||!ENTRYPOINTS[row.purpose]?.includes(row.signature))throw unavailable(purpose,'matrix')}

export async function verifyGeneration6Connections({passwords,expiresAt,tlsCa,createRuntime,pause=waitForPooler,
  requireClassifiedDenials=false,classifyQueryError,classifyConnectError,signal,onProgress}={}){
  if(!passwords||Object.keys(passwords).sort().join('|')!==[...purposes].sort().join('|')||!tlsCa||Object.keys(tlsCa).sort().join('|')!=='pem|sha256'
    ||typeof tlsCa.pem!=='string'||!tlsCa.pem||!/^[a-f0-9]{64}$/.test(tlsCa.sha256)||typeof createRuntime!=='function'||typeof pause!=='function'
    ||typeof requireClassifiedDenials!=='boolean'||(requireClassifiedDenials&&typeof classifyQueryError!=='function')
    ||(signal!==undefined&&(typeof signal.addEventListener!=='function'||typeof signal.aborted!=='boolean'))
    ||(onProgress!==undefined&&typeof onProgress!=='function')
    ||(classifyConnectError!==undefined&&typeof classifyConnectError!=='function'))throw unavailable()
  let purposesPassed=0
  const live=(purpose,check)=>{
    if(signal?.aborted)throw unavailable(purpose,check,{purposesPassed})
    onProgress?.({purpose,check})
  }
  for(const purpose of purposes){let runtime,client,primary,check='factory',firstConnect,secondConnect
    try{
      live(purpose,check)
      const create=()=>createRuntime({purpose,enabled:true,password:passwords[purpose],tlsCa})
      runtime=create();check='connect';live(purpose,check)
      try{client=await runtime.pool.connect()}
      catch(error){firstConnect=safeConnect(classifyConnectError?.(error));live(purpose,check);check='connect_wait';await runtime.close();runtime=undefined;await pause(POOLER_CONVERGENCE_MS,signal);live(purpose,check);check='factory_retry';runtime=create();check='connect_retry';try{client=await runtime.pool.connect()}catch(retryError){secondConnect=safeConnect(classifyConnectError?.(retryError));throw retryError}}
      check='identity'
      live(purpose,check)
      exactIdentity((await client.query(IDENTITY_QUERY)).rows[0],purpose,expiresAt)
      check='membership';live(purpose,check);exactMembership((await client.query(MEMBERSHIP_QUERY)).rows,purpose)
      check='matrix';live(purpose,check);exactMatrix((await client.query(FUNCTION_MATRIX_QUERY)).rows,purpose)
      const [query,payload,expected]=ownProbe[purpose]
      check='own_probe';live(purpose,check)
      if(expected==='error'){
        let rejected=false
        try{if(payload==null)await client.query(query);else await client.query(query,[payload])}
        catch(probeError){rejected=requireClassifiedDenials
          ? classifyQueryError(probeError)===(purpose==='cart'?'55000':'22023') : true}
        if(!rejected)throw unavailable(purpose,check,{expectedMode:'error',purposesPassed})
        if(requireClassifiedDenials){
          // A failed query destroys this runtime's lease. Reconnect before the
          // independent private-table denial check for cart and bridge.
          client.release(true)
          live(purpose,check);client=await runtime.pool.connect()
        }else client=undefined
      }else{
        try{
          const rows=(await client.query(query,[payload])).rows
          if(rows.length!==1||rows[0]?.result?.status!==expected)throw unavailable(purpose,check,{expectedMode:expected,purposesPassed})
        }catch(probeError){
          if(failures.has(probeError))throw probeError
          throw unavailable(purpose,check,{expectedMode:expected,purposesPassed,...(sqlstateOf(probeError)?{sqlstate:sqlstateOf(probeError)}:{})})
        }
      }
      if(client){check='table_denial';live(purpose,check);let denied=false;try{await client.query(PRIVATE_TABLE_DENIAL_QUERY)}
        catch(probeError){denied=requireClassifiedDenials?classifyQueryError(probeError)==='42501':true}
        if(!denied)throw unavailable(purpose,check,{purposesPassed});client=undefined}
    }catch(error){
      if(failures.has(error)){
        const prior=failures.get(error)
        if(!Number.isInteger(prior.purposesPassed))failures.set(error,{...prior,purposesPassed})
        primary=error
      }else primary=unavailable(purpose,check,{purposesPassed,firstConnect,secondConnect})
      if(primary&&failures.has(primary)){
        const detail=failures.get(primary)
        failures.set(primary,{...detail,...(firstConnect?{firstConnect}:{}),...(secondConnect?{secondConnect}:{})})
      }
    }
    finally{try{client?.release(true)}catch{if(!primary)primary=unavailable(purpose,'release',{purposesPassed})}try{await runtime?.close()}catch{if(!primary)primary=unavailable(purpose,'close',{purposesPassed})}}
    if(primary)throw primary
    purposesPassed+=1
  }
  return Object.freeze({status:'PASS',projectRef:PROJECT_REF,purposes:5,controlsEnabled:false})
}
