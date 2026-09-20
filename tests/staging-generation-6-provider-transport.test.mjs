import test from 'node:test'
import assert from 'node:assert/strict'
import { DISABLED_VERCEL_CONFIGURATION, GENERATED_SUPABASE_SECRET_NAMES, GENERATED_VERCEL_SECRET_NAMES, STAGED_VERCEL_NAMES } from '../scripts/staging-generation-6-transport.mjs'
import { readbackProviderNames, removeSupabaseSecrets, removeVercelSecrets, stageSupabaseSecrets, stageVercelSecrets, VERCEL_BRANCH } from '../scripts/staging-generation-6-provider-transport.mjs'

const secretValues=names=>Object.fromEntries(names.map((name,index)=>[name,`private-value-${index}-$()\`never-execute\``]))
function runner(outputs=[]) { const calls=[];return {calls,run:async(args,input,fd)=>{calls.push({args:[...args],input:Buffer.from(input).toString('utf8'),fd});return outputs.shift()??''}} }

test('Supabase staging uses an anonymous fd dotenv stream and never argv or environment values',async()=>{
  const f=runner(),values=secretValues(GENERATED_SUPABASE_SECRET_NAMES);await stageSupabaseSecrets(values,{run:f.run})
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].fd,3);assert.ok(f.calls[0].args.includes('/dev/fd/3'))
  for(const value of Object.values(values))assert.ok(!f.calls[0].args.join(' ').includes(value))
  assert.match(f.calls[0].input,/TLL_STAGING_BROKER_DATABASE_PASSWORD=/);assert.ok(!f.calls[0].args.includes('wrhgscovsgsudtedbljr'))
})

test('Vercel staging is branch-scoped, sensitive for secrets, disabled for all feature flags and stdin-only',async()=>{
  const f=runner(),values=secretValues(GENERATED_VERCEL_SECRET_NAMES)
  await stageVercelSecrets({secrets:values,configuration:DISABLED_VERCEL_CONFIGURATION},{run:f.run})
  assert.equal(f.calls.length,GENERATED_VERCEL_SECRET_NAMES.length+4)
  for(const call of f.calls){assert.ok(call.args.includes(VERCEL_BRANCH));assert.ok(call.args.includes('preview'));assert.equal(call.fd,0);assert.ok(!call.args.join(' ').includes(call.input))}
  assert.ok(f.calls.slice(0,GENERATED_VERCEL_SECRET_NAMES.length).every(call=>call.args.includes('--sensitive')))
  assert.ok(f.calls.slice(-4).every(call=>call.args.includes('--no-sensitive')&&['false','disabled'].includes(call.input)))
})

test('provider readback projects names only for the fixed branch and environment',async()=>{
  const f=runner([JSON.stringify(GENERATED_SUPABASE_SECRET_NAMES.map(name=>({name,value:'must-not-project'}))),JSON.stringify({envs:[
    ...STAGED_VERCEL_NAMES.map(key=>({key,gitBranch:VERCEL_BRANCH,target:['preview'],value:'must-not-project'})),
    {key:'WRONG_BRANCH',gitBranch:'main',target:['preview']},{key:'WRONG_TARGET',gitBranch:VERCEL_BRANCH,target:['production']},
  ]})])
  const result=await readbackProviderNames({run:f.run});assert.deepEqual(result.supabase,[...GENERATED_SUPABASE_SECRET_NAMES].sort());assert.deepEqual(result.vercel,[...STAGED_VERCEL_NAMES].sort())
  assert.doesNotMatch(JSON.stringify(result),/must-not-project/)
})

test('cleanup accepts only the exact generated-name sets and sends no values',async()=>{
  const f=runner();await removeSupabaseSecrets(GENERATED_SUPABASE_SECRET_NAMES,{run:f.run});await removeVercelSecrets(STAGED_VERCEL_NAMES,{run:f.run})
  assert.equal(f.calls.length,1+STAGED_VERCEL_NAMES.length);assert.ok(f.calls.every(call=>call.input===''))
  await assert.rejects(()=>removeSupabaseSecrets(['WRONG'],{run:f.run}),/unavailable/);await assert.rejects(()=>removeVercelSecrets(['WRONG'],{run:f.run}),/unavailable/)
})
