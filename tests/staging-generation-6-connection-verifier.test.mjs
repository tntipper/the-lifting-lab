import test from 'node:test'
import assert from 'node:assert/strict'
import { ENTRYPOINTS, FUNCTION_MATRIX_QUERY, IDENTITY_QUERY, MEMBERSHIP_QUERY, PRIVATE_TABLE_DENIAL_QUERY, verifyGeneration6Connections } from '../scripts/staging-generation-6-connection-verifier.mjs'
import { IDENTITIES } from '../scripts/staging-generation-6-credentials.mjs'

const purposes=Object.keys(IDENTITIES),expiresAt='2026-09-20T18:55:00.000Z',passwords=Object.fromEntries(purposes.map(p=>[p,`synthetic-${p}`]))
function fixture(change={}){const events=[];return {events,createRuntime({purpose,password}){assert.equal(password,passwords[purpose]);let destroyed=false
  return {pool:{async connect(){events.push(`${purpose}:connect`);return {async query(sql){
    if(sql===IDENTITY_QUERY)return {rows:[{database:'postgres',current_role:IDENTITIES[purpose].login,session_role:IDENTITIES[purpose].login,application_name:`tll-staging-${purpose}`,can_login:true,inherits:false,superuser:false,bypass_rls:false,create_role:false,create_database:false,replication:false,valid_until:expiresAt,...change.identity}]}
    if(sql===MEMBERSHIP_QUERY)return {rows:[{granted:IDENTITIES[purpose].membership,member:IDENTITIES[purpose].login,grantor:'postgres',admin_option:false,inherit_option:true,set_option:false,...change.membership}]}
    if(sql===FUNCTION_MATRIX_QUERY)return {rows:Object.entries(ENTRYPOINTS).flatMap(([owner,list])=>list.map(signature=>({purpose:owner,signature,present:true,allowed:owner===purpose,...change.matrix})))}
    if(sql===PRIVATE_TABLE_DENIAL_QUERY){destroyed=true;throw Error('contained denial')}
    if(purpose==='cart'){destroyed=true;throw Error('contained disabled control')}
    return {rows:[{result:{status:change.ownStatus??'rejected'}}]}
  },release(force){destroyed ||= force===true}}}},async close(){events.push(`${purpose}:close`);assert.equal(destroyed,true)}}}}
}

test('five current-schema identities pass exact membership, function matrix, disabled probe and table denial',async()=>{
  const f=fixture(),result=await verifyGeneration6Connections({passwords,expiresAt,createRuntime:f.createRuntime});assert.equal(result.status,'PASS');assert.equal(result.purposes,5)
  assert.deepEqual(f.events,purposes.flatMap(p=>[`${p}:connect`,`${p}:close`]))
})

for(const [name,change] of [['identity',{identity:{bypass_rls:true}}],['membership',{membership:{admin_option:true}}],['matrix',{matrix:{allowed:true}}],['own probe',{ownStatus:'ready'}]])
  test(`connection verifier fails closed on ${name}`,async()=>{const f=fixture(change);await assert.rejects(()=>verifyGeneration6Connections({passwords,expiresAt,createRuntime:f.createRuntime}),/unavailable/)})
