import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createStagingAccountHostedBaselineSurfaceBinding,
  HOSTED_BASELINE_SURFACE_BINDING_ENABLED,
  HOSTED_BASELINE_SURFACE_ERROR,
} from '../scripts/staging-account-hosted-baseline-surface.mjs'

const token = () => Buffer.from('private-vercel-read-token')
const aliasHost = 'the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app'
const aliasUrl = `https://api.vercel.com/v4/aliases/${aliasHost}?projectId=prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4&teamId=team_gf7cgIkkoeMLtODFDDT5MrW4`
const deploymentId = 'dpl_A1b2c3'
const immutableUrl = 'https://the-lifting-lab-abc123.vercel.app'
const deploymentUrl = `https://api.vercel.com/v13/deployments/${deploymentId}?withGitRepoInfo=true&teamId=team_gf7cgIkkoeMLtODFDDT5MrW4`
const readinessUrl = `${immutableUrl}/api/staging/readiness`
const edgeUrl = 'https://qdmvngjwkcsilzmqksme.supabase.co/functions/v1/tll-broker-token'
const response = (body, status = 200, headers) => new Response(JSON.stringify(body), { status, headers })
const alias = () => ({ alias: aliasHost, projectId: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4', deploymentId, deployment: { id: deploymentId, url: 'the-lifting-lab-abc123.vercel.app' } })
const deployment = () => ({ id: deploymentId, projectId: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4', ownerId: 'team_gf7cgIkkoeMLtODFDDT5MrW4', target: null, readyState: 'READY', url: 'the-lifting-lab-abc123.vercel.app', gitSource: { type: 'github', repoId: 998877, ref: 'codex/tll-integration', sha: 'a'.repeat(40) }, meta: { tllManifestSha256: 'b'.repeat(64) } })
const readiness = () => ({ deploymentId, immutableUrl, projectRef: 'qdmvngjwkcsilzmqksme', branch: 'codex/tll-integration', privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false })

function binding ({ onFetch = () => {}, bodyFor } = {}) {
  return createStagingAccountHostedBaselineSurfaceBinding({ vercelToken: token(), fetch: async (url, options) => {
    onFetch(url, options)
    const body = bodyFor ? bodyFor(url) : url === aliasUrl ? alias() : url === deploymentUrl ? deployment() : url === readinessUrl ? readiness() : { error: 'temporarily_unavailable' }
    return response(body, url === edgeUrl ? 503 : 200)
  } })
}

test('stays disabled and performs one fixed ordered read-only pass', async () => {
  assert.equal(HOSTED_BASELINE_SURFACE_BINDING_ENABLED, false)
  assert.throws(() => createStagingAccountHostedBaselineSurfaceBinding(), new RegExp(HOSTED_BASELINE_SURFACE_ERROR))
  const calls = [], signal = new AbortController().signal
  const result = await binding({ onFetch: (url, options) => calls.push({ url, options }) }).readBaseline({ signal })
  assert.deepEqual(calls.map(call => call.url), [aliasUrl, deploymentUrl, readinessUrl, edgeUrl])
  assert.deepEqual(result.surface, { edge: { target: { projectRef: 'qdmvngjwkcsilzmqksme', vercelProject: 'the-lifting-lab', vercelScope: 'my-lifting-lab-s-projects', branch: 'codex/tll-integration', environment: 'preview', alias: `https://${aliasHost}` }, functionName: 'customer-subject-broker', enabled: false }, flags: { target: { projectRef: 'qdmvngjwkcsilzmqksme', vercelProject: 'the-lifting-lab', vercelScope: 'my-lifting-lab-s-projects', branch: 'codex/tll-integration', environment: 'preview', alias: `https://${aliasHost}` }, privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false } })
  assert.deepEqual(result.deployment, { projectId: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4', project: 'the-lifting-lab', teamId: 'team_gf7cgIkkoeMLtODFDDT5MrW4', scope: 'my-lifting-lab-s-projects', branch: 'codex/tll-integration', alias: `https://${aliasHost}`, deploymentId, immutableUrl, gitProvider: 'github', repositoryId: '998877', gitSourceCommit: 'a'.repeat(40), applicationManifestSha256: 'b'.repeat(64) })
  assert.deepEqual(calls[0].options, { method: 'GET', redirect: 'error', headers: calls[0].options.headers, signal })
  assert.match(calls[0].options.headers.authorization, /^Bearer /)
  assert.deepEqual(calls[2].options.headers, { accept: 'application/json', 'accept-encoding': 'identity', 'x-tll-deployment-id': deploymentId })
  assert.deepEqual(calls[3].options.headers, { accept: 'application/json', 'accept-encoding': 'identity' })
  const oneShot = binding()
  await oneShot.readBaseline({ signal: new AbortController().signal })
  await assert.rejects(oneShot.readBaseline({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SURFACE_ERROR))
})

test('uses only protocol-approved Edge states and rejects target, source, URL, and deployment drift', async () => {
  const cases = [
    { url: aliasUrl, mutate: value => ({ ...value, alias: 'other.vercel.app' }) },
    { url: deploymentUrl, mutate: value => ({ ...value, ownerId: 'team_other' }) },
    { url: deploymentUrl, mutate: value => ({ ...value, target: 'production' }) },
    { url: deploymentUrl, mutate: value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'target')) },
    { url: deploymentUrl, mutate: value => ({ ...value, target: 'staging' }) },
    { url: deploymentUrl, mutate: value => ({ ...value, gitSource: { ...value.gitSource, ref: 'main' } }) },
    { url: deploymentUrl, mutate: value => ({ ...value, gitSource: { ...value.gitSource, repoId: '01' } }) },
    { url: deploymentUrl, mutate: value => ({ ...value, gitSource: { ...value.gitSource, repoId: 0 } }) },
    { url: deploymentUrl, mutate: value => ({ ...value, gitSource: { ...value.gitSource, repoId: Number.MAX_SAFE_INTEGER + 1 } }) },
    { url: deploymentUrl, mutate: value => ({ ...value, meta: { ...value.meta, tllManifestSha256: 'bad' } }) },
    { url: readinessUrl, mutate: value => ({ ...value, immutableUrl: 'https://attacker.invalid' }) },
  ]
  for (const { url: mutatedUrl, mutate } of cases) {
    const ports = binding({ bodyFor: url => {
      const original = url === aliasUrl ? alias() : url === deploymentUrl ? deployment() : url === readinessUrl ? readiness() : { error: 'temporarily_unavailable' }
      return url === mutatedUrl ? mutate(original) : original
    } })
    await assert.rejects(ports.readBaseline({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SURFACE_ERROR))
  }
  const enabled = createStagingAccountHostedBaselineSurfaceBinding({ vercelToken: token(), fetch: async url => response(url === aliasUrl ? alias() : url === deploymentUrl ? deployment() : url === readinessUrl ? readiness() : { error: 'invalid_client' }, url === edgeUrl ? 401 : 200) })
  assert.equal((await enabled.readBaseline({ signal: new AbortController().signal })).surface.edge.enabled, true)
  const unexpected = createStagingAccountHostedBaselineSurfaceBinding({ vercelToken: token(), fetch: async url => response(url === aliasUrl ? alias() : url === deploymentUrl ? deployment() : url === readinessUrl ? readiness() : { error: 'bad_request' }, url === edgeUrl ? 400 : 200) })
  await assert.rejects(unexpected.readBaseline({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SURFACE_ERROR))
})

test('normalizes documented Git repository IDs and observes, rather than invents, Git source SHA', async () => {
  const sourceSha = 'c'.repeat(40)
  for (const repoId of [998877, '998877']) {
    const ports = binding({ bodyFor: url => url === aliasUrl ? alias() : url === deploymentUrl
      ? { ...deployment(), gitSource: { ...deployment().gitSource, repoId, sha: sourceSha } }
      : url === readinessUrl ? readiness() : { error: 'temporarily_unavailable' } })
    const result = await ports.readBaseline({ signal: new AbortController().signal })
    assert.equal(result.deployment.repositoryId, '998877'); assert.equal(result.deployment.gitSourceCommit, sourceSha)
  }
})

test('records TLL application manifest evidence only when present and valid', async () => {
  const absent = binding({ bodyFor: url => url === aliasUrl ? alias() : url === deploymentUrl
    ? Object.fromEntries(Object.entries(deployment()).filter(([key]) => key !== 'meta'))
    : url === readinessUrl ? readiness() : { error: 'temporarily_unavailable' } })
  assert.equal((await absent.readBaseline({ signal: new AbortController().signal })).deployment.applicationManifestSha256, null)
  const invalid = binding({ bodyFor: url => url === aliasUrl ? alias() : url === deploymentUrl
    ? { ...deployment(), meta: { tllManifestSha256: 'invalid' } }
    : url === readinessUrl ? readiness() : { error: 'temporarily_unavailable' } })
  await assert.rejects(invalid.readBaseline({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SURFACE_ERROR))
})

test('redirects, framing, compression and oversized responses fail closed', async () => {
  const bad = [
    { status: 302, redirected: false, url: aliasUrl, body: response(alias()).body, headers: new Headers() },
    { status: 200, redirected: true, url: aliasUrl, body: response(alias()).body, headers: new Headers() },
    { status: 200, redirected: false, url: 'https://attacker.invalid', body: response(alias()).body, headers: new Headers() },
    { status: 200, redirected: false, url: aliasUrl, body: null, headers: new Headers() },
    response(alias(), 200, { 'content-length': '65537' }), response(alias(), 200, { 'content-encoding': 'gzip' }),
  ]
  for (const item of bad) {
    const ports = createStagingAccountHostedBaselineSurfaceBinding({ vercelToken: token(), fetch: async () => item })
    await assert.rejects(ports.readBaseline({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SURFACE_ERROR))
  }
  const bytes = new Uint8Array(65_537); bytes.fill(97)
  const oversize = createStagingAccountHostedBaselineSurfaceBinding({ vercelToken: token(), fetch: async () => ({ status: 200, redirected: false, url: aliasUrl, headers: new Headers(), body: new ReadableStream({ start (controller) { controller.enqueue(bytes); controller.close() } }) }) })
  await assert.rejects(oversize.readBaseline({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SURFACE_ERROR))
})

test('hostile response accessors remain redacted and cancel bodies where possible', async () => {
  const canaries = [
    { status: 200, redirected: false, url: aliasUrl, get headers () { throw Error('private header canary') }, body: response(alias()).body },
    { status: 200, redirected: false, url: aliasUrl, headers: new Headers(), get body () { throw Error('private body canary') } },
    { status: 200, redirected: false, url: aliasUrl, headers: new Headers(), body: { getReader () { throw Error('private reader canary') } } },
  ]
  for (const canary of canaries) {
    const ports = createStagingAccountHostedBaselineSurfaceBinding({ vercelToken: token(), fetch: async () => canary })
    await assert.rejects(ports.readBaseline({ signal: new AbortController().signal }), error => error.message === HOSTED_BASELINE_SURFACE_ERROR && !/private|canary/i.test(error.message))
  }
})

test('cancellation before or during a fetch or read settles and cleans up', async () => {
  const pre = new AbortController(); pre.abort()
  const noCall = createStagingAccountHostedBaselineSurfaceBinding({ vercelToken: token(), fetch: async () => { throw Error('must not run') } })
  await assert.rejects(noCall.readBaseline({ signal: pre.signal }), new RegExp(HOSTED_BASELINE_SURFACE_ERROR))
  let resolveFetch, cancelled = 0
  const controller = new AbortController()
  const pending = createStagingAccountHostedBaselineSurfaceBinding({ vercelToken: token(), fetch: () => new Promise(resolve => { resolveFetch = resolve }) }).readBaseline({ signal: controller.signal })
  await Promise.resolve(); controller.abort()
  resolveFetch({ status: 200, redirected: false, url: aliasUrl, headers: new Headers(), body: { getReader: () => ({ cancel: () => { cancelled += 1 }, releaseLock: () => {} }) } })
  await assert.rejects(pending, new RegExp(HOSTED_BASELINE_SURFACE_ERROR)); assert.equal(cancelled, 1)
  const neverFetchController = new AbortController()
  const neverFetch = createStagingAccountHostedBaselineSurfaceBinding({ vercelToken: token(), fetch: () => new Promise(() => {}) })
  const neverFetchPending = neverFetch.readBaseline({ signal: neverFetchController.signal })
  await Promise.resolve(); neverFetchController.abort()
  await assert.rejects(neverFetchPending, new RegExp(HOSTED_BASELINE_SURFACE_ERROR))
  let readCancelled = 0
  const duringRead = createStagingAccountHostedBaselineSurfaceBinding({ vercelToken: token(), fetch: async () => ({ status: 200, redirected: false, url: aliasUrl, headers: new Headers(), body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: () => { readCancelled += 1; return new Promise(() => {}) }, releaseLock: () => {} }) } }) })
  const c = new AbortController(), p = duringRead.readBaseline({ signal: c.signal }); await Promise.resolve(); c.abort()
  await assert.rejects(p, new RegExp(HOSTED_BASELINE_SURFACE_ERROR)); assert.equal(readCancelled, 1)
  let resolveRead
  const deferredBytes = new Uint8Array([1, 2, 3, 4])
  const deferred = createStagingAccountHostedBaselineSurfaceBinding({ vercelToken: token(), fetch: async () => ({ status: 200, redirected: false, url: aliasUrl, headers: new Headers(), body: { getReader: () => ({ read: () => new Promise(resolve => { resolveRead = resolve }), cancel: () => {}, releaseLock: () => {} }) } }) })
  const deferredController = new AbortController(), deferredPending = deferred.readBaseline({ signal: deferredController.signal })
  await new Promise(resolve => setImmediate(resolve)); assert.equal(typeof resolveRead, 'function'); deferredController.abort()
  await assert.rejects(deferredPending, new RegExp(HOSTED_BASELINE_SURFACE_ERROR))
  resolveRead({ done: false, value: deferredBytes })
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual([...deferredBytes], [0, 0, 0, 0])
})

test('source has no ambient, mutation or generic capability', () => {
  const source = readFileSync('scripts/staging-account-hosted-baseline-surface.mjs', 'utf8')
  assert.doesNotMatch(source, /child_process|spawn\(|exec\(|process\.|keychain|dotenv|globalThis\.fetch|https?\.request/i)
  assert.doesNotMatch(source, /PUT|PATCH|DELETE|secrets|env\s+(set|add|rm)|createDeployment|runCli/i)
  assert.doesNotMatch(source, /new URL\(|URLSearchParams|caller.*url/i)
  assert.match(source, /v4\/aliases\/\$\{ALIAS_HOST\}/); assert.match(source, /v13\/deployments\/\$\{id\}/)
  assert.match(source, /docs\/ops\/staging-account-activation\.md/)
  assert.match(source, /no concrete deployment-metadata writer/)
})

test('dispose wipes the one-shot binding and prevents a later observation', async () => {
  const ports = binding()
  ports.dispose()
  await assert.rejects(ports.readBaseline({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_SURFACE_ERROR))
})
