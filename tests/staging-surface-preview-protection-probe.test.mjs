import test from 'node:test'
import assert from 'node:assert/strict'
import { STAGING_ALIAS } from '../scripts/staging-surface-activation-transport.mjs'
import { createStagingPreviewProtectionProbe, STAGING_PREVIEW_PROTECTION_PROBE_ENABLED } from '../scripts/staging-surface-preview-protection-probe.mjs'

const immutableUrl = 'https://new-123.vercel.app'
const signal = new AbortController().signal
function challenge(url, callbackUrl = url) {
  return new Response(JSON.stringify({ error: { message: 'Protected deployment', code: '401' },
    protection: { vercel_auth_callback: `https://vercel.com/sso-api?url=${encodeURIComponent(callbackUrl)}&nonce=testnonce` } }),
  { status: 401, headers: { 'content-type': 'application/json', server: 'Vercel' } })
}

test('only two credential-free Vercel Auth challenges prove the immutable and alias addresses', async () => {
  assert.equal(STAGING_PREVIEW_PROTECTION_PROBE_ENABLED, false)
  const calls = []
  const probe = createStagingPreviewProtectionProbe({ fetch: async (url, options) => {
    calls.push({ url, options })
    return challenge(url)
  } })
  assert.deepEqual(await probe.verify({ immutableUrl, signal }), {
    status: 'PUBLIC_ACCESS_DENIED', immutableUrl, alias: STAGING_ALIAS,
  })
  assert.deepEqual(calls.map(call => call.url),
    [`${immutableUrl}/api/staging/readiness`, `${STAGING_ALIAS}/api/staging/readiness`])
  assert.ok(calls.every(call => call.options.redirect === 'manual' && call.options.credentials === 'omit'
    && call.options.cache === 'no-store' && call.options.headers['x-vercel-protection-bypass'] === undefined))
  await assert.rejects(probe.verify({ immutableUrl, signal }), /unavailable/)
})

test('public content, false challenges and a broken alias fail closed', async () => {
  for (const response of [
    () => new Response('{}', { status: 200 }),
    url => challenge(url, `${immutableUrl}/wrong`),
    url => new Response(JSON.stringify({ error: { message: 'Protected deployment', code: '401' },
      protection: { vercel_auth_callback: `https://example.com/sso-api?url=${encodeURIComponent(url)}&nonce=test` } }),
    { status: 401, headers: { 'content-type': 'application/json', server: 'Vercel' } }),
  ]) {
    const probe = createStagingPreviewProtectionProbe({ fetch: async url => response(url) })
    await assert.rejects(probe.verify({ immutableUrl, signal }), /unavailable/)
  }
  const missingAlias = createStagingPreviewProtectionProbe({ fetch: async url => {
    if (url.startsWith(STAGING_ALIAS)) throw Error('alias unavailable')
    return challenge(url)
  } })
  await assert.rejects(missingAlias.verify({ immutableUrl, signal }), /alias unavailable/)
})
