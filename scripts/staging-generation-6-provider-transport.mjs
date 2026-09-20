/** Fixed staging provider adapters. No function in this module reads a value. */
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { globSync, lstatSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, sep } from 'node:path'
import { DISABLED_VERCEL_CONFIGURATION, GENERATED_SUPABASE_SECRET_NAMES, GENERATED_VERCEL_SECRET_NAMES, STAGED_VERCEL_NAMES } from './staging-generation-6-transport.mjs'
import { PROJECT_REF } from './staging-generation-6-credentials.mjs'

export const NPX = '/usr/local/bin/npx'
export const SUPABASE_CLI_SHA256 = 'c2ca0770b4634e85a01254ffdfda1999063e5d424f41dc345839e62171d8bb4b'
export const VERCEL_PROJECT = 'the-lifting-lab'
export const VERCEL_SCOPE = 'my-lifting-lab-s-projects'
export const VERCEL_BRANCH = 'codex/tll-integration'
const MAX_OUTPUT = 1024 * 1024
export const SUPABASE_TRANSPORT_PROBE_NAMES = Object.freeze(['TLL_STAGING_TRANSPORT_PROBE_A','TLL_STAGING_TRANSPORT_PROBE_B'])
export class ProviderTransportError extends Error {
  constructor(code='PROVIDER_VALIDATION') { super('Generation-6 provider transport unavailable');this.name='ProviderTransportError';this.code=code }
}
const unavailable = code => { throw new ProviderTransportError(code) }
const safeEnvironment = () => Object.freeze({ PATH: '/usr/local/bin:/usr/bin:/bin', HOME: homedir(), LANG: 'C.UTF-8',
  NO_UPDATE_NOTIFIER: '1', npm_config_update_notifier: 'false' })

function containsAsciiFolded(buffer,pattern) {
  const needle=Buffer.from(pattern,'ascii')
  outer: for(let offset=0;offset<=buffer.length-needle.length;offset++) {
    for(let index=0;index<needle.length;index++) {
      const byte=buffer[offset+index],folded=byte>=65&&byte<=90?byte+32:byte
      if(folded!==needle[index])continue outer
    }
    return true
  }
  return false
}
export function classifyProviderFailure(buffer) {
  if(!Buffer.isBuffer(buffer))return 'CLI_EXIT'
  if(['unauthorized','forbidden','access token','not logged in',' 401',' 403'].some(value=>containsAsciiFolded(buffer,value)))return 'AUTH'
  if(['timeout','timed out','connection','network',' tls','socket',' 429',' 502',' 503',' 504'].some(value=>containsAsciiFolded(buffer,value)))return 'TRANSIENT'
  if(['invalid','reserved','env file','dotenv','secret name','must not'].some(value=>containsAsciiFolded(buffer,value)))return 'VALIDATION'
  if(['api',' 400',' 404',' 409',' 422',' 500'].some(value=>containsAsciiFolded(buffer,value)))return 'API'
  return 'CLI_EXIT'
}

function runBounded(executable,args,input,inputFd) {
  if (!Array.isArray(args) || args.some(value => typeof value !== 'string') || !Buffer.isBuffer(input) || ![0,3].includes(inputFd)) unavailable()
  return new Promise((resolve, reject) => {
    const stdio = ['ignore','pipe','pipe',inputFd === 3 ? 'pipe' : 'ignore']; if (inputFd === 0) stdio[0] = 'pipe'
    const child = spawn(executable, args, { stdio, env: safeEnvironment() }); const outputChunks=[],errorChunks=[]; let size=0, done=false
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);for(const chunk of [...outputChunks,...errorChunks])chunk.fill(0);if(error)reject(error);else resolve(value)}
    const fail=code=>{try{child.kill('SIGKILL')}catch{};finish(new ProviderTransportError(code))}
    const timer=setTimeout(()=>fail('TIMEOUT'),30_000);child.on('error',()=>fail('SPAWN'))
    for(const [stream,chunks] of [[child.stdout,outputChunks],[child.stderr,errorChunks]]) { stream.on('error',()=>fail('STREAM'));stream.on('data',chunk=>{size+=chunk.length;if(size>MAX_OUTPUT){chunk.fill(0);fail('OUTPUT_LIMIT')}else chunks.push(chunk)}) }
    child.on('close',code=>{if(code!==0){const diagnostic=Buffer.concat([...outputChunks,...errorChunks]);try{return fail(classifyProviderFailure(diagnostic))}finally{diagnostic.fill(0)}}const output=Buffer.concat(outputChunks);try{finish(null,output.toString('utf8'))}finally{output.fill(0)}})
    const destination=inputFd===3?child.stdio[3]:child.stdin;destination.on('error',()=>fail('INPUT_STREAM'));destination.end(input)
  })
}
export const runPrivateCli=(args,input,inputFd=0)=>runBounded(NPX,args,input,inputFd)

export function resolveSupabaseCli({home=homedir(),glob=globSync,lstat=lstatSync,read=readFileSync,uid=process.getuid?.(),expectedHash=SUPABASE_CLI_SHA256}={}) {
  const suffix=['node_modules','@supabase','cli-darwin-arm64','bin','supabase'].join(sep),base=join(home,'.npm','_npx')+sep
  const candidates=glob(join(base,'*',suffix)).sort()
  for(const candidate of candidates){let stat,bytes
    try {stat=lstat(candidate);if(!candidate.startsWith(base)||!candidate.endsWith(sep+suffix)||!stat.isFile()||stat.isSymbolicLink()
      ||stat.uid!==uid||(stat.mode&0o022)!==0||stat.size<10_000_000||stat.size>100_000_000)continue
      bytes=read(candidate);if(!Buffer.isBuffer(bytes)||createHash('sha256').update(bytes).digest('hex')!==expectedHash)continue
      return candidate
    } catch { /* inspect the next exact candidate */ }
    finally { bytes?.fill(0) }
  }
  unavailable()
}
export const runSupabasePrivateCli=(args,input,inputFd=0)=>runBounded(resolveSupabaseCli(),args,input,inputFd)

function validateMap(value, names) {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).sort().join('|')!==[...names].sort().join('|')) unavailable()
  for(const [name,secret] of Object.entries(value)) if(!/^[A-Z][A-Z0-9_]+$/.test(name)||typeof secret!=='string'||secret.length<1||secret.length>24_576||/[\0\r]/.test(secret)) unavailable()
}
const encodeDotenv = values => Buffer.from(Object.entries(values).map(([name,value])=>`${name}=${JSON.stringify(value)}`).join('\n')+'\n')
const vercelBase = ['--project',VERCEL_PROJECT,'--scope',VERCEL_SCOPE,'--non-interactive','--no-color']

export async function stageSupabaseSecrets(secrets,{run=runSupabasePrivateCli}={}) {
  validateMap(secrets,GENERATED_SUPABASE_SECRET_NAMES);const input=encodeDotenv(secrets)
  try { await run(['secrets','set','--env-file','/dev/fd/3','--project-ref',PROJECT_REF,'--output','json'],input,3) }
  finally { input.fill(0) }
}

async function listSupabaseSecretNames(run) {
  const raw=await run(['secrets','list','--project-ref',PROJECT_REF,'--output','json'],Buffer.alloc(0),0)
  try {const values=JSON.parse(raw);if(!Array.isArray(values))unavailable('READBACK');return values.map(value=>value?.name).filter(value=>typeof value==='string')}
  catch(error){if(error instanceof ProviderTransportError)throw error;unavailable('READBACK')}
}

export async function probeSupabaseSecretTransport({run=runSupabasePrivateCli,random=randomBytes}={}) {
  const bytes=random(24);if(!Buffer.isBuffer(bytes)||bytes.length!==24)unavailable()
  const values=Object.fromEntries(SUPABASE_TRANSPORT_PROBE_NAMES.map((name,index)=>[name,`${index}_${bytes.toString('base64url')}`]))
  const input=encodeDotenv(values);let failure
  try {
    await run(['secrets','set','--env-file','/dev/fd/3','--project-ref',PROJECT_REF,'--output','json'],input,3)
    const names=await listSupabaseSecretNames(run)
    if(SUPABASE_TRANSPORT_PROBE_NAMES.some(name=>!names.includes(name)))unavailable('READBACK')
  } catch(error) { failure=error instanceof ProviderTransportError?error:new ProviderTransportError('PROBE') }
  finally {
    input.fill(0);bytes.fill(0)
    for(const name of SUPABASE_TRANSPORT_PROBE_NAMES)try{await run(['secrets','unset',name,'--project-ref',PROJECT_REF,'--output','json'],Buffer.alloc(0),0)}catch{}
    const remaining=await listSupabaseSecretNames(run)
    if(SUPABASE_TRANSPORT_PROBE_NAMES.some(name=>remaining.includes(name)))unavailable('CLEANUP')
  }
  if(failure)throw failure
  return Object.freeze({status:'SUPABASE_SECRET_TRANSPORT_OK',probeSecretCount:SUPABASE_TRANSPORT_PROBE_NAMES.length,cleanupVerified:true})
}

async function putVercel(name,value,sensitive,run) {
  const input=Buffer.from(value)
  try { await run(['--yes','vercel','env','add',name,'preview','--git-branch',VERCEL_BRANCH,...vercelBase,sensitive?'--sensitive':'--no-sensitive','--force'],input,0) }
  finally { input.fill(0) }
}

export async function stageVercelSecrets({secrets,configuration},{run=runPrivateCli}={}) {
  validateMap(secrets,GENERATED_VERCEL_SECRET_NAMES);validateMap(configuration,Object.keys(DISABLED_VERCEL_CONFIGURATION))
  for(const name of GENERATED_VERCEL_SECRET_NAMES) await putVercel(name,secrets[name],true,run)
  for(const name of Object.keys(DISABLED_VERCEL_CONFIGURATION).sort()) {
    if(configuration[name]!==DISABLED_VERCEL_CONFIGURATION[name]) unavailable()
    await putVercel(name,configuration[name],false,run)
  }
}

export async function readbackProviderNames({run=runPrivateCli,runSupabase=runSupabasePrivateCli}={}) {
  const empty=Buffer.alloc(0)
  const [supabaseRaw,vercelRaw]=await Promise.all([
    runSupabase(['secrets','list','--project-ref',PROJECT_REF,'--output','json'],empty,0),
    run(['--yes','vercel','env','ls','preview',VERCEL_BRANCH,...vercelBase,'--json'],empty,0),
  ])
  try {
    const supabase=JSON.parse(supabaseRaw),vercel=JSON.parse(vercelRaw)
    if(!Array.isArray(supabase)||!vercel||!Array.isArray(vercel.envs)) unavailable()
    const supabaseNames=supabase.map(item=>item?.name).filter(name=>typeof name==='string')
    const vercelNames=vercel.envs.filter(item=>item?.gitBranch===VERCEL_BRANCH&&Array.isArray(item.target)&&item.target.includes('preview')).map(item=>item.key).filter(name=>typeof name==='string')
    return Object.freeze({supabase:Object.freeze([...new Set(supabaseNames)].sort()),vercel:Object.freeze([...new Set(vercelNames)].sort())})
  } catch { unavailable() }
}

export async function removeSupabaseSecrets(names,{run=runSupabasePrivateCli}={}) {
  if(JSON.stringify([...names].sort())!==JSON.stringify([...GENERATED_SUPABASE_SECRET_NAMES])) unavailable()
  let failed=false
  for(const name of GENERATED_SUPABASE_SECRET_NAMES) {
    try { await run(['secrets','unset',name,'--project-ref',PROJECT_REF,'--output','json'],Buffer.alloc(0),0) }
    catch { failed=true }
  }
  if(failed)unavailable()
}

export async function removeVercelSecrets(names,{run=runPrivateCli}={}) {
  if(JSON.stringify([...names].sort())!==JSON.stringify([...STAGED_VERCEL_NAMES])) unavailable()
  let failed=false
  for(const name of STAGED_VERCEL_NAMES) {
    try { await run(['--yes','vercel','env','rm',name,'preview',VERCEL_BRANCH,...vercelBase,'--yes'],Buffer.alloc(0),0) }
    catch { failed=true }
  }
  if(failed)unavailable()
}
