import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23FixedPreflight } from '../scripts/staging-generation-23-fixed-preflight.mjs'
import { STAGING_ALIAS, STAGING_SURFACE_TARGET } from '../scripts/staging-surface-activation-transport.mjs'

const nowMs = Date.parse('2026-09-27T12:00:00.000Z')
const token = Buffer.from('vercel-private-test-token')
const bypass = Buffer.from('preview-bypass-test-token')
const deployment = Object.freeze({ deploymentId: 'dpl_held', immutableUrl: 'https://held-preview.vercel.app',
  sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64), ready: true,
  createdAt: new Date(nowMs - 1_000).toISOString() })
const alias = Object.freeze({ target: STAGING_SURFACE_TARGET, alias: STAGING_ALIAS,
  deploymentId: deployment.deploymentId, immutableUrl: deployment.immutableUrl })
const source = Object.freeze({ status: 'SOURCE_PROOF_VERIFIED', sourceCommit: deployment.sourceCommit,
  manifestSha256: deployment.manifestSha256 })
const headers = { 'content-type': 'application/json' }
const inventory = (changes = {}) => new Response(JSON.stringify({ envs: [{ id: 'env_checkout',
  key: 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED', target: ['preview'], gitBranch: 'codex/tll-integration',
  type: 'encrypted', visibility: 'config', value: 'false' }], ...changes }), { status: 200, headers })

async function armed () {
  const sourceText = await readFile(new URL('../scripts/staging-generation-23-fixed-preflight.mjs', import.meta.url), 'utf8')
  const scripts = new URL('../scripts/', import.meta.url)
  const enabled = sourceText.replace('export const STAGING_GENERATION_23_FIXED_PREFLIGHT_ENABLED = false',
    'export const STAGING_GENERATION_23_FIXED_PREFLIGHT_ENABLED = true').replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(enabled).toString('base64')}`)
}

function fixture ({ mutate = value => value, response = inventory() } = {}) {
  const calls = []
  const makeNative = ({ protectedFetch }) => ({
    async readPinnedRepository () { return mutate({ repoId: 1264363509, org: 'tntipper', repo: 'the-lifting-lab' }) },
    async resolveAlias (_target, request) { assert.deepEqual(request, { project: 'the-lifting-lab', scope: 'my-lifting-lab-s-projects', alias: STAGING_ALIAS, branch: 'codex/tll-integration' }); return mutate(alias) },
    async readDeployment (_target, id) { assert.equal(id, deployment.deploymentId); return mutate(deployment) },
    async readVercelFlags () { assert.ok(protectedFetch); return mutate({ target: STAGING_SURFACE_TARGET, privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false }) },
    async readEdgeFlag () { return mutate({ target: STAGING_SURFACE_TARGET, functionName: 'customer-subject-broker', enabled: false }) },
    dispose () {},
  })
  const makeProtected = input => ({ fetch: async (...args) => input.fetch(...args), dispose () {} })
  return { calls, options: { fetch: async (url, options) => { calls.push({ url, options }); return response }, vercelToken: token,
    previewBypass: bypass, readSourceProof: async () => mutate(source), now: () => nowMs,
    factories: { createNativeBinding: makeNative, createProtectedFetch: makeProtected } } }
}

test('ordinary source is default-OFF', () => {
  assert.throws(() => createStagingGeneration23FixedPreflight({}), /unavailable/)
})

test('fresh producer returns only the fixed held facts and exact checkout setting ID', async () => {
  const preflightModule = await armed(), f = fixture()
  const producer = preflightModule.createStagingGeneration23FixedPreflight(f.options)
  const result = await producer.read({ signal: new AbortController().signal })
  assert.deepEqual(result.preflight.heldEvidence, { target: STAGING_SURFACE_TARGET, ...deployment })
  assert.deepEqual(result.preflight.requirements, { sourceCommit: deployment.sourceCommit, manifestSha256: deployment.manifestSha256,
    observedAt: new Date(nowMs).toISOString() })
  assert.deepEqual(result.checkoutTarget, { name: 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED', id: 'env_checkout',
    branch: 'codex/tll-integration', environment: 'preview', classification: 'config' })
  assert.equal(f.calls.length, 1)
  assert.match(f.calls[0].url, /target=preview&gitBranch=codex%2Ftll-integration&limit=100/)
  assert.equal(f.calls[0].options.method, 'GET')
  assert.equal(f.calls[0].options.redirect, 'error')
  assert.doesNotMatch(JSON.stringify(result), /private-test-token|preview-bypass|"value"/)
  await assert.rejects(producer.read({ signal: new AbortController().signal }), /unavailable/)
})

test('the default fixed Vercel binding accepts only the pinned repository, alias, deployment and held readiness replies', async () => {
  const preflightModule = await armed(), calls = []
  const project = { id: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4', name: 'the-lifting-lab', accountId: 'team_gf7cgIkkoeMLtODFDDT5MrW4',
    link: { type: 'github', repoId: 1264363509, repoOwnerId: 123, org: 'tntipper', repo: 'the-lifting-lab', productionBranch: 'main', sourceless: false } }
  const rawDeployment = { id: deployment.deploymentId, url: 'held-preview.vercel.app', projectId: project.id, ownerId: project.accountId,
    readyState: 'READY', target: null, createdAt: nowMs - 1_000,
    gitSource: { type: 'github', repoId: 1264363509, ref: 'codex/tll-integration', sha: deployment.sourceCommit },
    meta: { githubCommitRef: 'codex/tll-integration', githubCommitSha: deployment.sourceCommit, tllManifestSha256: deployment.manifestSha256 } }
  const fetch = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('/v9/projects/')) return new Response(JSON.stringify(project), { status: 200 })
    if (url.includes('/v4/aliases/')) return new Response(JSON.stringify({ alias: new URL(STAGING_ALIAS).hostname,
      projectId: project.id, deploymentId: deployment.deploymentId, deployment: { id: deployment.deploymentId, url: 'held-preview.vercel.app' } }), { status: 200 })
    if (url.includes('/v13/deployments/')) return new Response(JSON.stringify(rawDeployment), { status: 200 })
    if (url.endsWith('/api/staging/readiness')) return new Response(JSON.stringify({ deploymentId: deployment.deploymentId,
      immutableUrl: deployment.immutableUrl, projectRef: 'qdmvngjwkcsilzmqksme', branch: 'codex/tll-integration',
      privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false }), { status: 200 })
    if (url.endsWith('/tll-broker-token')) return new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: 503,
      headers: { 'x-tll-staging-edge-control': 'disabled' } })
    if (url.includes('/v10/projects/') && url.includes('/env?')) return inventory()
    throw Error(`unexpected ${url}`)
  }
  const producer = preflightModule.createStagingGeneration23FixedPreflight({ fetch, vercelToken: token, previewBypass: bypass,
    readSourceProof: async () => source, now: () => nowMs,
    factories: { createProtectedFetch: ({ fetch: raw }) => ({ fetch: raw, dispose () {} }) } })
  const result = await producer.read({ signal: new AbortController().signal })
  assert.equal(result.preflight.heldEvidence.deploymentId, deployment.deploymentId)
  assert.equal(result.checkoutTarget.id, 'env_checkout')
  assert.ok(calls.some(call => call.url.includes('/v9/projects/')))
  assert.equal(calls.filter(call => call.url.includes('/v4/aliases/')).length, 2)
  const protectedRead = calls.find(call => call.url.endsWith('/api/staging/readiness'))
  assert.equal(protectedRead.options.method, 'GET')
  assert.equal(protectedRead.options.redirect, 'error')
})

test('wrong branch, alias, source or checkout ID fails before returning a usable preflight', async () => {
  const preflightModule = await armed()
  for (const change of [
    value => value === alias ? { ...alias, alias: 'https://wrong.vercel.app' } : value,
    value => value === source ? { ...source, sourceCommit: 'c'.repeat(40) } : value,
  ]) {
    const f = fixture({ mutate: change })
    const producer = preflightModule.createStagingGeneration23FixedPreflight(f.options)
    await assert.rejects(producer.read({ signal: new AbortController().signal }), /unavailable/)
  }
  const wrongBranch = inventory({ envs: [{ id: 'env_checkout', key: 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED',
    target: ['preview'], gitBranch: 'main', type: 'encrypted', visibility: 'config' }] })
  const f = fixture({ response: wrongBranch })
  await assert.rejects(preflightModule.createStagingGeneration23FixedPreflight(f.options).read({ signal: new AbortController().signal }), /unavailable/)
})

test('malformed inventory cannot substitute a second setting or expose an unreviewed setting ID', async () => {
  const preflightModule = await armed()
  const duplicate = inventory({ envs: [
    { id: 'env_checkout', key: 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED', target: ['preview'], gitBranch: 'codex/tll-integration', type: 'encrypted', visibility: 'config' },
    { id: 'env_other', key: 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED', target: ['preview'], gitBranch: 'codex/tll-integration', type: 'encrypted', visibility: 'config' },
  ] })
  const f = fixture({ response: duplicate })
  await assert.rejects(preflightModule.createStagingGeneration23FixedPreflight(f.options).read({ signal: new AbortController().signal }), /unavailable/)
})
