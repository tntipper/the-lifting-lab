import test from 'node:test'
import assert from 'node:assert/strict'
import { namesFor,validateArguments,localEndpoint,runAcceptance } from './run-local.mjs'
import { fixtureTarget } from './fixture.mjs'
import { FIXTURE_LABEL,verifyStackRelayTarget,startStackRelay } from './loopback-relay.mjs'
const id='123abc456def',names=namesFor(id)
test('runner refuses remote services, custom targets and non-Linux containers',()=>{
 assert.throws(()=>validateArguments([],'darwin'),/Linux/);assert.throws(()=>validateArguments(['--keep'],'linux'))
 assert.equal(validateArguments(['--plan'],'darwin'),'--plan')
 for(const value of ['ssh://remote','tcp://localhost:2375','unix://relative','unix:///x\n'])assert.throws(()=>localEndpoint(value))
 assert.equal(localEndpoint('unix:///var/run/docker.sock'),'unix:///var/run/docker.sock')
 assert.throws(()=>fixtureTarget({TLL_STACK_TEST_CONTAINER:'production'}));assert.throws(()=>fixtureTarget({TLL_STACK_HTTP_PORT:'1234/remote'}))
})
function target(){
 const network={Name:names.network,Id:'a'.repeat(64),Driver:'bridge',Scope:'local',Internal:true,Labels:{[FIXTURE_LABEL]:id},IPAM:{Config:[{Subnet:'172.28.0.0/16',Gateway:'172.28.0.1'}]},Containers:{['b'.repeat(64)]:{Name:names.postgrest,IPv4Address:'172.28.0.2/16'}}}
 const container={Name:'/'+names.postgrest,Id:'b'.repeat(64),Config:{Labels:{[FIXTURE_LABEL]:id}},State:{Running:true},NetworkSettings:{Networks:{[names.network]:{NetworkID:network.Id,IPAddress:'172.28.0.2',IPPrefixLen:16}},Ports:{'3000/tcp':null}},HostConfig:{PortBindings:{}}}
 return{network,container}
}
test('stack relay verifies its own running container and exact internal network before opening',async()=>{
 const {network,container}=target();assert.deepEqual(verifyStackRelayTarget(id,network,container),{host:'172.28.0.2',port:3000})
 for(const change of [f=>f.network.Internal=false,f=>f.container.State.Running=false,f=>f.container.Config.Labels={},f=>f.container.NetworkSettings.Networks[names.network].IPAddress='8.8.8.8',f=>f.container.HostConfig.PortBindings={'3000/tcp':[{HostPort:'3000'}]}]){
  const f=target();change(f);assert.throws(()=>verifyStackRelayTarget(id,f.network,f.container))
 }
 await assert.rejects(startStackRelay({runId:id,endpoint:'ssh://remote',platform:'linux',docker:()=>assert.fail('no Docker call')}))
})
function harness(failHttp=false){
 const calls=[],logs=[];let clock=0
 return{calls,logs,run:()=>runAcceptance({platform:'linux',id,env:{},now:()=>clock,pause:async ms=>{clock+=ms},log:v=>logs.push(v),execute:async(binary,args,options={})=>{
  calls.push({binary,args,options})
  if(args[0]==='context')return'unix:///var/run/docker.sock'
  if(args.includes('pg_isready'))return'accepting connections'
  if(args.includes('inspect'))return id
  if(failHttp&&args.includes('tests/stacks/http.test.mjs')){const e=new Error('HTTP failed');e.stdout='assertion evidence';throw e}
  return'fixture success'
 },request:async()=>({status:200,json:async()=>({userId:'22222222-2222-4222-8222-222222222222'})}),relayFactory:async()=>({address:{port:45678},close:async()=>{calls.push({args:['relay-close']})}}) }) }
}
test('portable runner uses SQL then HTTP, preserves internal isolation and cleans owned resources',async()=>{
 const f=harness();await f.run();const commands=f.calls.map(c=>c.args.join(' '))
 assert.ok(commands.findIndex(c=>c.includes('--test tests/stacks/database.test.mjs'))<commands.findIndex(c=>c.includes('--test tests/stacks/http.test.mjs')))
 const sqlChild=f.calls.find(c=>c.args.includes('tests/stacks/database.test.mjs'))
 const httpChild=f.calls.find(c=>c.args.includes('tests/stacks/http.test.mjs'))
 assert.equal(fixtureTarget(sqlChild.options.env).container,names.postgres)
 assert.equal(fixtureTarget(httpChild.options.env).container,names.postgres)
 assert.equal(fixtureTarget(httpChild.options.env).origin,'http://127.0.0.1:45678')
 assert.equal(sqlChild.options.env.DOCKER_HOST,'unix:///var/run/docker.sock')
 assert.equal(sqlChild.options.env.DOCKER_CONTEXT,undefined)
 assert.ok(commands.some(c=>c.includes('network create --internal')));assert.equal(commands.some(c=>c.includes('--publish')),false)
 const close=commands.indexOf('relay-close'),remove=commands.findIndex(c=>c.includes('container rm --force'))
 assert.ok(close>=0&&remove>close);assert.ok(commands.some(c=>c.includes('network rm '+names.network)))
})
test('failed HTTP tests still close relay, remove owned fixtures and preserve assertion evidence',async()=>{
 const f=harness(true);await assert.rejects(f.run(),/HTTP failed/)
 assert.ok(f.logs.includes('assertion evidence'));assert.ok(f.calls.some(c=>c.args[0]==='relay-close'));assert.ok(f.calls.some(c=>c.args.includes('rm')&&c.args.includes(names.network)))
})
