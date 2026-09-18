import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

test('staging account activation manifest pins reviewed sources and contains no secret values', () => {
  execFileSync(process.execPath, ['scripts/staging-account-activation-manifest.mjs', '--check'], { stdio: 'pipe' })
  const raw = readFileSync('config/staging-account-activation-manifest.json', 'utf8'), manifest = JSON.parse(raw)
  assert.equal(manifest.schema, 'tll-staging-account-activation/v1')
  assert.deepEqual(manifest.migrations.map(item => item.path.match(/2026091800(1[2-6])_/)[1]), ['12','13','14','15','16'])
  assert.deepEqual(manifest.edge.functions.map(item => item.name), ['tll-broker-token','tll-broker-userinfo'])
  assert.equal(Object.keys(manifest.runtime.databaseIdentities).length, 5)
  assert.equal(new Set(Object.values(manifest.runtime.databaseIdentities).map(item => item.login)).size, 5)
  assert.equal(manifest.target.productionProjectRefExcluded, 'wrhgscovsgsudtedbljr')
  assert.equal(manifest.runtime.reviewedPreview.stableOrigin, manifest.provider.reviewedPreviewOrigin)
  assert.equal(manifest.runtime.reviewedPreview.branch, 'codex/tll-integration')
  assert.deepEqual(manifest.runtime.reviewedPreview.originConfiguration, ['TLL_STAGING_CUSTOMER_ORIGIN', 'TLL_STAGING_CART_ORIGIN'])
  assert.deepEqual(manifest.runtime.reviewedPreview.immutableDeploymentEvidence.requiredForEachPhase, ['disabled', 'enabled'])
  assert.deepEqual(manifest.runtime.reviewedPreview.immutableDeploymentEvidence.requiredFields,
    ['deploymentId', 'immutableUrl', 'sourceCommit', 'manifestSha256'])
  assert.equal(manifest.runtime.reviewedPreview.immutableDeploymentEvidence.aliasMustResolveToRecordedDeployment, true)
  assert.equal('previewOriginPattern' in manifest.provider, false)
  assert.ok(manifest.sourceTree.fileCount > 40); assert.match(manifest.sourceTree.sha256, /^[a-f0-9]{64}$/)
  assert.ok(manifest.gates.indexOf('enable_database_controls_then_edge_then_server_feature_flags')
    > manifest.gates.indexOf('run_unavailable_route_and_cross_role_denial_checks'))
  assert.ok(manifest.runtime.vercelSecrets.every(value => /^[A-Z][A-Z0-9_]+$/.test(value)))
  assert.equal(JSON.stringify(manifest).includes('secretValue'), false)
  assert.equal(JSON.stringify(manifest).includes('passwordValue'), false)
  assert.equal(JSON.stringify(manifest).includes('keyHexValue'), false)
  for (const pin of [...manifest.migrations,...manifest.edge.sources,...manifest.runtime.sources]) assert.match(pin.sha256,/^[a-f0-9]{64}$/)

  const classified = new Set([...manifest.runtime.vercelSecrets,...manifest.runtime.vercelConfiguration])
  const runtimeSource = ['lib/server/staging-customer.ts','lib/commerce/staging-cart-server.ts','app/auth/customer/logout/route.ts']
    .map(path => readFileSync(path,'utf8')).join('\n')
  const runtimeKeys = [...runtimeSource.matchAll(/(?:process\.env\.)?((?:NEXT_PUBLIC_)?TLL_STAGING_[A-Z0-9_]+|NEXT_PUBLIC_SUPABASE_[A-Z0-9_]+)/g)].map(match => match[1])
  assert.deepEqual([...new Set(runtimeKeys)].filter(key => !classified.has(key)), [])
  const edgeClassified = new Set([...manifest.edge.requiredSecrets,manifest.edge.enableLast,'SUPABASE_URL'])
  const edgeSource = readFileSync('lib/identity/customer-subject-broker-edge.ts','utf8')
  const edgeKeys = [...edgeSource.matchAll(/get\('([A-Z][A-Z0-9_]+)'\)/g)].map(match => match[1])
  assert.deepEqual([...new Set(edgeKeys)].filter(key => !edgeClassified.has(key)), [])
})
