import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildStagingReadinessResponse, STAGING_READINESS_HEADERS } from '../app/api/staging/readiness/contract.ts'

const staging = Object.freeze({ NEXT_PUBLIC_TLL_ENVIRONMENT: 'staging', VERCEL: '1', VERCEL_ENV: 'preview',
  TLL_STAGING_SUPABASE_PROJECT_REF: 'qdmvngjwkcsilzmqksme', VERCEL_GIT_COMMIT_REF: 'codex/tll-integration',
  VERCEL_DEPLOYMENT_ID: 'dpl_abc123', VERCEL_URL: 'tll-abc.vercel.app',
  TLL_STAGING_CUSTOMER_ENABLED: 'true', TLL_STAGING_CART_ENABLED: 'false' })

test('readiness contract rejects production, non-preview and identity/header drift', () => {
  for (const env of [{ ...staging, VERCEL_ENV: 'production' }, { ...staging, TLL_STAGING_SUPABASE_PROJECT_REF: 'wrhgscovsgsudtedbljr' }]) {
    const response = buildStagingReadinessResponse({ env, deploymentHeader: 'dpl_abc123', publicEnvironmentValue: 'staging', publicCustomerValue: 'enabled', publicCartValue: 'disabled' })
    assert.deepEqual(response, { status: 404, body: { status: 'held' }, headers: STAGING_READINESS_HEADERS })
  }
  assert.equal(buildStagingReadinessResponse({ env: staging, deploymentHeader: 'dpl_other', publicEnvironmentValue: 'staging', publicCustomerValue: 'enabled', publicCartValue: 'disabled' }).status, 404)
  assert.equal(buildStagingReadinessResponse({ env: staging, deploymentHeader: 'dpl_abc123', publicEnvironmentValue: 'production', publicCustomerValue: 'enabled', publicCartValue: 'disabled' }).status, 404)
})

test('readiness returns exact secret-free identity and private/runtime plus public/build booleans', () => {
  const response = buildStagingReadinessResponse({ env: staging, deploymentHeader: 'dpl_abc123', publicEnvironmentValue: 'staging', publicCustomerValue: 'disabled', publicCartValue: 'enabled' })
  assert.equal(response.status, 200); assert.deepEqual(response.headers, STAGING_READINESS_HEADERS)
  assert.deepEqual(response.body, { deploymentId: 'dpl_abc123', immutableUrl: 'https://tll-abc.vercel.app',
    projectRef: 'qdmvngjwkcsilzmqksme', branch: 'codex/tll-integration', privateCustomer: true, privateCart: false,
    publicCustomer: false, publicCart: true })
  assert.deepEqual(Object.keys(response.body).sort(), ['branch', 'deploymentId', 'immutableUrl', 'privateCart', 'privateCustomer', 'projectRef', 'publicCart', 'publicCustomer'])
  assert.doesNotMatch(JSON.stringify(response), /secret|token|password/i)
})

test('Next wrapper keeps direct public build-time references and delegates to the executed contract', async () => {
  const source = await readFile('app/api/staging/readiness/route.ts', 'utf8')
  assert.match(source, /publicEnvironmentValue: process\.env\.NEXT_PUBLIC_TLL_ENVIRONMENT/)
  assert.match(source, /publicCustomerValue: process\.env\.NEXT_PUBLIC_TLL_STAGING_CUSTOMER/)
  assert.match(source, /publicCartValue: process\.env\.NEXT_PUBLIC_TLL_STAGING_CART/)
  assert.match(source, /buildStagingReadinessResponse/)
  assert.doesNotMatch(source, /process\.env\.(?:.*SECRET|.*TOKEN|.*PASSWORD)/i)
})
