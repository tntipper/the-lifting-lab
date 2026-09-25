import test from 'node:test'
import assert from 'node:assert/strict'
import { createStagingPreviewDeploymentVerifier, STAGING_PREVIEW_DEPLOYMENT_VERIFIER_ENABLED } from '../scripts/staging-surface-preview-deployment-verifier.mjs'
import { createStagingPreviewDeploymentPost } from '../scripts/staging-surface-preview-deployment-post.mjs'
import { createStagingSurfaceNativeBinding, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } from '../scripts/staging-surface-activation-native-binding.mjs'
import { createStagingAccountHostedBaselineSurfaceBinding } from '../scripts/staging-account-hosted-baseline-surface.mjs'
import { STAGING_ALIAS } from '../scripts/staging-surface-activation-transport.mjs'

const input = Object.freeze({ branch: 'codex/tll-integration', sourceCommit: 'a'.repeat(40),
  manifestSha256: 'b'.repeat(64), publicCustomer: false, publicCart: false })
const id = 'dpl_new123', immutableUrl = 'https://new-123.vercel.app'
const aliasHost = new URL(STAGING_ALIAS).hostname
const started = Date.parse('2026-09-25T12:00:00.000Z')
const signal = new AbortController().signal

function fixture({ selectedInput = input, actualSha = selectedInput.sourceCommit, runtimeCustomer = false,
  aliasId = id, states = ['QUEUED', 'BUILDING', 'READY'] } = {}) {
  let clock = started, posts = 0, stateReads = 0, aliasReads = 0, stops = 0
  const calls = [], apiToken = Buffer.from('private-api-test-token')
  const deployment = { id, projectId: VERCEL_PROJECT_ID, ownerId: VERCEL_TEAM_ID, target: null,
    readyState: 'READY', url: new URL(immutableUrl).hostname, createdAt: started,
    gitSource: { type: 'github', repoId: 1264363509, ref: selectedInput.branch, sha: actualSha },
    meta: { githubCommitRef: selectedInput.branch, githubCommitSha: selectedInput.sourceCommit,
      tllManifestSha256: selectedInput.manifestSha256 } }
  const project = { id: VERCEL_PROJECT_ID, name: 'the-lifting-lab', accountId: VERCEL_TEAM_ID,
    link: { type: 'github', repoId: 1264363509, repoOwnerId: 12345, org: 'tntipper',
      repo: 'the-lifting-lab', productionBranch: 'main', sourceless: false } }
  const fetcher = async (url, options) => {
    calls.push({ url, method: options.method, headers: options.headers })
    if (url.includes('/v9/projects/')) return new Response(JSON.stringify(project), { status: 200 })
    if (options.method === 'POST' && url.includes('/v13/deployments')) {
      posts++
      return new Response(JSON.stringify({ id, readyState: 'QUEUED', target: null }), { status: 200 })
    }
    if (url.includes('/v13/deployments/')) {
      if (url.includes('withGitRepoInfo=true')) return new Response(JSON.stringify(deployment), { status: 200 })
      const readyState = states[Math.min(stateReads++, states.length - 1)]
      return new Response(JSON.stringify({ id, readyState, projectId: VERCEL_PROJECT_ID, ownerId: VERCEL_TEAM_ID, target: null }), { status: 200 })
    }
    if (url.includes('/v4/aliases/')) {
      aliasReads++
      return new Response(JSON.stringify({ alias: aliasHost, projectId: VERCEL_PROJECT_ID, deploymentId: aliasId,
        deployment: { id: aliasId, url: new URL(immutableUrl).hostname } }), { status: 200 })
    }
    if (url === `${immutableUrl}/api/staging/readiness`) return new Response(JSON.stringify({
      deploymentId: id, immutableUrl, projectRef: 'qdmvngjwkcsilzmqksme', branch: selectedInput.branch,
      privateCustomer: runtimeCustomer, privateCart: runtimeCustomer,
      publicCustomer: runtimeCustomer, publicCart: runtimeCustomer,
    }), { status: 200 })
    if (url.endsWith('/tll-broker-token')) return new Response(JSON.stringify({ error: runtimeCustomer ? 'invalid_client' : 'temporarily_unavailable' }),
      { status: runtimeCustomer ? 401 : 503 })
    throw Error('unexpected URL')
  }
  const binding = createStagingSurfaceNativeBinding({ runCli: async () => { throw Error('no CLI allowed') }, fetch: fetcher, vercelToken: apiToken })
  const stopWorkerGroup = () => { stops++ }
  const postHost = createStagingPreviewDeploymentPost({ fetch: fetcher, vercelToken: apiToken,
    readPinnedRepository: binding.readPinnedRepository, stopWorkerGroup })
  const verifier = createStagingPreviewDeploymentVerifier({ postHost, binding, stopWorkerGroup,
    pause: async (milliseconds, passedSignal) => { assert.equal(milliseconds, 2000); assert.equal(passedSignal, signal); clock += milliseconds },
    now: () => clock,
    createProtectedReader: expectedDeployment => createStagingAccountHostedBaselineSurfaceBinding({
      fetch: fetcher, vercelToken: apiToken, protectionBypassToken: Buffer.from('private-bypass-test-token'), expectedDeployment,
    }),
  })
  return { verifier, calls, postHost, get posts() { return posts }, get stateReads() { return stateReads },
    get aliasReads() { return aliasReads }, get stops() { return stops } }
}

test('one accepted Preview is polled, source-pinned and proved through the protected alias and runtime', async () => {
  assert.equal(STAGING_PREVIEW_DEPLOYMENT_VERIFIER_ENABLED, false)
  const f = fixture()
  assert.deepEqual(await f.verifier.verify(input, { signal }), {
    status: 'PROTECTED_PREVIEW_VERIFIED', deploymentId: id, immutableUrl,
    sourceCommit: input.sourceCommit, manifestSha256: input.manifestSha256,
    customerEnabled: false, cartEnabled: false,
  })
  assert.equal(f.posts, 1); assert.equal(f.stateReads, 3); assert.equal(f.aliasReads, 2); assert.equal(f.stops, 0)
  assert.equal(f.calls[0].method, 'GET')
  assert.equal(f.calls[1].method, 'POST')
  assert.ok(f.calls.some(call => call.url === `${immutableUrl}/api/staging/readiness`
    && call.headers['x-vercel-protection-bypass'] === 'private-bypass-test-token'))
  await assert.rejects(f.verifier.verify(input, { signal }), /unavailable/)
  f.postHost.dispose()
})

test('paired enabled public flags require the protected runtime and Edge to be enabled as well', async () => {
  const enabled = { ...input, publicCustomer: true, publicCart: true }
  const f = fixture({ selectedInput: enabled, runtimeCustomer: true, states: ['READY'] })
  const result = await f.verifier.verify(enabled, { signal })
  assert.equal(result.status, 'PROTECTED_PREVIEW_VERIFIED')
  assert.equal(result.customerEnabled, true); assert.equal(result.cartEnabled, true)
  assert.equal(f.posts, 1); assert.equal(f.stops, 0)
  f.postHost.dispose()
})

test('wrong actual Git source, alias or protected runtime flags stop after one POST without a success receipt', async () => {
  for (const options of [{ actualSha: 'c'.repeat(40) }, { aliasId: 'dpl_other123' }, { runtimeCustomer: true }]) {
    const f = fixture(options)
    const pending = f.verifier.verify(input, { signal })
    assert.equal(await Promise.race([pending.then(() => 'settled', () => 'rejected'),
      new Promise(resolve => setTimeout(() => resolve('held'), 20))]), 'held')
    assert.equal(f.posts, 1); assert.equal(f.stops, 1)
    await assert.rejects(f.verifier.verify(input, { signal }), /unavailable/)
    f.postHost.dispose()
  }
})

test('failed or never-ready build has bounded reads and stops without a second POST', async () => {
  for (const states of [['ERROR'], ['QUEUED']]) {
    const f = fixture({ states })
    const pending = f.verifier.verify(input, { signal })
    assert.equal(await Promise.race([pending.then(() => 'settled', () => 'rejected'),
      new Promise(resolve => setTimeout(() => resolve('held'), 20))]), 'held')
    assert.equal(f.posts, 1); assert.equal(f.stops, 1)
    assert.ok(f.stateReads <= 90)
    f.postHost.dispose()
  }
})
