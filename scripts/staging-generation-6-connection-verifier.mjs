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
const unavailable=(purpose=null,check='input')=>{const error=new Error('Generation-6 connection verification unavailable');failures.set(error,{purpose:purposes.includes(purpose)?purpose:null,check:failureChecks.has(check)?check:'input'});return error}
export const POOLER_CONVERGENCE_MS=16_000
export function connectionFailureReport(error){const value=failures.get(error);return Object.freeze({status:'FAIL',reason:'connection_verification_failed',purpose:value?.purpose??null,check:value?.check??'input'})}
const values=purposes.flatMap(purpose=>ENTRYPOINTS[purpose].map(signature=>`('${purpose}','${signature}')`)).join(',')
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
  bridge:[`SELECT tll_bridge_private.repository('admit',$1::jsonb) AS result`,'{}','rejected'],
})

function exactIdentity(row,purpose,expiresAt){const login=IDENTITIES[purpose].login
  if(!row||row.database!=='postgres'||row.current_role!==login||row.session_role!==login||row.application_name!=='Supavisor'||row.can_login!==true||row.inherits!==false
    ||row.superuser!==false||row.bypass_rls!==false||row.create_role!==false||row.create_database!==false||row.replication!==false||Date.parse(row.valid_until)!==Date.parse(expiresAt))throw unavailable(purpose,'identity')}
function exactMembership(rows,purpose){const expected=IDENTITIES[purpose]
  if(!Array.isArray(rows)||rows.length!==1||rows[0].granted!==expected.membership||rows[0].member!==expected.login||rows[0].grantor!=='postgres'
    ||rows[0].admin_option!==false||rows[0].inherit_option!==true||rows[0].set_option!==false)throw unavailable(purpose,'membership')}
function exactMatrix(rows,purpose){if(!Array.isArray(rows)||rows.length!==Object.values(ENTRYPOINTS).reduce((n,list)=>n+list.length,0))throw unavailable(purpose,'matrix')
  for(const row of rows)if(!row.present||row.allowed!==(row.purpose===purpose)||!ENTRYPOINTS[row.purpose]?.includes(row.signature))throw unavailable(purpose,'matrix')}

export async function verifyGeneration6Connections({passwords,expiresAt,createRuntime,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  if(!passwords||Object.keys(passwords).sort().join('|')!==[...purposes].sort().join('|')||typeof createRuntime!=='function'||typeof pause!=='function')throw unavailable()
  for(const purpose of purposes){let runtime,client,primary,check='factory'
    try{
      const create=()=>createRuntime({purpose,enabled:true,password:passwords[purpose]})
      runtime=create();check='connect'
      try{client=await runtime.pool.connect()}
      catch{check='connect_wait';await runtime.close();runtime=undefined;await pause(POOLER_CONVERGENCE_MS);check='factory_retry';runtime=create();check='connect_retry';client=await runtime.pool.connect()}
      check='identity'
      exactIdentity((await client.query(IDENTITY_QUERY)).rows[0],purpose,expiresAt)
      check='membership';exactMembership((await client.query(MEMBERSHIP_QUERY)).rows,purpose)
      check='matrix';exactMatrix((await client.query(FUNCTION_MATRIX_QUERY)).rows,purpose)
      const [query,payload,expected]=ownProbe[purpose]
      check='own_probe'
      if(expected==='error'){let rejected=false;try{await client.query(query)}catch{rejected=true}if(!rejected)throw unavailable(purpose,check);client=undefined}
      else{const rows=(await client.query(query,[payload])).rows;if(rows.length!==1||rows[0]?.result?.status!==expected)throw unavailable(purpose,check)}
      if(client){check='table_denial';let denied=false;try{await client.query(PRIVATE_TABLE_DENIAL_QUERY)}catch{denied=true}if(!denied)throw unavailable(purpose,check);client=undefined}
    }catch(error){primary=failures.has(error)?error:unavailable(purpose,check)}
    finally{try{client?.release(true)}catch{if(!primary)primary=unavailable(purpose,'release')}try{await runtime?.close()}catch{if(!primary)primary=unavailable(purpose,'close')}}
    if(primary)throw primary
  }
  return Object.freeze({status:'PASS',projectRef:PROJECT_REF,purposes:5,controlsEnabled:false})
}
