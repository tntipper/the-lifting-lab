import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildGeneration12CredentialSql, createGeneration12DispatchJournal, GENERATION, IDENTITIES, PACKAGE_ID, PREDECESSOR, PREDECESSOR_VALID_UNTIL, PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-12-credentials.mjs'

const NOW = Date.parse('2026-09-20T21:30:00.000Z')
const EXPIRES = '2026-09-20T22:25:00.000Z'
const verifier = index => `SCRAM-SHA-256$4096:${Buffer.from(`salt-${index}`).toString('base64')}$${Buffer.alloc(32,index+1).toString('base64')}:${Buffer.alloc(32,index+7).toString('base64')}`
const verifiers = () => Object.fromEntries(Object.keys(IDENTITIES).map((purpose,index)=>[purpose,verifier(index)]))

test('generation 12 SQL requires exact recovered retired generation 10 and remains one disabled staging transaction',()=>{
  const values=verifiers(),sql=buildGeneration12CredentialSql({expiresAt:EXPIRES,verifiers:values,nowMs:NOW})
  assert.equal(GENERATION,12);assert.equal(PREDECESSOR.generation,10);assert.ok(sql.startsWith('BEGIN;\n'));assert.equal((sql.match(/^COMMIT;$/gm)??[]).length,1)
  assert.equal((sql.match(/^ALTER ROLE /gm)??[]).length,5);assert.equal((sql.match(/^GRANT /gm)??[]).length,5)
  assert.match(sql,new RegExp(PROJECT_REF));assert.match(sql,new RegExp(WINDOW_ID));assert.match(sql,/Generation 12 retired predecessor mismatch/)
  assert.ok(sql.includes(`"expiresAt":"${PREDECESSOR.expiresAt}","generation":10,"projectRef":"${PROJECT_REF}","state":"retired","windowId":"${PREDECESSOR.windowId}"`))
  assert.match(sql,/substring\(role_marker FROM/);assert.match(sql,/parsed_marker IS DISTINCT FROM/);assert.doesNotMatch(sql,/shobj_description\(oid,'pg_authid'\) IS DISTINCT FROM/)
  assert.equal(PREDECESSOR_VALID_UNTIL,PREDECESSOR.expiresAt);assert.ok(sql.includes(`rolvaliduntil IS DISTINCT FROM '${PREDECESSOR.expiresAt}'::timestamptz`));assert.match(sql,/Generation 12 control changed during install/)
  assert.match(sql,/tll_generation_12_credential_receipt/);assert.doesNotMatch(sql,/tll_generation_6_credential_receipt/)
  for(const [purpose,identity] of Object.entries(IDENTITIES)){assert.match(sql,new RegExp(`GRANT ${identity.membership} TO ${identity.login}`));assert.ok(sql.includes(values[purpose]))}
})

test('generation 12 expiry and verifier contract fails closed',()=>{
  assert.throws(()=>buildGeneration12CredentialSql({expiresAt:'2026-09-20T22:30:01.000Z',verifiers:verifiers(),nowMs:NOW}),/unavailable/)
  const missing=verifiers();delete missing.bridge;assert.throws(()=>buildGeneration12CredentialSql({expiresAt:EXPIRES,verifiers:missing,nowMs:NOW}),/unavailable/)
  const duplicate=verifiers();duplicate.bridge=duplicate.customer;assert.throws(()=>buildGeneration12CredentialSql({expiresAt:EXPIRES,verifiers:duplicate,nowMs:NOW}),/unavailable/)
})

test('generation 12 journal is separate, exclusive, mode 0600 and terminal',()=>{
  const directory=mkdtempSync(join(tmpdir(),'tll-gen12-')),path=join(directory,'journal.json'),journal=createGeneration12DispatchJournal({path,makeRunId:()=> 'reviewed-generation-12-run'})
  const intent=journal.recordIntent({expiresAt:EXPIRES,nowMs:NOW});assert.equal(statSync(path).mode&0o777,0o600);assert.equal(journal.read().state,'INTENT_RECORDED')
  const raw=readFileSync(path,'utf8');assert.match(raw,new RegExp(PACKAGE_ID));assert.match(raw,new RegExp(WINDOW_ID));assert.doesNotMatch(raw,/SCRAM|password|secret|token|verifier|BEGIN;/i)
  assert.equal(journal.transition(intent,'RECEIPT_VALIDATED').state,'RECEIPT_VALIDATED');assert.throws(()=>journal.recordIntent({expiresAt:EXPIRES,nowMs:NOW}),/unavailable/)
})
