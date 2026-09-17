import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createAesGcmEnvelopeVault } from '../lib/identity/customer-token-vault.ts'
const context = ['synthetic-purpose/v1','synthetic-project','owner-a','record-a','generation-1']
const material = { accessToken:'synthetic-private-access',refreshToken:'synthetic-private-refresh',idToken:'synthetic-id',scopeProvenance:{source:'unchanged_request'},refreshTokenProvenance:{source:'retained_original'},unicode:'補充' }
const fixture = () => createAesGcmEnvelopeVault({activeKeyId:'synthetic-1',keys:new Map([['synthetic-1',randomBytes(32)]])})
test('authenticated encryption roundtrips all private metadata without plaintext envelope fields',()=>{
 const v=fixture(),a=v.seal(material,context),b=v.seal(material,context)
 assert.deepEqual(v.open(a,context),material);assert.deepEqual(v.open(b,context),material)
 assert.notEqual(a.iv,b.iv);assert.notEqual(a.ciphertext,b.ciphertext)
 assert.doesNotMatch(JSON.stringify(a),/synthetic-private|synthetic-id|scopeProvenance|補充/);v.destroy()
})
test('every binding dimension and envelope/header alteration fails closed',()=>{
 const v=fixture(),e=v.seal(material,context)
 for(let i=0;i<context.length;i++){const wrong=[...context];wrong[i]+='-other';assert.throws(()=>v.open(e,wrong),/unavailable/)}
 for(const field of ['iv','tag','ciphertext']){const wrong={...e,[field]:(e[field][0]==='A'?'B':'A')+e[field].slice(1)};assert.throws(()=>v.open(wrong,context),/unavailable/)}
 for(const change of [{kid:'absent'},{alg:'A128GCM'},{v:2},{extra:true},{iv:e.iv+'='},{tag:''},{ciphertext:'x'.repeat(200001)}])assert.throws(()=>v.open({...e,...change},context),/unavailable/)
 v.destroy()
})
test('key ID is authenticated even if two injected IDs contain the same key',()=>{
 const key=randomBytes(32),v=createAesGcmEnvelopeVault({activeKeyId:'one',keys:new Map([['one',key],['two',key]])}),e=v.seal(material,context)
 assert.throws(()=>v.open({...e,kid:'two'},context),/unavailable/);v.destroy()
})
test('rotation reads retained key version, writes active version and requires the old key for old envelopes',()=>{
 const one=randomBytes(32),two=randomBytes(32),old=createAesGcmEnvelopeVault({activeKeyId:'one',keys:new Map([['one',one]])}),e=old.seal(material,context)
 const rotating=createAesGcmEnvelopeVault({activeKeyId:'two',keys:new Map([['one',one],['two',two]])})
 assert.deepEqual(rotating.open(e,context),material);assert.equal(rotating.seal(material,context).kid,'two')
 const retired=createAesGcmEnvelopeVault({activeKeyId:'two',keys:new Map([['two',two]])});assert.throws(()=>retired.open(e,context),/unavailable/)
 old.destroy();rotating.destroy();retired.destroy()
})
test('key buffers are privately copied and destroyed vaults cannot encrypt or decrypt',()=>{
 const key=randomBytes(32),v=createAesGcmEnvelopeVault({activeKeyId:'one',keys:new Map([['one',key]])}),e=v.seal(material,context)
 key.fill(0);assert.deepEqual(v.open(e,context),material);v.destroy();v.destroy()
 assert.throws(()=>v.open(e,context),/unavailable/);assert.throws(()=>v.seal(material,context),/unavailable/)
})
test('invalid keyrings, oversized UTF8, sparse contexts and malformed JSON are rejected',()=>{
 for(const input of [{activeKeyId:'missing',keys:new Map([['one',randomBytes(32)]])},{activeKeyId:'one',keys:new Map([['one',randomBytes(31)]])},{activeKeyId:'one',keys:new Map()}])assert.throws(()=>createAesGcmEnvelopeVault(input),/unavailable/)
 const v=fixture();for(const value of [null,[],{x:'補'.repeat(50000)},undefined])assert.throws(()=>v.seal(value,context),/unavailable/)
 for(const c of [[],['one'],Array(2),['one','bad\n']])assert.throws(()=>v.seal(material,c),/unavailable/)
 const circular={};circular.self=circular;assert.throws(()=>v.seal(circular,context),/unavailable/);v.destroy()
})
