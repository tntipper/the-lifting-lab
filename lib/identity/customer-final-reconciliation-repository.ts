// Node/server-only durable final reconciliation adapter. The matching additive
// SQL migration is a separate gate; this module performs no work at import.
import { createHash } from 'node:crypto'
import type { CustomerRepositoryPool } from './customer-connection-repository'
import type { EnvelopeVault } from './customer-token-vault'
import type { CustomerFinalReconciliationRepository, CustomerFinalClaim, CustomerFinalRelease } from './customer-final-reconciliation'

const PROJECT = 'qdmvngjwkcsilzmqksme', VERSION = 'tll-customer-final/1'
const unavailable = () => new Error('Customer final reconciliation repository unavailable')
const ensure: (v: unknown) => asserts v = v => { if (!v) throw unavailable() }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const opaque = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v) && Buffer.from(v,'base64url').toString('base64url') === v
const integer = (v: unknown, zero=false): v is string => typeof v === 'string' && (zero ? /^(0|[1-9][0-9]{0,18})$/.test(v) : /^[1-9][0-9]{0,18}$/.test(v))
const ms = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number)>0 && (v as number)<=253402300799999
const subject = (v: unknown): v is string => typeof v === 'string' && v.startsWith('tllb_') && opaque(v.slice(5))
const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const callbackContext = (tx:string,browser:string,callback:string) => [VERSION,PROJECT,'callback',tx,browser,callback]
type ClaimInput = Parameters<CustomerFinalReconciliationRepository['claim']>[0]
type FinishInput = Parameters<CustomerFinalReconciliationRepository['finish']>[0]
type ReleaseInput = Parameters<CustomerFinalReconciliationRepository['release']>[0]
type HoldInput = Parameters<CustomerFinalReconciliationRepository['hold']>[0]
const rejected = () => ({ status: 'rejected' as const })
const sessionContext = (tx:string,callback:string,user:string,identity:string,sub:string,generation:string) => [VERSION,PROJECT,'session',tx,callback,user,identity,sub,generation]

export function createCustomerFinalReconciliationRepository(input: {
  pool: CustomerRepositoryPool; provisionalVault: EnvelopeVault; finalVault: EnvelopeVault
  syntheticExecution?: boolean; liveEnabled?: boolean
}): CustomerFinalReconciliationRepository & { liveEnabled: false } {
  const {pool,provisionalVault,finalVault}=input
  const active=()=>input.syntheticExecution===true && input.liveEnabled!==true && typeof window==='undefined' && provisionalVault!==finalVault
  async function call(op:string,payload:object):Promise<Record<string,unknown>>{
    ensure(active()); const wire=JSON.stringify(payload); ensure(Buffer.byteLength(wire)<=65536)
    let client:Awaited<ReturnType<CustomerRepositoryPool['connect']>>|undefined,result:Record<string,unknown>|undefined,failed=false
    try{client=await pool.connect();await client.query('BEGIN');await client.query("SET LOCAL lock_timeout = '5s'");await client.query("SET LOCAL statement_timeout = '10s'");await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'")
      const r=await client.query('SELECT tll_bridge_private.final_repository($1::text,$2::jsonb) AS result',[op,wire])
      ensure(r.rows.length===1&&object(r.rows[0].result));result=r.rows[0].result;await client.query('COMMIT')
    }catch{failed=true;try{await client?.query('ROLLBACK')}catch{}}
    finally{try{client?.release(failed)}catch{failed=true}}
    if(failed||!result)throw unavailable();return result
  }
  const bound=(p:{transactionId:string;browserHash:string;callbackUrl:string})=>{
    ensure(p&&uuid(p.transactionId)&&sha(p.browserHash)&&typeof p.callbackUrl==='string'&&p.callbackUrl.length<=2048)
    const u=new URL(p.callbackUrl);ensure(/^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app$/.test(u.origin)
      &&u.pathname==='/auth/customer/callback'&&!u.hash&&!u.username&&!u.password&&[...u.searchParams.keys()].sort().join(',')==='code,state')
    const code=u.searchParams.get('code'),state=u.searchParams.get('state');ensure(uuid(code)&&uuid(state));const callbackHash=hash(u.href)
    return {transactionId:p.transactionId,browserHash:p.browserHash,callbackUrl:u.href,callbackHash,authCode:code,state}
  }
  return Object.freeze({liveEnabled:false as const,
    async claim(p: ClaimInput){if(!active())return rejected();const b=bound(p);ensure(uuid(p.operationId))
      const material=finalVault.seal({authCode:b.authCode},callbackContext(b.transactionId,b.browserHash,b.callbackHash))
      const r=await call('claim',{operationId:p.operationId,transactionId:b.transactionId,browserHash:b.browserHash,callbackHash:b.callbackHash,state:b.state,callbackMaterial:material})
      if(r.status!=='claimed')return rejected()
      ensure(r.transactionId===b.transactionId&&r.browserHash===b.browserHash&&r.callbackHash===b.callbackHash&&(r.mode==='sign_in'||r.mode==='migration')
        &&((r.mode==='sign_in'&&r.originalUserId===null)||(r.mode==='migration'&&uuid(r.originalUserId)))&&uuid(r.shopifyProofReceiptId)
        &&integer(r.fence)&&integer(r.generation,true)&&ms(r.expiresAt)&&opaque(r.applicationPkceChallenge)&&subject(r.reservedSubject)
        &&sha(r.configHash)&&sha(r.intentHash)&&object(r.provisionalMaterial)&&object(r.callbackMaterial))
      const application=provisionalVault.open<Record<string,unknown>>(r.provisionalMaterial,
        ['tll-provisional-admission/1',PROJECT,'application-pkce',b.transactionId,r.configHash as string,b.browserHash,r.intentHash as string,'0'])
      const callback=finalVault.open<Record<string,unknown>>(r.callbackMaterial,callbackContext(b.transactionId,b.browserHash,b.callbackHash))
      ensure(Object.keys(application).join(',')==='verifier'&&opaque(application.verifier)&&Object.keys(callback).join(',')==='authCode'&&callback.authCode===b.authCode
        &&createHash('sha256').update(application.verifier as string).digest('base64url')===r.applicationPkceChallenge)
      return Object.freeze({status:'claimed',transactionId:b.transactionId,browserHash:b.browserHash,callbackHash:b.callbackHash,mode:r.mode,
        exchange:Object.freeze({authCode:b.authCode,applicationVerifier:application.verifier,applicationPkceChallenge:r.applicationPkceChallenge,reservedSubject:r.reservedSubject}),
        originalUserId:r.originalUserId,shopifyProofReceiptId:r.shopifyProofReceiptId,fence:r.fence,generation:r.generation,expiresAt:r.expiresAt} as CustomerFinalClaim)
    },
    async finish(p: FinishInput){if(!active())return false;ensure(uuid(p.transactionId)&&uuid(p.operationId)&&integer(p.fence)&&integer(p.generation,true)&&sha(p.callbackHash)&&uuid(p.shopifyProofReceiptId)
      &&p.result?.kind==='private_provisional'&&uuid(p.result.proof.userId)&&uuid(p.result.identity.identityId)&&subject(p.result.identity.subject)
      &&p.result.identity.userId===p.result.proof.userId&&p.result.session.tokenType==='Bearer'&&ms(p.result.session.expiresAt))
      const s=p.result.session, material=finalVault.seal({accessToken:s.accessToken,refreshToken:s.refreshToken,tokenType:'Bearer',expiresAt:s.expiresAt},
        sessionContext(p.transactionId,p.callbackHash,p.result.proof.userId,p.result.identity.identityId,p.result.identity.subject,p.generation))
      const r=await call('finish',{transactionId:p.transactionId,operationId:p.operationId,fence:p.fence,generation:p.generation,callbackHash:p.callbackHash,
        shopifyProofReceiptId:p.shopifyProofReceiptId,userId:p.result.proof.userId,identityId:p.result.identity.identityId,reservedSubject:p.result.identity.subject,
        authenticatedAt:p.result.proof.authenticatedAt,checkedAt:p.result.proof.checkedAt,expiresAt:p.result.proof.expiresAt,sessionMaterial:material})
      return r.status==='reconciled'
    },
    async release(p: ReleaseInput){if(!active())return rejected();const b=bound(p),r=await call('release',{transactionId:b.transactionId,browserHash:b.browserHash,callbackHash:b.callbackHash})
      if(r.status!=='reconciled')return rejected()
      ensure(r.transactionId===b.transactionId&&r.callbackHash===b.callbackHash&&uuid(r.userId)&&uuid(r.identityId)&&subject(r.reservedSubject)&&integer(r.generation,true)&&object(r.sessionMaterial))
      const s=finalVault.open<Record<string,unknown>>(r.sessionMaterial,sessionContext(b.transactionId,b.callbackHash,r.userId as string,r.identityId as string,r.reservedSubject as string,r.generation as string))
      ensure(Object.keys(s).sort().join(',')==='accessToken,expiresAt,refreshToken,tokenType'&&typeof s.accessToken==='string'&&typeof s.refreshToken==='string'&&s.tokenType==='Bearer'&&ms(s.expiresAt))
      return Object.freeze({status:'reconciled',transactionId:b.transactionId,callbackHash:b.callbackHash,userId:r.userId,identityId:r.identityId,reservedSubject:r.reservedSubject,
        session:Object.freeze({accessToken:s.accessToken,refreshToken:s.refreshToken,tokenType:'Bearer',expiresAt:s.expiresAt})} as CustomerFinalRelease)
    },
    async hold(p: HoldInput){ensure(active()&&uuid(p.operationId));const b=bound(p);ensure((p.fence===undefined||integer(p.fence))&&(p.generation===undefined||integer(p.generation,true)))
      const r=await call('hold',{operationId:p.operationId,transactionId:b.transactionId,browserHash:b.browserHash,callbackHash:b.callbackHash,
        ...(p.fence===undefined?{}:{fence:p.fence}),...(p.generation===undefined?{}:{generation:p.generation})});ensure(r.status==='held')
    }
  })
}
