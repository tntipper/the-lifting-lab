import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { inspectStagingLiveBoundary } from '../scripts/staging-live-boundary-check.mjs'
import { fileURLToPath } from 'node:url'
const path = fileURLToPath(new URL('../lib/identity/staging-owner-successor-broker-readiness-edge.ts', import.meta.url))
async function fixture(armed) {
  const contents = readFileSync(path, 'utf8').replace('OWNER_SUCCESSOR_BROKER_READINESS_ENABLED = false', `OWNER_SUCCESSOR_BROKER_READINESS_ENABLED = ${armed}`)
  const output = await build({ stdin: { contents, resolveDir: dirname(path), sourcefile: path, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, logLevel: 'silent' })
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`)
}
const windowId = 'cd4130c8-a8b8-462b-bdbe-5c3e6250a02d', secret = 'sb_secret_' + 'z'.repeat(48)
const start = '2030-01-01T12:00:00.000Z', end = '2030-01-01T12:45:00.000Z'
const now = () => Date.parse('2030-01-01T12:01:00.000Z')
const env = { SUPABASE_URL: 'https://qdmvngjwkcsilzmqksme.supabase.co', SUPABASE_SECRET_KEYS: JSON.stringify({ default: secret }), TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED: 'false', TLL_STAGING_BROKER_DATABASE_PASSWORD: 'SYNTHETIC_ONLY_' + 'x'.repeat(48), TLL_STAGING_POSTGRES_CA_PEM: 'public-ca-fixture', TLL_STAGING_POSTGRES_CA_SHA256: 'a'.repeat(64), TLL_STAGING_BROKER_READINESS_WINDOW: `${windowId}|${start}|${end}` }
const request = key => new Request('https://qdmvngjwkcsilzmqksme.supabase.co/functions/v1/tll-broker-readiness-owner-successor', { headers: { apikey: key ?? secret } })
test('ordinary OFF broker source cannot connect even with a fresh authenticated window', async () => {
  const api = await fixture(false)
  const response = await api.createStagingBrokerReadinessHandler(env, () => assert.fail('OFF connection'), now)(request())
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('x-tll-broker-revision'), 'tll-owner-successor-20261005-1')
})
test('fresh broker source rejects old/malformed window, wrong key, wrong project and enabled broker', async () => {
  const api = await fixture(true)
  for (const change of [{ TLL_STAGING_BROKER_READINESS_WINDOW: env.TLL_STAGING_BROKER_READINESS_WINDOW.replace(windowId, 'd5180b08-79ee-43e8-96d4-4f73621fecbf') }, { TLL_STAGING_BROKER_READINESS_WINDOW: `${windowId}|2030-02-30T12:00:00.000Z|2030-02-30T12:45:00.000Z` }, { TLL_STAGING_BROKER_READINESS_WINDOW: undefined }, { SUPABASE_URL: 'https://wrong.supabase.co' }, { TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED: 'true' }]) {
    const response = await api.createStagingBrokerReadinessHandler({ ...env, ...change }, () => assert.fail('invalid connection'), now)(request())
    assert.equal(response.status, 404)
  }
  assert.equal((await api.createStagingBrokerReadinessHandler(env, () => assert.fail('wrong key connection'), now)(request('wrong'))).status, 404)
})
test('fresh authenticated fixture performs one role proof, closes it and returns the exact fresh window', async () => {
  const api = await fixture(true)
  let connects = 0, releases = 0, closes = 0
  const runtime = () => ({ pool: { async connect() { connects++; return { async query() { return { rows: [{ role: 'tll_broker_runtime' }] } }, release() { releases++ } } } }, async close() { closes++ } })
  const response = await api.createStagingBrokerReadinessHandler(env, runtime, now)(request())
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'PASS', windowId, expiresAt: end })
  assert.deepEqual([connects, releases, closes], [1, 1, 1])
})

test('ordinary boundary rejects a missing, duplicated or armed successor Edge gate', () => {
  const root = mkdtempSync(join(tmpdir(), 'tll-successor-edge-boundary-'))
  try {
    for (const dir of ['config', 'scripts', 'tests', 'lib/identity']) mkdirSync(join(root, dir), { recursive: true })
    writeFileSync(join(root, 'config/project-stage-gate-policy.json'), readFileSync(new URL('../config/project-stage-gate-policy.json', import.meta.url)))
    const file = join(root, 'lib/identity/staging-owner-successor-broker-readiness-edge.ts')
    for (const declaration of ['export const OWNER_SUCCESSOR_BROKER_READINESS_ENABLED = false', '', 'export const OWNER_SUCCESSOR_BROKER_READINESS_ENABLED = true', 'export const OWNER_SUCCESSOR_BROKER_READINESS_ENABLED = false\nexport const OWNER_SUCCESSOR_BROKER_READINESS_ENABLED = false']) {
      writeFileSync(file, declaration + '\n')
      const violations = inspectStagingLiveBoundary({ projectRoot: root })
      assert.equal(violations.length, declaration === 'export const OWNER_SUCCESSOR_BROKER_READINESS_ENABLED = false' ? 0 : 1)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
