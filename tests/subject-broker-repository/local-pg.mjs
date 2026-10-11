// Only the explicitly approved existing synthetic container/database. Never a URL.
import { spawn, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
export const CONTAINER='tll-stage0-postgres',DATABASE='tll_broker_repository'
const options={encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024,timeout:15000}
const clients=new Set()
export function admin(sql){
 try{return execFileSync('docker',['exec','-i',CONTAINER,'psql','-XqAt','-U','postgres','-d',DATABASE,'-v','ON_ERROR_STOP=1'],{...options,input:sql}).trim()}
 catch{throw new Error('Synthetic subject broker repository SQL failed (raw output suppressed)')}
}
export function assertLocalContainer(){
 if(process.env.DOCKER_HOST&&!process.env.DOCKER_HOST.startsWith('unix://'))throw new Error('Remote Docker endpoint refused')
 const endpoint=execFileSync('docker',['context','inspect','--format','{{(index .Endpoints "docker").Host}}'],options).trim()
 if(!endpoint.startsWith('unix://'))throw new Error('Local Unix Docker endpoint required')
 const state=execFileSync('docker',['inspect','--format','{{.State.Running}} {{.Config.Image}}',CONTAINER],options).trim()
 if(!/^true postgres:17(?:[.\-].*)?$/.test(state))throw new Error('Unexpected local PostgreSQL container')
}
export function assertFixture(){
 assertLocalContainer()
 if(admin("SELECT current_database()||':'||coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database WHERE datname=current_database();")!==DATABASE+':tll-subject-broker-repository-synthetic-v1')throw new Error('Missing exact synthetic database marker')
}
const literal=v=>typeof v==='string'?"'"+v.replaceAll("'","''")+"'":v===null?'NULL':Number.isFinite(v)?String(v):(()=>{throw new Error('Unsupported synthetic SQL binding')})()
class LocalClient{
 constructor(role){
  this.process=spawn('docker',['exec','-i',CONTAINER,'psql','-XqAt','-U','postgres','-d',DATABASE,'-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']})
  this.buffer='';this.pending=null;this.dead=false;clients.add(this)
  this.closed=new Promise(resolve=>this.process.once('close',()=>{this.dead=true;clients.delete(this);this.pending?.reject(new Error('Synthetic PostgreSQL connection closed'));this.pending=null;resolve()}))
  this.process.stderr.on('data',()=>{}) // no raw SQL/encrypted payload diagnostics
  this.process.on('error',()=>{this.dead=true;this.pending?.reject(new Error('Synthetic PostgreSQL launch failed'))})
  this.process.stdout.on('data',b=>{this.buffer+=b;const p=this.pending;if(!p)return;const end=this.buffer.indexOf(p.marker+'\n');if(end<0)return;const raw=this.buffer.slice(0,end).trim();this.buffer=this.buffer.slice(end+p.marker.length+1);this.pending=null;try{p.resolve(raw?{rows:JSON.parse(raw).rows}:{rows:[]})}catch{p.reject(new Error('Invalid synthetic PostgreSQL response'))}})
  this.ready=this.query('SET ROLE '+role)
 }
 async query(sql,values=[]){
  if(this.dead||this.pending)throw new Error('Synthetic SQL client is not idle')
  const text=sql.replace(/\$(\d+)/g,(_,n)=>literal(values[Number(n)-1]))
  const statement=/^SELECT /i.test(text)?`SELECT json_build_object('rows',COALESCE(json_agg(q),'[]'::json)) FROM (${text.replace(/;$/,'')})q;`:text+';'
  const marker='tll_'+randomBytes(12).toString('hex')
  return new Promise((resolve,reject)=>{this.pending={marker,resolve,reject};this.process.stdin.write(statement+'\n\\echo '+marker+'\n')})
 }
 release(){if(!this.dead&&!this.released){this.released=true;this.process.stdin.end('\\q\n')}}
}
export function localPool({role='tll_broker_executor',fault}={}){
 if(!['tll_broker_executor','postgres','anon','authenticated','service_role'].includes(role))throw new Error('Invalid synthetic role')
 return {async connect(){const c=new LocalClient(role);await c.ready;const query=c.query.bind(c);let op;return {async query(sql,values){if(values)op=values[0];if(fault?.({sql,op,before:true}))throw new Error('Synthetic precommit transport failure');const r=await query(sql,values);if(fault?.({sql,op,before:false,rows:r.rows}))throw new Error('Synthetic lost acknowledgement');return r},release:c.release.bind(c)}}}
}
export async function closeClients(){for(const c of clients)c.release();await Promise.all([...clients].map(c=>c.closed))}
