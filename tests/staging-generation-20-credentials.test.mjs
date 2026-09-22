import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ACTIVE_WINDOW_EXPIRES_AT, assertGeneration20ActiveWindowExpiry, buildGeneration20CredentialSql, createGeneration20DispatchJournal, GENERATION, IDENTITIES, PACKAGE_ID, PREDECESSOR, WINDOW_ID } from '../scripts/staging-generation-20-credentials.mjs'

const NOW = Date.parse('2026-09-22T12:35:00.000Z')
const EXPIRES = ACTIVE_WINDOW_EXPIRES_AT
const verifier = index => `SCRAM-SHA-256$4096:${Buffer.from(`salt-${index}`).toString('base64')}$${Buffer.alloc(32,index+1).toString('base64')}:${Buffer.alloc(32,index+7).toString('base64')}`
const verifiers = () => Object.fromEntries(Object.keys(IDENTITIES).map((purpose,index)=>[purpose,verifier(index)]))

test('generation 20 installer consumes the sole reviewed bounded expiry source',()=>{
  assert.equal(GENERATION,20);assert.equal(PREDECESSOR.generation,19);assert.equal(PREDECESSOR.windowId,'51809dd4-bd4b-44c7-8609-7dd8ca063679')
  assert.equal(ACTIVE_WINDOW_EXPIRES_AT,'2026-09-22T13:23:00.000Z')
  assert.equal(assertGeneration20ActiveWindowExpiry(NOW), ACTIVE_WINDOW_EXPIRES_AT)
  const sql=buildGeneration20CredentialSql({verifiers:verifiers(),nowMs:NOW})
  assert.match(sql, /2026-09-22T13:23:00\.000Z/)
})

test('generation 20 journal is separate, exclusive, mode 0600 and terminal',()=>{
  const directory=mkdtempSync(join(tmpdir(),'tll-gen20-')),path=join(directory,'journal.json'),journal=createGeneration20DispatchJournal({path,makeRunId:()=> 'reviewed-generation-20-run'})
  const intent=journal.recordIntent({expiresAt:EXPIRES,nowMs:NOW});assert.equal(statSync(path).mode&0o777,0o600);assert.equal(journal.read().state,'INTENT_RECORDED')
  const raw=readFileSync(path,'utf8');assert.match(raw,new RegExp(PACKAGE_ID));assert.match(raw,new RegExp(WINDOW_ID));assert.doesNotMatch(raw,/SCRAM|password|secret|token|verifier|BEGIN;/i)
  assert.equal(journal.transition(intent,'RECEIPT_VALIDATED').state,'RECEIPT_VALIDATED');assert.throws(()=>journal.recordIntent({expiresAt:EXPIRES,nowMs:NOW}),/unavailable/)
})
