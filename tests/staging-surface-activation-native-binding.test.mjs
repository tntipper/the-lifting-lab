import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createStagingSurfaceNativeBinding, EDGE_FLAG_NAME, NATIVE_SURFACE_ACTIVATION_BINDING_ENABLED, VERCEL_PROJECT_ID, VERCEL_TEAM_ID,
} from '../scripts/staging-surface-activation-native-binding.mjs'
import { STAGING_ALIAS, STAGING_SURFACE_TARGET } from '../scripts/staging-surface-activation-transport.mjs'
import { createStagingSurfaceNativePorts } from '../scripts/staging-surface-activation-native-adapter.mjs'

const token = () => Buffer.from('private-vercel-token')
const signal = new AbortController().signal
const deploymentId = 'dpl_abc123'
const deployment = Object.freeze({ id: deploymentId, url: 'tll-abc.vercel.app', projectId: VERCEL_PROJECT_ID,
  ownerId: VERCEL_TEAM_ID, readyState: 'READY', createdAt: Date.parse('2026-09-22T12:00:00.000Z'),
  meta: { githubCommitRef: 'codex/tll-integration', githubCommitSha: 'a'.repeat(40), tllManifestSha256: 'b'.repeat(64) } })
const jsonResponse = (status, body, _url, length = null) => new Response(JSON.stringify(body), { status,
  headers: length === null ? undefined : { 'content-length': length } })

function binding({ onFetch = () => {}, onCli = () => ({ status: 'COMPLETED' }) } = {}) {
  return createStagingSurfaceNativeBinding({ vercelToken: token(),
    runCli: async (...args) => onCli(...args),
    fetch: async (url, options) => { onFetch(url, options); if (url.includes('/v4/aliases/')) return jsonResponse(200, {
      alias: new URL(STAGING_ALIAS).hostname, projectId: VERCEL_PROJECT_ID, deploymentId,
      deployment: { id: deploymentId, url: deployment.url, meta: { githubCommitRef: 'codex/tll-integration' } },
    }, url)
      if (url.includes('/v13/deployments/')) return jsonResponse(200, deployment, url)
      if (url.endsWith('/tll-broker-token')) return jsonResponse(503, { error: 'temporarily_unavailable' }, url)
      return jsonResponse(200, { deploymentId, immutableUrl: `https://${deployment.url}`, projectRef: 'qdmvngjwkcsilzmqksme', branch: 'codex/tll-integration',
        privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false }, url) },
  })
}

test('binding stays disabled and requires explicit injected dependencies', () => {
  assert.equal(NATIVE_SURFACE_ACTIVATION_BINDING_ENABLED, false)
  assert.throws(() => createStagingSurfaceNativeBinding(), /unavailable/)
  assert.throws(() => createStagingSurfaceNativeBinding({ runCli: () => {}, fetch: () => {}, vercelToken: Buffer.alloc(0) }), /unavailable/)
})

test('read-only deployment preflight checks the fixed connected GitHub repository afresh', async () => {
  const calls = []
  const project = { id: VERCEL_PROJECT_ID, name: 'the-lifting-lab', accountId: VERCEL_TEAM_ID,
    link: { type: 'github', repoId: 1264363509, repoOwnerId: 12345, org: 'tntipper',
      repo: 'the-lifting-lab', productionBranch: 'main', sourceless: false } }
  const host = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }),
    fetch: async (url, options) => { calls.push({ url, options }); return jsonResponse(200, project, url) } })
  const expected = { repoId: 1264363509, org: 'tntipper', repo: 'the-lifting-lab' }
  assert.deepEqual(await host.readPinnedRepository(signal), expected)
  assert.deepEqual(await host.readPinnedRepository(signal), expected)
  assert.equal(calls.length, 2, 'the check must not reuse a previous project read')
  for (const call of calls) {
    assert.equal(call.url, `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}?teamId=${VERCEL_TEAM_ID}`)
    assert.equal(call.options.method, 'GET')
    assert.equal(call.options.signal, signal)
  }
  await assert.rejects(host.createDeployment(), /unavailable/)
  assert.equal(calls.length, 2, 'disabled deployment must never dispatch a POST')
})

test('deployment preflight rejects a changed repository, project, or aborted signal', async () => {
  const base = { id: VERCEL_PROJECT_ID, name: 'the-lifting-lab', accountId: VERCEL_TEAM_ID,
    link: { type: 'github', repoId: 1264363509, repoOwnerId: 12345, org: 'tntipper',
      repo: 'the-lifting-lab', productionBranch: 'main', sourceless: false } }
  for (const changed of [
    { ...base, link: { ...base.link, repoId: 999 } },
    { ...base, link: { ...base.link, sourceless: true } },
    { ...base, accountId: 'team_other' },
  ]) {
    const host = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }),
      fetch: async (url) => jsonResponse(200, changed, url) })
    await assert.rejects(host.readPinnedRepository(signal), /unavailable/)
  }
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(binding().readPinnedRepository(aborted.signal), /unavailable/)
})

test('Vercel mutations accept only the four fixed commands and forward the abort signal', async () => {
  const calls = [], ports = binding({ onCli: (args, input, fd, options) => { calls.push({ args, input: input.toString(), fd, options }); return { status: 'COMPLETED' } } })
  await ports.runVercel(['--yes', 'vercel', 'env', 'add', 'TLL_STAGING_CUSTOMER_ENABLED', 'preview', '--git-branch', 'codex/tll-integration', '--no-sensitive', '--force', '--project', 'the-lifting-lab', '--scope', 'my-lifting-lab-s-projects', '--non-interactive', '--no-color'], Buffer.from('true'), 0, { signal })
  assert.equal(calls.length, 1); assert.equal(calls[0].options.signal, signal)
  await assert.rejects(ports.runVercel(['vercel', 'env'], Buffer.from('true'), 0, { signal }), /unavailable/)
  await assert.rejects(ports.runVercel(['--yes', 'vercel', 'env', 'add', 'TLL_STAGING_CUSTOMER_ENABLED', 'preview', '--git-branch', 'codex/tll-integration', '--no-sensitive', '--force', '--project', 'the-lifting-lab', '--scope', 'my-lifting-lab-s-projects', '--non-interactive', '--no-color'], Buffer.from('enabled'), 0, { signal }), /unavailable/)
})

test('edge write uses an exact private-fd command and runner acknowledgement', async () => {
  const calls = [], ports = binding({ onCli: (args, input, fd, options) => { calls.push([args, input.toString(), fd, options.signal]); return { status: 'COMPLETED' } } })
  const receipt = await ports.setEdgeFlag(STAGING_SURFACE_TARGET, 'customer-subject-broker', true, { signal })
  assert.deepEqual(receipt, { target: STAGING_SURFACE_TARGET, functionName: 'customer-subject-broker', enabled: true })
  assert.deepEqual(calls[0].slice(0, 3), [['supabase', 'secrets', 'set', '--env-file', '/dev/fd/3', '--project-ref', 'qdmvngjwkcsilzmqksme', '--output', 'json'], `${EDGE_FLAG_NAME}=true\n`, 3])
  const noAck = binding({ onCli: () => ({ status: 'PENDING' }) })
  await assert.rejects(noAck.setEdgeFlag(STAGING_SURFACE_TARGET, 'customer-subject-broker', false, { signal }), /unavailable/)
})

test('Edge read permits only the two secret-free runtime protocol proofs', async () => {
  const calls = []
  const held = binding({ onFetch: (url, options) => calls.push({ url, options }) })
  assert.deepEqual(await held.readEdgeFlag(STAGING_SURFACE_TARGET, 'customer-subject-broker', { signal }), { target: STAGING_SURFACE_TARGET, functionName: 'customer-subject-broker', enabled: false })
  assert.deepEqual(calls[0], { url: 'https://qdmvngjwkcsilzmqksme.supabase.co/functions/v1/tll-broker-token', options: { method: 'POST', redirect: 'error', headers: { accept: 'application/json' }, signal } })
  const unexpected = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }), fetch: async (url) => jsonResponse(400, { error: 'bad_request' }, url) })
  await assert.rejects(unexpected.readEdgeFlag(STAGING_SURFACE_TARGET, 'customer-subject-broker', { signal }), /unavailable/)
  const wrongStatus = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }), fetch: async (url) => jsonResponse(200, { error: 'invalid_client' }, url) })
  await assert.rejects(wrongStatus.readEdgeFlag(STAGING_SURFACE_TARGET, 'customer-subject-broker', { signal }), /unavailable/)
})

test('alias, readiness and deployment calls use fixed URLs, headers, and reject drift', async () => {
  const calls = [], ports = binding({ onFetch: (url, options) => calls.push({ url, options }) })
  const alias = await ports.resolveAlias(STAGING_SURFACE_TARGET, { project: 'the-lifting-lab', scope: 'my-lifting-lab-s-projects', alias: STAGING_ALIAS, branch: 'codex/tll-integration' }, { signal })
  assert.deepEqual(alias, { target: STAGING_SURFACE_TARGET, alias: STAGING_ALIAS, deploymentId, immutableUrl: `https://${deployment.url}` })
  assert.match(calls[0].url, /^https:\/\/api\.vercel\.com\/v4\/aliases\/the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects\.vercel\.app\?/)
  assert.match(calls[0].url, /projectId=prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4&teamId=team_gf7cgIkkoeMLtODFDDT5MrW4$/)
  const flags = await ports.readVercelFlags(STAGING_SURFACE_TARGET, { privateCustomer: 'TLL_STAGING_CUSTOMER_ENABLED', privateCart: 'TLL_STAGING_CART_ENABLED', publicCustomer: 'NEXT_PUBLIC_TLL_STAGING_CUSTOMER', publicCart: 'NEXT_PUBLIC_TLL_STAGING_CART' }, { signal })
  assert.deepEqual(flags, { target: STAGING_SURFACE_TARGET, privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false })
  assert.deepEqual(calls.at(-1).options.headers, { 'x-tll-deployment-id': deploymentId })
  const read = await ports.readDeployment(STAGING_SURFACE_TARGET, deploymentId, { signal })
  assert.equal(read.sourceCommit, 'a'.repeat(40)); assert.equal(read.manifestSha256, 'b'.repeat(64))
  const deploymentCall = calls.find(call => call.url.includes('/v13/deployments/'))
  assert.equal(deploymentCall.url, `https://api.vercel.com/v13/deployments/${deploymentId}?teamId=${VERCEL_TEAM_ID}`)
  await assert.rejects(ports.readDeployment({ ...STAGING_SURFACE_TARGET, projectRef: 'wrhgscovsgsudtedbljr' }, deploymentId, { signal }), /unavailable/)
  await assert.rejects(ports.createDeployment(), /unavailable/)
})

test('deployment state read distinguishes pending, ready and failed builds without claiming source proof', async () => {
  const calls = []
  for (const readyState of ['QUEUED', 'INITIALIZING', 'BUILDING', 'READY', 'ERROR']) {
    const host = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }),
      fetch: async (url, options) => { calls.push({ url, options }); return jsonResponse(200, {
        id: deploymentId, projectId: VERCEL_PROJECT_ID, ownerId: VERCEL_TEAM_ID, readyState, target: null }, url) } })
    assert.deepEqual(await host.readDeploymentState(STAGING_SURFACE_TARGET, deploymentId, { signal }), { deploymentId, readyState })
  }
  assert.equal(calls.length, 5)
  for (const call of calls) {
    assert.equal(call.url, `https://api.vercel.com/v13/deployments/${deploymentId}?teamId=${VERCEL_TEAM_ID}`)
    assert.equal(call.options.method, 'GET')
    assert.equal(call.options.signal, signal)
  }
})

test('deployment state read rejects changed identity, production target and unknown state', async () => {
  for (const changed of [
    { id: 'dpl_other', readyState: 'READY' },
    { id: deploymentId, readyState: 'READY', projectId: 'prj_other' },
    { id: deploymentId, readyState: 'READY', ownerId: 'team_other' },
    { id: deploymentId, readyState: 'READY', target: 'production' },
    { id: deploymentId, readyState: 'NOT_FOUND' },
  ]) {
    const host = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }),
      fetch: async url => jsonResponse(200, changed, url) })
    await assert.rejects(host.readDeploymentState(STAGING_SURFACE_TARGET, deploymentId, { signal }), /unavailable/)
  }
})

test('redirects, actual oversized JSON, dishonest or missing lengths, malformed source evidence, aborted calls, and ambient escape hatches fail closed', async () => {
  const malformed = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }), fetch: async url => ({ ...jsonResponse(200, deployment, url), redirected: true }) })
  await assert.rejects(malformed.readDeployment(STAGING_SURFACE_TARGET, deploymentId, { signal }), /unavailable/)
  const tooLarge = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }), fetch: async url => jsonResponse(200, { data: 'x'.repeat(65_537) }, url, '2') })
  await assert.rejects(tooLarge.readDeployment(STAGING_SURFACE_TARGET, deploymentId, { signal }), /unavailable/)
  const dishonest = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }), fetch: async url => jsonResponse(200, deployment, url, '9999999') })
  await assert.doesNotReject(dishonest.readDeployment(STAGING_SURFACE_TARGET, deploymentId, { signal }))
  const badSource = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }), fetch: async url => jsonResponse(200, { ...deployment, meta: { ...deployment.meta, githubCommitRef: 'main' } }, url) })
  await assert.rejects(badSource.readDeployment(STAGING_SURFACE_TARGET, deploymentId, { signal }), /unavailable/)
  const badOwner = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }), fetch: async url => jsonResponse(200, { ...deployment, ownerId: 'team_unexpected' }, url) })
  await assert.rejects(badOwner.readDeployment(STAGING_SURFACE_TARGET, deploymentId, { signal }), /unavailable/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(binding().readDeployment(STAGING_SURFACE_TARGET, deploymentId, { signal: controller.signal }), /unavailable/)
  const source = await (await import('node:fs/promises')).readFile('scripts/staging-surface-activation-native-binding.mjs', 'utf8')
  assert.doesNotMatch(source, /process\.env|process\.argv|spawn\(|Keychain|security find|globalThis\.fetch/)
})

test('chunked oversized bodies are cancelled as soon as the bounded reader crosses its limit', async () => {
  let reads = 0, cancelled = false, released = false
  const body = { getReader: () => ({
    read: async () => { reads += 1; return reads === 1 ? { done: false, value: new Uint8Array(65_537) } : { done: true } },
    cancel: async () => { cancelled = true }, releaseLock: () => { released = true },
  }) }
  const ports = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }), fetch: async () => ({ status: 200, url: '', redirected: false, body }) })
  await assert.rejects(ports.readDeployment(STAGING_SURFACE_TARGET, deploymentId, { signal }), /unavailable/)
  assert.equal(reads, 1); assert.equal(cancelled, true); assert.equal(released, true)
})

test('composition with the surface adapter supports a fresh-process readiness fallback and keeps deployment creation unavailable', async () => {
  const host = binding()
  const ports = createStagingSurfaceNativePorts({ execute: async operation => ({ status: 'COMPLETED', value: await operation(signal) }), ...host })
  const runtime = await ports.readRuntimeReadiness(STAGING_SURFACE_TARGET, deploymentId)
  assert.deepEqual(runtime, { target: STAGING_SURFACE_TARGET, deploymentId, immutableUrl: `https://${deployment.url}`,
    customerEnabled: false, cartEnabled: false, brokerEnabled: false, publicCustomerEnabled: false, publicCartEnabled: false })
  await assert.rejects(ports.createPreviewDeployment(STAGING_SURFACE_TARGET, { branch: 'codex/tll-integration', sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64), publicCustomer: false, publicCart: false }), /unavailable/)
})

test('composed mid-flight abort waits for the binding operation to settle and never produces a receipt', async () => {
  let settled = false
  const host = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }), fetch: async (url, options) => new Promise(resolve => {
    options.signal.addEventListener('abort', () => { settled = true; resolve(jsonResponse(200, deployment, url)) }, { once: true })
  }) })
  const execute = async operation => {
    const controller = new AbortController(), pending = operation(controller.signal)
    controller.abort(); await pending
    return { status: 'CANCELLED', value: null }
  }
  const ports = createStagingSurfaceNativePorts({ execute, ...host })
  await assert.rejects(ports.readDeployment(STAGING_SURFACE_TARGET, deploymentId), /unavailable/)
  assert.equal(settled, true)
})

test('adapter fetch boundary rejects unrelated URLs and methods before dispatch', async () => {
  let dispatched = false
  const host = createStagingSurfaceNativeBinding({ vercelToken: token(), runCli: async () => ({ status: 'COMPLETED' }), fetch: async () => { dispatched = true; return jsonResponse(200, {}) } })
  await assert.rejects(host.fetch('https://example.test/', { method: 'DELETE', redirect: 'manual', signal }), /unavailable/)
  assert.equal(dispatched, false)
})

test('injected secret diagnostics are replaced by the fixed binding error', async () => {
  const ports = binding({ onCli: () => { throw new Error('private-vercel-token must never be reported') } })
  await assert.rejects(ports.runVercel(['--yes', 'vercel', 'env', 'add', 'TLL_STAGING_CUSTOMER_ENABLED', 'preview', '--git-branch', 'codex/tll-integration', '--no-sensitive', '--force', '--project', 'the-lifting-lab', '--scope', 'my-lifting-lab-s-projects', '--non-interactive', '--no-color'], Buffer.from('true'), 0, { signal }), error => error.message === 'Staging surface native binding unavailable' && !error.message.includes('private'))
})
