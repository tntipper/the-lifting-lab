import test from 'node:test'
import assert from 'node:assert/strict'
import { connectionFailureReport, ENTRYPOINTS, FUNCTION_MATRIX_QUERY, IDENTITY_QUERY, MEMBERSHIP_QUERY, OWN_PROBE, POOLER_CONVERGENCE_MS, PRIVATE_TABLE_DENIAL_QUERY, verifyGeneration6Connections } from '../scripts/staging-generation-6-connection-verifier.mjs'
import { IDENTITIES } from '../scripts/staging-generation-6-credentials.mjs'

const purposes=Object.keys(IDENTITIES),expiresAt='2026-09-20T18:55:00.000Z',passwords=Object.fromEntries(purposes.map(p=>[p,`synthetic-${p}`]))
const tlsCa=Object.freeze({pem:'synthetic-public-supabase-ca',sha256:'8'.repeat(64)})
function fixture(change={}){const events=[];return {events,createRuntime({purpose,password,tlsCa:receivedCa}){assert.equal(password,passwords[purpose]);assert.equal(receivedCa,tlsCa);let destroyed=false
  return {pool:{async connect(){events.push(`${purpose}:connect`);return {async query(sql){
    if(sql===IDENTITY_QUERY)return {rows:[{database:'postgres',current_role:IDENTITIES[purpose].login,session_role:IDENTITIES[purpose].login,application_name:'Supavisor',can_login:true,inherits:false,superuser:false,bypass_rls:false,create_role:false,create_database:false,replication:false,valid_until:expiresAt,...change.identity}]}
    if(sql===MEMBERSHIP_QUERY)return {rows:[{granted:IDENTITIES[purpose].membership,member:IDENTITIES[purpose].login,grantor:'postgres',admin_option:false,inherit_option:true,set_option:false,...change.membership}]}
    if(sql===FUNCTION_MATRIX_QUERY)return {rows:Object.entries(ENTRYPOINTS).flatMap(([owner,list])=>list.map(signature=>({purpose:owner,signature,present:true,allowed:owner===purpose,...change.matrix})))}
    if(sql===PRIVATE_TABLE_DENIAL_QUERY){destroyed=true;throw Error('contained denial')}
    if(purpose==='cart'||purpose==='bridge'){destroyed=true;throw Error('contained raise-mode probe')}
    return {rows:[{result:{status:change.ownStatus??'rejected'}}]}
  },release(force){destroyed ||= force===true}}}},async close(){events.push(`${purpose}:close`);assert.equal(destroyed,true)}}}}
}

test('five current-schema identities pass exact membership, function matrix, disabled probe and table denial',async()=>{
  const f=fixture(),result=await verifyGeneration6Connections({passwords,expiresAt,tlsCa,createRuntime:f.createRuntime});assert.equal(result.status,'PASS');assert.equal(result.purposes,5)
  assert.deepEqual(f.events,purposes.flatMap(p=>[`${p}:connect`,`${p}:close`]))
})

for(const [name,change] of [['identity',{identity:{bypass_rls:true}}],['membership',{membership:{admin_option:true}}],['matrix',{matrix:{allowed:true}}],['own probe',{ownStatus:'ready'}]])
  test(`connection verifier fails closed on ${name}`,async()=>{const f=fixture(change);await assert.rejects(()=>verifyGeneration6Connections({passwords,expiresAt,tlsCa,createRuntime:f.createRuntime}),/unavailable/)})

test('one failed connection waits once and uses one fresh runtime',async()=>{
  const f=fixture(),waits=[];let attempts=0
  const createRuntime=input=>{const runtime=f.createRuntime(input);if(input.purpose==='customer'&&attempts++===0){runtime.pool.connect=async()=>{throw Error('private stale credential')};runtime.close=async()=>f.events.push('customer:close')}return runtime}
  const result=await verifyGeneration6Connections({passwords,expiresAt,tlsCa,createRuntime,pause:async ms=>waits.push(ms)})
  assert.equal(result.status,'PASS');assert.deepEqual(waits,[POOLER_CONVERGENCE_MS]);assert.deepEqual(f.events.slice(0,3),['customer:close','customer:connect','customer:close'])
})

test('second connection failure reports only fixed purpose and check',async()=>{
  const f=fixture(),waits=[]
  const createRuntime=input=>{const runtime=f.createRuntime(input);if(input.purpose==='customer'){runtime.pool.connect=async()=>{throw Error('PRIVATE_PASSWORD')};runtime.close=async()=>f.events.push('customer:close')}return runtime}
  try{await verifyGeneration6Connections({passwords,expiresAt,tlsCa,createRuntime,pause:async ms=>waits.push(ms)});assert.fail('must reject')}
  catch(error){assert.deepEqual(connectionFailureReport(error),{status:'FAIL',reason:'connection_verification_failed',purpose:'customer',check:'connect_retry',purposesPassed:0});assert.doesNotMatch(JSON.stringify(connectionFailureReport(error)),/PRIVATE|PASSWORD/)}
  assert.deepEqual(waits,[POOLER_CONVERGENCE_MS])
})

test('identity drift reports fixed diagnostic and accepts Supavisor backend identity',async()=>{
  const f=fixture({identity:{application_name:'PRIVATE_CLIENT_VALUE'}})
  try{await verifyGeneration6Connections({passwords,expiresAt,tlsCa,createRuntime:f.createRuntime});assert.fail('must reject')}
  catch(error){assert.deepEqual(connectionFailureReport(error),{status:'FAIL',reason:'connection_verification_failed',purpose:'customer',check:'identity',purposesPassed:0});assert.doesNotMatch(JSON.stringify(connectionFailureReport(error)),/PRIVATE|CLIENT/)}
})

test('missing or malformed public CA input fails before any runtime is created',async()=>{
  for(const candidate of [undefined,null,{}, {pem:'',sha256:'8'.repeat(64)},{pem:'synthetic',sha256:'bad'},{pem:'synthetic',sha256:'8'.repeat(64),extra:true}]){
    let calls=0
    await assert.rejects(()=>verifyGeneration6Connections({passwords,expiresAt,tlsCa:candidate,createRuntime(){calls++}}),/unavailable/)
    assert.equal(calls,0)
  }
})


test('bridge own_probe expects raise via allow-listed register with empty payload', () => {
  const [query, payload, expected] = OWN_PROBE.bridge
  assert.match(query, /tll_bridge_private\.repository\('register'/)
  assert.equal(payload, '{}')
  assert.equal(expected, 'error')
  assert.notEqual(expected, 'rejected')
  assert.doesNotMatch(query, /'admit'/)
  // cart remains the other raise-mode probe; other purposes stay soft-reject
  assert.equal(OWN_PROBE.cart[2], 'error')
  assert.equal(OWN_PROBE.customer[2], 'rejected')
  assert.equal(OWN_PROBE.broker[2], 'rejected')
  assert.equal(OWN_PROBE.provisional[2], 'rejected')
})

test('bridge own_probe failure report carries expectedMode error and purposesPassed', async () => {
  const f = fixture()
  const createRuntime = input => {
    const runtime = f.createRuntime(input)
    if (input.purpose === 'bridge') {
      const inner = runtime.pool.connect
      runtime.pool.connect = async () => {
        const client = await inner()
        const original = client.query
        client.query = async (sql, params) => {
          if (typeof sql === 'string' && sql.includes("tll_bridge_private.repository('register'")) {
            // Simulate soft-reject row instead of raise — must fail closed for expectedMode error
            return { rows: [{ result: { status: 'rejected' } }] }
          }
          return original(sql, params)
        }
        return client
      }
    }
    return runtime
  }
  try {
    await verifyGeneration6Connections({ passwords, expiresAt, tlsCa, createRuntime: createRuntime })
    assert.fail('must reject')
  } catch (error) {
    assert.deepEqual(connectionFailureReport(error), {
      status: 'FAIL',
      reason: 'connection_verification_failed',
      purpose: 'bridge',
      check: 'own_probe',
      expectedMode: 'error',
      purposesPassed: 4,
    })
  }
})
