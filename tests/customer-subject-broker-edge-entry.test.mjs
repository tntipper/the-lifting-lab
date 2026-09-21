import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const SECRET = 'edge-broker-client-' + 's'.repeat(40)
const PASSWORD = 'edge-broker-database-' + 'p'.repeat(40)
const enabled = {
  SUPABASE_URL: 'https://qdmvngjwkcsilzmqksme.supabase.co',
  TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED: 'true',
  TLL_STAGING_BROKER_DATABASE_PASSWORD: PASSWORD,
  TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET: SECRET,
}
const values = {}
let reads = 0
globalThis.Deno = { env: { get(name) { reads += 1; return values[name] } } }

async function load(entry) {
  const bundle = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
  return import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
}
const token = await load('supabase/functions/tll-broker-token/index.ts')
const userinfo = await load('supabase/functions/tll-broker-userinfo/index.ts')
const tokenRequest = () => new Request('https://qdmvngjwkcsilzmqksme.supabase.co/functions/v1/tll-broker-token', {
  method: 'POST',
  headers: { authorization: 'Basic ' + Buffer.from('client:secret').toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=authorization_code&code=opaque',
})

test('edge entrypoints read secrets per request and wrong Basic auth is invalid_client', async () => {
  assert.equal(reads, 0)
  Object.assign(values, enabled)
  const before = reads
  const response = await token.default.fetch(tokenRequest())
  assert.equal(reads, before + 6)
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'invalid_client' })
  assert.equal(response.headers.get('www-authenticate'), 'Basic realm="tll-staging-subject-broker"')
  const prior = globalThis.process
  let denoSafe
  try {
    Object.defineProperty(globalThis, 'process', { configurable: true, value: undefined })
    denoSafe = await token.default.fetch(tokenRequest())
  } finally {
    Object.defineProperty(globalThis, 'process', { configurable: true, value: prior })
  }
  assert.equal(denoSafe.status, 401)
  assert.deepEqual(await denoSafe.json(), { error: 'invalid_client' })
  assert.equal(denoSafe.headers.get('www-authenticate'), 'Basic realm="tll-staging-subject-broker"')
  assert.equal(reads, before + 12)
  values.TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED = 'false'
  const blocked = await token.default.fetch(tokenRequest())
  assert.equal(blocked.status, 503)
  assert.deepEqual(await blocked.json(), { error: 'temporarily_unavailable' })
  assert.equal(reads, before + 18)
  values.TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED = 'true'
  const info = await userinfo.default.fetch(new Request('https://qdmvngjwkcsilzmqksme.supabase.co/functions/v1/tll-broker-userinfo', {
    headers: { authorization: 'Bearer not-a-token' },
  }))
  assert.equal(info.status, 401)
  assert.deepEqual(await info.json(), { error: 'invalid_token' })
  assert.equal(reads, before + 24)
})
