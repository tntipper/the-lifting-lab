import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ENDPOINT, FIXED_QUERY, NATIVE_ACCESS_APPROVED, PRIOR_ATTEMPT, PROJECT_REF, QUERY_ID, createObservationJournal, runReconciliationOnce, validateResult } from '../scripts/staging-readonly-reconcile.mjs'

const observed = { queryId: QUERY_ID, projectRef: PROJECT_REF, priorAttempt: PRIOR_ATTEMPT, environmentMarker: true, operator: { current:true,session:true,database:true,notSuperuser:true,createrole:true,readAll:true,writeAll:false,maintain:false }, migrations: { totalCount:15,baselinePairCount:10,forbiddenCount:5 }, controls: { customer:true,cart:true,broker:true,provisional:true,bridge:true }, runtime: { roleCount:5,loginCount:0,passwordCount:0,edgeCount:10,retiredOperatorEdgeCount:5,qualifyingDistinctRoleCount:5,sessionCount:0,retiredMarkerCount:5 }, absentObjects: { shopifyProofs:false,finalizations:false,cartTransitions:false,accountGenerations:false,accountLogouts:false } }

test('reconciliation is disarmed after one observation and remains a single fixed read-only SELECT', () => {
  assert.equal(NATIVE_ACCESS_APPROVED, false); assert.equal(PROJECT_REF, 'qdmvngjwkcsilzmqksme'); assert.equal(QUERY_ID, 'tll-staging-readonly-reconcile/v1')
  assert.deepEqual(ENDPOINT, { hostname:'api.supabase.com',path:'/v1/projects/qdmvngjwkcsilzmqksme/database/query',method:'POST' })
  assert.equal((FIXED_QUERY.match(/;/g) ?? []).length, 1); assert.match(FIXED_QUERY, /^SELECT /); assert.match(FIXED_QUERY, /priorAttempt/)
  assert.doesNotMatch(FIXED_QUERY, /\b(?:BEGIN|COMMIT|DO|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|SECURITY DEFINER)\b/i)
  assert.doesNotMatch(FIXED_QUERY, /(?:operator_status\s*\(|operator_set_enabled\s*\()/)
  for (const value of ['tll_staging_private.environment','tll_staging_private.applied_migrations','tll_customer_private.control','tll_cart_private.control','tll_broker_private.control','tll_provisional_private.control','tll_bridge_private.control','pg_roles','pg_authid','pg_auth_members','pg_stat_activity','to_regclass']) assert.ok(FIXED_QUERY.includes(value))
})

test('valid result returns differences rather than rejecting a changed baseline', () => {
  const result = validateResult([{ tll_staging_readonly_reconcile: observed }])
  assert.equal(result.status, 'PASS'); assert.deepEqual(result.differences, [])
  const changed = structuredClone(observed); changed.migrations.totalCount = 10; changed.absentObjects.shopifyProofs = true
  const changedResult = validateResult([{ tll_staging_readonly_reconcile: changed }])
  assert.equal(changedResult.status, 'PASS'); assert.deepEqual(changedResult.differences.sort(), ['absentObjects','migrations'])
  const reordered = structuredClone(observed); reordered.controls = { cart:true,bridge:true,broker:true,customer:true,provisional:true }
  assert.deepEqual(validateResult([{tll_staging_readonly_reconcile:reordered}]).differences,[])
  assert.throws(() => validateResult([{ tll_staging_readonly_reconcile: { ...observed, runtime: { ...observed.runtime, roleCount: -1 } } }]))
})

test('disabled path reads neither Keychain nor network', async () => {
  let reads=0, posts=0
  const result = await runReconciliationOnce({ readToken:()=>{reads++;return 'x'},post:async()=>{posts++},now:()=>1 })
  assert.deepEqual(result,{status:'NATIVE_ACCESS_DISABLED',target:PROJECT_REF,queryId:QUERY_ID}); assert.equal(reads,0); assert.equal(posts,0)
})

test('post-dispatch output exposes only the coarse diagnostic envelope', async () => {
  const source = readFileSync('scripts/staging-readonly-reconcile.mjs', 'utf8').replace('export const NATIVE_ACCESS_APPROVED = false', 'export const NATIVE_ACCESS_APPROVED = true').replace(/export const DEFAULT_JOURNAL_PATH = .*\n/, "export const DEFAULT_JOURNAL_PATH = '/tmp/tll-reconcile-test.json'\n").replace("if (process.argv[1] === fileURLToPath(import.meta.url))", 'if (false)')
  const enabled = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  const directory=mkdtempSync(join(tmpdir(),'tll-reconcile-error-')); const path=join(directory,'claim.json')
  try { const result=await enabled.runReconciliationOnce({readToken:()=> 'opaque',post:async()=>{throw {kind:'response',statusClass:'4xx',contentType:'json',sizeBucket:'1k',category:'permission',raw:'never'}},journal:enabled.createObservationJournal({path,makeRunId:()=> 'run-0003'}),now:()=>1}); assert.deepEqual(result,{status:'POST_DISPATCH_DIAGNOSTIC',target:PROJECT_REF,queryId:QUERY_ID,outcome:'response',statusClass:'4xx',contentType:'json',sizeBucket:'1k',category:'permission'}); assert.doesNotMatch(readFileSync(path,'utf8'),/never|raw/) } finally { rmSync(directory,{recursive:true,force:true}) }
})

test('exclusive observation claim blocks another process and stores no raw response', () => {
  const directory=mkdtempSync(join(tmpdir(),'tll-reconcile-')); const path=join(directory,'claim.json')
  try { const a=createObservationJournal({path,makeRunId:()=> 'run-0001'}); const intent=a.claim('2026-09-18T00:00:00.000Z'); assert.throws(()=>createObservationJournal({path,makeRunId:()=> 'run-0002'}).claim('2026-09-18T00:00:00.000Z')); a.finish(intent,'PASS_OBSERVED',{observationHash:'a'.repeat(64),differenceKeys:[]}); const saved=readFileSync(path,'utf8'); assert.match(saved,/PASS_OBSERVED/); assert.doesNotMatch(saved,/Authorization|Bearer|SELECT|token/i) } finally { rmSync(directory,{recursive:true,force:true}) }
})

test('manifest pins the disarmed sources and fixed query', () => {
  const manifest=JSON.parse(readFileSync('config/staging-readonly-reconcile-manifest.json','utf8'))
  assert.equal(manifest.nativeAccessApproved,false); assert.equal(manifest.query.id,QUERY_ID); assert.equal(manifest.query.statementCount,1); assert.equal(manifest.transport.maxRequests,1); assert.equal(manifest.transport.maxResponseBytes,16384)
})
