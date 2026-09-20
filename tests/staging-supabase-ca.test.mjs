import test from 'node:test'
import assert from 'node:assert/strict'
import {readPinnedSupabaseCa,SUPABASE_CA_DER_SHA256,SUPABASE_CA_FILE_SHA256} from '../scripts/staging-supabase-ca.mjs'

test('loads the exact public Supabase root and returns its DER fingerprint',()=>{
  const result=readPinnedSupabaseCa({now:Date.parse('2026-09-20T00:00:00Z')})
  assert.match(result.pem,/^-----BEGIN CERTIFICATE-----/)
  assert.equal(result.sha256,SUPABASE_CA_DER_SHA256)
  assert.equal(SUPABASE_CA_FILE_SHA256,'700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7')
  assert.equal(Object.isFrozen(result),true)
})

test('fails closed for changed bytes, non-buffer reads and dates outside validity',()=>{
  for(const options of [
    {read:()=>Buffer.from('changed')},
    {read:()=> 'not-a-buffer'},
    {now:Date.parse('2031-04-26T10:56:54Z')},
  ]) assert.throws(()=>readPinnedSupabaseCa(options),/unavailable/)
})
