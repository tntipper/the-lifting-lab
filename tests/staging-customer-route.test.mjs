import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({ stdin: { contents: "export * from './lib/server/staging-customer-route.ts'", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { stagingSupabaseAccessToken, stagingCustomerRoute } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const STORAGE = 'sb-qdmvngjwkcsilzmqksme-auth-token', TOKEN = 'header.' + 'a'.repeat(40) + '.signature'
const encoded = value => 'base64-' + Buffer.from(JSON.stringify(value)).toString('base64url')
const request = cookie => new Request('https://fixture.invalid/auth/customer/prepare', { method:'POST', headers: cookie ? { cookie } : {} })

test('request-scoped SSR cookie reader accepts exact single and contiguous chunked storage only', () => {
  const value = encoded({ access_token:TOKEN, refresh_token:'PRIVATE-REFRESH' })
  assert.equal(stagingSupabaseAccessToken(request(`${STORAGE}=${value}; unrelated=value`)), TOKEN)
  const split = Math.floor(value.length / 2)
  assert.equal(stagingSupabaseAccessToken(request(`${STORAGE}.0=${value.slice(0,split)}; ${STORAGE}.1=${value.slice(split)}`)), TOKEN)
  for (const cookie of ['', `${STORAGE}=raw`, `${STORAGE}=base64-%%%%`, `${STORAGE}=${encoded({})}`,
    `${STORAGE}=${value}; ${STORAGE}=${value}`, `${STORAGE}=${value}; ${STORAGE}.0=${value}`,
    `${STORAGE}.1=${value}`, `${STORAGE}.0=${value}; ${STORAGE}.2=x`, `${STORAGE}=${encoded({access_token:'short'})}`]) {
    assert.equal(stagingSupabaseAccessToken(request(cookie)), null, cookie.slice(0,80))
  }
})

test('route dispatches only the fixed action, uses a request-bound token accessor and closes once', async () => {
  const cookie = `${STORAGE}=${encoded({ access_token:TOKEN })}`; let captured, closed = 0, called = 0
  const runtimeFactory = input => { captured = input; return { enabled:true, customerPool:{}, tokenVault:{}, connection:{}, close:async()=>{closed++}, delivery:{
    async prepare(received){called++;assert.equal(received.headers.get('cookie'),cookie);return new Response('prepared',{status:200})},
    async start(){throw Error('wrong action')},async authorize(){throw Error('wrong action')},async shopifyCallback(){throw Error('wrong action')},async recover(){throw Error('wrong action')},
  } } }
  const response = await stagingCustomerRoute(request(cookie),'prepare',runtimeFactory)
  assert.equal(response.status,200); assert.equal(await response.text(),'prepared'); assert.equal(called,1); assert.equal(closed,1)
  assert.equal(await captured.readAccessToken(),TOKEN)
})

test('Shopify callback action dispatches only the sealed callback handler and closes once', async () => {
  let called=0,closed=0
  const runtimeFactory=()=>({enabled:true,customerPool:{},tokenVault:{},connection:{},close:async()=>{closed++},delivery:{
    async shopifyCallback(received){called++;assert.match(received.url,/\/auth\/customer\/prepare$/);return new Response(null,{status:303,headers:{location:'https://fixture.invalid/final'}})} }})
  const response=await stagingCustomerRoute(request(),'shopify-callback',runtimeFactory)
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),'https://fixture.invalid/final');assert.equal(called,1);assert.equal(closed,1)
})

test('missing composition, handler failure and cleanup failure return one fixed held response', async () => {
  const cases = [() => null, () => ({ enabled:true, customerPool:{}, tokenVault:{}, connection:{}, close:async()=>{}, delivery:{prepare:async()=>{throw Error('PRIVATE')}} }),
    () => ({ enabled:true, customerPool:{}, tokenVault:{}, connection:{}, close:async()=>{throw Error('PRIVATE')}, delivery:{prepare:async()=>new Response(null,{status:200})} })]
  for (const factory of cases) { const response = await stagingCustomerRoute(request(), 'prepare', factory); assert.equal(response.status,409); assert.deepEqual(await response.json(),{status:'held'}); assert.equal(response.headers.has('set-cookie'),false); assert.equal(response.headers.has('location'),false) }
})

test('actual route files export only their intended Next method and remain unavailable without staging configuration', async () => {
  const entries = [['prepare','POST'],['start','POST'],['authorize','GET'],['shopify/callback','GET'],['recover','POST']]
  for (const [path, method] of entries) {
    const built = await build({ entryPoints:[`app/auth/customer/${path}/route.ts`], bundle:true, format:'esm', platform:'node', write:false, logLevel:'silent' })
    const route = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64') + '#' + path.replace('/','-'))
    assert.equal(typeof route[method],'function'); assert.equal(route.dynamic,'force-dynamic')
    const response = await route[method](new Request(`https://fixture.invalid/auth/customer/${path}`,{method})); assert.equal(response.status,409); assert.deepEqual(await response.json(),{status:'held'})
  }
})
