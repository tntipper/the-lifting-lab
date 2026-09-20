import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { dirname, resolve } from 'node:path'

export const PHASE_DEADLINES_MS = Object.freeze({
  LAUNCH_STARTED: 60_000,
  ENTRY_PREFLIGHT: 80_000,
  ENTRY_PREFLIGHT_RETRY: 40_000,
  JOURNAL_INTENT: 10_000,
  MATERIAL_GENERATION: 10_000,
  VERCEL_STAGE: 660_000,
  SUPABASE_STAGE: 40_000,
  PROVIDER_READBACK: 40_000,
  DATABASE_PACKAGE: 10_000,
  DATABASE_DISPATCH: 40_000,
  CONNECTION_VERIFICATION: 420_000,
  DATABASE_RECOVERY: 80_000,
  JOURNAL_FINALIZE: 10_000,
  VERCEL_CLEANUP: 660_000,
  SUPABASE_CLEANUP: 70_000,
})
export const TERMINAL_OUTCOMES = Object.freeze(['SUCCESS','RECOVERY_VERIFIED','RECOVERY_REQUIRED','STOPPED_BEFORE_DATABASE'])
const phases = Object.keys(PHASE_DEADLINES_MS)
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const unavailable = () => { throw new Error('Staging window phase journal unavailable') }
const validIdentity = value => exactKeys(value,['packageId','target','generation','windowId'])
  && typeof value.packageId === 'string' && /^tll-staging-generation-\d+-credentials\/v1$/.test(value.packageId)
  && typeof value.target === 'string' && /^[a-z0-9]{20}$/.test(value.target)
  && Number.isSafeInteger(value.generation) && value.generation > 0
  && typeof value.windowId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.windowId)

function durableReplace(path, value, runId, fileSystem) {
  const temporary = resolve(dirname(path), `.tll-window-phase.${runId}.tmp`)
  const bytes = Buffer.from(JSON.stringify(value) + '\n');let descriptor
  try {
    descriptor=fileSystem.openSync(temporary,'wx',0o600);fileSystem.writeSync(descriptor,bytes);fileSystem.fsyncSync(descriptor)
    fileSystem.closeSync(descriptor);descriptor=undefined;fileSystem.renameSync(temporary,path)
    const directory=fileSystem.openSync(dirname(path),'r');try{fileSystem.fsyncSync(directory)}finally{fileSystem.closeSync(directory)}
  } finally {if(descriptor!==undefined)fileSystem.closeSync(descriptor);bytes.fill(0)}
}

function readRecord(path,fileSystem=fs){
  try{
    const stat=fileSystem.lstatSync(path)
    if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o600||stat.nlink!==1||stat.size>16_384)unavailable()
    const value=JSON.parse(fileSystem.readFileSync(path,'utf8'))
    if(!exactKeys(value,['schema','identity','observerRunId','sequence','phase','startedAt','updatedAt','outcome'])
      ||value.schema!=='tll-staging-window-phase/v1'||!validIdentity(value.identity)||typeof value.observerRunId!=='string'
      ||!Number.isSafeInteger(value.sequence)||value.sequence<0||!phases.includes(value.phase)
      ||typeof value.startedAt!=='string'||typeof value.updatedAt!=='string'
      ||!(value.outcome===null||TERMINAL_OUTCOMES.includes(value.outcome)))unavailable()
    return Object.freeze(value)
  }catch(error){if(error?.code==='ENOENT')return null;unavailable()}
}

export function createStagingWindowPhaseJournal({path,fileSystem=fs,makeRunId=randomUUID,now=Date.now}={}){
  if(typeof path!=='string'||!path)unavailable();let ownedRunId
  return Object.freeze({
    read:()=>readRecord(path,fileSystem),
    start(identity){
      if(!validIdentity(identity)||readRecord(path,fileSystem))unavailable()
      const observerRunId=makeRunId(),timestamp=new Date(now()).toISOString()
      if(typeof observerRunId!=='string'||observerRunId.length<8)unavailable()
      const record=Object.freeze({schema:'tll-staging-window-phase/v1',identity:Object.freeze({...identity}),observerRunId,sequence:0,phase:'LAUNCH_STARTED',startedAt:timestamp,updatedAt:timestamp,outcome:null})
      const directory=dirname(path),bytes=Buffer.from(JSON.stringify(record)+'\n');let descriptor
      try{fileSystem.mkdirSync(directory,{recursive:true,mode:0o700});descriptor=fileSystem.openSync(path,'wx',0o600);fileSystem.writeSync(descriptor,bytes);fileSystem.fsyncSync(descriptor);fileSystem.closeSync(descriptor);descriptor=undefined
        const dir=fileSystem.openSync(directory,'r');try{fileSystem.fsyncSync(dir)}finally{fileSystem.closeSync(dir)};ownedRunId=observerRunId;return record}
      finally{if(descriptor!==undefined)fileSystem.closeSync(descriptor);bytes.fill(0)}
    },
    record(intent,phase){
      if(!intent||intent.observerRunId!==ownedRunId||intent.outcome!==null||!phases.includes(phase))unavailable()
      const current=readRecord(path,fileSystem)
      if(!current||current.observerRunId!==ownedRunId||current.outcome!==null||phases.indexOf(phase)<=phases.indexOf(current.phase))unavailable()
      const next=Object.freeze({...current,sequence:current.sequence+1,phase,updatedAt:new Date(now()).toISOString()});durableReplace(path,next,ownedRunId,fileSystem);return next
    },
    finish(intent,outcome){
      if(!intent||intent.observerRunId!==ownedRunId||!TERMINAL_OUTCOMES.includes(outcome))unavailable()
      const current=readRecord(path,fileSystem);if(!current||current.observerRunId!==ownedRunId||current.outcome!==null)unavailable()
      const next=Object.freeze({...current,sequence:current.sequence+1,updatedAt:new Date(now()).toISOString(),outcome});durableReplace(path,next,ownedRunId,fileSystem);ownedRunId=undefined;return next
    },
  })
}

export function assessStagingWindowProgress(record,nowMs=Date.now()){
  if(!record||!phases.includes(record.phase)||!Number.isFinite(nowMs))unavailable()
  if(record.outcome!==null)return Object.freeze({status:'TERMINAL',phase:record.phase,outcome:record.outcome})
  const updated=Date.parse(record.updatedAt),elapsedMs=nowMs-updated,deadlineMs=PHASE_DEADLINES_MS[record.phase]
  if(!Number.isFinite(updated)||elapsedMs<0)unavailable()
  return Object.freeze({status:elapsedMs<=deadlineMs?'ACTIVE_WITHIN_PHASE_BOUND':'STALE_REQUIRES_RECONCILIATION',phase:record.phase,elapsedMs,deadlineMs})
}
