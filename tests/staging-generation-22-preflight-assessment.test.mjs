import test from 'node:test'
import assert from 'node:assert/strict'
import { HOSTED_BASELINE_VERCEL_TARGET } from '../scripts/staging-account-hosted-baseline-vercel.mjs'
import { DISABLED_VERCEL_CONFIGURATION, MISSING_VERCEL_SECRET_NAMES } from '../scripts/staging-generation-22-material.mjs'
import { assessStagingGeneration22PreflightVercel,
  STAGING_GENERATION_22_PREFLIGHT_ASSESSMENT_ENABLED } from '../scripts/staging-generation-22-preflight-assessment.mjs'

const project = { target: HOSTED_BASELINE_VERCEL_TARGET, repository: { provider: 'github', repoId: 1264363509,
  org: 'tntipper', repo: 'the-lifting-lab', ownerId: 17, productionBranch: 'main', sourceless: false } }
const entry = key => ({ key, type: 'encrypted', visibility: 'config', scope: 'branch' })
const inventory = entries => ({ target: HOSTED_BASELINE_VERCEL_TARGET, environment: 'preview',
  branch: 'codex/tll-integration', entries })

test('pre-installation assessment requires all 16 secret and four switch names absent', () => {
  assert.equal(STAGING_GENERATION_22_PREFLIGHT_ASSESSMENT_ENABLED, false)
  const result = assessStagingGeneration22PreflightVercel({ project, inventory: inventory([entry('UNRELATED_NAME')]) })
  assert.deepEqual(result, { status: 'GENERATION_22_NAMES_ABSENT',
    projectId: HOSTED_BASELINE_VERCEL_TARGET.projectId, branch: HOSTED_BASELINE_VERCEL_TARGET.branch,
    requiredAbsentCount: 20, present: [] })
})

test('any already-installed secret or switch holds before credential generation', () => {
  for (const name of [...MISSING_VERCEL_SECRET_NAMES, ...Object.keys(DISABLED_VERCEL_CONFIGURATION)]) {
    const result = assessStagingGeneration22PreflightVercel({ project, inventory: inventory([entry(name)]) })
    assert.equal(result.status, 'HOLD')
    assert.deepEqual(result.present, [name])
  }
})

test('wrong project, branch, duplicate or value-bearing entry fails closed', () => {
  const base = { project, inventory: inventory([]) }
  for (const input of [
    { ...base, project: { ...project, repository: { ...project.repository, repoId: 42 } } },
    { ...base, inventory: { ...inventory([]), branch: 'main' } },
    { ...base, inventory: inventory([entry('UNRELATED_NAME'), entry('UNRELATED_NAME')]) },
    { ...base, inventory: inventory([{ ...entry('UNRELATED_NAME'), value: 'secret' }]) },
  ]) assert.throws(() => assessStagingGeneration22PreflightVercel(input), /unavailable/)
})
