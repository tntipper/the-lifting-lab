import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assessStagingWindowProgress, createStagingWindowPhaseJournal, PHASE_DEADLINES_MS } from '../scripts/staging-window-phase-journal.mjs'

const identity={packageId:'tll-staging-generation-11-credentials/v1',target:'qdmvngjwkcsilzmqksme',generation:11,windowId:'11111111-1111-4111-8111-111111111111'}

test('phase journal is exclusive, private, monotonic and contains no secret material',()=>{
  const directory=mkdtempSync(join(tmpdir(),'tll-phase-')),path=join(directory,'phase.json');let now=Date.parse('2026-09-20T21:00:00.000Z')
  const journal=createStagingWindowPhaseJournal({path,makeRunId:()=> 'observer-run-11',now:()=>now})
  const started=journal.start(identity);assert.equal(statSync(path).mode&0o777,0o600);assert.equal(started.phase,'LAUNCH_STARTED')
  now+=1000;const staged=journal.record(started,'VERCEL_STAGE');assert.equal(staged.sequence,1);assert.equal(staged.phase,'VERCEL_STAGE')
  assert.throws(()=>journal.record(staged,'ENTRY_PREFLIGHT'));assert.throws(()=>createStagingWindowPhaseJournal({path}).start(identity))
  now+=1000;const finished=journal.finish(staged,'RECOVERY_VERIFIED');assert.equal(finished.outcome,'RECOVERY_VERIFIED')
  assert.doesNotMatch(JSON.stringify(finished),/password|token|secret|sql|providerValue/i)
})

test('foreign process cannot update an interrupted phase journal',()=>{
  const directory=mkdtempSync(join(tmpdir(),'tll-phase-')),path=join(directory,'phase.json')
  const owner=createStagingWindowPhaseJournal({path,makeRunId:()=> 'owner-run-11'}),intent=owner.start(identity)
  const foreign=createStagingWindowPhaseJournal({path,makeRunId:()=> 'foreign-run-11'})
  assert.throws(()=>foreign.record(intent,'ENTRY_PREFLIGHT'));assert.equal(foreign.read().phase,'LAUNCH_STARTED')
})

test('progress assessment does not call a bounded provider phase stalled at ninety seconds',()=>{
  const updatedAt='2026-09-20T21:00:00.000Z',record={phase:'VERCEL_STAGE',updatedAt,outcome:null}
  assert.equal(PHASE_DEADLINES_MS.VERCEL_STAGE,660_000)
  assert.deepEqual(assessStagingWindowProgress(record,Date.parse(updatedAt)+90_000),{status:'ACTIVE_WITHIN_PHASE_BOUND',phase:'VERCEL_STAGE',elapsedMs:90_000,deadlineMs:660_000})
  assert.equal(assessStagingWindowProgress(record,Date.parse(updatedAt)+660_001).status,'STALE_REQUIRES_RECONCILIATION')
})

test('terminal progress never becomes stale',()=>{
  const record={phase:'SUPABASE_CLEANUP',updatedAt:'2026-09-20T21:00:00.000Z',outcome:'RECOVERY_VERIFIED'}
  assert.deepEqual(assessStagingWindowProgress(record,Date.parse('2026-09-21T21:00:00.000Z')),{status:'TERMINAL',phase:'SUPABASE_CLEANUP',outcome:'RECOVERY_VERIFIED'})
})
