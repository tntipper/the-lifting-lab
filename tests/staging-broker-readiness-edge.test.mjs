import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const path = fileURLToPath(new URL('../lib/identity/staging-broker-readiness-edge.ts', import.meta.url))
const source = readFileSync(path, 'utf8')
const bundle = await build({ stdin: { contents: source.replace('STAGING_BROKER_READINESS_ENABLED = false',
  'STAGING_BROKER_READINESS_ENABLED = true'), resolveDir: dirname(path), sourcefile: path, loader: 'ts' }, bundle: true,
  platform: 'node', format: 'esm', packages: 'external', write: false, logLevel: 'silent' })
const { createStagingBrokerReadinessHandler } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const ordinaryBundle = await build({ entryPoints: [path], bundle: true, platform: 'node',
  format: 'esm', packages: 'external', write: false, logLevel: 'silent' })
const ordinary = await import(`data:text/javascript;base64,${Buffer.from(ordinaryBundle.outputFiles[0].text).toString('base64')}`)
const serviceKey = 'SYNTHETIC_SERVICE_KEY_' + 'x'.repeat(40)
const startsAt = '2026-09-27T21:00:00.000Z', expiresAt = '2026-09-27T22:00:00.000Z'
const now = () => Date.parse('2026-09-27T21:30:00.000Z')
const env = Object.freeze({ SUPABASE_URL: 'https://qdmvngjwkcsilzmqksme.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: serviceKey, TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED: 'false',
  TLL_STAGING_BROKER_DATABASE_PASSWORD: 'SYNTHETIC_BROKER_PASSWORD_' + 'y'.repeat(40),
  TLL_STAGING_POSTGRES_CA_PEM: 'public-ca-fixture', TLL_STAGING_POSTGRES_CA_SHA256: 'a'.repeat(64),
  TLL_STAGING_BROKER_READINESS_WINDOW: `da4a6ec0-ff46-4db0-ba9d-db24eccbdaef|${startsAt}|${expiresAt}` })
const request = (authorization = `Bearer ${serviceKey}`, apikey = serviceKey) => new Request(
  'https://qdmvngjwkcsilzmqksme.supabase.co/functions/v1/tll-broker-readiness-g23-v9', {
    headers: { authorization, apikey },
  })

test('ordinary deployed source keeps the Edge probe off before credential access', async () => {
  let constructed = false
  const result = await ordinary.createStagingBrokerReadinessHandler({ ...env,
    TLL_STAGING_BROKER_READINESS_WINDOW: undefined }, () => { constructed = true }, now)(request())
  assert.equal(result.status, 404)
  assert.equal(result.headers.get('x-tll-broker-revision'), 'tll-gen23-v9-guard-audit-1')
  assert.equal(constructed, false)
})

test('ordinary deployed source accepts only the short-lived staging window', async () => {
  let connected = 0
  const runtime = () => ({ pool: { async connect() { connected++; return {
    async query() { return { rows: [{ role: 'tll_broker_runtime' }] } }, release() {},
  } } }, async close() {} })
  const live = await ordinary.createStagingBrokerReadinessHandler(env, runtime, now)(request())
  assert.equal(live.status, 200)
  assert.equal(live.headers.get('x-tll-broker-revision'), 'tll-gen23-v9-guard-audit-1')
  assert.equal(connected, 1)
  for (const setting of [undefined,
    `wrong-window|${startsAt}|${expiresAt}`,
    `da4a6ec0-ff46-4db0-ba9d-db24eccbdaef|${startsAt}|2026-09-27T22:00:01.000Z`]) {
    const held = await ordinary.createStagingBrokerReadinessHandler({ ...env,
      TLL_STAGING_BROKER_READINESS_WINDOW: setting }, runtime, now)(request())
    assert.equal(held.status, 404)
    assert.equal(held.headers.get('x-tll-broker-revision'), 'tll-gen23-v9-guard-audit-1')
  }
  const expired = await ordinary.createStagingBrokerReadinessHandler(env, runtime,
    () => Date.parse(expiresAt))(request())
  assert.equal(expired.status, 404)
  assert.equal(connected, 1)
})

test('wrong authority or active broker never reaches a database runtime', async () => {
  for (const [settings, req] of [[env, request('Bearer wrong', serviceKey)],
    [env, request(`Bearer ${'é'.repeat(serviceKey.length)}`, serviceKey)],
    [{ ...env, TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED: 'true' }, request()],
    [{ ...env, SUPABASE_URL: 'https://other.supabase.co' }, request()]]) {
    let constructed = false
    const handler = createStagingBrokerReadinessHandler(settings, () => { constructed = true }, now)
    const result = await handler(req)
    assert.equal(result.status, 404)
    assert.equal(constructed, false)
  }
})

test('the authenticated Edge probe uses its own installed broker password and returns only PASS', async () => {
  const handler = createStagingBrokerReadinessHandler(env, input => {
    assert.equal(input.purpose, 'broker')
    assert.equal(input.password, env.TLL_STAGING_BROKER_DATABASE_PASSWORD)
    assert.equal(input.tlsCa.pem, env.TLL_STAGING_POSTGRES_CA_PEM)
    return { pool: { async connect() { return { async query(sql) {
      assert.equal(sql, 'SELECT current_user::text AS role')
      return { rows: [{ role: 'tll_broker_runtime' }] }
    }, release() {} } } }, async close() {} }
  }, now)
  const result = await handler(request())
  assert.equal(result.status, 200)
  assert.equal(result.headers.get('x-tll-broker-revision'), 'tll-gen23-v9-guard-audit-1')
  assert.deepEqual(await result.json(), { status: 'PASS', windowId: 'da4a6ec0-ff46-4db0-ba9d-db24eccbdaef', expiresAt })
  assert.doesNotMatch(JSON.stringify(Object.fromEntries(result.headers)), /SYNTHETIC/)
})

test('Edge connection errors stay private and give no false pass', async () => {
  const handler = createStagingBrokerReadinessHandler(env, () => ({
    pool: { async connect() { throw Error(`SYNTHETIC_PRIVATE_${serviceKey}`) } }, async close() {},
  }), now)
  const result = await handler(request())
  assert.equal(result.status, 503)
  assert.equal(result.headers.get('x-tll-broker-revision'), 'tll-gen23-v9-guard-audit-1')
  assert.deepEqual(await result.json(), { status: 'FAIL' })
})

test('guard audit reports only safe conditions and never opens a database connection', async () => {
  let connected = false
  const noConnection = () => { connected = true; throw Error('must not connect') }
  const diagnostic = headers => new Request(
    'https://qdmvngjwkcsilzmqksme.supabase.co/functions/v1/tll-broker-readiness-g23-v9', {
      headers: { ...headers, 'x-tll-broker-guard-audit': 'tll-gen23-guard-audit/v1' },
    })
  const allowed = await ordinary.createStagingBrokerReadinessHandler({ ...env,
    TLL_STAGING_BROKER_READINESS_WINDOW: undefined }, noConnection, now)(diagnostic({
      authorization: `Bearer ${serviceKey}`, apikey: serviceKey,
    }))
  assert.equal(allowed.status, 200)
  assert.deepEqual(await allowed.json(), { status: 'GUARDS', projectUrlMatches: true,
    brokerFlagOff: true, window: 'absent' })
  const wrongKey = await ordinary.createStagingBrokerReadinessHandler(env, noConnection, now)(
    diagnostic({ authorization: 'Bearer wrong', apikey: 'wrong' }))
  assert.equal(wrongKey.status, 404)
  const wrongSettings = await ordinary.createStagingBrokerReadinessHandler({ ...env,
    SUPABASE_URL: 'https://other.supabase.co', TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED: 'true',
    TLL_STAGING_BROKER_READINESS_WINDOW: 'invalid' }, noConnection, now)(diagnostic({
      authorization: `Bearer ${serviceKey}`, apikey: serviceKey,
    }))
  assert.deepEqual(await wrongSettings.json(), { status: 'GUARDS', projectUrlMatches: false,
    brokerFlagOff: false, window: 'invalid' })
  assert.equal(connected, false)
})
