import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildStagingPreviewDeploymentRequest,
  STAGING_GITHUB_REPOSITORY_ID,
  STAGING_PREVIEW_DEPLOYMENT_REQUEST_ENABLED,
  STAGING_PREVIEW_DEPLOYMENT_REQUEST_ERROR,
} from '../scripts/staging-surface-preview-deployment-request.mjs'

const valid = Object.freeze({ branch: 'codex/tll-integration', sourceCommit: 'a'.repeat(40),
  manifestSha256: 'b'.repeat(64), publicCustomer: false, publicCart: false })

test('request fixes the team, project, repository, commit, manifest and Preview branch without a production target', () => {
  assert.equal(STAGING_PREVIEW_DEPLOYMENT_REQUEST_ENABLED, false)
  assert.equal(STAGING_GITHUB_REPOSITORY_ID, 1264363509)
  const request = buildStagingPreviewDeploymentRequest(valid)
  assert.equal(request.method, 'POST')
  assert.equal(request.url, 'https://api.vercel.com/v13/deployments?teamId=team_gf7cgIkkoeMLtODFDDT5MrW4')
  assert.deepEqual(request.body, {
    name: 'the-lifting-lab', project: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4',
    gitSource: { type: 'github', repoId: 1264363509, ref: valid.branch, sha: valid.sourceCommit },
    meta: { githubCommitRef: valid.branch, githubCommitSha: valid.sourceCommit,
      tllManifestSha256: valid.manifestSha256 },
  })
  assert.equal(Object.hasOwn(request.body, 'target'), false)
  assert.equal(Object.hasOwn(request.body, 'files'), false)
  assert.equal(Object.hasOwn(request.body, 'withLatestCommit'), false)
  assert.equal(Object.isFrozen(request.body.gitSource), true)
  assert.equal(Object.isFrozen(request.body.meta), true)
})

test('request cannot select another source, production, enabled public flags or arbitrary metadata', () => {
  for (const invalid of [
    { ...valid, branch: 'main' }, { ...valid, sourceCommit: 'a'.repeat(39) },
    { ...valid, sourceCommit: 'A'.repeat(40) }, { ...valid, manifestSha256: 'b'.repeat(63) },
    { ...valid, sourceCommit: ['a'.repeat(40)] }, { ...valid, manifestSha256: ['b'.repeat(64)] },
    { ...valid, sourceCommit: new String('a'.repeat(40)) },
    { ...valid, manifestSha256: new String('b'.repeat(64)) },
    { ...valid, publicCustomer: true }, { ...valid, publicCart: true },
    { ...valid, target: 'production' }, { ...valid, project: 'another-project' },
    { ...valid, gitSource: { ref: 'main' } }, { ...valid, meta: { arbitrary: 'value' } },
    null, {}, [],
  ]) assert.throws(() => buildStagingPreviewDeploymentRequest(invalid), new RegExp(STAGING_PREVIEW_DEPLOYMENT_REQUEST_ERROR))
})

test('request rejects accessors before invoking them or emitting an unvalidated hash', () => {
  for (const key of ['sourceCommit', 'manifestSha256']) {
    const input = { ...valid }
    let reads = 0
    Object.defineProperty(input, key, { enumerable: true, get() { reads++; return valid[key] } })
    assert.throws(() => buildStagingPreviewDeploymentRequest(input), new RegExp(STAGING_PREVIEW_DEPLOYMENT_REQUEST_ERROR))
    assert.equal(reads, 0)
  }
})
