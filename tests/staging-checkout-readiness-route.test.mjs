import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: [fileURLToPath(new URL('../app/api/staging/checkout-readiness/contract.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'esm', write: false })
const { buildStagingCheckoutReadinessResponse } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

const environment = {
  NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging', VERCEL: '1', VERCEL_ENV: 'preview',
  TLL_STAGING_SUPABASE_PROJECT_REF: 'qdmvngjwkcsilzmqksme',
  VERCEL_GIT_COMMIT_REF: 'codex/tll-integration',
  VERCEL_DEPLOYMENT_ID: 'dpl_test123', VERCEL_URL: 'tll-test-123.vercel.app',
}
const input = env => ({ env, deploymentHeader: 'dpl_test123',
  publicEnvironmentValue: 'staging', publicCustomerValue: 'disabled', publicCartValue: 'disabled' })

test('checkout readiness is OFF unless the exact private flag is true', () => {
  for (const value of [undefined, '', 'false', 'TRUE', 'enabled']) {
    const response = buildStagingCheckoutReadinessResponse(input({ ...environment,
      TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED: value }))
    assert.equal(response.status, 200)
    assert.equal(response.body.checkoutHandoffEnabled, false)
    assert.equal(response.body.deploymentId, 'dpl_test123')
    assert.equal(response.headers['Cache-Control'], 'no-store')
  }
  assert.equal(buildStagingCheckoutReadinessResponse(input({ ...environment,
    TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED: 'true' })).body.checkoutHandoffEnabled, true)
})

test('wrong source, project, environment or deployment header receives no readiness bit', () => {
  const cases = [
    { env: { ...environment, VERCEL_ENV: 'production' } },
    { env: { ...environment, TLL_STAGING_SUPABASE_PROJECT_REF: 'wrhgscovsgsudtedbljr' } },
    { env: { ...environment, VERCEL_GIT_COMMIT_REF: 'main' } },
    { env: environment, deploymentHeader: 'dpl_other' },
  ]
  for (const item of cases) {
    const response = buildStagingCheckoutReadinessResponse({ ...input(item.env), ...item })
    assert.equal(response.status, 404)
    assert.deepEqual(response.body, { status: 'held' })
  }
})

test('mounted route uses the protected contract and does not accept request-selected settings', async () => {
  const source = await readFile(new URL('../app/api/staging/checkout-readiness/route.ts', import.meta.url), 'utf8')
  assert.match(source, /buildStagingCheckoutReadinessResponse/)
  assert.match(source, /env: process\.env/)
  assert.match(source, /deploymentHeader: request\.headers\.get\('x-tll-deployment-id'\)/)
})
