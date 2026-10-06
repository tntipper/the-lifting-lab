import type { CartEnvelope, CartRecord, CartVault } from './staging-cart-service'
import { CartUnavailable } from './staging-cart-service'
import { parseCartRecord, type CartRepositoryPool } from './staging-cart-repository'

type Binding = Readonly<{ sourceSession: string; sourceActor: string; targetSession: string; targetActor: string }>
export type CartTransitionState = Readonly<{ status: 'absent'|'claimed'|'replay'|'reconciled'|'held'|'conflict'; source: CartRecord|null; target: CartRecord|null }>
const HEX=/^[a-f0-9]{64}$/
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const valid=(b:Binding)=>b&&HEX.test(b.sourceSession)&&HEX.test(b.sourceActor)&&HEX.test(b.targetSession)&&HEX.test(b.targetActor)
  &&b.sourceSession!==b.targetSession&&b.sourceActor!==b.targetActor

export function createCartTransitionRepository(options:{enabled:boolean;pool:CartRepositoryPool}){
  const active=options.enabled===true
  async function call(sql:string,args:unknown[]){
    if(!active)throw new CartUnavailable();let client:Awaited<ReturnType<CartRepositoryPool['connect']>>|undefined,ack=false
    try{client=await options.pool.connect();await client.query('BEGIN');const out=await client.query(sql,args);if(out.rows.length!==1)throw new CartUnavailable();await client.query('COMMIT');ack=true;return out.rows[0].result}
    catch{throw new CartUnavailable()}finally{client?.release(!ack)}
  }
  const state=(value:unknown,b:Binding):CartTransitionState=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw new CartUnavailable();const v=value as Record<string,unknown>
    if(!['absent','claimed','replay','reconciled','held','conflict'].includes(v.status as string))throw new CartUnavailable()
    if(v.status==='conflict')return{status:'conflict',source:null,target:null}
    const source=v.source===null?null:parseCartRecord(v.source,b.sourceSession,b.sourceActor)
    const target=v.target===null?null:parseCartRecord(v.target,b.targetSession,b.targetActor)
    return{status:v.status as CartTransitionState['status'],source,target}
  }
  return Object.freeze({
    async read(b:Binding){if(!valid(b))throw new CartUnavailable();return state(await call('SELECT public.tll_cart_transition_read($1::text,$2::text,$3::text,$4::text) AS result',[b.sourceSession,b.sourceActor,b.targetSession,b.targetActor]),b)},
    async claim(b:Binding,requestId:string,revision:number){if(!valid(b)||!UUID.test(requestId)||!Number.isSafeInteger(revision)||revision<0)throw new CartUnavailable();return state(await call('SELECT public.tll_cart_transition_claim($1::text,$2::text,$3::text,$4::text,$5::uuid,$6::bigint) AS result',[b.sourceSession,b.sourceActor,b.targetSession,b.targetActor,requestId,revision]),b)},
    async finish(b:Binding,requestId:string,envelope:CartEnvelope|null,source:CartRecord){
      if(!valid(b)||!UUID.test(requestId)||source.sessionHash!==b.sourceSession||source.actorHash!==b.sourceActor)throw new CartUnavailable()
      const value=await call('SELECT public.tll_cart_transition_finish($1::text,$2::text,$3::text,$4::text,$5::uuid,$6::jsonb,$7::integer,$8::integer,$9::integer) AS result',
        [b.sourceSession,b.sourceActor,b.targetSession,b.targetActor,requestId,envelope===null?null:JSON.stringify(envelope),source.quantity,source.unitPricePence,source.subtotalPence])
      if(!value||typeof value!=='object'||Array.isArray(value))throw new CartUnavailable();const v=value as Record<string,unknown>
      if(v.status==='held'||v.status==='rejected')return{status:v.status as 'held'|'rejected',target:null}
      if(v.status!=='reconciled')throw new CartUnavailable()
      return{status:'reconciled' as const,target:parseCartRecord(v.target,b.targetSession,b.targetActor)}
    },
  })
}

export function createCartTransitionService(options:{repository:ReturnType<typeof createCartTransitionRepository>;vault:CartVault;context:readonly string[]}){
  const aad=(session:string,actor:string)=>['tll-staging-cart/v1',...options.context,session,actor]
  return Object.freeze({
    inspect(binding:Binding){return options.repository.read(binding)},
    async transfer(binding:Binding,requestId:string,revision:number){
      const claim=await options.repository.claim(binding,requestId,revision)
      if(claim.status==='reconciled')return claim
      if(!['claimed','replay'].includes(claim.status)||!claim.source)return claim
      let envelope:CartEnvelope|null=null
      try{if(claim.source.envelope){const cart=options.vault.open<{id:string}>(claim.source.envelope,aad(binding.sourceSession,binding.sourceActor));
          if(!cart||typeof cart.id!=='string'||cart.id.length<1||cart.id.length>2048)throw new CartUnavailable()
          envelope=options.vault.seal({id:cart.id},aad(binding.targetSession,binding.targetActor))}
        const done=await options.repository.finish(binding,requestId,envelope,claim.source)
        return done.status==='reconciled'?{status:'reconciled' as const,source:claim.source,target:done.target}:{status:done.status,source:claim.source,target:null}
      }catch{throw new CartUnavailable()}
    },
  })
}
