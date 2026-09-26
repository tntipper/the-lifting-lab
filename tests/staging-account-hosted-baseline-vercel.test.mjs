import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BROKER_SECRET_NAME } from '../scripts/staging-provider-broker-rotation.mjs'
import {
  createStagingAccountHostedBaselineVercelBinding,
  HOSTED_BASELINE_VERCEL_BINDING_ENABLED,
  HOSTED_BASELINE_VERCEL_ERROR,
  HOSTED_BASELINE_VERCEL_TARGET,
} from '../scripts/staging-account-hosted-baseline-vercel.mjs'

const token = () => Buffer.from('private-vercel-read-token')
const projectUrl = 'https://api.vercel.com/v9/projects/prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4?teamId=team_gf7cgIkkoeMLtODFDDT5MrW4'
const environmentUrl = 'https://api.vercel.com/v10/projects/prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4/env?target=preview&gitBranch=codex%2Ftll-integration&limit=100&teamId=team_gf7cgIkkoeMLtODFDDT5MrW4'
const project = () => ({ id: HOSTED_BASELINE_VERCEL_TARGET.projectId, name: HOSTED_BASELINE_VERCEL_TARGET.project,
  accountId: HOSTED_BASELINE_VERCEL_TARGET.teamId, arbitraryAdditiveField: { permitted: true }, link: {
    type: 'github', repoId: 998877, repoOwnerId: 776655, org: 'tntipper', repo: 'the-lifting-lab',
    productionBranch: 'main', sourceless: false, arbitraryAdditiveField: 'permitted',
  } })
const envs = () => ({ envs: [
  { key: BROKER_SECRET_NAME, target: ['preview'], gitBranch: 'codex/tll-integration', type: 'encrypted', value: 'must-not-escape' },
  { key: 'UNRELATED_SAFE_NAME', target: ['preview'], gitBranch: 'codex/tll-integration', type: 'plain', value: 'also-not-returned' },
], pagination: { next: null } })
const response = (body, status = 200, headers = undefined) => new Response(JSON.stringify(body), { status, headers })

function binding ({ onFetch = () => {}, bodyFor = url => url === projectUrl ? project() : envs() } = {}) {
  return createStagingAccountHostedBaselineVercelBinding({
    vercelToken: token(),
    fetch: async (url, options) => { onFetch(url, options); return response(bodyFor(url)) },
  })
}

test('binding remains disabled and reads only the documented fixed project and preview environment endpoints', async () => {
  assert.equal(HOSTED_BASELINE_VERCEL_BINDING_ENABLED, false)
  assert.throws(() => createStagingAccountHostedBaselineVercelBinding(), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  const calls = [], signal = new AbortController().signal
  const result = await binding({ onFetch: (url, options) => calls.push({ url, options }) }).readBaseline({ signal })
  assert.deepEqual(result, {
    project: { target: HOSTED_BASELINE_VERCEL_TARGET, repository: { provider: 'github', repoId: 998877, org: 'tntipper', repo: 'the-lifting-lab', ownerId: 776655, productionBranch: 'main', sourceless: false } },
    environment: { target: HOSTED_BASELINE_VERCEL_TARGET, environment: 'preview', branch: 'codex/tll-integration', brokerSecretPresent: true },
  })
  assert.deepEqual(calls.map(call => call.url), [projectUrl, environmentUrl])
  for (const call of calls) {
    assert.equal(call.options.method, 'GET'); assert.equal(call.options.redirect, 'error'); assert.equal(call.options.signal, signal)
    assert.deepEqual(call.options.headers, { accept: 'application/json', 'accept-encoding': 'identity', authorization: call.options.headers.authorization })
    assert.match(call.options.headers.authorization, /^Bearer /)
  }
})

test('environment evidence is presence-only and never includes provider values', async () => {
  const result = await binding().readPreviewEnvironmentPresence({ signal: new AbortController().signal })
  const text = JSON.stringify(result)
  assert.equal(result.brokerSecretPresent, true)
  assert.doesNotMatch(text, /must-not-escape|also-not-returned|UNRELATED_SAFE_NAME|value/i)
  const absent = await binding({ bodyFor: () => ({ envs: [], pagination: { next: null } }) }).readPreviewEnvironmentPresence({ signal: new AbortController().signal })
  assert.equal(absent.brokerSecretPresent, false)
})

test('target and repository identity drift fails before a receipt is returned', async () => {
  for (const mutate of [
    value => ({ ...value, id: 'prj_other' }), value => ({ ...value, name: 'other-project' }), value => ({ ...value, accountId: 'team_other' }),
    value => ({ ...value, link: { ...value.link, type: 'gitlab' } }), value => ({ ...value, link: { ...value.link, repoId: '998877' } }),
    value => ({ ...value, link: { ...value.link, repoOwnerId: 0 } }), value => ({ ...value, link: { ...value.link, productionBranch: '' } }),
    value => ({ ...value, link: { ...value.link, org: 'my-lifting-lab-s-projects' } }),
    value => ({ ...value, link: { ...value.link, org: 'tntipper-typo' } }),
    value => ({ ...value, link: { ...value.link, repo: 'another-repository' } }),
    value => ({ ...value, link: { ...value.link, productionBranch: 'release' } }),
    value => ({ ...value, link: { ...value.link, sourceless: 'false' } }),
  ]) {
    await assert.rejects(binding({ bodyFor: () => mutate(project()) }).readProject({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  }
})

test('preview branch, target, and documented environment types are all exact', async () => {
  const cases = [
    { envs: [{ key: BROKER_SECRET_NAME, target: ['production'], gitBranch: 'codex/tll-integration', type: 'encrypted' }], pagination: { next: null } },
    { envs: [{ key: BROKER_SECRET_NAME, target: ['preview', 'production'], gitBranch: 'codex/tll-integration', type: 'encrypted' }], pagination: { next: null } },
    { envs: [{ key: BROKER_SECRET_NAME, target: ['preview'], gitBranch: 'main', type: 'encrypted' }], pagination: { next: null } },
    { envs: [{ key: BROKER_SECRET_NAME, target: ['preview'], gitBranch: 'codex/tll-integration', type: 'unknown' }], pagination: { next: null } },
    { envs: [{ key: 'lowercase', target: ['preview'], gitBranch: 'codex/tll-integration', type: 'encrypted' }], pagination: { next: null } },
  ]
  for (const body of cases) await assert.rejects(binding({ bodyFor: () => body }).readPreviewEnvironmentPresence({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  const sensitive = await binding({ bodyFor: () => ({ envs: [{ key: BROKER_SECRET_NAME, target: 'preview', gitBranch: 'codex/tll-integration', type: 'sensitive' }], pagination: { next: null } }) }).readPreviewEnvironmentPresence({ signal: new AbortController().signal })
  assert.equal(sensitive.brokerSecretPresent, true)
})

test('a short page without pagination is terminal, while a full page or incomplete cursor cannot prove absence', async () => {
  const shortPage = await binding({ bodyFor: () => ({ envs: [] }) }).readPreviewEnvironmentPresence({ signal: new AbortController().signal })
  assert.equal(shortPage.brokerSecretPresent, false)
  for (const pagination of [{}, { next: 'next-page' }, { next: 1 }, null]) {
    await assert.rejects(binding({ bodyFor: () => ({ envs: [], pagination }) }).readPreviewEnvironmentPresence({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  }
  const fullPage = Array.from({ length: 100 }, () => ({ key: 'VALID_NAME', target: ['preview'], gitBranch: 'codex/tll-integration', type: 'encrypted' }))
  await assert.rejects(binding({ bodyFor: () => ({ envs: fullPage }) }).readPreviewEnvironmentPresence({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  const terminal = await binding({ bodyFor: () => ({ envs: [], pagination: { next: null, count: 0 } }) }).readPreviewEnvironmentPresence({ signal: new AbortController().signal })
  assert.equal(terminal.brokerSecretPresent, false)
})

test('redirects, statuses, URL drift, bad framing, and oversized streamed responses fail closed', async () => {
  const signal = new AbortController().signal
  const cases = [
    async () => ({ status: 302, redirected: false, url: projectUrl, body: response(project()).body, headers: new Headers() }),
    async () => ({ status: 200, redirected: true, url: projectUrl, body: response(project()).body, headers: new Headers() }),
    async () => ({ status: 200, redirected: false, url: 'https://attacker.invalid', body: response(project()).body, headers: new Headers() }),
    async () => ({ status: 200, redirected: false, url: projectUrl, body: null, headers: new Headers() }),
    async () => response(project(), 200, { 'content-length': '65537' }),
    async () => response(project(), 200, { 'content-encoding': 'gzip' }),
  ]
  for (const fetch of cases) {
    const ports = createStagingAccountHostedBaselineVercelBinding({ fetch: async () => fetch(), vercelToken: token() })
    await assert.rejects(ports.readProject({ signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  }
  const oversized = new Uint8Array(65_537); oversized.fill(97)
  const ports = createStagingAccountHostedBaselineVercelBinding({ fetch: async () => ({ status: 200, redirected: false, url: projectUrl, headers: new Headers(), body: new ReadableStream({ start (controller) { controller.enqueue(oversized); controller.close() } }) }), vercelToken: token() })
  await assert.rejects(ports.readProject({ signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
})

test('invalid response bodies are cancelled and an abort during a pending stream read settles immediately', async () => {
  let invalidCancelled = 0
  const invalidBody = { getReader: () => ({ cancel: () => { invalidCancelled += 1 }, releaseLock: () => {} }) }
  const invalid = createStagingAccountHostedBaselineVercelBinding({ fetch: async () => ({ status: 500, redirected: false, url: projectUrl, headers: new Headers(), body: invalidBody }), vercelToken: token() })
  await assert.rejects(invalid.readProject({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  assert.equal(invalidCancelled, 1)

  let cancelled = 0
  const pendingBody = { getReader: () => ({ read: () => new Promise(() => {}), cancel: () => { cancelled += 1; return new Promise(() => {}) }, releaseLock: () => {} }) }
  const ports = createStagingAccountHostedBaselineVercelBinding({ fetch: async () => ({ status: 200, redirected: false, url: projectUrl, headers: new Headers(), body: pendingBody }), vercelToken: token() })
  const controller = new AbortController(); const pending = ports.readProject({ signal: controller.signal })
  await Promise.resolve(); controller.abort()
  await assert.rejects(pending, new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  assert.equal(cancelled, 1)
})

test('an abort during fetch, same-turn response, and an oversized body with a never-settling cancel all settle without a wait', async () => {
  let resolveFetch
  const controller = new AbortController()
  const fetchBeforeAbort = createStagingAccountHostedBaselineVercelBinding({
    fetch: () => new Promise(resolve => { resolveFetch = resolve }), vercelToken: token(),
  })
  const pending = fetchBeforeAbort.readProject({ signal: controller.signal })
  await Promise.resolve(); controller.abort()
  let abortedBodyCancelled = 0
  resolveFetch({ status: 200, redirected: false, url: projectUrl, headers: new Headers(), body: { getReader: () => ({ cancel: () => { abortedBodyCancelled += 1 }, releaseLock: () => {} }) } })
  await assert.rejects(pending, new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  assert.equal(abortedBodyCancelled, 1)

  let sameTurnCancelled = 0
  const sameTurnController = new AbortController()
  const sameTurn = createStagingAccountHostedBaselineVercelBinding({
    fetch: async url => {
      sameTurnController.abort()
      return { status: 200, redirected: false, url, headers: new Headers(), body: { getReader: () => ({ cancel: () => { sameTurnCancelled += 1 }, releaseLock: () => {} }) } }
    }, vercelToken: token(),
  })
  await assert.rejects(sameTurn.readProject({ signal: sameTurnController.signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  await new Promise(resolve => setImmediate(resolve)); assert.equal(sameTurnCancelled, 1)

  let oversizedCancelled = 0
  const bytes = new Uint8Array(65_537); bytes.fill(97)
  const oversized = createStagingAccountHostedBaselineVercelBinding({
    fetch: async () => ({ status: 200, redirected: false, url: projectUrl, headers: new Headers(), body: { getReader: () => ({
      read: async () => ({ done: false, value: bytes }), cancel: () => { oversizedCancelled += 1; return new Promise(() => {}) }, releaseLock: () => {},
    }) } }), vercelToken: token(),
  })
  await assert.rejects(oversized.readProject({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  assert.equal(oversizedCancelled, 1)
})

test('abort before reader setup, pending late bytes, hostile accessors, and dispose all fail closed', async () => {
  const beforeReader = new AbortController()
  const abortingReader = createStagingAccountHostedBaselineVercelBinding({
    fetch: async url => ({ status: 200, redirected: false, url, headers: new Headers(), body: { getReader: () => {
      beforeReader.abort()
      return { read: () => new Promise(() => {}), cancel: () => {}, releaseLock: () => {} }
    } } }), vercelToken: token(),
  })
  await assert.rejects(abortingReader.readProject({ signal: beforeReader.signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))

  let resolveRead
  const lateBytes = new Uint8Array([1, 2, 3, 4])
  const late = createStagingAccountHostedBaselineVercelBinding({
    fetch: async url => ({ status: 200, redirected: false, url, headers: new Headers(), body: { getReader: () => ({
      read: () => new Promise(resolve => { resolveRead = resolve }), cancel: () => {}, releaseLock: () => {},
    }) } }), vercelToken: token(),
  })
  const lateController = new AbortController()
  const latePending = late.readProject({ signal: lateController.signal })
  await new Promise(resolve => setImmediate(resolve)); assert.equal(typeof resolveRead, 'function')
  lateController.abort()
  await assert.rejects(latePending, new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  resolveRead({ done: false, value: lateBytes })
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual([...lateBytes], [0, 0, 0, 0])

  const unhandled = []
  const onUnhandled = reason => { unhandled.push(reason) }
  process.on('unhandledRejection', onUnhandled)
  try {
    const hostileBytes = new Uint8Array([5, 6, 7])
    Object.defineProperty(hostileBytes, 'fill', { value: () => { throw Error('private fill canary') } })
    for (const item of [
      { done: false, get value () { throw Error('private late value canary') } },
      { done: false, value: hostileBytes },
    ]) {
      let resolveHostileRead
      const hostileLate = createStagingAccountHostedBaselineVercelBinding({
        fetch: async url => ({ status: 200, redirected: false, url, headers: new Headers(), body: { getReader: () => ({
          read: () => new Promise(resolve => { resolveHostileRead = resolve }), cancel: () => {}, releaseLock: () => {},
        }) } }), vercelToken: token(),
      })
      const hostileController = new AbortController()
      const hostilePending = hostileLate.readProject({ signal: hostileController.signal })
      await new Promise(resolve => setImmediate(resolve)); hostileController.abort()
      await assert.rejects(hostilePending, new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
      resolveHostileRead(item)
      await new Promise(resolve => setImmediate(resolve))
    }
    assert.deepEqual(unhandled, [])
  } finally { process.off('unhandledRejection', onUnhandled) }

  for (const hostile of [
    { get status () { throw Error('private response canary') }, redirected: false, url: projectUrl, headers: new Headers(), body: response(project()).body },
    { status: 200, redirected: false, url: projectUrl, get headers () { throw Error('private header canary') }, body: response(project()).body },
    { status: 200, redirected: false, url: projectUrl, headers: new Headers(), get body () { throw Error('private body canary') } },
    { status: 200, redirected: false, url: projectUrl, headers: new Headers(), body: { getReader () { throw Error('private reader canary') } } },
  ]) {
    const ports = createStagingAccountHostedBaselineVercelBinding({ fetch: async () => hostile, vercelToken: token() })
    await assert.rejects(ports.readProject({ signal: new AbortController().signal }), error => error.message === HOSTED_BASELINE_VERCEL_ERROR && !/private|canary/i.test(error.message))
  }

  const disposed = binding()
  disposed.dispose(); disposed.dispose()
  await assert.rejects(disposed.readProject({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  await assert.rejects(disposed.readPreviewEnvironmentPresence({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  await assert.rejects(disposed.readBaseline({ signal: new AbortController().signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
})

test('rejects cancellation and redacts provider or token diagnostics', async () => {
  const aborted = new AbortController(); aborted.abort()
  const never = createStagingAccountHostedBaselineVercelBinding({ fetch: async () => { throw Error('must not run') }, vercelToken: token() })
  await assert.rejects(never.readProject({ signal: aborted.signal }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
  const ports = createStagingAccountHostedBaselineVercelBinding({ fetch: async () => { throw Error('private token diagnostic') }, vercelToken: token() })
  await assert.rejects(ports.readProject({ signal: new AbortController().signal }), error => error.message === HOSTED_BASELINE_VERCEL_ERROR && !/private|token|diagnostic/i.test(error.message))
  assert.throws(() => createStagingAccountHostedBaselineVercelBinding({ fetch: () => {}, vercelToken: Buffer.alloc(8) }), new RegExp(HOSTED_BASELINE_VERCEL_ERROR))
})

test('source has no ambient launcher, credential discovery, process, or generic request capability', () => {
  const source = readFileSync('scripts/staging-account-hosted-baseline-vercel.mjs', 'utf8')
  assert.doesNotMatch(source, /child_process|spawn\(|exec\(|process\.|keychain|dotenv|globalThis\.fetch|https?\.request/i)
  assert.doesNotMatch(source, /new URL\(|URLSearchParams|caller.*url/i)
  assert.match(source, /v9\/projects\/\$\{VERCEL_PROJECT_ID\}/)
  assert.match(source, /const ENVIRONMENT_PAGE_LIMIT = 100/)
  assert.match(source, /v10\/projects\/\$\{VERCEL_PROJECT_ID\}\/env\?target=preview&gitBranch=codex%2Ftll-integration&limit=\$\{ENVIRONMENT_PAGE_LIMIT\}/)
  assert.match(source, /githubFullName: 'tntipper\/the-lifting-lab'/)
})
