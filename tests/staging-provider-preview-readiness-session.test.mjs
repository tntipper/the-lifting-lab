import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPreviewSourceReadJournal } from '../scripts/staging-preview-source-journal.mjs'
import { observeProtectedPreviewOnce, PREVIEW_READINESS_TARGET } from '../scripts/staging-provider-preview-readiness-session.mjs'
import { createPinnedReadinessReader } from '../scripts/staging-provider-preview-readiness-reader.mjs'

const body = () => ({ deploymentId: PREVIEW_READINESS_TARGET.deploymentId,
  immutableUrl: PREVIEW_READINESS_TARGET.immutableUrl, projectRef: PREVIEW_READINESS_TARGET.projectRef,
  branch: PREVIEW_READINESS_TARGET.branch, privateCustomer: false, privateCart: false,
  publicCustomer: false, publicCart: false })
function fixture(change = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-preview-readiness-'))
  const journal = createPreviewSourceReadJournal({ path: join(directory, 'one-use.json') })
  const bypass = Buffer.from('private-preview-bypass')
  const calls = []
  return { journal, bypass, calls, options: { journal,
    readBypass: async () => { if (change.keychainFailure) throw Error('unavailable'); return bypass },
    readReadiness: async (url) => { calls.push(url); if (change.readFailure) throw Error('unavailable')
      return { ...body(), ...change.body } },
  } }
}

test('three exact observations prove all account/cart controls disabled and consume journal', async () => {
  const f = fixture()
  assert.equal((await observeProtectedPreviewOnce(f.options)).status, 'PREVIEW_DISABLED_VERIFIED')
  assert.deepEqual(f.calls, [PREVIEW_READINESS_TARGET.aliasUrl, PREVIEW_READINESS_TARGET.immutableUrl,
    PREVIEW_READINESS_TARGET.aliasUrl])
  assert.equal(f.journal.read().outcome, 'OBSERVED')
  assert.deepEqual([...f.bypass], Array(f.bypass.length).fill(0))
  assert.equal((await observeProtectedPreviewOnce(f.options)).status, 'REPLAY_REJECTED')
  assert.equal(f.calls.length, 3)
})

for (const [name, change] of [
  ['changed deployment', { body: { deploymentId: 'dpl_other' } }],
  ['enabled private customer', { body: { privateCustomer: true } }],
  ['extra response field', { body: { secret: 'extra' } }],
  ['network failure', { readFailure: true }],
]) {
  test(`${name} consumes journal and stops after first read`, async () => {
    const f = fixture(change)
    assert.equal((await observeProtectedPreviewOnce(f.options)).status, 'READ_UNAVAILABLE')
    assert.equal(f.journal.read().outcome, 'READ_UNAVAILABLE')
    assert.equal(f.calls.length, 1)
    assert.equal((await observeProtectedPreviewOnce(f.options)).status, 'REPLAY_REJECTED')
  })
}

test('credential failure never makes a network request or consumes journal', async () => {
  const f = fixture({ keychainFailure: true })
  assert.equal((await observeProtectedPreviewOnce(f.options)).status, 'READ_UNAVAILABLE')
  assert.equal(f.journal.read(), null)
  assert.equal(f.calls.length, 0)
})

test('native reader uses only pinned URL, deployment header, bypass and GET', async () => {
  const requests = []
  const read = createPinnedReadinessReader({ target: PREVIEW_READINESS_TARGET,
    fetcher: async (url, options) => { requests.push({ url, options }); return {
      url, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
      body: new Response(JSON.stringify(body())).body,
    } },
  })
  const bypass = Buffer.from('private-preview-bypass')
  assert.deepEqual(await read(PREVIEW_READINESS_TARGET.aliasUrl, bypass), body())
  assert.equal(requests[0].url, `${PREVIEW_READINESS_TARGET.aliasUrl}/api/staging/readiness`)
  assert.equal(requests[0].options.method, 'GET')
  assert.equal(requests[0].options.redirect, 'error')
  assert.equal(requests[0].options.headers['x-tll-deployment-id'], PREVIEW_READINESS_TARGET.deploymentId)
  await assert.rejects(() => read('https://untrusted.example', bypass))
  await read(PREVIEW_READINESS_TARGET.immutableUrl, bypass)
  await read(PREVIEW_READINESS_TARGET.aliasUrl, bypass)
  await assert.rejects(() => read(PREVIEW_READINESS_TARGET.aliasUrl, bypass))
  assert.equal(requests.length, 3)
})

test('third alias read catches drift after the immutable read', async () => {
  const f = fixture()
  let read = 0
  f.options.readReadiness = async url => {
    f.calls.push(url)
    read++
    return read === 3 ? { ...body(), publicCart: true } : body()
  }
  assert.equal((await observeProtectedPreviewOnce(f.options)).status, 'READ_UNAVAILABLE')
  assert.equal(f.journal.read().outcome, 'READ_UNAVAILABLE')
  assert.deepEqual(f.calls, [PREVIEW_READINESS_TARGET.aliasUrl, PREVIEW_READINESS_TARGET.immutableUrl,
    PREVIEW_READINESS_TARGET.aliasUrl])
})

for (const [name, response] of [
  ['redirect', { status: 302 }],
  ['wrong response URL', { url: 'https://other.example/api/staging/readiness' }],
  ['wrong content type', { headers: new Headers({ 'content-type': 'text/html' }) }],
  ['oversize content length', { headers: new Headers({ 'content-type': 'application/json', 'content-length': '4097' }) }],
  ['oversize streamed body', { body: new Response('x'.repeat(4097)).body }],
]) {
  test(`native reader rejects ${name}`, async () => {
    const address = `${PREVIEW_READINESS_TARGET.aliasUrl}/api/staging/readiness`
    const base = { url: address, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
      body: new Response(JSON.stringify(body())).body }
    const read = createPinnedReadinessReader({ target: PREVIEW_READINESS_TARGET,
      fetcher: async () => ({ ...base, ...response }) })
    await assert.rejects(() => read(PREVIEW_READINESS_TARGET.aliasUrl, Buffer.from('private-preview-bypass')))
  })
}

test('native reader deadline stops a fetch that ignores abort', { timeout: 12_000 }, async () => {
  const read = createPinnedReadinessReader({ target: PREVIEW_READINESS_TARGET,
    fetcher: async () => new Promise(() => {}) })
  const start = Date.now()
  await assert.rejects(() => read(PREVIEW_READINESS_TARGET.aliasUrl, Buffer.from('private-preview-bypass')))
  assert.ok(Date.now() - start >= 9_500 && Date.now() - start < 12_000)
})
