import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({ entryPoints:['lib/server/staging-customer-session.ts'], bundle:true,
  format:'esm', platform:'node', write:false, logLevel:'silent' })
const { stagingCustomerSessionResponse } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const NOW=Date.parse('2026-09-18T12:00:00Z'),USER='a0000000-0000-4000-8000-000000000001',IDENTITY='b0000000-0000-4000-8000-000000000001'
const enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
const token=change=>`${enc({alg:'ES256',typ:'JWT'})}.${enc({sub:USER,iss:'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1',aud:'authenticated',exp:NOW/1000+3600,...change})}.signature`
const release=change=>({status:'reconciled',transactionId:'c0000000-0000-4000-8000-000000000001',callbackHash:'a'.repeat(64),userId:USER,
  identityId:IDENTITY,reservedSubject:'tllb_'+Buffer.alloc(32,1).toString('base64url'),session:{accessToken:token(),refreshToken:'refresh-'+ 'r'.repeat(40),tokenType:'Bearer',expiresAt:NOW+3600000},...change})

test('writes only a bounded tokens-only SSR session after exact reconciled release',()=>{
  const response=stagingCustomerSessionResponse(release(),NOW)
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/dashboard');assert.match(response.headers.get('cache-control'),/no-store/)
  const cookies=response.headers.getSetCookie(),storage='sb-qdmvngjwkcsilzmqksme-auth-token'
  assert.ok(cookies.some(value=>value.startsWith('__Host-tll-customer-start=')&&value.includes('HttpOnly')&&value.includes('Max-Age=0')))
  assert.ok(cookies.some(value=>value.startsWith('__Host-tll-customer-transaction=')&&value.includes('HttpOnly')&&value.includes('Max-Age=0')))
  const written=cookies.filter(value=>value.startsWith(storage+'=')&&!value.includes('Max-Age=0'))
  assert.equal(written.length,1);assert.equal(written[0].includes('HttpOnly'),false);assert.match(written[0],/Secure; SameSite=Lax; Max-Age=34560000/)
  const value=written[0].slice(storage.length+1,written[0].indexOf(';')),stored=JSON.parse(Buffer.from(value.slice(7),'base64url').toString())
  assert.deepEqual(Object.keys(stored).sort(),['access_token','expires_at','expires_in','refresh_token','token_type'])
  assert.equal(stored.access_token,release().session.accessToken);assert.equal(stored.refresh_token,release().session.refreshToken)
  assert.equal(JSON.stringify(stored).includes(USER),false);assert.equal(JSON.stringify(stored).includes(IDENTITY),false)
  assert.equal(JSON.stringify(stored).includes('reservedSubject'),false);assert.equal(JSON.stringify(stored).includes('email'),false)
})

test('chunks bounded sessions and rejects substituted, expired or oversized releases',()=>{
  const large=release({session:{...release().session,refreshToken:'r'.repeat(5000)}}),response=stagingCustomerSessionResponse(large,NOW)
  const writes=response.headers.getSetCookie().filter(value=>/^sb-qdmvngjwkcsilzmqksme-auth-token\.\d=/.test(value)&&!value.includes('Max-Age=0'))
  assert.ok(writes.length>=2&&writes.length<=3)
  for(const value of [
    release({userId:'a0000000-0000-4000-8000-000000000002'}),
    release({session:{...release().session,accessToken:token({iss:'https://attacker.invalid'})}}),
    release({session:{...release().session,expiresAt:NOW}}),
    release({session:{...release().session,refreshToken:'r'.repeat(10000)}}),
  ]) assert.throws(()=>stagingCustomerSessionResponse(value,NOW),/^Error: Staging customer session release unavailable$/)
})
