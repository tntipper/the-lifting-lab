import test from 'node:test'
import assert from 'node:assert/strict'
import { HOSTED_BASELINE_VERCEL_TARGET } from '../scripts/staging-account-hosted-baseline-vercel.mjs'
import { assessStagingPreviewEnvironment, STAGING_PREVIEW_ENVIRONMENT_ASSESSMENT_ENABLED } from '../scripts/staging-preview-environment-assessment.mjs'

const project = { target: HOSTED_BASELINE_VERCEL_TARGET, repository: { provider: 'github', repoId: 1264363509,
  org: 'tntipper', repo: 'the-lifting-lab', ownerId: 17, productionBranch: 'main', sourceless: false } }
const entry = (key, visibility = 'secret', scope = 'branch') => ({ key, type: 'sensitive', visibility, scope })
const inventory = entries => ({ target: HOSTED_BASELINE_VERCEL_TARGET, environment: 'preview',
  branch: 'codex/tll-integration', entries })
const requirements = { requiredSecrets: ['TLL_STAGING_CUSTOMER_DATABASE_PASSWORD', 'TLL_STAGING_CART_STOREFRONT_TOKEN'],
  requiredConfiguration: ['NEXT_PUBLIC_TLL_STAGING_CUSTOMER'] }

test('disabled assessment reports only required missing names and unproven secret classification', () => {
  assert.equal(STAGING_PREVIEW_ENVIRONMENT_ASSESSMENT_ENABLED, false)
  const result = assessStagingPreviewEnvironment({ project, inventory: inventory([
    entry('TLL_STAGING_CART_STOREFRONT_TOKEN', 'config', 'preview'),
    entry('UNRELATED_SECRET', 'secret', 'preview'),
  ]), ...requirements })
  assert.equal(result.status, 'HOLD')
  assert.deepEqual(result.missing, ['NEXT_PUBLIC_TLL_STAGING_CUSTOMER', 'TLL_STAGING_CUSTOMER_DATABASE_PASSWORD'])
  assert.deepEqual(result.secretClassificationUnproven, ['TLL_STAGING_CART_STOREFRONT_TOKEN'])
  assert.equal(result.requiredCount, 3); assert.equal(result.presentCount, 1)
  assert.doesNotMatch(JSON.stringify(result), /UNRELATED_SECRET/)
})

test('all names with classified secrets means names present, not runtime or values verified', () => {
  const result = assessStagingPreviewEnvironment({ project, inventory: inventory([
    entry('TLL_STAGING_CUSTOMER_DATABASE_PASSWORD'), entry('TLL_STAGING_CART_STOREFRONT_TOKEN'),
    entry('NEXT_PUBLIC_TLL_STAGING_CUSTOMER', 'config'),
  ]), ...requirements })
  assert.equal(result.status, 'NAMES_PRESENT')
  assert.deepEqual(result.missing, []); assert.deepEqual(result.secretClassificationUnproven, [])
  assert.equal(result.presentCount, 3)
})

test('wrong project, branch, duplicate requirements and value-bearing entries fail closed', () => {
  const base = { project, inventory: inventory([entry('TLL_STAGING_CUSTOMER_DATABASE_PASSWORD')]), ...requirements }
  for (const input of [
    { ...base, project: { ...project, repository: { ...project.repository, repoId: 42 } } },
    { ...base, inventory: { ...base.inventory, branch: 'main' } },
    { ...base, requiredSecrets: [requirements.requiredSecrets[0], requirements.requiredSecrets[0]] },
    { ...base, requiredConfiguration: [requirements.requiredSecrets[0]] },
    { ...base, inventory: inventory([{ ...entry('TLL_STAGING_CUSTOMER_DATABASE_PASSWORD'), value: 'must-not-pass' }]) },
    { ...base, inventory: inventory([entry('TLL_STAGING_CUSTOMER_DATABASE_PASSWORD'), entry('TLL_STAGING_CUSTOMER_DATABASE_PASSWORD')]) },
  ]) assert.throws(() => assessStagingPreviewEnvironment(input), /unavailable/)
})
