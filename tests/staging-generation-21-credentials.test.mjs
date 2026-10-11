import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ACTIVE_WINDOW_EXPIRES_AT, assertGeneration21ActiveWindowExpiry, buildGeneration21CredentialSql, createGeneration21DispatchJournal, GENERATION, IDENTITIES, PACKAGE_ID, PREDECESSOR, WINDOW_ID } from '../scripts/staging-generation-21-credentials.mjs'

const NOW = Date.parse('2026-09-22T13:10:00.000Z')
const EXPIRES = '2026-09-22T14:00:00.000Z'
const verifier = index => `SCRAM-SHA-256$4096:${Buffer.from(`salt-${index}`).toString('base64')}$${Buffer.alloc(32,index+1).toString('base64')}:${Buffer.alloc(32,index+7).toString('base64')}`
const verifiers = () => Object.fromEntries(Object.keys(IDENTITIES).map((purpose,index)=>[purpose,verifier(index)]))

test('generation 21 installer fails closed after the reviewed window is consumed',()=>{
  assert.equal(GENERATION,21);assert.equal(PREDECESSOR.generation,19);assert.equal(PREDECESSOR.windowId,'51809dd4-bd4b-44c7-8609-7dd8ca063679')
  assert.equal(ACTIVE_WINDOW_EXPIRES_AT,'UNSET_REQUIRES_REVIEWED_ARMING_DIFF')
  assert.throws(()=>assertGeneration21ActiveWindowExpiry(NOW),/unavailable/)
  assert.throws(()=>buildGeneration21CredentialSql({verifiers:verifiers(),nowMs:NOW}),/unavailable/)
  const source=readFileSync('scripts/staging-generation-21-credentials.mjs','utf8')
  assert.match(source,/WHERE \(g\.rolname IN\(\$\{roleList\}\) OR m\.rolname IN\(\$\{roleList\}\)\)/)
  assert.match(source,/m\.rolname=operator_name[\s\S]*e\.admin_option AND NOT e\.inherit_option AND NOT e\.set_option/)
  assert.match(source,/m\.rolname=session_user[\s\S]*e\.admin_option AND NOT e\.inherit_option AND NOT e\.set_option/)
  assert.match(source,/AND NOT \(\(\(g\.rolname,m\.rolname\) IN/)
  assert.match(source,/count\(\*\) FROM tll_customer_private\.control\)<>1/)
  assert.match(source,/tll_bridge_private\.control WHERE NOT singleton OR enabled/)
})

test('generation 21 journal is separate, exclusive, mode 0600 and terminal',()=>{
  const directory=mkdtempSync(join(tmpdir(),'tll-gen21-')),path=join(directory,'journal.json'),journal=createGeneration21DispatchJournal({path,makeRunId:()=> 'reviewed-generation-21-run'})
  const intent=journal.recordIntent({expiresAt:EXPIRES,nowMs:NOW});assert.equal(statSync(path).mode&0o777,0o600);assert.equal(journal.read().state,'INTENT_RECORDED')
  const raw=readFileSync(path,'utf8');assert.match(raw,new RegExp(PACKAGE_ID));assert.match(raw,new RegExp(WINDOW_ID));assert.doesNotMatch(raw,/SCRAM|password|secret|token|verifier|BEGIN;/i)
  assert.equal(journal.transition(intent,'RECEIPT_VALIDATED').state,'RECEIPT_VALIDATED');assert.throws(()=>journal.recordIntent({expiresAt:EXPIRES,nowMs:NOW}),/unavailable/)
})
