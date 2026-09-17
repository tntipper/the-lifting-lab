import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {rootCertificates} from 'node:tls'
import {X509Certificate,createHash} from 'node:crypto'
import {build} from 'esbuild'
const bundled=await build({entryPoints:['lib/server/staging-postgres.ts'],bundle:true,platform:'node',format:'esm',packages:'external',write:false,logLevel:'silent'})
const {createStagingPostgresRuntime,STAGING_POSTGRES_PROJECT_REF,STAGING_POSTGRES_HOST,STAGING_POSTGRES_LIMITS:L}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const tick=()=>new Promise(resolve=>setImmediate(resolve))
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
const privateError=()=>Object.assign(new Error('SYNTHETIC_PASSWORD SELECT secret FROM private'),{detail:'SYNTHETIC_PRIVATE',cause:new Error('SYNTHETIC_CAUSE')})
const unavailable=error=>{assert.equal(error.message,'Staging database unavailable');assert.equal(error.cause,undefined);assert.doesNotMatch(JSON.stringify(error),/SYNTHETIC/);return true}
class Client extends EventEmitter{
 status='I';calls=[];released=[];queryImpl=async()=>({rows:[{ok:true}]})
 getTransactionStatus(){return this.status}
 async query(...args){this.calls.push(args);return this.queryImpl(...args)}
 release(destroy){this.released.push(destroy)}
}
class Driver extends EventEmitter{
 client=new Client();connects=0;ends=0;connectImpl=async()=>this.client;endImpl=async()=>{}
 connect(){this.connects++;return this.connectImpl()}
 end(){this.ends++;return this.endImpl()}
}
function setup(options={},driver=new Driver()){
 const captures=[]
 const runtime=createStagingPostgresRuntime({purpose:'customer',enabled:true,password:'SYNTHETIC_PASSWORD',...options},{createPool(config){captures.push(config);return driver}})
 return{runtime,driver,captures}
}

test('import and default-disabled runtime allocate no driver or connection, even without credentials',async()=>{
 let calls=0
 for(const options of [{purpose:'customer'},{purpose:'cart',enabled:false},{purpose:'broker'},{purpose:'provisional'},{purpose:'customer',enabled:'true'}]){
  const runtime=createStagingPostgresRuntime(options,{createPool(){calls++;throw privateError()}})
  assert.equal(runtime.enabled,false);await assert.rejects(()=>runtime.pool.connect(),unavailable);await runtime.close()
 }
 assert.equal(calls,0)
})
test('enabled factory is lazy and pins separate exact pool identities with strict TLS and bounded settings',async()=>{
 for(const purpose of ['customer','cart','broker','provisional']){
  const {runtime,driver,captures}=setup({purpose,host:'attacker.invalid',port:1,user:'postgres',connectionString:'ignored',ssl:false})
  assert.equal(runtime.enabled,true);assert.equal(captures.length,0)
  const client=await runtime.pool.connect(),config=captures[0]
  assert.equal(config.host,STAGING_POSTGRES_HOST);assert.equal(config.port,6543);assert.equal(config.database,'postgres')
  assert.equal(config.user,`tll_${purpose}_runtime.${STAGING_POSTGRES_PROJECT_REF}`)
  assert.equal(config.connectionString,undefined);assert.equal(config.options,undefined)
  assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.ssl.servername,STAGING_POSTGRES_HOST);assert.equal(config.ssl.minVersion,'TLSv1.2')
  assert.equal(config.max,1);assert.equal(config.min,0);assert.equal(config.pipeline,false)
  for(const field of ['connectionTimeoutMillis','query_timeout','statement_timeout','lock_timeout','idle_in_transaction_session_timeout','idleTimeoutMillis','maxLifetimeSeconds'])assert.ok(config[field]>0)
  assert.equal(driver.connects,1);client.release();assert.deepEqual(driver.client.released,[false]);await runtime.close();assert.equal(driver.ends,1)
 }
})
test('hostname identity check rejects a valid-looking certificate for another hostname and contains errors',async()=>{
 const {runtime,captures}=setup();const client=await runtime.pool.connect(),verify=captures[0].ssl.checkServerIdentity
 assert.equal(verify(STAGING_POSTGRES_HOST,{subjectaltname:`DNS:${STAGING_POSTGRES_HOST}`}),undefined)
 unavailable(verify(STAGING_POSTGRES_HOST,{subjectaltname:'DNS:other.example.test'}))
 unavailable(verify('other.example.test',{subjectaltname:'DNS:other.example.test'}))
 unavailable(verify(STAGING_POSTGRES_HOST,{subjectaltname:'IP Address:127.0.0.1'}))
 client.release();await runtime.close()
})
test('unknown purpose, invalid password and browser execution fail before a constructor is invoked',()=>{
 for(const options of [{purpose:'admin'},{purpose:'__proto__'},{purpose:'constructor'},{purpose:'broker.other-project'},{purpose:{toString:()=> 'customer'}},{purpose:null},{password:''},{password:()=>''},{password:'x'.repeat(1025)},{password:'private\nsecret'}])assert.throws(()=>setup(options),unavailable)
 const prior=globalThis.window;try{globalThis.window={};assert.throws(()=>setup(),unavailable)}finally{if(prior===undefined)delete globalThis.window;else globalThis.window=prior}
})
test('ambient PG destination, SSL, options and native-driver overrides are rejected without reading credential stores',async()=>{
 for(const [key,value]of [['PGHOST','synthetic.invalid'],['PGPORT','1'],['PGUSER','postgres'],['PGPASSWORD','SYNTHETIC_PRIVATE'],['PGDATABASE','other'],['PGSSLMODE','disable'],['PGOPTIONS','-c role=postgres'],['PGREPLICATION','database'],['PGBINARY','1'],['NODE_PG_FORCE_NATIVE','1'],['NODE_TLS_REJECT_UNAUTHORIZED','0']]){
  const previous=process.env[key]
  try{process.env[key]=value;assert.throws(()=>setup(),unavailable)}finally{if(previous===undefined)delete process.env[key];else process.env[key]=previous}
 }
 const {runtime,driver}=setup();const previous=process.env.PGOPTIONS
 try{process.env.PGOPTIONS='-c role=postgres';await assert.rejects(()=>runtime.pool.connect(),unavailable);assert.equal(driver.connects,0)}finally{if(previous===undefined)delete process.env.PGOPTIONS;else process.env.PGOPTIONS=previous;await runtime.close()}
})
test('query parameters remain separate; transaction clients are never returned for reuse before acknowledged idle',async()=>{
 const {runtime,driver}=setup();const client=await runtime.pool.connect()
 const values=["synthetic'; SELECT private; --",{ciphertext:'synthetic'}]
 await client.query('SELECT $1::text, $2::jsonb',values)
 assert.deepEqual(driver.client.calls,[['SELECT $1::text, $2::jsonb',values]])
 driver.client.status='T';client.release();client.release();assert.deepEqual(driver.client.released,[true])
 await assert.rejects(()=>client.query('SELECT 1'),unavailable);await runtime.close()
})
test('release(true), malformed query and named-query configuration discard without sending unsafe input',async()=>{
 for(const arg of [{text:'SELECT 1',name:'named'},'',null]){
  const {runtime,driver}=setup();const client=await runtime.pool.connect();await assert.rejects(()=>client.query(arg),unavailable)
  assert.equal(driver.client.calls.length,0);assert.deepEqual(driver.client.released,[true]);await runtime.close()
 }
 const {runtime,driver}=setup();const client=await runtime.pool.connect();client.release(true);client.release(true);assert.deepEqual(driver.client.released,[true]);await runtime.close()
})
test('a dirty acquired driver session is destroyed without being exposed or retried',async()=>{
 for(const status of ['T','E',null]){const {runtime,driver}=setup();driver.client.status=status;await assert.rejects(()=>runtime.pool.connect(),unavailable);assert.equal(driver.connects,1);assert.deepEqual(driver.client.released,[true]);await runtime.close()}
})
test('raw constructor, connection, query and pool-close errors never expose secret causes or driver fields',async()=>{
 const fail=createStagingPostgresRuntime({purpose:'customer',enabled:true,password:'SYNTHETIC_PASSWORD'},{createPool(){throw privateError()}})
 await assert.rejects(()=>fail.pool.connect(),unavailable);await fail.close()
 const {runtime,driver}=setup();driver.connectImpl=async()=>{throw privateError()};await assert.rejects(()=>runtime.pool.connect(),unavailable);assert.equal(driver.connects,1);await runtime.close()
 const next=setup();const c=await next.runtime.pool.connect();next.driver.client.queryImpl=async()=>{throw privateError()};await assert.rejects(()=>c.query('SELECT SYNTHETIC_PRIVATE'),unavailable);assert.deepEqual(next.driver.client.released,[true]);next.driver.endImpl=async()=>{throw privateError()};await assert.rejects(()=>next.runtime.close(),unavailable)
})
test('idle pool errors are contained and an acquired-client error destroys/rejects the current operation',async()=>{
 const {runtime,driver}=setup();const c=await runtime.pool.connect();driver.emit('error',privateError())
 const waiting=deferred();driver.client.queryImpl=()=>waiting.promise
 const pending=c.query('SELECT 1');await tick();driver.client.emit('error',privateError());await assert.rejects(()=>pending,unavailable)
 assert.deepEqual(driver.client.released,[true]);waiting.resolve({rows:[{secret:'SYNTHETIC_PRIVATE'}]});await tick();await runtime.close()
})
test('parallel use of one leased client is rejected and cannot queue a second statement',async()=>{
 const {runtime,driver}=setup();const c=await runtime.pool.connect(),waiting=deferred();driver.client.queryImpl=()=>waiting.promise
 const first=c.query('SELECT 1');const firstFailure=assert.rejects(()=>first,unavailable);await tick()
 await assert.rejects(()=>c.query('SELECT 2'),unavailable);await firstFailure
 assert.equal(driver.client.calls.length,1);assert.deepEqual(driver.client.released,[true]);waiting.resolve({rows:[]});await runtime.close()
})
test('acquisition deadline destroys a late successful connection and never returns it to the caller',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 const {runtime,driver}=setup(),waiting=deferred();driver.connectImpl=()=>waiting.promise
 const pending=runtime.pool.connect(),failed=assert.rejects(()=>pending,unavailable);await tick();t.mock.timers.tick(L.acquireMs+1);await failed
 waiting.resolve(driver.client);await tick();assert.deepEqual(driver.client.released,[true]);assert.equal(driver.connects,1);await runtime.close()
})
test('driver loading itself is acquisition-bounded and a timed-out waiter does not connect later',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const waiting=deferred(),driver=new Driver()
 const runtime=createStagingPostgresRuntime({purpose:'cart',enabled:true,password:'SYNTHETIC_PASSWORD'},{createPool:()=>waiting.promise})
 const pending=runtime.pool.connect(),failed=assert.rejects(()=>pending,unavailable);t.mock.timers.tick(L.acquireMs+1);await failed
 waiting.resolve(driver);await tick();assert.equal(driver.connects,0);await runtime.close();assert.equal(driver.ends,1)
})
test('pending acquisition queue is bounded and close rejects queued work; late completions are destroyed',async()=>{
 const {runtime,driver}=setup(),waiting=deferred();driver.connectImpl=()=>waiting.promise
 const pending=Array.from({length:L.maxPending},()=>runtime.pool.connect()),failures=pending.map(p=>assert.rejects(()=>p,unavailable));await tick()
 await assert.rejects(()=>runtime.pool.connect(),unavailable);assert.equal(driver.connects,L.maxPending)
 await runtime.close();await Promise.all(failures);waiting.resolve(driver.client);await tick();assert.equal(driver.client.released.length,L.maxPending);assert.ok(driver.client.released.every(Boolean))
})
test('query deadline discards late results and leaves COMMIT uncertainty to repository fences',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {runtime,driver}=setup(),c=await runtime.pool.connect(),waiting=deferred();driver.client.queryImpl=()=>waiting.promise
 const pending=c.query('COMMIT'),failed=assert.rejects(()=>pending,unavailable);await tick();t.mock.timers.tick(L.queryMs+1);await failed
 assert.deepEqual(driver.client.released,[true]);waiting.resolve({rows:[{committed:true}]});await tick();assert.equal(driver.client.calls.length,1);await runtime.close()
})
test('forgotten lease is bounded and close destroys active clients with no reuse',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {runtime,driver}=setup(),c=await runtime.pool.connect();t.mock.timers.tick(L.leaseMs+1)
 assert.deepEqual(driver.client.released,[true]);await assert.rejects(()=>c.query('SELECT 1'),unavailable);await runtime.close()
 const next=setup();await next.runtime.pool.connect();const one=next.runtime.close(),two=next.runtime.close();assert.equal(one,two);await one;assert.deepEqual(next.driver.client.released,[true]);assert.equal(next.driver.ends,1);await assert.rejects(()=>next.runtime.pool.connect(),unavailable)
})
test('close has a deadline including late constructor completion and still cleans up afterward',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const waiting=deferred(),driver=new Driver()
 const runtime=createStagingPostgresRuntime({purpose:'cart',enabled:true,password:'SYNTHETIC_PASSWORD'},{createPool:()=>waiting.promise})
 const pending=runtime.pool.connect(),failed=assert.rejects(()=>pending,unavailable);await tick();const closing=runtime.close(),closeFailure=assert.rejects(()=>closing,unavailable);await failed
 t.mock.timers.tick(L.closeMs+1);await closeFailure;waiting.resolve(driver);await tick();assert.equal(driver.connects,0);assert.equal(driver.ends,1)
})

test('a reviewed public CA is explicitly DER-hash pinned and cannot weaken TLS or load files',async()=>{
 const pem=rootCertificates.find(pem=>{const c=new X509Certificate(pem);return c.ca&&Date.parse(c.validFrom)<Date.now()&&Date.parse(c.validTo)>Date.now()})
 assert.ok(pem);const sha256=createHash('sha256').update(new X509Certificate(pem).raw).digest('hex')
 const {runtime,captures}=setup({tlsCa:{pem,sha256}}),client=await runtime.pool.connect()
 assert.equal(captures[0].ssl.ca,pem);assert.equal(captures[0].ssl.rejectUnauthorized,true);client.release();await runtime.close()
 for(const tlsCa of [{pem,sha256:'0'.repeat(64)},{pem:'/private/not-read.pem',sha256},{pem:pem+'\n'+pem,sha256},null,{pem:'SYNTHETIC_PRIVATE',sha256}])assert.throws(()=>setup({tlsCa}),unavailable)
})
