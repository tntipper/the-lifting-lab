import test from 'node:test'
import assert from 'node:assert/strict'
import { createStagingPreviewDeploymentPost, STAGING_PREVIEW_DEPLOYMENT_POST_ENABLED } from '../scripts/staging-surface-preview-deployment-post.mjs'

const input = Object.freeze({ branch: 'codex/tll-integration', sourceCommit: 'a'.repeat(40),
  manifestSha256: 'b'.repeat(64), publicCustomer: false, publicCart: false })
const linked = Object.freeze({ repoId: 1264363509, org: 'tntipper', repo: 'the-lifting-lab' })
const signal = new AbortController().signal
const response = (value, status = 200) => new Response(JSON.stringify(value), { status })

test('one-use POST checks the repository immediately before the fixed fresh Preview request', async () => {
  assert.equal(STAGING_PREVIEW_DEPLOYMENT_POST_ENABLED, false)
  const calls = [], token = Buffer.from('private-test-token')
  const host = createStagingPreviewDeploymentPost({ vercelToken: token,
    readPinnedRepository: async passed => { assert.equal(passed, signal); calls.push('project'); return linked },
    stopWorkerGroup: () => { throw Error('must not stop') },
    fetch: async (url, options) => { calls.push('post'); assert.equal(options.signal, signal)
      assert.equal(url, 'https://api.vercel.com/v13/deployments?forceNew=1&teamId=team_gf7cgIkkoeMLtODFDDT5MrW4')
      assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error')
      const body = JSON.parse(options.body)
      assert.equal(body.project, 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4')
      assert.deepEqual(body.gitSource, { type: 'github', org: 'tntipper', repo: 'the-lifting-lab', ref: input.branch, sha: input.sourceCommit })
      assert.equal(body.meta.tllManifestSha256, input.manifestSha256)
      assert.equal(Object.hasOwn(body, 'target'), false)
      return response({ id: 'dpl_test123', readyState: 'QUEUED', target: null }) },
  })
  assert.deepEqual(await host.submit(input, { signal }), { status: 'ACCEPTED_UNVERIFIED', deploymentId: 'dpl_test123' })
  assert.deepEqual(calls, ['project', 'post'])
  await assert.rejects(host.submit(input, { signal }), /unavailable/)
  host.dispose(); assert.equal(token.toString(), 'private-test-token', 'the caller retains its buffer')
})

test('wrong project link or invalid request stops before POST', async () => {
  let posts = 0, stops = 0
  const host = createStagingPreviewDeploymentPost({ vercelToken: Buffer.from('private-test-token'),
    readPinnedRepository: async () => ({ ...linked, repoId: 1 }), stopWorkerGroup: () => { stops++ },
    fetch: async () => { posts++; return response({ id: 'dpl_wrong', readyState: 'READY' }) } })
  await assert.rejects(host.submit(input, { signal }), /unavailable/)
  await assert.rejects(host.submit({ ...input, branch: 'main' }, { signal }), /unavailable/)
  assert.equal(posts, 0); assert.equal(stops, 0)
})

test('lost or misleading POST acknowledgement stops the worker and never returns a retryable error', async () => {
  for (const reply of [
    async () => { throw Error('network lost') },
    async () => response({ id: 'dpl_test123', readyState: 'READY', target: 'production' }),
    async () => response({ id: 'not-a-deployment', readyState: 'READY' }),
    async () => response({ error: 'bad request' }, 400),
  ]) {
    let stops = 0, posts = 0
    const host = createStagingPreviewDeploymentPost({ vercelToken: Buffer.from('private-test-token'),
      readPinnedRepository: async () => linked, stopWorkerGroup: () => { stops++ },
      fetch: async () => { posts++; return reply() } })
    const pending = host.submit(input, { signal })
    const settled = await Promise.race([pending.then(() => 'settled', () => 'rejected'),
      new Promise(resolve => setTimeout(() => resolve('held'), 15))])
    assert.equal(settled, 'held'); assert.equal(stops, 1); assert.equal(posts, 1)
    await assert.rejects(host.submit(input, { signal }), /unavailable/)
    host.dispose()
  }
})

test('abort after dispatch is uncertain; abort before preflight makes no request', async () => {
  const controller = new AbortController(); let posts = 0, stops = 0
  const host = createStagingPreviewDeploymentPost({ vercelToken: Buffer.from('private-test-token'),
    readPinnedRepository: async () => linked, stopWorkerGroup: () => { stops++ },
    fetch: async () => { posts++; controller.abort(); return response({ id: 'dpl_test123', readyState: 'READY' }) } })
  const pending = host.submit(input, { signal: controller.signal })
  assert.equal(await Promise.race([pending.then(() => 'settled', () => 'rejected'),
    new Promise(resolve => setTimeout(() => resolve('held'), 15))]), 'held')
  assert.equal(posts, 1); assert.equal(stops, 1)
  const before = new AbortController(); before.abort()
  await assert.rejects(host.submit(input, { signal: before.signal }), /unavailable/)
})
