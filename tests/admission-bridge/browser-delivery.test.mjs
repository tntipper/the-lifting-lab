// Actual coordinator/008/010/011 + private cookies + actual007 admit; synthetic HTTP only.
import test, { before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { build } from 'esbuild'
import { SignJWT, jwtVerify } from 'jose'
import { createAesGcmEnvelopeVault } from '../../lib/identity/customer-token-vault.ts'
import { admin, assertFixture, localPool, closeClients } from './local-pg.mjs'
import { source, exclusive } from './browser-once.mjs'
const bundle = await build({ stdin: { contents: "export * from './lib/identity/customer-admission-browser-delivery.ts'; export * from './lib/identity/customer-admission-bridge-continuation.ts'", resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' })
const { createCustomerAdmissionBrowserDelivery: delivery, createCustomerAdmissionBridgeContinuation: continuation } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const ORIGIN = 'https://the-lifting-synthetic-my-lifting-lab-s-projects.vercel.app', ISSUER = 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1'
const BOOT = '__Host-tll-customer-start', TX = '__Host-tll-customer-transaction', SIGNING = new TextEncoder().encode('synthetic-browser-admission-signature')
const opaque = () => randomBytes(32).toString('base64url'), hash = v => createHash('sha256').update(v).digest('hex')
const schemas = ['tll_bridge_private','tll_broker_private','tll_provisional_private']
const truncate = 'TRUNCATE tll_bridge_private.grants,tll_bridge_private.operations,tll_provisional_private.intents,tll_provisional_private.operations,tll_provisional_private.daily_quota,tll_broker_private.flows,tll_broker_private.operations,tll_broker_private.subjects,tll_broker_private.daily_quota'
const control = enabled => { for (const s of schemas) admin(`SET SESSION AUTHORIZATION tll_admission_bridge_migrator; SELECT ${s}.operator_set_enabled(${enabled},'browser_delivery_test')`) }
const rows = t => JSON.parse(admin(`SELECT coalesce(json_agg(x),'[]') FROM ${t} x`))
const state = id => ({ p: rows('tll_provisional_private.intents').find(r => r.id === id), b: rows('tll_broker_private.flows').find(r => r.id === id), g: rows('tll_bridge_private.grants').find(r => r.id === id) })
const vaults = new Set(); let installationAttempted = false, securityBefore
const security = () => admin(`SELECT json_build_object(
 'roles',(SELECT json_agg(x ORDER BY oid) FROM pg_roles x WHERE rolname LIKE 'tll_ab_%' OR rolname='tll_admission_bridge_migrator'),
 'memberships',(SELECT json_agg(x ORDER BY oid) FROM pg_auth_members x),
 'functions',(SELECT json_agg(x ORDER BY oid) FROM pg_proc x WHERE pronamespace IN ('tll_bridge_private'::regnamespace,'tll_broker_private'::regnamespace,'tll_provisional_private'::regnamespace)),
 'constraints',(SELECT json_agg(x ORDER BY oid) FROM pg_constraint x WHERE connamespace IN ('tll_bridge_private'::regnamespace,'tll_broker_private'::regnamespace,'tll_provisional_private'::regnamespace)))`)
const vault = () => { const v = createAesGcmEnvelopeVault({ activeKeyId: 'browser-synthetic', keys: new Map([['browser-synthetic', randomBytes(32)]]) }); vaults.add(v); return v }
before(() => { assertFixture(); admin(exclusive); for (const s of schemas) assert.equal(admin(`SELECT enabled FROM ${s}.control`), 'f')
  assert.equal(admin("SELECT to_regclass('tll_provisional_private.provisional_browser_once') IS NULL"), 't')
  securityBefore = security(); installationAttempted = true
  admin('SET SESSION AUTHORIZATION tll_admission_bridge_migrator; ' + source().adapted)
})
beforeEach(() => { admin(truncate); control(true) })
after(async () => { if (installationAttempted) { control(false); admin(truncate); await closeClients(); admin(exclusive)
  admin('ALTER TABLE tll_provisional_private.intents DROP CONSTRAINT IF EXISTS provisional_browser_once')
  assert.equal(admin("SELECT to_regclass('tll_provisional_private.provisional_browser_once') IS NULL"), 't')
  assert.equal(security(),securityBefore)
  for (const s of schemas) assert.equal(admin(`SELECT enabled FROM ${s}.control`),'f')
  for (const t of ['tll_bridge_private.grants','tll_bridge_private.operations','tll_provisional_private.intents','tll_provisional_private.operations','tll_broker_private.flows','tll_broker_private.operations']) assert.equal(admin(`SELECT count(*) FROM ${t}`),'0') }
  for (const v of vaults) v.destroy()
})
const request = (path, fields, cookie = '') => new Request(ORIGIN + '/auth/customer/' + path, { method: 'POST', headers: {
  origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams(fields) })
const visit = (url, cookie) => new Request(url, { headers: { cookie, 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } })
const jar = r => r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
const cookieValue = (cookie, name) => cookie.split('; ').find(c => c.startsWith(name + '='))?.slice(name.length + 1)
function pool(kind, events, hook) {
  const actual = localPool({ role: `tll_ab_${kind}_executor` })
  return { async connect() { await hook?.({ kind, phase: 'connect' }); const client = await actual.connect(); let op
    return { async query(sql, values) { if (values) op = values[0]; const e = { kind, phase: sql, op, payload: values && JSON.parse(values[1]) }; events.push(e)
      await hook?.({ ...e, before: true }); const result = await client.query(sql, values); return await hook?.({ ...e, before: false, result }) ?? result
    }, release(destroy) { events.push({ kind, phase: 'release', destroy }); client.release(destroy) } }
  } }
}
async function fixture({ mode = 'sign_in', hook, sessionHook, admissionHook, cookieSeal, now, transactionExpiresAt, proofIssue } = {}) {
  const events = [], http = [], privateVault = vault(), sealedVault = vault(), at = Math.floor(Date.now() / 1000)
  const proofState = opaque(), innerPkceChallenge = opaque(), proofCalls=[]; let proofTransaction = null, proofVerified = false
  const token = await new SignJWT({ iss: ISSUER, aud: 'authenticated', role: 'authenticated', sub: 'eeeeeeee-dddd-4ccc-8bbb-aaaaaaaaaaaa',
    session_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', is_anonymous: false, iat: at - 1, exp: at + 3600, amr: [{ method: 'password', timestamp: at - 1 }] }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(SIGNING)
  const shopifyProof = { async start(input) { proofCalls.push('start');proofTransaction = input.transactionId
      if(proofIssue==='start')return{status:'held',liveEnabled:false}
      const authorizationUrl = 'https://shopify.com/authentication/107532616020/oauth/authorize?' + new URLSearchParams({ state: proofState,
        client_id: '63f474eda69ec32778ce2a99e8c1114f', redirect_uri: ORIGIN + '/auth/customer/shopify/callback' })
      return { status:'authorization_ready', authorizationUrl, expiresAt:Math.min(input.transactionExpiresAt,Date.now()+300000), liveEnabled:false }
    }, async complete(input) { proofCalls.push('complete');const u=new URL(input.callbackUrl)
      if(proofIssue==='complete')return{status:'held',liveEnabled:false}
      if(input.transactionId!==proofTransaction||u.searchParams.get('state')!==proofState||u.searchParams.get('code')!=='synthetic-provider-code')return{status:'held',liveEnabled:false}
      proofVerified=true; return {status:'verified',liveEnabled:false} } }
  const shopifyProofRepository = { async verifiedSubject(id) { proofCalls.push('read');if(proofIssue==='read'||!proofVerified||id!==proofTransaction)return null; const verifiedAt=Date.now()
      return {transactionId:id,receiptId:randomUUID(),shopId:'107532616020',issuer:'https://shopify.com/authentication/107532616020',
        subject:'synthetic-browser-customer',innerPkceChallenge,verifiedAt,expiresAt:verifiedAt+60000} } }
  const options = { provisionalPool: pool('provisional', events, hook), bridgePool: pool('bridge', events, hook), brokerPool: pool('broker', events, hook),
    vault: privateVault, cookieVault: { ...sealedVault, seal(value, context) { cookieSeal?.(value); return sealedVault.seal(value, context) } }, applicationOrigin: ORIGIN,
    publishableKey: 'sb_publishable_synthetic00000000000', syntheticExecution: true, now, transactionExpiresAt, readAccessToken: async () => token,
    shopifyProof,shopifyProofRepository,subjectBrokerClientSecret:'synthetic-broker-secret-'+'x'.repeat(32),
    sessionTransport: async r => { http.push(r); const { payload } = await jwtVerify(r.headers.authorization.slice(7), SIGNING, { issuer: ISSUER, audience: 'authenticated' })
      await sessionHook?.(r); return { url: r.url, status: 200, headers: [['content-type','application/json']], body: Buffer.from(JSON.stringify({ id: payload.sub, role: 'authenticated', aud: 'authenticated', is_anonymous: false })) } },
    admissionTransport: async r => { http.push(r); await admissionHook?.(r)
      const url = ORIGIN + '/auth/customer/authorize?' + new URLSearchParams({ response_type: 'code', client_id: 'tll-staging-subject-broker-v1', redirect_uri: ISSUER + '/callback',
        scope: 'subject', state: randomUUID(), code_challenge_method: 'S256', code_challenge: opaque() })
      return mode === 'migration' ? { url: r.url, status: 200, headers: [['content-type','application/json']], body: Buffer.from(JSON.stringify({ url })) }
        : { url: r.url, status: 302, headers: [['location',url]], body: new Uint8Array() }
    } }
  const prepared = await delivery(options).prepare(request('prepare', { mode })), bootstrapCookie = jar(prepared), { csrf } = await prepared.json()
  const open = (cookie, name = TX) => sealedVault.open(JSON.parse(Buffer.from(cookieValue(cookie,name),'base64url').toString()), ['tll-customer-browser-cookie/v1',ORIGIN,name,'/'])
  const callbackUrl=response=>{const u=new URL(response.headers.get('location'));return ORIGIN+'/auth/customer/shopify/callback?'+new URLSearchParams({state:u.searchParams.get('state'),code:'synthetic-provider-code'})}
  return { options, mode, events, http, csrf, bootstrapCookie, open, token, proofCalls, callbackUrl, api: () => delivery(options),
    start: () => delivery(options).start(request('start', { mode, csrf }, bootstrapCookie)),
    authorize: (response, cookie = bootstrapCookie + '; ' + jar(response)) => delivery(options).admit(visit(response.headers.get('location'), cookie)),
    callback: (response, cookie = bootstrapCookie + '; ' + jar(response)) => delivery(options).shopifyCallback(visit(callbackUrl(response),cookie)),
    callbackRequest: (url,cookie) => delivery(options).shopifyCallback(visit(url,cookie)),
    recover: (cookie, action = 'inspect', csrfValue = csrf) => delivery(options).recover(request('recover', { action, csrf: csrfValue }, cookie)) }
}
const ops = f => f.events.filter(e => e.payload).map(e => `${e.kind}:${e.op}`)
const dispatches = f => f.http.filter(r => !r.url.endsWith('/user')).length
async function held(r) { assert.equal(r.status, 409); assert.deepEqual(await r.json(), { status: 'held' }); assert.equal(r.headers.has('location'), false) }
function terminal(id) { const s = state(id); assert.equal(s.p.state, 'held'); assert.equal(s.p.material, null); if (s.g) { assert.equal(s.g.state,'held'); assert.equal(s.g.release_hash,null) } }

test('real sign-in/migration only deliver sealed private cookies and redirect after commit; exact broker admission consumes release once', async t => {
  for (const mode of ['sign_in','migration']) await t.test(mode, async () => {
    const f = await fixture({ mode }), r = await f.start(); assert.equal(r.status,303)
    const cookie = f.bootstrapCookie + '; ' + jar(r), c = f.open(cookie), b = c.recovery.binding, s = state(b.transactionId)
    const reread = await f.api().prepare(request('prepare',{mode},cookie))
    assert.deepEqual(await reread.json(),{csrf:f.csrf}); assert.equal(reread.headers.has('set-cookie'),false)
    assert.equal(c.expiresAt, s.p.metadata.expiresAt); assert.equal(c.bootstrap.browserSecret, f.open(f.bootstrapCookie,BOOT).browserSecret)
    assert.equal(b.browserHash, hash(c.bootstrap.browserSecret)); assert.ok(c.expiresAt <= c.bootstrap.fenceAt)
    assert.equal(await r.text(), ''); assert.equal(r.headers.get('location'), c.authorizationUrl); assert.match(r.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/)
    const exposed = JSON.stringify([...r.headers]); for (const secret of [c.bootstrap.browserSecret,c.releaseSecret,f.token]) assert.equal(exposed.includes(secret), false)
    assert.equal(dispatches(f),1); assert.equal(f.http.filter(x => x.url.endsWith('/user')).length, mode === 'migration' ? 3 : 0)
    const denied = await f.api().start(request('start',{mode,csrf:f.csrf},cookie)); await held(denied); assert.equal(dispatches(f),1)
    const admitted = await f.authorize(r); assert.equal(admitted.status,303); const consumed = f.open(jar(admitted))
    assert.equal(consumed.phase,'shopify_pending'); assert.equal(Object.hasOwn(consumed,'releaseSecret'),false); assert.equal(Object.hasOwn(consumed,'authorizationUrl'),false)
    assert.equal(state(b.transactionId).g.release_hash,null); assert.equal(state(b.transactionId).g.state,'browser_admitted')
    const completed=await f.callback(admitted);assert.equal(completed.status,303);assert.match(completed.headers.get('location'),/^https:\/\/qdmvngjwkcsilzmqksme\.supabase\.co\/auth\/v1\/callback\?code=/)
    const ready=f.open(jar(completed));assert.equal(ready.phase,'ready');assert.equal(Object.hasOwn(ready,'redirectUrl'),true)
    assert.equal(JSON.stringify([...completed.headers]).includes('synthetic-browser-customer'),false)
    await held(await f.authorize(r)); assert.equal(state(b.transactionId).g.state,'browser_admitted')
  })
})
test('concurrent starts sharing sealed bootstrap dispatch once; losing quarantine cannot hold winner', async () => {
  const f = await fixture(), results = await Promise.all([f.start(),f.start(),f.start()])
  assert.deepEqual(results.map(r=>r.status).sort(),[303,409,409]); assert.equal(dispatches(f),1)
  const winner = results.find(r=>r.status===303), c = f.open(jar(winner)), s = state(c.recovery.binding.transactionId)
  assert.equal(s.p.state,'admitted'); assert.equal(s.g.state,'pending_browser'); assert.ok(s.g.release_hash)
  assert.equal(rows('tll_provisional_private.intents').length,1)
  for (const loser of results.filter(r=>r.status===409)) assert.equal(loser.headers.has('set-cookie'),false)
  await held(await f.start()); assert.equal(dispatches(f),1); assert.equal(state(c.recovery.binding.transactionId).g.state,'pending_browser')
  assert.equal((await f.authorize(winner)).status,303)
})
test('exact completed callback replays only its sealed final redirect; substitution is held without another proof read',async()=>{
  const f=await fixture(),started=await f.start(),admitted=await f.authorize(started),providerCallback=f.callbackUrl(admitted)
  const completed=await f.callbackRequest(providerCallback,f.bootstrapCookie+'; '+jar(admitted));assert.equal(completed.status,303)
  const final=completed.headers.get('location'),readyCookie=f.bootstrapCookie+'; '+jar(completed),before=[...f.proofCalls]
  const replay=await f.callbackRequest(providerCallback,readyCookie);assert.equal(replay.status,303);assert.equal(replay.headers.get('location'),final)
  await held(await f.callbackRequest(providerCallback.replace('synthetic-provider-code','substituted'),readyCookie));assert.deepEqual(f.proofCalls,before)
})
test('final application callback opens only the exact sealed ready transaction and browser binding',async()=>{
  const f=await fixture(),started=await f.start(),admitted=await f.authorize(started),completed=await f.callback(admitted)
  const readyCookie=f.bootstrapCookie+'; '+jar(completed),capsule=f.open(jar(completed)),code=randomUUID()
  const callback=visit(`${ORIGIN}/auth/customer/callback?code=${code}`,readyCookie)
  const binding=f.api().finalBinding(callback)
  assert.deepEqual(binding,{transactionId:capsule.recovery.binding.transactionId,browserHash:capsule.recovery.binding.browserHash,callbackUrl:callback.url})
  for(const request of [visit(`${ORIGIN}/auth/customer/callback?code=${code}&extra=1`,readyCookie),
    visit(`${ORIGIN}/auth/customer/callback?code=${code}`,f.bootstrapCookie+'; '+jar(admitted)),
    new Request(callback.url,{headers:{cookie:readyCookie}})]) {
    assert.throws(()=>f.api().finalBinding(request),/^Error: Customer final callback unavailable$/)
  }
})
test('proof start, completion or durable subject-read failure yields no redirect and holds the admitted transaction',async t=>{
  for(const issue of ['start','complete','read'])await t.test(issue,async()=>{const f=await fixture({proofIssue:issue}),started=await f.start(),id=f.open(jar(started)).recovery.binding.transactionId
    const admitted=await f.authorize(started)
    if(issue==='start')await held(admitted);else{assert.equal(admitted.status,303);await held(await f.callback(admitted))}
    assert.equal(state(id).g.state,'held');assert.equal(admitted.headers.has('location'),issue!=='start')
  })
})
test('lost prepare, finish or registration ACK is never replayed with retained bootstrap', async t => {
  for (const target of ['provisional:prepare','provisional:finish_admission','bridge:register']) await t.test(target, async () => {
    let lost = false
    const f = await fixture({ hook(e) { if (!lost && `${e.kind}:${e.op}`===target && e.phase==='COMMIT' && !e.before) { lost=true; throw Error('Synthetic lost acknowledgement') } } })
    await held(await f.start()); const before = dispatches(f), original = rows('tll_provisional_private.intents')[0]; terminal(original.id)
    await held(await f.start()); assert.equal(dispatches(f),before); assert.equal(before,target==='provisional:prepare'?0:1)
    assert.equal(rows('tll_provisional_private.intents').length,1); terminal(original.id)
  })
})
test('lost admit ACK gets one exact hold and no private response; inspection never reissues capability', async () => {
  let lost = false
  const f = await fixture({ hook(e) { if (!lost && e.kind==='broker' && e.op==='admit' && e.phase==='COMMIT' && !e.before) { lost=true; throw Error('Synthetic lost admit acknowledgement') } } })
  const r = await f.start(), cookie = f.bootstrapCookie+'; '+jar(r), c = f.open(cookie), before = ops(f).length
  const inspected = await f.recover(cookie); assert.equal(inspected.status,200); assert.equal(inspected.headers.has('set-cookie'),false)
  assert.doesNotMatch(JSON.stringify(await inspected.json()),/secret|release|authorization|binding|operation/i)
  await held(await f.authorize(r)); terminal(c.recovery.binding.transactionId)
  assert.deepEqual(ops(f).slice(before),['bridge:inspect','broker:admit','bridge:hold'])
  assert.ok(f.events.some(e=>e.kind==='broker'&&e.phase==='release'&&e.destroy)); assert.equal(dispatches(f),1)
})
test('post-ACK cookie encryption failure releases nothing and quarantines original transaction once', async () => {
  const f = await fixture({ cookieSeal(v) { if (v.phase==='registered') throw Error('Synthetic cookie custody failure') } })
  const r = await f.start(); await held(r); assert.equal(r.headers.has('set-cookie'),false)
  const p = rows('tll_provisional_private.intents')[0]; terminal(p.id)
  assert.equal(ops(f).filter(x=>x==='bridge:hold').length,1); await held(await f.start()); assert.equal(dispatches(f),1)
})
test('mixing foreign bootstrap/capsule or bad recovery CSRF cannot touch winner; acknowledged cancellation permits explicit restart', async () => {
  const f = await fixture(), g = await fixture(), r = await f.start(), cookie = f.bootstrapCookie+'; '+jar(r), c = f.open(cookie), before=ops(f).length
  await held(await f.recover(cookie,'cancel',opaque())); assert.equal(ops(f).length,before)
  await held(await f.authorize(r,g.bootstrapCookie+'; '+jar(r))); assert.equal(ops(f).length,before)
  const cancel = await f.recover(cookie,'cancel'); assert.equal(cancel.status,200); assert.deepEqual(await cancel.json(),{status:'cancelled'})
  assert.equal(cancel.headers.getSetCookie().length,2); assert.ok(cancel.headers.getSetCookie().every(c=>c.includes('Max-Age=0')))
  assert.equal(state(c.recovery.binding.transactionId).g.state,'cancelled')
  const prepare = await f.api().prepare(request('prepare',{mode:'sign_in'})); assert.equal(prepare.status,200)
  assert.notEqual(f.open(jar(prepare),BOOT).browserSecret,c.bootstrap.browserSecret)
})
test('trusted expiry is captured/clamped, delayed initial verification cannot prepare after deadline, SQL rejects late connection expiry', async t => {
  await t.test('clamp and constructor capture', async () => {
    const deadline = Date.now()+30000, f = await fixture({ transactionExpiresAt:deadline }), options={...f.options}, api=continuation(options)
    options.transactionExpiresAt=Date.now()+300000
    const r=await api.startSignIn({browserSecret:opaque()}); assert.equal(r.status,'private_registered'); assert.equal(r.expiresAt,deadline)
  })
  await t.test('late original verification', async () => {
    const f=await fixture({mode:'migration',transactionExpiresAt:Date.now()+100,sessionHook:()=>new Promise(resolve=>setTimeout(resolve,150))})
    const r=await continuation(f.options).startMigration({browserSecret:opaque()}); assert.equal(r.status,'held'); assert.equal(dispatches(f),0); assert.equal(ops(f).length,0)
  })
  await t.test('late prepare pool acquisition', async () => {
    let first=true
    const f=await fixture({transactionExpiresAt:Date.now()+100,hook(e) {if(first&&e.kind==='provisional'&&e.phase==='connect'){first=false;return new Promise(resolve=>setTimeout(resolve,150))}}})
    const r=await continuation(f.options).startSignIn({browserSecret:opaque()}); assert.equal(r.status,'held'); assert.equal(dispatches(f),0)
    assert.equal(rows('tll_provisional_private.intents').filter(r=>r.state!=='held').length,0)
  })
})
test('private response expiry releases nothing; a later disabled gate refuses admission', async t => {
  for (const issue of ['expiry','disabled']) await t.test(issue,async()=>{
    let offset=0,changed=false
    const f=await fixture({now:()=>Date.now()+offset,hook(e){if(!changed&&e.kind==='bridge'&&e.op==='register'&&e.phase==='COMMIT'&&!e.before){changed=true;if(issue==='expiry')offset=600001;else control(false)}}})
    const r=await f.start()
    if(issue==='expiry'){await held(r);terminal(rows('tll_provisional_private.intents')[0].id)}
    else {assert.equal(r.status,303);await held(await f.authorize(r));assert.equal(state(f.open(jar(r)).recovery.binding.transactionId).g.state,'pending_browser')}
  })
})


test('concurrent and replayed authorize GET rejection preserves the admitted winner', async () => {
  const f=await fixture(), r=await f.start(), c=f.open(jar(r)), before=ops(f).length
  const results=await Promise.all([f.authorize(r),f.authorize(r),f.authorize(r)])
  assert.deepEqual(results.map(x=>x.status).sort(),[303,409,409])
  await held(await f.authorize(r)); assert.equal(state(c.recovery.binding.transactionId).g.state,'browser_admitted')
  assert.equal(ops(f).slice(before).filter(x=>x==='bridge:hold').length,0)
  const bad=visit(r.headers.get('location')+'&state=duplicate',f.bootstrapCookie+'; '+jar(r)), count=ops(f).length
  await held(await f.api().admit(bad)); assert.equal(ops(f).length,count)
})
test('on-time start may cross entry window during real verification but cannot extend sealed absolute fence', async () => {
  let offset=-299700
  const f=await fixture({mode:'migration',now:()=>Date.now()+offset,sessionHook:()=>new Promise(resolve=>setTimeout(resolve,500))})
  const bootstrap=f.open(f.bootstrapCookie,BOOT); offset=0
  assert.ok(Date.now()<bootstrap.startBefore)
  const r=await f.start(); assert.equal(r.status,303); const c=f.open(jar(r))
  assert.ok(Date.now()>bootstrap.startBefore); assert.equal(c.expiresAt,bootstrap.fenceAt)
  assert.equal(state(c.recovery.binding.transactionId).p.metadata.expiresAt,bootstrap.fenceAt)
})


test('aborted delivery after registration ACK quarantines once before any cookie or URL escapes', async () => {
  const controller=new AbortController()
  const f=await fixture({hook(e){if(e.kind==='bridge'&&e.op==='register'&&e.phase==='COMMIT'&&!e.before)controller.abort()}})
  const original=request('start',{mode:f.mode,csrf:f.csrf},f.bootstrapCookie), req=new Request(original,{signal:controller.signal})
  const r=await f.api().start(req); await held(r); assert.equal(r.headers.has('set-cookie'),false)
  terminal(rows('tll_provisional_private.intents')[0].id); assert.equal(ops(f).filter(x=>x==='bridge:hold').length,1)
})
