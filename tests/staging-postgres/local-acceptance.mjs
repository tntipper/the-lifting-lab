// Actual pg driver against the already approved local synthetic fixture only.
// This is an explicit trusted driver injection, NOT a production endpoint option.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {build} from 'esbuild'
import {Pool} from 'pg'
import {admin,assertFixture} from '../customer-repository/local-pg.mjs'
assertFixture()
assert.equal(admin('SELECT enabled FROM tll_customer_private.control'),'f')
const ports=JSON.parse(execFileSync('docker',['inspect','--format','{{json (index .NetworkSettings.Ports "5432/tcp")}}','tll-stage0-postgres'],{encoding:'utf8',timeout:15000}))
assert.deepEqual(ports,[{HostIp:'127.0.0.1',HostPort:'55432'}])
const bundled=await build({entryPoints:['lib/server/staging-postgres.ts'],bundle:true,platform:'node',format:'esm',packages:'external',write:false,logLevel:'silent'})
const {createStagingPostgresRuntime}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const runtime=createStagingPostgresRuntime({purpose:'customer',enabled:true,password:'SYNTHETIC_UNUSED'}, {
 createPool(config){return new Pool({...config,host:'127.0.0.1',port:55432,database:'tll_customer_repository',user:'postgres',password:'tll-local-synthetic-only',ssl:false})},
})
let client
try{
 client=await runtime.pool.connect()
 assert.deepEqual((await client.query('SELECT current_database() AS db')).rows,[{db:'tll_customer_repository'}])
 const first=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
 const text="synthetic'; DELETE FROM private; --"
 assert.equal((await client.query('SELECT $1::text AS literal',[text])).rows[0].literal,text)
 await client.query('BEGIN');await client.query('CREATE TEMP TABLE tll_runtime_probe(value text) ON COMMIT DROP')
 await client.query('INSERT INTO tll_runtime_probe(value) VALUES($1::text)',[text]);assert.equal((await client.query('SELECT value FROM tll_runtime_probe')).rows[0].value,text)
 await client.query('COMMIT');client.release();client=undefined
 client=await runtime.pool.connect();assert.equal((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,first)
 await client.query('BEGIN');client.release();client=undefined // forgotten transaction must destroy
 client=await runtime.pool.connect();const second=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;assert.notEqual(second,first)
 await assert.rejects(()=>client.query('SELECT 1/0'),error=>error.message==='Staging database unavailable'&&!error.cause)
 client.release();client=undefined
 client=await runtime.pool.connect();assert.notEqual((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,second)
 client.release(true);client=undefined
 console.log('PASS: real pg driver parameter binding, explicit COMMIT/idle reuse, dirty-transaction destruction, data-free query failure and fresh-session recovery (6 checks)')
}finally{client?.release(true);await runtime.close();assert.equal(admin('SELECT enabled FROM tll_customer_private.control'),'f')}
