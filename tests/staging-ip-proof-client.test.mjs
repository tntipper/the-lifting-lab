import assert from 'node:assert/strict'
import test from 'node:test'
import { runIpProof, SPOOF_CASES } from '../scripts/staging-ip-proof.mjs'

const config = () => ({ origin: 'https://tll-git-staging-fixture.vercel.app', verifiedEnvironment: 'hosted-staging-preview', keyHex: 'ab'.repeat(32), runId: 'cd'.repeat(16) })
function transport(mode = 'pass') {
  const calls = []
  return { calls, fetch: async (url, options) => {
    calls.push({ url, options })
    assert.equal(url, `${config().origin}/api/staging/ip-proof`)
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error')
    assert.equal(options.headers['x-tll-ip-proof-run'], config().runId)
    if (options.headers['x-tll-ip-proof-key'] !== config().keyHex) return new Response(null, { status: 404 })
    const spoof = Object.keys(options.headers).some(key => !['x-tll-ip-proof-key','x-tll-ip-proof-run'].includes(key))
    const result = { matches_documentation_spoof: mode === 'spoof' && spoof,
      fingerprint: mode === 'changed' && spoof ? '22'.repeat(32) : '11'.repeat(32) }
    if (mode === 'missing') result.fingerprint = null
    if (mode === 'leak') result.raw_headers = { authorization: 'PRIVATE_PROVIDER_TOKEN' }
    if (mode === 'unstable' && calls.length === 5) result.fingerprint = '33'.repeat(32)
    if (mode === 'http') return Response.json({ token: 'PRIVATE_PROVIDER_TOKEN' }, { status: 500 })
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } }
}
test('hosted proof checks missing/wrong credentials and interleaves stable baselines around every spoof', async () => {
  const t = transport(), result = await runIpProof(config(), t.fetch)
  assert.equal(t.calls.length, 2 + 3 * SPOOF_CASES.length)
  assert.equal(result.status, 'pass'); assert.equal(result.cases.length, SPOOF_CASES.length)
  assert.ok(result.cases.every(row => row.unchanged))
  assert.ok(!JSON.stringify(result).includes(config().keyHex))
  for (const [i, [name, headers]] of SPOOF_CASES.entries()) {
    assert.equal(result.cases[i].name, name)
    assert.deepEqual(t.calls[3 + i * 3].options.headers, { 'x-tll-ip-proof-key': config().keyHex, 'x-tll-ip-proof-run': config().runId, ...headers })
  }
})
for (const mode of ['spoof','changed','missing','leak','unstable','http']) test(`proof rejects ${mode} instead of emitting successful acceptance or raw payload`, async () => {
  const t = transport(mode)
  await assert.rejects(runIpProof(config(), t.fetch), error => {
    assert.match(error.message, /^Staging IP proof/)
    assert.ok(!error.message.includes('PRIVATE_PROVIDER_TOKEN'))
    assert.ok(!error.message.includes(config().keyHex))
    if (mode === 'unstable') assert.match(error.message, /inconclusive/)
    return true
  })
})
for (const change of [
  { origin: 'https://theliftinglab.co.uk' }, { origin: 'https://shop.theliftinglab.co.uk' },
  { origin: 'https://example.invalid' }, { origin: 'http://tll-git-staging-fixture.vercel.app' },
  { origin: 'https://tll-git-staging-fixture.vercel.app?secret=private' },
  { origin: 'https://user:private@tll-git-staging-fixture.vercel.app' },
  { verifiedEnvironment: 'production' }, { verifiedEnvironment: undefined }, { keyHex: 'short' },
]) test(`invalid operator context makes no requests: ${Object.keys(change)[0]} ${Object.values(change)[0]}`, async () => {
  let calls = 0
  await assert.rejects(runIpProof({ ...config(), ...change }, () => { calls++; assert.fail('Unexpected transport') }))
  assert.equal(calls, 0)
})
